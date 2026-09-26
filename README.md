# Pulse Notification Engine

![Tests](https://github.com/devanshjaincampaign-tech/pulse-notification-engine/actions/workflows/test.yml/badge.svg)

Pulse is a production-oriented, real-time notification backend built with
Node.js. It combines a REST API, PostgreSQL persistence, an in-process event
bus, Redis Pub/Sub, and authenticated Socket.IO connections.

The notification path uses a PostgreSQL-backed durable event outbox. Redis
remains the real-time delivery fan-out layer, while PostgreSQL provides the
recoverable source of truth for events waiting to be processed.

## Table of contents

- [What Pulse does](#what-pulse-does)
- [Architecture](#architecture)
- [Request and notification flows](#request-and-notification-flows)
- [Implemented capabilities](#implemented-capabilities)
- [Technology stack](#technology-stack)
- [Repository structure](#repository-structure)
- [Getting started](#getting-started)
- [Configuration](#configuration)
- [API reference](#api-reference)
- [WebSocket reference](#websocket-reference)
- [Event model](#event-model)
- [Database schema](#database-schema)
- [Testing and CI](#testing-and-ci)
- [Operational guidance](#operational-guidance)
- [Security](#security)
- [Remaining work](#remaining-work)
- [Known limitations](#known-limitations)
- [License](#license)

## What Pulse does

Pulse provides:

1. User registration and login with bcrypt password hashing.
2. Short-lived JWT access tokens and rotating, persisted refresh tokens.
3. A durable PostgreSQL notification feed with ownership checks and
   idempotency.
4. Per-user notification preferences.
5. Real-time delivery to every connected device for a user.
6. Cross-instance delivery through Redis Pub/Sub.
7. Reconnection synchronization for unread notifications.
8. Security and operational middleware such as Helmet, CORS, request IDs,
   rate limiting, request validation, structured logs, and graceful shutdown.

The persistence path is the source of truth. Socket delivery is best effort:
an offline user can still retrieve notifications through the REST API.

## Architecture

```mermaid
graph TB
    Client[Client]
    LB[Load Balancer]
    App1[App instance 1<br/>Express + Socket.IO]
    App2[App instance 2<br/>Express + Socket.IO]
    Outbox[(PostgreSQL event outbox)]
    Worker1[Outbox worker 1]
    Worker2[Outbox worker 2]
    PG[(PostgreSQL 16)]
    Redis[(Redis 7<br/>Pub/Sub + rate limiting)]

    Client -->|HTTP + WebSocket| LB
    LB --> App1
    LB --> App2
    App1 -->|persist event| Outbox
    App2 -->|persist event| Outbox
    Worker1 --> Outbox
    Worker2 --> Outbox
    Worker1 --> App1
    Worker2 --> App2
    App1 -->|persist notification| PG
    App2 -->|persist notification| PG
    App1 -->|publish delivery message| Redis
    App2 -->|publish delivery message| Redis
    Redis --> App1
    Redis --> App2
    App1 -.->|emit to local user room| Client
    App2 -.->|emit to local user room| Client
```

### Important delivery boundary

There are two separate delivery layers:

- **Event processing:** Producers persist validated events into the PostgreSQL
  `event_outbox` table. Workers claim rows with PostgreSQL row locks and
  `SKIP LOCKED`, process them, retry transient failures with backoff, and move
  exhausted events to `dead_letter`.
- **Delivery fan-out:** Redis Pub/Sub. Every application instance subscribes,
  checks whether the recipient has a local Socket.IO room, and emits locally.

Redis is required during startup and remains best effort for live socket
delivery. PostgreSQL protects events until the notification consumer succeeds;
an outage can still prevent an immediate WebSocket emission, but the event can
be retried by the outbox worker.

## Request and notification flows

### Authentication flow

1. The client submits credentials to `/api/auth/register` or
   `/api/auth/login`.
2. The API validates the request with Zod.
3. Passwords are hashed or compared with bcrypt.
4. The API returns an access token and refresh token.
5. The refresh token is stored as a hash in PostgreSQL and rotated at refresh.
6. The access token authenticates REST requests and Socket.IO handshakes.

### Notification flow

```mermaid
sequenceDiagram
    participant Producer as Event producer
    participant Outbox as PostgreSQL event outbox
    participant Consumer as Notification consumer
    participant Prefs as PostgreSQL preferences
    participant DB as PostgreSQL notifications
    participant Redis as Redis Pub/Sub
    participant Socket as Recipient app instance
    participant User as Recipient device

    Producer->>Outbox: Persist validated event
    Outbox->>Consumer: Worker claims event
    Consumer->>Prefs: Check in-app preference
    Consumer->>DB: Insert event_id and notification
    DB-->>Consumer: Created row or duplicate constraint
    Consumer->>Redis: Publish delivery message
    Redis-->>Socket: Fan out to every instance
    Socket->>Socket: Find local user room
    Socket-->>User: Emit notification
```

Duplicate processing is prevented by the unique `notifications.event_id`
constraint. This is idempotency for database writes, not a guarantee that a
lost event will eventually be replayed.

## Implemented capabilities

### Authentication and identity

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `GET /api/auth/me`
- bcrypt password hashing
- generic invalid-login responses
- JWT access tokens
- seven-day, hashed refresh tokens with rotation and revocation
- transactional user and initial refresh-token creation

### Notification management

- bounded, offset-based notification listing
- unread count
- mark one notification as read
- mark all notifications as read
- delete one notification
- ownership checks so users can only access their notifications
- stable `read_at` timestamps when a notification is marked repeatedly
- unique event IDs for idempotent creation

### Preferences

- list the current user's preferences
- update in-app and email settings per event type
- validation against the shared event-type definition

### Events and real-time delivery

- `POST_LIKED` consumer and notification handler
- `USER_FOLLOWED` consumer and notification handler
- development-only test event routes
- authenticated Socket.IO handshakes
- `user:<id>` rooms for multi-device delivery
- Redis Pub/Sub fan-out between application instances
- unread notification sync on connection and reconnection

The following event types are defined but do not yet have consumers:
`COMMENT_CREATED`, `MESSAGE_RECEIVED`, `ORDER_STATUS_CHANGED`,
`PAYMENT_COMPLETED`, and `SECURITY_ALERT`.

## Technology stack

| Technology | Role |
|---|---|
| Node.js 20 | Runtime and container base |
| Express 5 | HTTP API and middleware pipeline |
| PostgreSQL 16 | Users, refresh tokens, notifications, preferences, and migrations |
| Redis 7 | Pub/Sub delivery fan-out and shared authentication rate limits |
| Socket.IO 4 | Authenticated real-time transport and user rooms |
| JWT | Stateless access-token authentication |
| bcrypt | Password hashing |
| Zod | Runtime request validation |
| Pino | Structured application logging |
| Helmet and CORS | HTTP security and cross-origin controls |
| Docker Compose | Local multi-service development |
| Vitest | Unit, integration, and WebSocket tests |
| GitHub Actions | Continuous integration |

## Repository structure

```text
pulse-notification-system/
├── .env.example                         # Development configuration template
├── .env.test                            # Test configuration
├── .github/
│   └── workflows/
│       └── test.yml                     # PostgreSQL, Redis, and npm test CI job
├── Dockerfile                            # Non-root production image
├── docker-compose.yml                    # Two app instances plus databases/Redis
├── package.json                          # Scripts and dependencies
├── vitest.config.js                     # Node test configuration
├── src/
│   ├── app.js                           # Express app, middleware, and route mounting
│   ├── server.js                        # Startup, dependencies, WebSocket, shutdown
│   ├── config/
│   │   ├── cors.js                      # CORS policy
│   │   ├── database.js                  # PostgreSQL pool
│   │   ├── env.js                       # Environment loading and required variables
│   │   ├── logger.js                    # Pino logger
│   │   └── redis.js                     # Redis clients and connections
│   ├── common/
│   │   ├── errors/                      # Application error classes and exports
│   │   ├── middleware/                  # Error, request ID, validation, rate limiting
│   │   └── utils/                       # Retry/backoff and shared utilities
│   ├── db/
│   │   ├── migrate.js                   # Ordered SQL migration runner
│   │   └── migrations/                  # Users, notifications, preferences, refresh tokens
│   ├── middleware/
│   │   └── auth.middleware.js            # REST JWT authentication
│   ├── events/
│   │   ├── eventPublisher.js            # Validated event persistence entry point
│   │   ├── eventTypes.js                # Shared event type constants
│   │   ├── createEvent.js               # Event envelope factory
│   │   ├── redisChannel.js              # Redis notification channel
│   │   ├── event.schema.js              # Event and producer request schemas
│   │   └── outbox/                       # Durable worker, claiming, retry, dead letter
│   │   ├── consumers/                   # Event-to-notification consumers
│   │   ├── handlers/                    # Notification builders by event type
│   │   └── producers/                   # Development test producers and routes
│   ├── modules/
│   │   ├── auth/                        # Controllers, routes, schemas, services, repositories
│   │   ├── notifications/               # Feed controller, service, repository, schemas
│   │   └── preferences/                 # Preference controller, service, repository, schemas
│   ├── websocket/
│   │   ├── index.js                     # Socket.IO setup, Redis subscription, sync
│   │   ├── socketAuth.js                # Socket JWT middleware
│   │   └── socketEmitter.js             # Local room delivery and Redis publishing
│   ├── socketAuth.js                    # Legacy/compatibility socket auth module
│   ├── utils/
│   │   ├── jwt.js                       # JWT signing and verification
│   │   └── refreshToken.js              # Refresh-token generation and hashing
│   └── testSocketClient.js              # Test/helper Socket.IO client
└── README.md                            # This project guide
```

## Getting started

### Prerequisites

- Docker Desktop with Docker Compose
- Node.js 20 or newer
- npm
- Git

### 1. Clone and configure

```bash
git clone https://github.com/devanshjaincampaign-tech/pulse-notification-engine.git
cd pulse-notification-engine
cp .env.example .env
```

On Windows PowerShell, use:

```powershell
Copy-Item .env.example .env
```

Change `JWT_SECRET`, database credentials, and `CORS_ORIGIN` before using the
service outside local development. Never commit `.env`.

### 2. Start dependencies and application instances

```bash
docker compose up --build -d
```

This starts:

| Service | Host port | Purpose |
|---|---:|---|
| `app` | 3000 | First API and Socket.IO instance |
| `app2` | 3001 | Second instance for fan-out testing |
| `postgres` | 5432 | Development database |
| `postgres_test` | 5433 | Isolated test database |
| `redis` | 6379 | Pub/Sub and rate-limit store |

Apply development migrations:

```bash
docker compose exec app npm run migrate
```

Check the API:

```bash
curl http://localhost:3000/health
```

Expected response:

```json
{"status":"ok"}
```

### 3. Stop local services

```bash
docker compose down
```

Add `-v` only when you intentionally want to remove the PostgreSQL volume and
all local development data:

```bash
docker compose down -v
```

## Configuration

Copy `.env.example` to `.env`. The application exits when any required
variable is missing.

| Variable | Required | Example | Description |
|---|---|---|---|
| `NODE_ENV` | No | `development` | Runtime mode; test routes are disabled in production. |
| `PORT` | Yes | `3000` | HTTP and Socket.IO port inside the container. |
| `DB_USER` | Yes | `postgres` | PostgreSQL user. |
| `DB_PASSWORD` | Yes | `changeme` | PostgreSQL password. |
| `DB_NAME` | Yes | `pulse_notifications` | Database name. |
| `DB_HOST` | Yes | `postgres` | PostgreSQL hostname. |
| `DB_PORT` | Yes | `5432` | PostgreSQL port. |
| `REDIS_HOST` | Yes | `redis` | Redis hostname. |
| `REDIS_PORT` | Yes | `6379` | Redis port. |
| `JWT_SECRET` | Yes | change-me | Secret used to sign access tokens. |
| `CORS_ORIGIN` | No | `https://app.example.com` | Allowed frontend origin in production. |

For the test suite, `.env.test` points to the isolated test database on port
`5433` and the local Redis instance.

## API reference

All protected routes require:

```http
Authorization: Bearer <access-token>
```

Errors use the centralized application error format and include a request ID
in logs for correlation.

### Authentication — `/api/auth`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/register` | No | Create a user and return user, access token, and refresh token. |
| `POST` | `/login` | No | Authenticate and return user, access token, and refresh token. |
| `POST` | `/refresh` | No | Rotate a valid refresh token and return replacement tokens. |
| `GET` | `/me` | Yes | Return the authenticated user's identity. |

Registration requires a valid email and a password of at least eight
characters. Login intentionally uses the same error for an unknown email and
an incorrect password.

Example:

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"alice","email":"alice@example.com","password":"password123"}'
```

### Notifications — `/api/notifications`

All notification routes require authentication.

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/?limit=20&offset=0` | Return bounded, paginated notifications. |
| `GET` | `/unread-count` | Return the current user's unread count. |
| `PATCH` | `/:id/read` | Mark one owned notification as read. |
| `PATCH` | `/read-all` | Mark all notifications as read. |
| `DELETE` | `/:id` | Delete one owned notification. |

Missing or non-owned IDs return a not-found response without revealing which
case occurred.

### Preferences — `/api/preferences`

All preference routes require authentication.

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/` | List the current user's preferences. |
| `PATCH` | `/:type` | Update in-app and email settings for one event type. |

The event type is checked against the shared event-type definition.

### Development test events — `/api/test-events`

These routes are mounted only when `NODE_ENV` is not `production`. They are
intended for local demonstrations, not external producer traffic.

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/post-liked` | Emit a `POST_LIKED` event. |
| `POST` | `/user-followed` | Emit a `USER_FOLLOWED` event. |

Both routes require authentication. Their request bodies still need stronger
runtime validation before they should be exposed beyond development.

## WebSocket reference

Connect with a JWT in the Socket.IO handshake:

```js
import { io } from "socket.io-client";

const socket = io("http://localhost:3000", {
  auth: { token: "<access-token>" },
});

socket.on("sync", ({ notifications }) => {
  console.log("Unread notifications:", notifications);
});

socket.on("notification", (notification) => {
  console.log("New notification:", notification);
});
```

On connection, the server:

1. verifies the JWT;
2. joins the socket to `user:<id>`;
3. retrieves up to 50 newest notifications;
4. emits the unread subset in a `sync` event.

Every device for the same user joins the same room. A notification published
by any instance is delivered to all local instances through Redis, and each
instance emits only if it owns a connection for that user.

## Event model

Events are created with this envelope:

```json
{
  "eventId": "uuid",
  "eventType": "POST_LIKED",
  "timestamp": "2026-01-01T00:00:00.000Z",
  "source": "example-service",
  "actorId": "uuid",
  "targetUserId": "uuid",
  "payload": {}
}
```

Defined event types:

| Event type | Consumer | Current status |
|---|---|---|
| `POST_LIKED` | Yes | Wired to notification creation and delivery |
| `USER_FOLLOWED` | Yes | Wired to notification creation and delivery |
| `COMMENT_CREATED` | No | Constant only |
| `MESSAGE_RECEIVED` | No | Constant only |
| `ORDER_STATUS_CHANGED` | No | Constant only |
| `PAYMENT_COMPLETED` | No | Constant only |
| `SECURITY_ALERT` | No | Constant only |

`eventId` is generated with `randomUUID()` and stored as a unique database
value. A duplicate event is ignored by the outbox insert and by notification
creation. Event envelopes and development producer bodies are validated with
Zod before persistence.

## Database schema

Migrations are applied in filename order:

### `users`

Stores usernames, unique email addresses, bcrypt password hashes, and
timestamps.

### `notifications`

Stores the unique `event_id`, recipient, optional actor, event type, title,
message, JSONB metadata, read state, and timestamps. Recipient deletion
cascades to notifications; deleting an actor sets `actor_id` to null.

### `notification_preferences`

Stores per-user in-app and email settings. The pair
`(user_id, notification_type)` is unique and maintained with an upsert.

### `refresh_tokens`

Stores hashed refresh tokens, owning users, expiration, revocation state, and
timestamps. Raw refresh tokens are returned to clients but are not persisted.

Important indexes include the notification feed index on
`(recipient_id, created_at DESC)` and the unread-count index on
`(recipient_id, is_read)`.

## Testing and CI

### Run tests locally

Start the test dependencies:

```bash
docker compose up -d postgres_test redis
```

Then run:

```bash
npm install
npm test
```

`npm test` applies test migrations and runs Vitest. The test suite requires a
reachable PostgreSQL instance on `localhost:5433` and Redis on
`localhost:6379`; without those services, migration startup fails before
Vitest begins.

Useful scripts:

| Command | Purpose |
|---|---|
| `npm run start` | Start the server |
| `npm run dev` | Start with Nodemon |
| `npm run migrate` | Apply development migrations |
| `npm run migrate:test` | Apply test migrations |
| `npm test` | Migrate the test database and run Vitest |

### What is tested

- retry and backoff behavior
- authentication service behavior
- notification service behavior
- PostgreSQL repository behavior and constraints
- Socket.IO authentication and delivery behavior

GitHub Actions runs the test job on pushes and pull requests to `main` with
fresh PostgreSQL and Redis service containers.

## Operational guidance

### Local scaling demonstration

Run both application services:

```bash
docker compose up --build -d app app2 postgres redis
```

Connect a client to port `3000`, then call a test-event endpoint on port
`3001` with the same user's access token. Redis should fan the delivery
message across both instances, allowing the socket connected to port `3000` to
receive it.

### Shutdown behavior

The server handles `SIGTERM` and `SIGINT`, closes the HTTP server, PostgreSQL
pool, and Redis clients, and forces exit after a ten-second timeout.

### Logging

Pino emits structured logs for requests, authentication-relevant operations,
notification creation, connection lifecycle, failures, and shutdown. Request
IDs are attached to incoming requests for correlation.

## Security

Implemented baseline protections:

- bcrypt password hashing
- JWT verification for REST and WebSocket authentication
- hashed refresh-token persistence
- generic login errors to reduce account enumeration
- parameterized SQL queries
- Zod validation on supported API schemas
- Redis-backed authentication rate limiting
- Helmet security headers
- configurable CORS with production checks
- ten-kilobyte JSON request limit
- centralized errors without internal-error details in responses
- non-root application container
- production container installation without development dependencies
- development test routes excluded from production

Bearer headers are used instead of authentication cookies, so CSRF protection
is not currently required. If browser cookies are introduced, add CSRF
protection before using them for authentication.

## Remaining work

The P0 reliability work is implemented. The remaining work is now primarily
hardening, product expansion, and production operations.

### Reliability follow-ups

- Add an administrative workflow to inspect and replay dead-letter events.
- Add metrics and alerts for pending, processing, and dead-letter outbox rows.
- Consider a separate worker deployment when API and event-processing scaling
  requirements diverge.

### Security and operations

- **Make refresh-token rotation transactional.** Revoking the old token and
  storing the replacement are separate operations; a failure between them can
  invalidate a session without issuing replacement credentials.
- **Add session management.** Consider global logout, per-device sessions,
  refresh-token cleanup, and reuse detection.
- **Add access-token revocation strategy.** Current revocation applies to
  refresh tokens; already-issued access tokens remain valid until expiry.
- **Protect WebSocket handshakes and messages.** Add connection/IP limits and
  abuse controls separate from HTTP rate limiting.
- **Harden Redis message parsing.** Validate and safely handle malformed
  Pub/Sub payloads instead of allowing callback exceptions.
- **Add health/readiness checks.** `/health` currently reports application
  liveness only; production orchestration should also be able to distinguish
  database and Redis readiness.
- **Add metrics and tracing.** Track event lag, notification creation errors,
  Pub/Sub delivery, WebSocket connections, unread sync size, and endpoint
  latency.

### P2 — Product completeness

- Implement handlers and tests for `SECURITY_ALERT`,
  `COMMENT_CREATED`, `MESSAGE_RECEIVED`, `ORDER_STATUS_CHANGED`, and
  `PAYMENT_COMPLETED`, or remove unsupported constants.
- Add email or other out-of-band notification delivery if the `email_enabled`
  preference is intended to have behavior.
- Add cursor pagination for large notification feeds.
- Add API/OpenAPI documentation and contract tests.
- Add production deployment manifests, secret management, backups, and
  rollback guidance.
- Run and document repeatable load, failure-injection, and multi-instance
  chaos tests.

## Known limitations

- Redis Pub/Sub is not replayable.
- Notification delivery is best effort after database persistence.
- Redis is required for startup and authentication rate limiting.
- Connection sync returns up to 50 unread notifications.
- There is no built-in email sender despite storing email preferences.
- Load and chaos testing are not part of the repository's automated CI job.

## License

ISC

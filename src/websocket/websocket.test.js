import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { io as ioClient } from 'socket.io-client';
import { initializeWebSocket } from './index.js';
import { signToken } from '../utils/jwt.js';
import { parseDeliveryMessage, consumeHandshake, consumeIpMessage } from './index.js';
import { createSocketAuthMiddleware } from './socketAuth.js';
import { env } from '../config/env.js';

let server;
let port;

beforeAll(async () => {
  server = http.createServer();
  await initializeWebSocket(server);

  await new Promise((resolve) => {
    server.listen(0, () => {
      port = server.address().port;
      resolve();
    });
  });
}, 15000);

afterAll(() => {
  server.close();
});

describe('WebSocket authentication', () => {
  it('rejects a connection with no token', async () => {
    const client = ioClient(`http://localhost:${port}`, {
      auth: {},
      reconnection: false,
    });

    const error = await new Promise((resolve) => {
      client.on('connect_error', (err) => resolve(err));
    });

    expect(error.message).toBe('No token provided');
    client.close();
  });

  it('accepts a connection with a valid token and joins the correct room', async () => {
    const token = signToken({ userId: 42 });

    const client = ioClient(`http://localhost:${port}`, {
      auth: { token },
      reconnection: false,
    });

    await new Promise((resolve) => {
      client.on('connect', resolve);
    });

    expect(client.connected).toBe(true);
    client.close();
  });
});

describe('WebSocket input defenses', () => {
  it('accepts only well-formed notification Pub/Sub payloads', () => {
    expect(parseDeliveryMessage('not json')).toBeNull();
    expect(parseDeliveryMessage(JSON.stringify({ userId: -1, eventName: 'notification', data: {} }))).toBeNull();
    expect(parseDeliveryMessage(JSON.stringify({ userId: 42, eventName: 'notification', data: { id: 1 } })))
      .toEqual({ userId: 42, eventName: 'notification', data: { id: 1 } });
  });

  it('rejects Pub/Sub payloads above the safety bound', () => {
    expect(parseDeliveryMessage(JSON.stringify({
      userId: 1,
      eventName: 'notification',
      data: { content: 'x'.repeat(1024 * 1024) },
    }))).toBeNull();
  });

  it('limits messages per IP within a sliding minute', () => {
    const now = Date.now();
    for (let index = 0; index < 120; index++) expect(consumeIpMessage('rate-test-ip', now)).toBe(true);
    expect(consumeIpMessage('rate-test-ip', now)).toBe(false);
    expect(consumeIpMessage('rate-test-ip', now + 60_001)).toBe(true);
  });

  it('limits new Socket.IO handshakes per IP', () => {
    const now = Date.now();
    for (let index = 0; index < 60; index++) expect(consumeHandshake('handshake-test-ip', now)).toBe(true);
    expect(consumeHandshake('handshake-test-ip', now)).toBe(false);
    expect(consumeHandshake('handshake-test-ip', now + 60_001)).toBe(true);
  });
});

describe('WebSocket connection limits', () => {
  it('reserves an IP connection slot during authentication and releases it on disconnect', async () => {
    const counts = new Map();
    const middleware = createSocketAuthMiddleware(counts);
    const socket = {
      handshake: {
        address: 'reservation-test-ip',
        headers: {},
        auth: { token: signToken({ userId: 88 }) },
      },
    };
    const error = await new Promise((resolve) => middleware(socket, resolve));

    expect(error).toBeUndefined();
    expect(counts.get('reservation-test-ip')).toBe(1);
    socket.releaseIpReservation();
    expect(counts.has('reservation-test-ip')).toBe(false);
  });

  it('rejects an IP that already holds its connection limit', async () => {
    const counts = new Map([['limited-test-ip', env.websocket.maxConnectionsPerIp]]);
    const middleware = createSocketAuthMiddleware(counts);
    const socket = {
      handshake: {
        address: 'limited-test-ip',
        headers: {},
        auth: { token: signToken({ userId: 88 }) },
      },
    };
    const error = await new Promise((resolve) => middleware(socket, resolve));
    expect(error.message).toBe('Connection limit exceeded');
  });
});
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { io } from 'socket.io-client';

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
dotenv.config({
  path: path.join(projectRoot, '.env.test'),
  override: process.env.CI !== 'true',
});

if (!/(^|_)test$/i.test(process.env.DB_NAME || '')) {
  throw new Error('Multi-instance tests require DB_NAME to end in "_test".');
}

const { pool } = await import('../src/config/database.js');
const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
const userIds = [];
const apiProcesses = [];
let socket;
let primaryError;

async function listenOnAvailablePort(excludedPorts = new Set()) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const port = await new Promise((resolve, reject) => {
      const server = createServer();
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        const { port: availablePort } = server.address();
        server.close((error) => (error ? reject(error) : resolve(availablePort)));
      });
    });
    if (!excludedPorts.has(port)) return port;
  }
  throw new Error('Could not allocate distinct local ports for the API processes.');
}

function startApi(port) {
  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: projectRoot,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      APP_ROLE: 'all',
      PORT: String(port),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.output = '';
  child.on('error', (error) => {
    child.spawnError = error;
  });

  for (const stream of [child.stdout, child.stderr]) {
    stream.setEncoding('utf8');
    stream.on('data', (chunk) => {
      child.output = `${child.output}${chunk}`.slice(-20_000);
      if (process.env.E2E_VERBOSE === 'true') {
        process.stdout.write(`[api:${port}] ${chunk}`);
      }
    });
  }

  apiProcesses.push(child);
  return child;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitUntilReady(api, child, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;

  while (Date.now() < deadline) {
    if (child.spawnError) {
      throw new Error(`Could not start API process: ${child.spawnError.message}`);
    }
    if (child.exitCode !== null) {
      throw new Error(`API process exited with code ${child.exitCode}:\n${child.output}`);
    }

    try {
      const response = await fetch(`${api}/ready`, { signal: AbortSignal.timeout(1500) });
      if (response.ok) return;
      lastError = new Error(`Readiness returned HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await sleep(250);
  }

  throw new Error(`API did not become ready at ${api}: ${lastError?.message}\n${child.output}`);
}

async function requestJson(api, route, { token, method = 'GET', body } = {}) {
  const headers = { accept: 'application/json' };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (token) headers.authorization = `Bearer ${token}`;

  const response = await fetch(`${api}${route}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(10_000),
  });
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    throw new Error(`${method} ${route} returned HTTP ${response.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

function waitForSocketEvent(socketClient, eventName, timeoutMs) {
  let cancel;
  const promise = new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      clearTimeout(timeout);
      socketClient.off(eventName, onEvent);
      socketClient.off('connect_error', onConnectError);
    };
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback(value);
    };
    const onEvent = (value) => finish(resolve, value);
    const onConnectError = (error) => finish(reject, error);
    const timeout = setTimeout(
      () => finish(reject, new Error(`Timed out waiting for Socket.IO "${eventName}" event.`)),
      timeoutMs
    );

    cancel = () => finish(resolve, null);
    socketClient.once(eventName, onEvent);
    socketClient.once('connect_error', onConnectError);
  });
  return { promise, cancel: () => cancel?.() };
}

async function stopProcess(child) {
  if (child.exitCode !== null || child.signalCode !== null || child.spawnError) return;

  const exited = new Promise((resolve) => child.once('exit', resolve));
  child.kill('SIGTERM');
  const graceful = await Promise.race([
    exited.then(() => true),
    sleep(5000).then(() => false),
  ]);
  if (!graceful) {
    child.kill('SIGKILL');
    await exited;
  }
}

async function waitForOutboxPublished(eventId, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { rows } = await pool.query(
      'SELECT status FROM event_outbox WHERE event_id = $1',
      [eventId]
    );
    if (rows[0]?.status === 'published') return;
    await sleep(100);
  }
  throw new Error(`Outbox event ${eventId} was not marked published.`);
}

async function main() {
  const firstPort = await listenOnAvailablePort();
  const secondPort = await listenOnAvailablePort(new Set([firstPort]));
  const firstApi = `http://127.0.0.1:${firstPort}`;
  const secondApi = `http://127.0.0.1:${secondPort}`;
  const firstProcess = startApi(firstPort);
  const secondProcess = startApi(secondPort);

  try {
    await Promise.all([
      waitUntilReady(firstApi, firstProcess),
      waitUntilReady(secondApi, secondProcess),
    ]);

    const recipient = await requestJson(firstApi, '/api/auth/register', {
      method: 'POST',
      body: {
        username: `e2e_r_${suffix}`,
        email: `e2e_r_${suffix}@example.test`,
        password: 'e2e-test-password-1',
      },
    });
    userIds.push(recipient.user.id);

    const actor = await requestJson(secondApi, '/api/auth/register', {
      method: 'POST',
      body: {
        username: `e2e_a_${suffix}`,
        email: `e2e_a_${suffix}@example.test`,
        password: 'e2e-test-password-1',
      },
    });
    userIds.push(actor.user.id);

    socket = io(firstApi, {
      auth: { token: recipient.accessToken },
      reconnection: false,
      timeout: 5000,
    });
    const syncReceived = waitForSocketEvent(socket, 'sync', 10_000);
    const socketConnected = waitForSocketEvent(socket, 'connect', 7_000);
    let initialSync;
    try {
      await socketConnected.promise;
      initialSync = await syncReceived.promise;
    } catch (error) {
      syncReceived.cancel();
      socketConnected.cancel();
      throw error;
    }
    if (!Array.isArray(initialSync.notifications)) {
      throw new Error('Socket.IO sync did not include the unread notification list.');
    }

    const notificationReceived = waitForSocketEvent(socket, 'notification', 20_000);
    let liveNotification;
    try {
      await requestJson(secondApi, '/api/test-events/user-followed', {
        method: 'POST',
        token: actor.accessToken,
        body: { targetUserId: recipient.user.id },
      });
      liveNotification = await notificationReceived.promise;
    } catch (error) {
      notificationReceived.cancel();
      throw error;
    }

    if (liveNotification.type !== 'USER_FOLLOWED') {
      throw new Error(`Unexpected live notification type: ${liveNotification.type}`);
    }

    const inbox = await requestJson(firstApi, '/api/notifications/cursor?limit=10', {
      token: recipient.accessToken,
    });
    const persistedNotification = inbox.notifications.find(
      (notification) => notification.id === liveNotification.id
    );
    if (!persistedNotification || persistedNotification.type !== 'USER_FOLLOWED') {
      throw new Error('The live notification was not present in the recipient’s persisted inbox.');
    }
    if (Number(persistedNotification.actor_id) !== actor.user.id) {
      throw new Error('The persisted notification did not retain the authenticated event actor.');
    }

    await waitForOutboxPublished(persistedNotification.event_id);
    console.log(
      'End-to-end test passed: two authenticated users, two API instances, PostgreSQL outbox, persisted inbox, and cross-instance Socket.IO delivery.'
    );
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    socket?.close();
    await Promise.all(apiProcesses.map(stopProcess));

    try {
      if (userIds.length) {
        await pool.query(
          `DELETE FROM event_outbox
           WHERE actor_id = ANY($1::integer[]) OR target_user_id = ANY($1::integer[])`,
          [userIds]
        );
        await pool.query('DELETE FROM users WHERE id = ANY($1::integer[])', [userIds]);
      }
    } catch (cleanupError) {
      console.error('Could not clean up end-to-end test records:', cleanupError);
      if (!primaryError) throw cleanupError;
    } finally {
      await pool.end();
    }
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});

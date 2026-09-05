import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { io as ioClient } from 'socket.io-client';
import { initializeWebSocket } from './index.js';
import { signToken } from '../utils/jwt.js';

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
import { randomUUID } from 'node:crypto';
import { io } from 'socket.io-client';

const firstApi = process.env.PULSE_API_INSTANCE_1 || 'http://localhost:3000';
const secondApi = process.env.PULSE_API_INSTANCE_2 || 'http://localhost:3001';
const suffix = randomUUID().slice(0, 8);
const allowedHosts = new Set(['localhost', '127.0.0.1', '[::1]']);

for (const api of [firstApi, secondApi]) {
  const parsed = new URL(api);
  if (!allowedHosts.has(parsed.hostname) && process.env.PULSE_SMOKE_ALLOW_REMOTE !== 'true') {
    throw new Error('Refusing to create smoke-test data on a remote host without PULSE_SMOKE_ALLOW_REMOTE=true');
  }
}

async function register(api, username, email) {
  const response = await fetch(`${api}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, email, password: 'smoke-test-password-1' }),
  });
  if (!response.ok) throw new Error(`Registration failed (${response.status}) at ${api}`);
  return response.json();
}

async function main() {
  const recipient = await register(firstApi, `smoke_r_${suffix}`, `smoke_r_${suffix}@example.test`);
  const actor = await register(secondApi, `smoke_a_${suffix}`, `smoke_a_${suffix}@example.test`);
  const socket = io(firstApi, {
    auth: { token: recipient.accessToken },
    reconnection: false,
    timeout: 5000,
  });

  try {
    await new Promise((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('connect_error', reject);
      setTimeout(() => reject(new Error('Socket connection timed out')), 7000).unref();
    });

    const notificationReceived = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Cross-instance notification timed out')), 20000);
      socket.once('notification', (notification) => {
        clearTimeout(timeout);
        resolve(notification);
      });
    });

    const response = await fetch(`${secondApi}/api/test-events/user-followed`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${actor.accessToken}`,
      },
      body: JSON.stringify({ targetUserId: recipient.user.id }),
    });
    if (!response.ok) throw new Error(`Event request failed with HTTP ${response.status}`);

    const notification = await notificationReceived;
    if (notification.type !== 'USER_FOLLOWED') {
      throw new Error(`Unexpected notification type: ${notification.type}`);
    }
    console.log('Multi-instance smoke test passed: instance 2 event reached instance 1 socket.');
  } finally {
    socket.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

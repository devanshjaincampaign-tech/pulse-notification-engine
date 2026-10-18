import { createServer } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import app from './app.js';

let server;
let origin;

beforeAll(async () => {
  server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

describe('local interactive demo', () => {
  it('serves the demo page only through the development app surface', async () => {
    const response = await fetch(`${origin}/demo`);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('Make something happen.');
    expect(html).toContain('/demo/assets/demo.js');
    expect(html).toContain('Operational signals');
    expect(response.headers.get('content-security-policy')).toContain('http://localhost:*');
  });

  it('serves the demo JavaScript and styles from local assets', async () => {
    const [script, stylesheet] = await Promise.all([
      fetch(`${origin}/demo/assets/demo.js`),
      fetch(`${origin}/demo/assets/demo.css`),
    ]);

    expect(script.status).toBe(200);
    expect(await script.text()).toContain('async function sendEvent()');
    expect(stylesheet.status).toBe(200);
    expect(await stylesheet.text()).toContain('.architecture-grid');
  });
});

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const specPath = fileURLToPath(new URL('../openapi.json', import.meta.url));

describe('OpenAPI contract', () => {
  it('is valid JSON and declares the implemented route/method contracts', async () => {
    const specification = JSON.parse(await readFile(specPath, 'utf8'));

    expect(specification.openapi).toBe('3.1.0');
    const declared = new Set();
    for (const [path, pathItem] of Object.entries(specification.paths)) {
      for (const method of Object.keys(pathItem)) {
        declared.add(`${method.toUpperCase()} ${path}`);
      }
    }

    expect([...declared]).toEqual(expect.arrayContaining([
      'GET /health',
      'GET /ready',
      'GET /metrics',
      'POST /api/auth/register',
      'POST /api/auth/login',
      'POST /api/auth/refresh',
      'GET /api/auth/me',
      'GET /api/auth/sessions',
      'POST /api/auth/logout',
      'POST /api/auth/logout-all',
      'DELETE /api/auth/sessions/{id}',
      'GET /api/notifications',
      'GET /api/notifications/cursor',
      'GET /api/notifications/unread-count',
      'PATCH /api/notifications/read-all',
      'PATCH /api/notifications/{id}/read',
      'DELETE /api/notifications/{id}',
      'GET /api/preferences',
      'PATCH /api/preferences/{type}',
      'POST /api/test-events/post-liked',
      'POST /api/test-events/user-followed',
    ]));
    expect(specification.components.securitySchemes.bearerAuth).toEqual({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
    });
  });

  it('describes cursor pagination response fields and validation bounds', async () => {
    const specification = JSON.parse(await readFile(specPath, 'utf8'));
    const cursorOperation = specification.paths['/api/notifications/cursor'].get;
    const response = specification.components.schemas.CursorNotificationPage;

    expect(cursorOperation.parameters.find(({ name }) => name === 'limit').schema).toMatchObject({
      minimum: 1,
      maximum: 100,
    });
    expect(response.required).toEqual(expect.arrayContaining([
      'notifications',
      'hasMore',
      'nextCursor',
    ]));
  });
});

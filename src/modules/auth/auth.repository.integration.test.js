import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { pool } from '../../config/database.js';
import { findUserByEmail, createUser } from './auth.repository.js';

beforeEach(async () => {
  await pool.query('DELETE FROM users');
});

afterAll(async () => {
  await pool.end();
});

describe('auth.repository (integration)', () => {
  it('createUser inserts a real row and findUserByEmail retrieves it', async () => {
    await createUser({
      username: 'integrationuser',
      email: 'integration@example.com',
      passwordHash: 'fakehash123',
    });

    const found = await findUserByEmail('integration@example.com');

    expect(found).not.toBeNull();
    expect(found.username).toBe('integrationuser');
    expect(found.password_hash).toBe('fakehash123');
  });

  it('findUserByEmail returns null for a genuinely nonexistent email', async () => {
    const found = await findUserByEmail('doesnotexist@example.com');
    expect(found).toBeNull();
  });
});
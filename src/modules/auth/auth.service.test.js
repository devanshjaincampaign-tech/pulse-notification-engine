import { describe, it, expect, vi } from 'vitest';

vi.mock('./auth.repository.js', () => ({
  findUserByEmail: vi.fn(),
  createUser: vi.fn(),
}));

vi.mock('bcrypt', () => ({
  default: {
    hash: vi.fn().mockResolvedValue('hashed_password_123'),
  },
}));

vi.mock('./refreshToken.repository.js', () => ({
  storeRefreshToken: vi.fn(),
  findValidRefreshToken: vi.fn(),
  revokeRefreshToken: vi.fn(),
}));

import { registerUser } from './auth.service.js';
import { findUserByEmail, createUser } from './auth.repository.js';

describe('registerUser', () => {
  it('throws ConflictError when the email is already registered', async () => {
    findUserByEmail.mockResolvedValue({ id: 1, email: 'test@example.com' });

    await expect(
      registerUser({ username: 'test', email: 'test@example.com', password: 'password123' })
    ).rejects.toThrow('Email already registered');
  });

  it('creates a new user and returns a token when the email is available', async () => {
    findUserByEmail.mockResolvedValue(null);
    createUser.mockResolvedValue({ id: 2, username: 'newuser', email: 'new@example.com', created_at: new Date() });

    const result = await registerUser({ username: 'newuser', email: 'new@example.com', password: 'password123' });

    expect(result.user.email).toBe('new@example.com');
    expect(result.accessToken).toBeDefined();
    expect(result.refreshToken).toBeDefined();
    expect(createUser).toHaveBeenCalledWith({
      username: 'newuser',
      email: 'new@example.com',
      passwordHash: 'hashed_password_123',
    });
  });
});
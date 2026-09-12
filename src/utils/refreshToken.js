import { randomBytes, createHash } from 'crypto';

export function generateRefreshToken() {
  return randomBytes(40).toString('hex');
}

export function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}
import { z } from 'zod';

export const registerSchema = z.object({
  username: z.string().min(3).max(50),
  email: z.string().email(),
  password: z.string().min(8),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  deviceName: z.string().trim().min(1).max(100).optional(),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export const sessionIdParamSchema = z.object({
  id: z.string().uuid(),
});
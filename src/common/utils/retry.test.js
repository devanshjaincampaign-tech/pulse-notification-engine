import { describe, it, expect, vi } from 'vitest';
import { retryWithBackoff } from './retry.js';

describe('retryWithBackoff', () => {
  it('returns the result immediately if the function succeeds on the first attempt', async () => {
    const fn = vi.fn().mockResolvedValue('success');

    const result = await retryWithBackoff(fn, { maxAttempts: 3, baseDelayMs: 1 });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries and eventually succeeds after transient failures', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValueOnce('success');

    const result = await retryWithBackoff(fn, { maxAttempts: 5, baseDelayMs: 1 });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('throws after exhausting all attempts', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('permanent failure'));

    await expect(
      retryWithBackoff(fn, { maxAttempts: 3, baseDelayMs: 1 })
    ).rejects.toThrow('permanent failure');

    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not retry when isRetryable returns false', async () => {
    const fn = vi.fn().mockRejectedValue(Object.assign(new Error('duplicate'), { code: '23505' }));

    await expect(
      retryWithBackoff(fn, { maxAttempts: 5, baseDelayMs: 1, isRetryable: (err) => err.code !== '23505' })
    ).rejects.toThrow('duplicate');

    expect(fn).toHaveBeenCalledTimes(1);
  });
});
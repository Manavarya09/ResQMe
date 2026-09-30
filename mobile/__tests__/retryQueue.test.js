import { backoffDelay, createRetryQueue, isRetryableError, RETRY_BASE_MS, RETRY_MAX_MS } from '../src/lib/retryQueue';

const netErr = () => Object.assign(new Error('Cannot reach the ResQMe server.'), { status: 0 });
const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

describe('isRetryableError', () => {
  it('retries network and server errors only', () => {
    expect(isRetryableError({ status: 0 })).toBe(true);
    expect(isRetryableError({ status: 503 })).toBe(true);
    expect(isRetryableError({ status: 400 })).toBe(false);
    expect(isRetryableError({ status: 401 })).toBe(false);
    expect(isRetryableError(new Error('x'))).toBe(false);
    expect(isRetryableError(null)).toBe(false);
  });
});

describe('backoffDelay', () => {
  it('defaults to a steady 10 s cadence', () => {
    expect(RETRY_BASE_MS).toBe(10000);
    expect([0, 1, 5, 50].map((n) => backoffDelay(n))).toEqual([10000, 10000, 10000, 10000]);
  });

  it('grows exponentially and caps at the max', () => {
    const opts = { baseMs: 1000, factor: 2, maxMs: 8000 };
    expect([0, 1, 2, 3, 4, 10].map((n) => backoffDelay(n, opts))).toEqual([1000, 2000, 4000, 8000, 8000, 8000]);
    expect(backoffDelay(100, { factor: 3 })).toBe(RETRY_MAX_MS);
  });

  it('applies bounded jitter and never goes below the base', () => {
    expect(backoffDelay(2, { baseMs: 1000, factor: 2, jitter: 0.5, random: () => 1 })).toBe(6000);
    expect(backoffDelay(2, { baseMs: 1000, factor: 2, jitter: 0.5, random: () => 0 })).toBe(2000);
    expect(backoffDelay(0, { baseMs: 1000, jitter: 0.5, random: () => 0 })).toBe(1000);
  });

  it('treats bad attempts as 0', () => {
    expect(backoffDelay(-3)).toBe(10000);
    expect(backoffDelay(undefined)).toBe(10000);
  });
});

describe('createRetryQueue', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('retries every 10 s until the task succeeds', async () => {
    const task = jest.fn()
      .mockRejectedValueOnce(netErr())
      .mockRejectedValueOnce(netErr())
      .mockResolvedValueOnce({ id: 'inc-1' });
    const onSuccess = jest.fn();
    const onAttempt = jest.fn();
    const q = createRetryQueue({ task, onSuccess, onAttempt });
    q.start();

    expect(task).not.toHaveBeenCalled();
    jest.advanceTimersByTime(9999);
    expect(task).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    await flush();
    expect(task).toHaveBeenCalledTimes(1);
    expect(onAttempt).toHaveBeenLastCalledWith(1, expect.objectContaining({ status: 0 }));

    jest.advanceTimersByTime(10000);
    await flush();
    expect(task).toHaveBeenCalledTimes(2);

    jest.advanceTimersByTime(10000);
    await flush();
    expect(task).toHaveBeenCalledTimes(3);
    expect(onSuccess).toHaveBeenCalledWith({ id: 'inc-1' });
    expect(q.running).toBe(false);

    jest.advanceTimersByTime(60000);
    await flush();
    expect(task).toHaveBeenCalledTimes(3);
  });

  it('trigger() retries immediately (app foreground) without overlapping', async () => {
    let resolve;
    const task = jest.fn(() => new Promise((r) => { resolve = r; }));
    const onSuccess = jest.fn();
    const q = createRetryQueue({ task, onSuccess });
    q.start();
    q.trigger();
    q.trigger();
    expect(task).toHaveBeenCalledTimes(1);
    resolve('ok');
    await flush();
    expect(onSuccess).toHaveBeenCalledWith('ok');
    jest.advanceTimersByTime(20000);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('stops on a non-retryable error', async () => {
    const bad = Object.assign(new Error('Invalid'), { status: 400 });
    const task = jest.fn().mockRejectedValue(bad);
    const onFatal = jest.fn();
    const q = createRetryQueue({ task, onFatal });
    q.start({ immediate: true });
    await flush();
    expect(onFatal).toHaveBeenCalledWith(bad);
    jest.advanceTimersByTime(60000);
    await flush();
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('stop() cancels pending retries and ignores late results', async () => {
    let resolve;
    const task = jest.fn(() => new Promise((r) => { resolve = r; }));
    const onSuccess = jest.fn();
    const q = createRetryQueue({ task, onSuccess });
    q.start({ immediate: true });
    q.stop();
    resolve('late');
    await flush();
    expect(onSuccess).not.toHaveBeenCalled();
    jest.advanceTimersByTime(60000);
    expect(task).toHaveBeenCalledTimes(1);
    q.trigger();
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('uses a custom delay schedule', async () => {
    const task = jest.fn().mockRejectedValue(netErr());
    const q = createRetryQueue({ task, delay: (n) => backoffDelay(n, { baseMs: 1000, factor: 2, maxMs: 4000 }) });
    q.start();
    jest.advanceTimersByTime(1000); await flush();
    expect(task).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(1999); await flush();
    expect(task).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(1); await flush();
    expect(task).toHaveBeenCalledTimes(2);
    jest.advanceTimersByTime(4000); await flush();
    expect(task).toHaveBeenCalledTimes(3);
    expect(q.attempts).toBe(3);
    q.stop();
  });
});

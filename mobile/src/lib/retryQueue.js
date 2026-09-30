// Pure retry helpers for the offline SOS queue. No React / storage imports so they unit-test cleanly.

export const RETRY_BASE_MS = 10000;
export const RETRY_MAX_MS = 60000;

// A network failure (server unreachable / timeout) surfaces from api.js as ApiError status 0.
// 5xx is also worth retrying; 4xx means the payload itself was rejected and retrying won't help.
export function isRetryableError(e) {
  const s = e?.status;
  return s === 0 || (typeof s === 'number' && s >= 500);
}

// Delay before retry number `attempt` (0-based). Defaults to a steady 10 s cadence — for an SOS we
// want to keep knocking at a fixed short interval rather than back off. Pass factor > 1 for
// exponential backoff; the result is always clamped to [baseMs, maxMs].
export function backoffDelay(attempt, { baseMs = RETRY_BASE_MS, factor = 1, maxMs = RETRY_MAX_MS, jitter = 0, random = Math.random } = {}) {
  const n = Math.max(0, Math.floor(Number(attempt) || 0));
  const raw = baseMs * Math.pow(factor, n);
  const spread = jitter > 0 ? raw * jitter * (random() * 2 - 1) : 0;
  return Math.round(Math.min(maxMs, Math.max(baseMs, raw + spread)));
}

// Retries `task` until it resolves or fails with a non-retryable error.
//   task()            -> Promise<result>
//   onSuccess(result) -> called once, then the queue stops
//   onFatal(error)    -> non-retryable failure, the queue stops
//   onAttempt(n, err) -> optional, after each failed retryable attempt
// `trigger()` runs an attempt right away (e.g. when the app returns to the foreground); overlapping
// attempts are never started. Timers are injectable for tests.
export function createRetryQueue({
  task,
  onSuccess,
  onFatal,
  onAttempt,
  shouldRetry = isRetryableError,
  delay = (attempt) => backoffDelay(attempt),
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}) {
  let attempt = 0;
  let timer = null;
  let inFlight = false;
  let stopped = true;

  const schedule = () => {
    if (stopped) return;
    clearTimer(timer);
    timer = setTimer(run, delay(attempt));
  };

  async function run() {
    if (stopped || inFlight) return;
    clearTimer(timer);
    timer = null;
    inFlight = true;
    try {
      const result = await task();
      if (stopped) return;
      stopped = true;
      onSuccess?.(result);
    } catch (e) {
      if (stopped) return;
      if (!shouldRetry(e)) {
        stopped = true;
        onFatal?.(e);
        return;
      }
      onAttempt?.(attempt + 1, e);
      attempt += 1;
      schedule();
    } finally {
      inFlight = false;
    }
  }

  return {
    // Begin waiting for the first retry (the caller already made the initial attempt).
    start({ immediate = false } = {}) {
      if (!stopped) return;
      stopped = false;
      if (immediate) run();
      else schedule();
    },
    trigger() {
      if (stopped || inFlight) return;
      run();
    },
    stop() {
      stopped = true;
      clearTimer(timer);
      timer = null;
    },
    get attempts() { return attempt; },
    get running() { return !stopped; },
  };
}

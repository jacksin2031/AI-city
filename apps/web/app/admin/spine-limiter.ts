/** Runs at most `limit` async jobs at once; the rest wait in arrival order. */
export function createLimiter(limit: number) {
  let active = 0;
  const waiting: Array<() => void> = [];
  function release() {
    active -= 1;
    waiting.shift()?.();
  }
  return async function run<T>(job: () => Promise<T>): Promise<T> {
    if (active >= limit) await new Promise<void>((resolve) => waiting.push(resolve));
    active += 1;
    try {
      return await job();
    } finally {
      release();
    }
  };
}

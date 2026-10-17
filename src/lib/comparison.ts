/** A page of favorites must not start an unbounded set of provider requests. */
export const COMPARISON_PAGE_SIZE = 6;
export const COMPARISON_CONCURRENCY = 3;

export type ComparisonResult<T> = { data: T; error: null } | { data: null; error: unknown };

/** Abort stops queued work and suppresses results from obsolete selections. */
export async function runComparisonBatch<T, U>(
  items: readonly T[],
  load: (item: T, signal: AbortSignal) => Promise<U>,
  onResult: (item: T, result: ComparisonResult<U>) => void,
  signal: AbortSignal,
): Promise<void> {
  let cursor = 0;
  const worker = async () => {
    while (!signal.aborted && cursor < items.length) {
      const item = items[cursor++];
      let result: ComparisonResult<U>;
      try { result = { data: await load(item, signal), error: null }; }
      catch (error) { result = { data: null, error }; }
      if (!signal.aborted) onResult(item, result);
    }
  };
  await Promise.all(Array.from({ length: Math.min(COMPARISON_CONCURRENCY, items.length) }, worker));
}

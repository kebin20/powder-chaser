import { describe, expect, it } from 'vitest';
import { COMPARISON_CONCURRENCY, COMPARISON_PAGE_SIZE, runComparisonBatch } from '../src/lib/comparison';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const flush = () => new Promise<void>(resolve => { queueMicrotask(resolve); });

describe('bounded favorites comparison requests', () => {
  it('loads a six-resort page using at most three concurrent requests', async () => {
    const items = Array.from({ length: COMPARISON_PAGE_SIZE }, (_, index) => index);
    const requests = items.map(() => deferred<number>());
    const started: number[] = [], completed: number[] = [];
    let active = 0, peak = 0;
    const run = runComparisonBatch(items, async item => {
      started.push(item); active++; peak = Math.max(peak, active);
      const result = await requests[item].promise;
      active--; return result;
    }, (item, result) => { expect(result.data).toBe(item); completed.push(item); }, new AbortController().signal);
    expect(started).toEqual([0, 1, 2]);
    requests[1].resolve(1); await flush(); await flush();
    expect(started).toEqual([0, 1, 2, 3]);
    requests.forEach((request, index) => request.resolve(index));
    await run;
    expect(peak).toBe(COMPARISON_CONCURRENCY);
    expect(completed.sort()).toEqual(items);
  });

  it('keeps loading other resorts when one provider request fails', async () => {
    const results: { item: number; failed: boolean }[] = [];
    await runComparisonBatch([0, 1, 2, 3, 4], async item => {
      if (item === 1) throw new Error('Provider unavailable');
      return item;
    }, (item, result) => results.push({ item, failed: result.error !== null }), new AbortController().signal);
    expect(results).toHaveLength(5);
    expect(results.find(result => result.item === 1)?.failed).toBe(true);
    expect(results.filter(result => !result.failed)).toHaveLength(4);
  });

  it('aborts queued work and suppresses stale results even if a loader ignores cancellation', async () => {
    const controller = new AbortController();
    const requests = [deferred<number>(), deferred<number>(), deferred<number>()];
    const started: number[] = [], delivered: number[] = [];
    const run = runComparisonBatch([0, 1, 2, 3, 4, 5], async (item, signal) => {
      expect(signal).toBe(controller.signal); started.push(item);
      return requests[item].promise;
    }, item => delivered.push(item), controller.signal);
    controller.abort();
    requests.forEach((request, index) => request.resolve(index));
    await run;
    expect(started).toEqual([0, 1, 2]);
    expect(delivered).toEqual([]);
  });

  it('does not start requests when the screen has already been cancelled', async () => {
    const controller = new AbortController(); controller.abort();
    let started = 0;
    await runComparisonBatch([1, 2], async () => ++started, () => { throw new Error('Unexpected result'); }, controller.signal);
    expect(started).toBe(0);
  });
});

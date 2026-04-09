import { beforeEach, describe, expect, test } from '@jest/globals';
import N3 from 'n3';

function installWindow() {
  globalThis.window = { N3 };
}

describe('engine bindings collection', () => {
  beforeEach(() => {
    installWindow();
  });

  test('collectBindingsStream prefers toArray over an async iterator that never completes', async () => {
    const { collectBindingsStream } = await import('../docs/app/engine.js');

    const stream = {
      toArray: async () => [],
      [Symbol.asyncIterator]: () => ({
        next: () => new Promise(() => {})
      })
    };

    const result = await Promise.race([
      collectBindingsStream(stream),
      new Promise((resolve) => setTimeout(() => resolve('timeout'), 50))
    ]);

    expect(result).toEqual([]);
  });
});

import { beforeEach, describe, expect, test } from '@jest/globals';
import N3 from 'n3';

function installWindow() {
  globalThis.window = { N3 };
}

describe('report model resource inventory', () => {
  beforeEach(() => {
    installWindow();
  });

  test('inspectStore keeps asserted primary resources in per-resource output even without labels or failures', async () => {
    const { inspectStore } = await import('../docs/app/report-model.js');

    const store = new N3.Store([
      N3.DataFactory.quad(
        N3.DataFactory.namedNode('http://example.org/term/NoLabel'),
        N3.DataFactory.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
        N3.DataFactory.namedNode('http://www.w3.org/2002/07/owl#Class')
      )
    ]);

    const report = await inspectStore(
      store,
      'example.ttl',
      {
        queries: [],
        standards: []
      },
      null,
      {
        primaryStore: store
      }
    );

    expect(report.perResource).toEqual([
      expect.objectContaining({
        resource: 'http://example.org/term/NoLabel'
      })
    ]);
  });
});

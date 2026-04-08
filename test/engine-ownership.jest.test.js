import { beforeEach, describe, expect, test } from '@jest/globals';
import N3 from 'n3';

function installWindow() {
  globalThis.window = { N3 };
}

describe('engine ownership helpers', () => {
  beforeEach(() => {
    installWindow();
  });

  test('collectAssertedNamedResources returns named subjects asserted in the primary store', async () => {
    const { collectAssertedNamedResources } = await import('../docs/app/engine.js');

    const store = new N3.Store([
      N3.DataFactory.quad(
        N3.DataFactory.namedNode('http://example.org/owned/A'),
        N3.DataFactory.namedNode('http://www.w3.org/2000/01/rdf-schema#label'),
        N3.DataFactory.literal('A')
      ),
      N3.DataFactory.quad(
        N3.DataFactory.namedNode('http://example.org/owned/B'),
        N3.DataFactory.namedNode('http://example.org/p'),
        N3.DataFactory.blankNode('b1')
      ),
      N3.DataFactory.quad(
        N3.DataFactory.blankNode('b2'),
        N3.DataFactory.namedNode('http://example.org/p'),
        N3.DataFactory.namedNode('http://example.org/owned/C')
      )
    ]);

    expect(collectAssertedNamedResources(store)).toEqual([
      'http://example.org/owned/A',
      'http://example.org/owned/B'
    ]);
  });

  test('filterResultsByResourceSet keeps ontology rows but excludes imported resource rows', async () => {
    const { filterResultsByResourceSet } = await import('../docs/app/engine.js');

    const filtered = filterResultsByResourceSet([
      {
        resource: 'http://example.org/primary/A',
        queryId: 'q1',
        criterionId: 'STD:REQ',
        status: 'fail',
        severity: 'error',
        scope: 'resource',
        details: {}
      },
      {
        resource: 'http://example.org/import/B',
        queryId: 'q1',
        criterionId: 'STD:REQ',
        status: 'fail',
        severity: 'error',
        scope: 'resource',
        details: {}
      },
      {
        resource: 'http://example.org/onto',
        queryId: 'q2',
        criterionId: 'STD:ONTO',
        status: 'fail',
        severity: 'error',
        scope: 'ontology',
        details: {}
      }
    ], new Set(['http://example.org/primary/A']));

    expect(filtered).toEqual([
      expect.objectContaining({ resource: 'http://example.org/primary/A', scope: 'resource' }),
      expect.objectContaining({ resource: 'http://example.org/onto', scope: 'ontology' })
    ]);
  });
});

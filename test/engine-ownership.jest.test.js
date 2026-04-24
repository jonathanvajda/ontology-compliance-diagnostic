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

  test('extractExternalIriDependencies collects primary predicate/object IRIs and enriches from lookup store', async () => {
    const {
      extractExternalIriDependencies,
      CCO_CURATED_IN_ONTOLOGY_IRI
    } = await import('../docs/app/engine.js');
    const { namedNode, literal, quad } = N3.DataFactory;

    const primaryStore = new N3.Store([
      quad(
        namedNode('http://example.org/primary/ontology'),
        namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
        namedNode('http://www.w3.org/2002/07/owl#Ontology')
      ),
      quad(
        namedNode('http://example.org/primary/A'),
        namedNode('http://www.w3.org/2000/01/rdf-schema#subClassOf'),
        namedNode('http://example.org/import/B')
      ),
      quad(
        namedNode('http://example.org/import/C'),
        namedNode('http://example.org/import/p'),
        literal('annotation')
      )
    ]);

    const lookupStore = new N3.Store(primaryStore.getQuads(null, null, null, null));
    lookupStore.addQuad(
      namedNode('http://example.org/import/B'),
      namedNode('http://www.w3.org/2000/01/rdf-schema#label'),
      literal('Imported B')
    );
    lookupStore.addQuad(
      namedNode('http://example.org/import/B'),
      namedNode(CCO_CURATED_IN_ONTOLOGY_IRI),
      namedNode('http://example.org/import/ontology')
    );

    const dependencies = extractExternalIriDependencies(primaryStore, lookupStore);

    expect(dependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        iri: 'http://example.org/import/B',
        label: 'Imported B',
        curatedIn: 'http://example.org/import/ontology',
        reasons: ['object']
      }),
      expect.objectContaining({
        iri: 'http://example.org/import/C',
        reasons: ['external-subject']
      }),
      expect.objectContaining({
        iri: 'http://www.w3.org/2000/01/rdf-schema#subClassOf',
        reasons: ['predicate']
      })
    ]));
  });

  test('extractExternalIriDependencies falls back to common vocabulary curated-in namespaces', async () => {
    const { extractExternalIriDependencies } = await import('../docs/app/engine.js');
    const { namedNode, quad } = N3.DataFactory;

    const primaryStore = new N3.Store([
      quad(
        namedNode('http://example.org/primary/ontology'),
        namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
        namedNode('http://www.w3.org/2002/07/owl#Ontology')
      ),
      quad(
        namedNode('http://example.org/primary/A'),
        namedNode('http://www.w3.org/2004/02/skos/core#prefLabel'),
        namedNode('http://www.w3.org/2000/01/rdf-schema#Literal')
      )
    ]);

    const dependencies = extractExternalIriDependencies(primaryStore, primaryStore);

    expect(dependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        iri: 'http://www.w3.org/2004/02/skos/core#prefLabel',
        curatedIn: 'http://www.w3.org/2004/02/skos/core#'
      }),
      expect.objectContaining({
        iri: 'http://www.w3.org/2000/01/rdf-schema#Literal',
        curatedIn: 'http://www.w3.org/2000/01/rdf-schema#'
      })
    ]));
  });
});

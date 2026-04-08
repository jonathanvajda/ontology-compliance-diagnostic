import { beforeEach, describe, expect, test } from '@jest/globals';
import N3 from 'n3';

function installWindow() {
  globalThis.window = { N3 };
}

describe('edit-session helpers', () => {
  beforeEach(() => {
    installWindow();
  });

  test('buildMergedInspectionStore combines primary and supplemental stores', async () => {
    const { buildMergedInspectionStore } = await import('../docs/app/edit-session.js');

    const primaryStore = new N3.Store([
      N3.DataFactory.quad(
        N3.DataFactory.namedNode('http://example.org/A'),
        N3.DataFactory.namedNode('http://www.w3.org/2000/01/rdf-schema#label'),
        N3.DataFactory.literal('A')
      )
    ]);

    const supplementalStore = new N3.Store([
      N3.DataFactory.quad(
        N3.DataFactory.namedNode('http://example.org/B'),
        N3.DataFactory.namedNode('http://www.w3.org/2000/01/rdf-schema#label'),
        N3.DataFactory.literal('B')
      )
    ]);

    const merged = buildMergedInspectionStore(
      {
        store: primaryStore,
        prefixes: {},
        sourceFormat: 'text/turtle',
        baseIri: null,
        fileName: 'primary.ttl',
        originalText: ''
      },
      [{
        file: /** @type {File} */ ({ name: 'closure.ttl' }),
        parsedOntology: {
          store: supplementalStore,
          prefixes: {},
          sourceFormat: 'text/turtle',
          baseIri: null,
          fileName: 'closure.ttl',
          originalText: ''
        },
        summary: /** @type {any} */ ({ fileName: 'closure.ttl' })
      }]
    );

    expect(merged.size).toBe(2);
  });

  test('applyStagedEditsToStore replaces existing values and appends new assertions', async () => {
    const {
      applyStagedEditsToStore
    } = await import('../docs/app/edit-session.js');

    const store = new N3.Store([
      N3.DataFactory.quad(
        N3.DataFactory.namedNode('http://example.org/A'),
        N3.DataFactory.namedNode('http://purl.obolibrary.org/obo/IAO_0000114'),
        N3.DataFactory.namedNode('http://purl.obolibrary.org/obo/IAO_0000124')
      )
    ]);

    const nextStore = applyStagedEditsToStore(store, [
      {
        id: 'edit-1',
        kind: 'set-codesignated-values',
        subject: 'http://example.org/A',
        predicateIri: 'http://purl.obolibrary.org/obo/IAO_0000114',
        objects: [{
          termType: 'NamedNode',
          value: 'http://purl.obolibrary.org/obo/IAO_0000123'
        }]
      },
      {
        id: 'edit-2',
        kind: 'add-assertion',
        subject: 'http://example.org/A',
        predicateIri: 'http://www.w3.org/2000/01/rdf-schema#comment',
        objects: [{
          termType: 'Literal',
          value: 'Curator comment'
        }]
      }
    ]);

    expect(
      nextStore.getQuads(
        'http://example.org/A',
        'http://purl.obolibrary.org/obo/IAO_0000114',
        null,
        null
      )[0]?.object?.value
    ).toBe('http://purl.obolibrary.org/obo/IAO_0000123');

    expect(
      nextStore.getQuads(
        'http://example.org/A',
        'http://www.w3.org/2000/01/rdf-schema#comment',
        null,
        null
      )[0]?.object?.value
    ).toBe('Curator comment');
  });
});

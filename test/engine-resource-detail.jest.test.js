import { beforeEach, describe, expect, test } from '@jest/globals';
import N3 from 'n3';

function installWindow() {
  globalThis.window = { N3 };
}

describe('engine resource detail extraction', () => {
  beforeEach(() => {
    installWindow();
  });

  test('extractResourceDetail includes recognized fields plus outgoing and incoming assertions', async () => {
    const { extractResourceDetail } = await import('../docs/app/engine.js');

    const store = new N3.Store([
      N3.DataFactory.quad(
        N3.DataFactory.namedNode('http://example.org/A'),
        N3.DataFactory.namedNode('http://www.w3.org/2000/01/rdf-schema#label'),
        N3.DataFactory.literal('Thing A', 'en')
      ),
      N3.DataFactory.quad(
        N3.DataFactory.namedNode('http://example.org/A'),
        N3.DataFactory.namedNode('http://example.org/customPredicate'),
        N3.DataFactory.namedNode('http://example.org/B')
      ),
      N3.DataFactory.quad(
        N3.DataFactory.namedNode('http://example.org/C'),
        N3.DataFactory.namedNode('http://example.org/customPredicate'),
        N3.DataFactory.namedNode('http://example.org/A')
      )
    ]);

    const detail = extractResourceDetail(store, 'http://example.org/A');

    expect(detail.recognizedFields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Label', values: ['Thing A'] })
      ])
    );
    expect(detail.outgoingAssertions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ predicateIri: 'http://example.org/customPredicate' })
      ])
    );
    expect(detail.incomingAssertions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          subject: 'http://example.org/C',
          predicateIri: 'http://example.org/customPredicate'
        })
      ])
    );
  });
});

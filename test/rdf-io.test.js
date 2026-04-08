import assert from 'node:assert/strict';
import N3 from 'n3';

import {
  convertRdflibTermToRdfJs,
  detectRdfFormat,
  isSupportedRdfFileName,
  normalizeRdfFormat,
  parseRdfInput,
  serializeRdfStore,
  RDF_FORMATS
} from '../docs/app/rdf-io.js';

async function run(name, fn) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

await run('normalizeRdfFormat normalizes common aliases', async () => {
  assert.equal(normalizeRdfFormat('ttl'), RDF_FORMATS.TURTLE);
  assert.equal(normalizeRdfFormat('json-ld'), RDF_FORMATS.JSON_LD);
  assert.equal(normalizeRdfFormat('application/rdf+xml'), RDF_FORMATS.RDF_XML);
  assert.equal(normalizeRdfFormat('nq'), RDF_FORMATS.N_QUADS);
});

await run('detectRdfFormat recognizes supported file extensions', async () => {
  assert.equal(detectRdfFormat('example.ttl'), RDF_FORMATS.TURTLE);
  assert.equal(detectRdfFormat('example.trig'), RDF_FORMATS.TRIG);
  assert.equal(detectRdfFormat('example.jsonld'), RDF_FORMATS.JSON_LD);
  assert.equal(detectRdfFormat('example.rdf'), RDF_FORMATS.RDF_XML);
  assert.equal(detectRdfFormat('example.unknown'), RDF_FORMATS.TURTLE);
});

await run('isSupportedRdfFileName accepts the phase-1 input formats', async () => {
  assert.equal(isSupportedRdfFileName('one.ttl'), true);
  assert.equal(isSupportedRdfFileName('one.jsonld'), true);
  assert.equal(isSupportedRdfFileName('one.owl'), true);
  assert.equal(isSupportedRdfFileName('one.txt'), false);
});

await run('convertRdflibTermToRdfJs maps named nodes, blank nodes, typed literals, and language literals', async () => {
  const runtime = { N3 };

  const namedNode = convertRdflibTermToRdfJs({
    termType: 'NamedNode',
    value: 'http://example.org/A'
  }, runtime);
  assert.equal(namedNode.termType, 'NamedNode');
  assert.equal(namedNode.value, 'http://example.org/A');

  const blankNode = convertRdflibTermToRdfJs({
    termType: 'BlankNode',
    value: 'b1'
  }, runtime);
  assert.equal(blankNode.termType, 'BlankNode');
  assert.equal(blankNode.value, 'b1');

  const typedLiteral = convertRdflibTermToRdfJs({
    termType: 'Literal',
    value: '3',
    datatype: { value: 'http://www.w3.org/2001/XMLSchema#integer' },
    language: ''
  }, runtime);
  assert.equal(typedLiteral.termType, 'Literal');
  assert.equal(typedLiteral.datatype.value, 'http://www.w3.org/2001/XMLSchema#integer');

  const languageLiteral = convertRdflibTermToRdfJs({
    termType: 'Literal',
    value: 'hello',
    datatype: { value: 'http://www.w3.org/2001/XMLSchema#string' },
    language: 'en'
  }, runtime);
  assert.equal(languageLiteral.termType, 'Literal');
  assert.equal(languageLiteral.language, 'en');
});

await run('convertRdflibTermToRdfJs expands rdflib Collection terms into RDF list triples', async () => {
  const runtime = { N3 };
  const store = new N3.Store();

  const head = convertRdflibTermToRdfJs({
    termType: 'Collection',
    value: 'collectionHead',
    elements: [
      { termType: 'NamedNode', value: 'http://example.org/one' },
      {
        termType: 'Literal',
        value: 'two',
        datatype: { value: 'http://www.w3.org/2001/XMLSchema#string' },
        language: ''
      }
    ]
  }, runtime, store);

  assert.equal(head.termType, 'BlankNode');
  assert.equal(store.size, 4);
  assert.equal(
    store.getQuads(head, N3.DataFactory.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#first'), null, null).length,
    1
  );
});

await run('parseRdfInput parses Turtle, N-Triples, and TriG with N3 by default', async () => {
  const runtime = { N3 };

  const turtle = await parseRdfInput(
    '@prefix ex: <http://example.org/> . ex:onto a <http://www.w3.org/2002/07/owl#Ontology> .',
    'onto.ttl',
    { runtime }
  );
  assert.equal(turtle.sourceFormat, RDF_FORMATS.TURTLE);
  assert.equal(turtle.store.size, 1);

  const ntriples = await parseRdfInput(
    '<http://example.org/onto> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2002/07/owl#Ontology> .',
    'onto.nt',
    { runtime }
  );
  assert.equal(ntriples.sourceFormat, RDF_FORMATS.N_TRIPLES);
  assert.equal(ntriples.store.size, 1);

  const trig = await parseRdfInput(
    '{ <http://example.org/onto> <http://www.w3.org/2000/01/rdf-schema#label> "Example" . }',
    'onto.trig',
    { runtime }
  );
  assert.equal(trig.sourceFormat, RDF_FORMATS.TRIG);
  assert.equal(trig.store.size, 1);
});

await run('parseRdfInput parses JSON-LD through the jsonld adapter path', async () => {
  const runtime = {
    N3,
    jsonld: {
      async toRDF(documentValue) {
        assert.equal(documentValue['@id'], 'http://example.org/onto');
        return '<http://example.org/onto> <http://www.w3.org/2000/01/rdf-schema#label> "Example" .';
      }
    }
  };

  const parsed = await parseRdfInput(
    JSON.stringify({ '@id': 'http://example.org/onto' }),
    'onto.jsonld',
    { runtime }
  );

  assert.equal(parsed.sourceFormat, RDF_FORMATS.JSON_LD);
  assert.equal(parsed.store.size, 1);
});

await run('parseRdfInput parses RDF/XML through the rdflib adapter path', async () => {
  const runtime = {
    N3,
    $rdf: {
      graph() {
        return { statements: [] };
      },
      parse(_text, graph, _baseIri, _mimeType, callback) {
        graph.statements.push({
          subject: { termType: 'NamedNode', value: 'http://example.org/onto' },
          predicate: { termType: 'NamedNode', value: 'http://www.w3.org/2000/01/rdf-schema#label' },
          object: {
            termType: 'Literal',
            value: 'Example',
            datatype: { value: 'http://www.w3.org/2001/XMLSchema#string' },
            language: ''
          }
        });
        callback(null);
      }
    }
  };

  const parsed = await parseRdfInput('<rdf:RDF />', 'onto.rdf', { runtime });
  assert.equal(parsed.sourceFormat, RDF_FORMATS.RDF_XML);
  assert.equal(parsed.store.size, 1);
});

await run('parseRdfInput expands RDF/XML collections surfaced by rdflib', async () => {
  const runtime = {
    N3,
    $rdf: {
      graph() {
        return { statements: [] };
      },
      parse(_text, graph, _baseIri, _mimeType, callback) {
        graph.statements.push({
          subject: { termType: 'NamedNode', value: 'http://example.org/onto' },
          predicate: { termType: 'NamedNode', value: 'http://example.org/hasList' },
          object: {
            termType: 'Collection',
            value: 'listHead',
            elements: [
              { termType: 'NamedNode', value: 'http://example.org/one' },
              { termType: 'NamedNode', value: 'http://example.org/two' }
            ]
          }
        });
        callback(null);
      }
    }
  };

  const parsed = await parseRdfInput('<rdf:RDF />', 'onto.owl', { runtime });
  assert.equal(parsed.sourceFormat, RDF_FORMATS.RDF_XML);
  assert.equal(parsed.store.size, 5);
});

await run('parseRdfInput rejects malformed JSON-LD and unsupported file types', async () => {
  await assert.rejects(
    () => parseRdfInput('{not json}', 'broken.jsonld', {
      runtime: {
        N3,
        jsonld: {
          async toRDF() {
            return '';
          }
        }
      }
    }),
    /Invalid JSON-LD/
  );

  await assert.rejects(
    () => parseRdfInput('hello', 'broken.txt', { runtime: { N3 } }),
    /Unsupported ontology file type/
  );
});

await run('serializeRdfStore round-trips N3-compatible syntaxes', async () => {
  const runtime = { N3 };
  const parsed = await parseRdfInput(
    '@prefix ex: <http://example.org/> . ex:onto <http://www.w3.org/2000/01/rdf-schema#label> "Example" .',
    'onto.ttl',
    { runtime }
  );

  const cases = [
    ['onto.ttl', RDF_FORMATS.TURTLE],
    ['onto.nt', RDF_FORMATS.N_TRIPLES],
    ['onto.nq', RDF_FORMATS.N_QUADS],
    ['onto.trig', RDF_FORMATS.TRIG],
    ['onto.n3', RDF_FORMATS.N3]
  ];

  for (const [fileName, format] of cases) {
    const serialized = await serializeRdfStore(parsed.store, format, {
      runtime,
      prefixes: parsed.prefixes,
      baseIri: parsed.baseIri
    });
    const reparsed = await parseRdfInput(serialized, fileName, { runtime });
    assert.equal(reparsed.store.size, 1);
  }
});

await run('serializeRdfStore round-trips JSON-LD through the adapter path', async () => {
  const runtime = {
    N3,
    jsonld: {
      async toRDF(documentValue) {
        assert.equal(documentValue['@id'], 'http://example.org/onto');
        return '<http://example.org/onto> <http://www.w3.org/2000/01/rdf-schema#label> "Example" .';
      },
      async fromRDF(nquads) {
        assert.match(nquads, /http:\/\/example.org\/onto/);
        return { '@id': 'http://example.org/onto' };
      }
    }
  };

  const parsed = await parseRdfInput(
    JSON.stringify({ '@id': 'http://example.org/onto' }),
    'onto.jsonld',
    { runtime }
  );
  const serialized = await serializeRdfStore(parsed.store, RDF_FORMATS.JSON_LD, { runtime });
  const reparsed = await parseRdfInput(serialized, 'onto.jsonld', { runtime });

  assert.equal(reparsed.store.size, 1);
});

await run('serializeRdfStore round-trips RDF/XML through rdflib adapters', async () => {
  const runtime = {
    N3,
    $rdf: {
      namedNode(value) {
        return { termType: 'NamedNode', value };
      },
      blankNode(value) {
        return { termType: 'BlankNode', value };
      },
      literal(value, languageOrDatatype) {
        if (typeof languageOrDatatype === 'string') {
          return {
            termType: 'Literal',
            value,
            language: languageOrDatatype,
            datatype: { value: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#langString' }
          };
        }

        return {
          termType: 'Literal',
          value,
          language: '',
          datatype: { value: languageOrDatatype?.value || 'http://www.w3.org/2001/XMLSchema#string' }
        };
      },
      graph() {
        return {
          statements: [],
          add(subject, predicate, object) {
            this.statements.push({ subject, predicate, object });
          }
        };
      },
      serialize(_target, graph) {
        assert.equal(graph.statements.length, 1);
        return '<rdf:RDF />';
      },
      parse(_text, graph, _baseIri, _mimeType, callback) {
        graph.statements.push({
          subject: { termType: 'NamedNode', value: 'http://example.org/onto' },
          predicate: { termType: 'NamedNode', value: 'http://www.w3.org/2000/01/rdf-schema#label' },
          object: {
            termType: 'Literal',
            value: 'Example',
            datatype: { value: 'http://www.w3.org/2001/XMLSchema#string' },
            language: ''
          }
        });
        callback(null);
      }
    }
  };

  const parsed = await parseRdfInput(
    '<rdf:RDF />',
    'onto.rdf',
    { runtime }
  );
  const serialized = await serializeRdfStore(parsed.store, RDF_FORMATS.RDF_XML, { runtime });
  const reparsed = await parseRdfInput(serialized, 'onto.rdf', { runtime });

  assert.equal(reparsed.store.size, 1);
});

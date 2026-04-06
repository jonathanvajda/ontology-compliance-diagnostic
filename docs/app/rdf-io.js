// app/rdf-io.js
// @ts-check

/**
 * Brand-neutral RDF parsing and serialization helpers.
 *
 * The app normalizes all supported inputs into an RDF/JS-compatible N3 store.
 * N3 remains the default parser for N3-compatible syntaxes, while JSON-LD and
 * RDF/XML use browser-global adapter libraries before being bridged into N3.
 */

/** @typedef {{ N3?: any, jsonld?: any, $rdf?: any }} RuntimeLibraries */

/** @typedef {'text/turtle' | 'application/n-triples' | 'application/n-quads' | 'application/trig' | 'text/n3' | 'application/ld+json' | 'application/rdf+xml'} RdfFormat */

/**
 * @typedef {Object} ParsedOntology
 * @property {any} store
 * @property {Record<string, string>} prefixes
 * @property {RdfFormat} sourceFormat
 * @property {string | null} baseIri
 */

/** @type {any} */
const runtimeWindow = typeof window !== 'undefined' ? window : globalThis;

export const RDF_FORMATS = Object.freeze({
  TURTLE: 'text/turtle',
  N_TRIPLES: 'application/n-triples',
  N_QUADS: 'application/n-quads',
  TRIG: 'application/trig',
  N3: 'text/n3',
  JSON_LD: 'application/ld+json',
  RDF_XML: 'application/rdf+xml'
});

export const RDF_EXTENSIONS = Object.freeze([
  '.ttl',
  '.turtle',
  '.nt',
  '.ntriples',
  '.nq',
  '.trig',
  '.n3',
  '.jsonld',
  '.json-ld',
  '.rdf',
  '.owl',
  '.xml'
]);

/** @type {Readonly<Record<string, RdfFormat>>} */
const extensionToFormat = Object.freeze({
  '.ttl': RDF_FORMATS.TURTLE,
  '.turtle': RDF_FORMATS.TURTLE,
  '.nt': RDF_FORMATS.N_TRIPLES,
  '.ntriples': RDF_FORMATS.N_TRIPLES,
  '.nq': RDF_FORMATS.N_QUADS,
  '.trig': RDF_FORMATS.TRIG,
  '.n3': RDF_FORMATS.N3,
  '.jsonld': RDF_FORMATS.JSON_LD,
  '.json-ld': RDF_FORMATS.JSON_LD,
  '.rdf': RDF_FORMATS.RDF_XML,
  '.owl': RDF_FORMATS.RDF_XML,
  '.xml': RDF_FORMATS.RDF_XML
});

/** @type {Readonly<Record<string, string>>} */
const n3FormatByMime = Object.freeze({
  [RDF_FORMATS.TURTLE]: RDF_FORMATS.TURTLE,
  [RDF_FORMATS.N_TRIPLES]: RDF_FORMATS.N_TRIPLES,
  [RDF_FORMATS.N_QUADS]: RDF_FORMATS.N_QUADS,
  [RDF_FORMATS.TRIG]: RDF_FORMATS.TRIG,
  [RDF_FORMATS.N3]: RDF_FORMATS.N3
});

const RDF_FIRST_IRI = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#first';
const RDF_REST_IRI = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#rest';
const RDF_NIL_IRI = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#nil';

/**
 * Returns the runtime libraries, optionally overridden for testing.
 *
 * @param {RuntimeLibraries} [overrides]
 * @returns {Required<RuntimeLibraries>}
 */
function getRuntimeLibraries(overrides = {}) {
  return {
    N3: overrides.N3 || runtimeWindow.N3,
    jsonld: overrides.jsonld || runtimeWindow.jsonld,
    $rdf: overrides.$rdf || runtimeWindow.$rdf
  };
}

/**
 * Normalizes a MIME type or shorthand RDF format token.
 *
 * @param {string | null | undefined} input
 * @returns {RdfFormat | null}
 */
export function normalizeRdfFormat(input) {
  const value = String(input || '').trim().toLowerCase();
  if (!value) {
    return null;
  }

  if (value === 'ttl' || value === 'turtle' || value === RDF_FORMATS.TURTLE) {
    return RDF_FORMATS.TURTLE;
  }
  if (
    value === 'nt' ||
    value === 'ntriples' ||
    value === 'n-triples' ||
    value === RDF_FORMATS.N_TRIPLES
  ) {
    return RDF_FORMATS.N_TRIPLES;
  }
  if (value === 'nq' || value === 'nquads' || value === 'n-quads' || value === RDF_FORMATS.N_QUADS) {
    return RDF_FORMATS.N_QUADS;
  }
  if (value === 'trig' || value === RDF_FORMATS.TRIG) {
    return RDF_FORMATS.TRIG;
  }
  if (value === 'n3' || value === RDF_FORMATS.N3) {
    return RDF_FORMATS.N3;
  }
  if (
    value === 'jsonld' ||
    value === 'json-ld' ||
    value === RDF_FORMATS.JSON_LD
  ) {
    return RDF_FORMATS.JSON_LD;
  }
  if (
    value === 'rdf' ||
    value === 'rdfxml' ||
    value === 'rdf/xml' ||
    value === 'owl' ||
    value === 'xml' ||
    value === RDF_FORMATS.RDF_XML
  ) {
    return RDF_FORMATS.RDF_XML;
  }

  return null;
}

/**
 * Detects an RDF format from a file name.
 *
 * @param {string | null | undefined} fileName
 * @returns {RdfFormat}
 */
export function detectRdfFormat(fileName) {
  const lower = String(fileName || '').toLowerCase();

  for (const [extension, format] of Object.entries(extensionToFormat)) {
    if (lower.endsWith(extension)) {
      return format;
    }
  }

  return RDF_FORMATS.TURTLE;
}

/**
 * Returns true when the file extension is one the app expects to support.
 *
 * @param {string | null | undefined} fileName
 * @returns {boolean}
 */
export function isSupportedRdfFileName(fileName) {
  const lower = String(fileName || '').toLowerCase();
  if (!lower) {
    return true;
  }

  return RDF_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

/**
 * Returns the N3 Store constructor.
 *
 * @param {RuntimeLibraries} [runtime]
 * @returns {any}
 */
function getStoreConstructor(runtime) {
  const { N3 } = getRuntimeLibraries(runtime);
  const Store = N3?.Store;
  if (!Store) {
    throw new Error('N3.Store not found on window.N3. Check that n3.min.js is loaded.');
  }
  return Store;
}

/**
 * Returns the N3 DataFactory.
 *
 * @param {RuntimeLibraries} [runtime]
 * @returns {any}
 */
function getDataFactory(runtime) {
  const { N3 } = getRuntimeLibraries(runtime);
  const dataFactory = N3?.DataFactory;
  if (!dataFactory) {
    throw new Error('N3.DataFactory not found on window.N3. Check that n3.min.js is loaded.');
  }
  return dataFactory;
}

/**
 * Converts an rdflib term to an RDF/JS term.
 *
 * @param {any} term
 * @param {RuntimeLibraries} [runtime]
 * @param {any} [targetStore]
 * @returns {any}
 */
export function convertRdflibTermToRdfJs(term, runtime, targetStore) {
  const dataFactory = getDataFactory(runtime);
  if (!term || typeof term !== 'object') {
    throw new Error('Invalid rdflib term.');
  }

  switch (term.termType) {
    case 'NamedNode':
      return dataFactory.namedNode(term.value);
    case 'BlankNode':
      return dataFactory.blankNode(term.value);
    case 'Literal': {
      const language = typeof term.language === 'string' ? term.language : '';
      const datatypeValue = term?.datatype?.value || 'http://www.w3.org/2001/XMLSchema#string';
      return language
        ? dataFactory.literal(term.value, language)
        : dataFactory.literal(term.value, dataFactory.namedNode(datatypeValue));
    }
    case 'Collection': {
      if (!targetStore || typeof targetStore.addQuad !== 'function') {
        throw new Error('rdflib Collection conversion requires a target RDF store.');
      }

      const items = Array.isArray(term.elements) ? term.elements : [];
      if (!items.length) {
        return dataFactory.namedNode(RDF_NIL_IRI);
      }

      const rdfFirst = dataFactory.namedNode(RDF_FIRST_IRI);
      const rdfRest = dataFactory.namedNode(RDF_REST_IRI);
      const rdfNil = dataFactory.namedNode(RDF_NIL_IRI);

      /** @type {any[]} */
      const nodes = items.map((_item, index) => {
        if (index === 0 && typeof term.value === 'string' && term.value) {
          return dataFactory.blankNode(term.value.replace(/^_:/, ''));
        }
        return dataFactory.blankNode();
      });

      for (let index = 0; index < items.length; index += 1) {
        const currentNode = nodes[index];
        const objectTerm = convertRdflibTermToRdfJs(items[index], runtime, targetStore);
        const nextNode = index === items.length - 1 ? rdfNil : nodes[index + 1];

        targetStore.addQuad(dataFactory.quad(currentNode, rdfFirst, objectTerm));
        targetStore.addQuad(dataFactory.quad(currentNode, rdfRest, nextNode));
      }

      return nodes[0];
    }
    default:
      throw new Error(`Unsupported rdflib termType: ${String(term.termType)}`);
  }
}

/**
 * Parses an N3-compatible syntax directly with N3.
 *
 * @param {string} text
 * @param {RdfFormat} format
 * @param {string | null} baseIri
 * @param {RuntimeLibraries} [runtime]
 * @returns {ParsedOntology}
 */
function parseWithN3(text, format, baseIri, runtime) {
  const { N3 } = getRuntimeLibraries(runtime);
  const Parser = N3?.Parser;
  const Store = getStoreConstructor(runtime);

  if (!Parser) {
    throw new Error('N3.Parser not found on window.N3. Check that n3.min.js is loaded.');
  }

  /** @type {Record<string, string>} */
  const prefixes = {};
  const store = new Store();
  const parser = new Parser({
    format: n3FormatByMime[format],
    ...(baseIri ? { baseIRI: baseIri } : {})
  });

  let parseError = null;
  parser.parse(text, (error, quad, parsedPrefixes) => {
    if (error) {
      parseError = error;
      return;
    }
    if (quad) {
      store.addQuad(quad);
      return;
    }
    if (parsedPrefixes && typeof parsedPrefixes === 'object') {
      Object.assign(prefixes, parsedPrefixes);
    }
  });

  if (parseError) {
    throw parseError;
  }

  return {
    store,
    prefixes,
    sourceFormat: format,
    baseIri
  };
}

/**
 * Parses JSON-LD by converting it to N-Quads first.
 *
 * @param {string} text
 * @param {string | null} baseIri
 * @param {RuntimeLibraries} [runtime]
 * @returns {Promise<ParsedOntology>}
 */
async function parseWithJsonLd(text, baseIri, runtime) {
  const { jsonld } = getRuntimeLibraries(runtime);
  if (!jsonld || typeof jsonld.toRDF !== 'function') {
    throw new Error('jsonld not found on window.jsonld. Check that jsonld.min.js is loaded.');
  }

  let documentValue;
  try {
    documentValue = JSON.parse(text);
  } catch (error) {
    throw new Error(`Invalid JSON-LD: ${error instanceof Error ? error.message : String(error)}`);
  }

  /** @type {string} */
  let nquads;
  try {
    nquads = await jsonld.toRDF(documentValue, {
      format: RDF_FORMATS.N_QUADS,
      ...(baseIri ? { base: baseIri } : {})
    });
  } catch (error) {
    throw new Error(`JSON-LD parse failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  const parsed = parseWithN3(nquads, RDF_FORMATS.N_QUADS, baseIri, runtime);
  return {
    ...parsed,
    sourceFormat: RDF_FORMATS.JSON_LD
  };
}

/**
 * Parses RDF/XML with rdflib and converts it into an N3 store.
 *
 * @param {string} text
 * @param {string | null} baseIri
 * @param {RuntimeLibraries} [runtime]
 * @returns {Promise<ParsedOntology>}
 */
async function parseWithRdfXml(text, baseIri, runtime) {
  const { $rdf, N3 } = getRuntimeLibraries(runtime);
  if (!$rdf || typeof $rdf.graph !== 'function' || typeof $rdf.parse !== 'function') {
    throw new Error('rdflib not found on window.$rdf. Check that rdflib.min.js is loaded.');
  }
  if (!N3?.DataFactory) {
    throw new Error('N3.DataFactory not found on window.N3. Check that n3.min.js is loaded.');
  }

  const graph = $rdf.graph();
  const Store = getStoreConstructor(runtime);
  const store = new Store();
  const graphBaseIri = baseIri || 'urn:ontology-curation-manager:base';

  await new Promise((resolve, reject) => {
    try {
      $rdf.parse(text, graph, graphBaseIri, RDF_FORMATS.RDF_XML, (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(true);
      });
    } catch (error) {
      reject(error);
    }
  }).catch((error) => {
    throw new Error(`RDF/XML parse failed: ${error instanceof Error ? error.message : String(error)}`);
  });

  for (const statement of graph.statements || []) {
    const subject = convertRdflibTermToRdfJs(statement.subject, runtime, store);
    const predicate = convertRdflibTermToRdfJs(statement.predicate, runtime, store);
    const object = convertRdflibTermToRdfJs(statement.object, runtime, store);
    store.addQuad(N3.DataFactory.quad(subject, predicate, object));
  }

  return {
    store,
    prefixes: {},
    sourceFormat: RDF_FORMATS.RDF_XML,
    baseIri
  };
}

/**
 * Parses RDF text into a canonical N3 store.
 *
 * @param {string} text
 * @param {string} [fileName='ontology.ttl']
 * @param {{ baseIri?: string | null, runtime?: RuntimeLibraries }} [options]
 * @returns {Promise<ParsedOntology>}
 */
export async function parseRdfInput(text, fileName = 'ontology.ttl', options = {}) {
  if (typeof text !== 'string') {
    throw new TypeError('parseRdfInput() requires text to be a string.');
  }
  if (!isSupportedRdfFileName(fileName)) {
    throw new Error(
      'Unsupported ontology file type. Supported inputs are Turtle, N-Triples, N-Quads, TriG, N3, JSON-LD, and RDF/XML.'
    );
  }

  const format = detectRdfFormat(fileName);
  const baseIri = typeof options.baseIri === 'string' && options.baseIri.trim()
    ? options.baseIri.trim()
    : null;

  if (format === RDF_FORMATS.JSON_LD) {
    return parseWithJsonLd(text, baseIri, options.runtime);
  }
  if (format === RDF_FORMATS.RDF_XML) {
    return parseWithRdfXml(text, baseIri, options.runtime);
  }

  return parseWithN3(text, format, baseIri, options.runtime);
}

/**
 * Serialization hook for later phases.
 *
 * @param {any} _store
 * @param {RdfFormat} _format
 * @returns {Promise<string>}
 */
export async function serializeRdfStore(_store, _format) {
  throw new Error('serializeRdfStore() is reserved for a later phase.');
}

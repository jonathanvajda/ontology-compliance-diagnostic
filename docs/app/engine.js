// app/engine.js
// @ts-check

/**
 * OCQ query evaluation engine.
 *
 * Responsibilities:
 * - Parse ontology text into an RDF/JS store
 * - Load the manifest and SPARQL query text files
 * - Execute SELECT and ASK queries via Comunica
 * - Normalize rows into a stable result shape
 */

/** @typedef {import('./types.js').OcqManifest} OcqManifest */
/** @typedef {import('./types.js').OcqManifestQuery} OcqManifestQuery */
/** @typedef {import('./types.js').OcqQueryResultRow} OcqQueryResultRow */
/** @typedef {import('./types.js').OcqQueryResultStatus} OcqQueryResultStatus */
/** @typedef {import('./types.js').OcqQueryScope} OcqQueryScope */
/** @typedef {import('./types.js').OcqSeverity} OcqSeverity */

/**
 * @typedef {Object} EvaluateAllQueriesOptions
 * @property {string} [manifestUrl]
 * @property {string} [queryBasePath]
 */

/**
 * @typedef {Object} EvaluateAllQueriesOutput
 * @property {OcqQueryResultRow[]} results
 * @property {string[]} resources
 * @property {string} ontologyIri
 */

/** @type {Window & { N3?: any, Comunica?: any }} */
const runtimeWindow = window;

/** @type {{ Parser?: any, Store?: any }} */
const N3_GLOBAL = runtimeWindow.N3 || {};

/** @type {{ newEngine?: Function, QueryEngine?: any }} */
const COMUNICA_GLOBAL = runtimeWindow.Comunica || {};

/** @type {any | null} */
let cachedComunicaEngine = null;

export const DEFAULT_MANIFEST_URL = './queries/manifest.json';
export const DEFAULT_QUERY_BASE_PATH = 'queries/';

export const RDF_TYPE_IRI = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
export const RDFS_LABEL_IRI = 'http://www.w3.org/2000/01/rdf-schema#label';
export const OWL_ONTOLOGY_IRI = 'http://www.w3.org/2002/07/owl#Ontology';
export const UNKNOWN_ONTOLOGY_IRI = 'urn:ontology:unknown';

export const SUPPORTED_RDF_FORMATS = Object.freeze({
  TURTLE: 'text/turtle',
  N_TRIPLES: 'application/n-triples',
  N_QUADS: 'application/n-quads',
  TRIG: 'application/trig',
  N3: 'text/n3'
});

export const SUPPORTED_RDF_EXTENSIONS = Object.freeze([
  '.ttl',
  '.turtle',
  '.nt',
  '.ntriples',
  '.nq',
  '.trig',
  '.n3'
]);

/**
 * Returns the N3 Parser constructor.
 *
 * @returns {any}
 */
function getParserConstructor() {
  const Parser = N3_GLOBAL.Parser;
  if (!Parser) {
    throw new Error('N3.Parser not found on window.N3. Check that n3.min.js is loaded.');
  }
  return Parser;
}

/**
 * Returns the N3 Store constructor.
 *
 * @returns {any}
 */
function getStoreConstructor() {
  const Store = N3_GLOBAL.Store;
  if (!Store) {
    throw new Error('N3.Store not found on window.N3. Check that n3.min.js is loaded.');
  }
  return Store;
}

/**
 * Creates a Comunica engine using the browser bundle shape available at runtime.
 *
 * @returns {any}
 */
export function createComunicaEngine() {
  if (typeof COMUNICA_GLOBAL.newEngine === 'function') {
    console.info('[Comunica] Using Comunica.newEngine()');
    return COMUNICA_GLOBAL.newEngine();
  }

  if (typeof COMUNICA_GLOBAL.QueryEngine === 'function') {
    console.info('[Comunica] Using new Comunica.QueryEngine()');
    return new COMUNICA_GLOBAL.QueryEngine();
  }

  throw new Error(
    'No supported Comunica constructor found on window.Comunica.'
  );
}

/**
 * Returns a cached Comunica engine instance.
 *
 * @returns {any}
 */
export function getComunicaEngine() {
  if (!cachedComunicaEngine) {
    cachedComunicaEngine = createComunicaEngine();
  }
  return cachedComunicaEngine;
}

/**
 * Guesses an RDF syntax from the file name.
 *
 * This function only returns formats that N3.Parser can actually parse.
 * It intentionally does not claim RDF/XML or JSON-LD support.
 *
 * @param {string} [fileName]
 * @returns {string}
 */
export function guessRdfFormatFromFilename(fileName) {
  if (!fileName) {
    return SUPPORTED_RDF_FORMATS.TURTLE;
  }

  const lower = fileName.toLowerCase();

  if (lower.endsWith('.ttl') || lower.endsWith('.turtle')) {
    return SUPPORTED_RDF_FORMATS.TURTLE;
  }
  if (lower.endsWith('.nt') || lower.endsWith('.ntriples')) {
    return SUPPORTED_RDF_FORMATS.N_TRIPLES;
  }
  if (lower.endsWith('.nq')) {
    return SUPPORTED_RDF_FORMATS.N_QUADS;
  }
  if (lower.endsWith('.trig')) {
    return SUPPORTED_RDF_FORMATS.TRIG;
  }
  if (lower.endsWith('.n3')) {
    return SUPPORTED_RDF_FORMATS.N3;
  }

  return SUPPORTED_RDF_FORMATS.TURTLE;
}

/**
 * Throws if the file extension suggests a syntax this module does not support.
 *
 * @param {string} [fileName]
 * @returns {void}
 */
export function assertSupportedOntologyFile(fileName) {
  if (!fileName) {
    return;
  }

  const lower = fileName.toLowerCase();

  if (
    lower.endsWith('.rdf') ||
    lower.endsWith('.owl') ||
    lower.endsWith('.xml') ||
    lower.endsWith('.jsonld') ||
    lower.endsWith('.json-ld')
  ) {
    throw new Error(
      'This engine currently supports only N3.js-compatible syntaxes: Turtle, N-Triples, N-Quads, TriG, and N3.'
    );
  }
}

/**
 * Loads ontology text into an N3 store.
 *
 * @param {string} ontologyText
 * @param {string} [fileName='ontology.ttl']
 * @returns {Promise<any>}
 */
export async function loadOntologyIntoStore(ontologyText, fileName = 'ontology.ttl') {
  if (typeof ontologyText !== 'string') {
    throw new TypeError('loadOntologyIntoStore() requires ontologyText to be a string.');
  }

  assertSupportedOntologyFile(fileName);

  const Parser = getParserConstructor();
  const Store = getStoreConstructor();
  const format = guessRdfFormatFromFilename(fileName);

  const parser = new Parser({ format });
  const store = new Store();
  const quads = parser.parse(ontologyText);

  store.addQuads(quads);
  return store;
}

/**
 * Collects all rows from a Comunica bindings stream.
 *
 * Supports either an async iterator or an EventEmitter-like stream.
 *
 * @param {any} stream
 * @returns {Promise<any[]>}
 */
export async function collectBindingsStream(stream) {
  if (stream && typeof stream[Symbol.asyncIterator] === 'function') {
    const rows = [];
    for await (const row of stream) {
      rows.push(row);
    }
    return rows;
  }

  if (stream && typeof stream.on === 'function') {
    return new Promise(
      /**
       * @param {(value: any[]) => void} resolve
       * @param {(reason?: unknown) => void} reject
       */
      (resolve, reject) => {
        /** @type {any[]} */
        const rows = [];
        stream.on('data', /** @param {any} row */ (row) => rows.push(row));
        stream.on('end', () => resolve(rows));
        stream.on('error', /** @param {unknown} error */ (error) => reject(error));
      }
    );
  }

  throw new Error('Unsupported bindings stream shape returned by Comunica.');
}

/**
 * Executes a SELECT query against an RDF/JS store and normalizes the bindings.
 *
 * @param {any} store
 * @param {string} sparql
 * @param {any} [engine]
 * @returns {Promise<Array<Record<string, string>>>}
 */
export async function runSelect(store, sparql, engine = getComunicaEngine()) {
  if (!store) {
    throw new TypeError('runSelect() requires a store.');
  }
  if (!sparql) {
    throw new TypeError('runSelect() requires SPARQL text.');
  }

  let bindingsStream;

  if (typeof engine.queryBindings === 'function') {
    bindingsStream = await engine.queryBindings(sparql, {
      sources: [{ type: 'rdfjsSource', value: store }]
    });
  } else if (typeof engine.query === 'function') {
    const result = await engine.query(sparql, {
      sources: [{ type: 'rdfjsSource', value: store }]
    });

    if (!result || typeof result.bindings !== 'function') {
      throw new Error('Comunica query() result does not expose a bindings() method.');
    }

    bindingsStream = await result.bindings();
  } else {
    throw new Error('Comunica engine supports neither queryBindings() nor query().');
  }

  const bindings = await collectBindingsStream(bindingsStream);
  /** @type {Array<Record<string, string>>} */
  const rows = [];

  for (const binding of bindings) {
    /** @type {Record<string, string>} */
    const row = {};

    if (typeof binding.entries === 'function') {
      for (const [variable, term] of binding.entries()) {
        row[String(variable)] = term?.value ?? '';
      }
    } else if (typeof binding.forEach === 'function') {
        binding.forEach(
          /** @type {(term: { value?: string } | null | undefined, variable: string) => void} */
          ((term, variable) => {
            row[String(variable)] = term?.value ?? '';
          })
        );
    }

    rows.push(row);
  }

  return rows;
}

/**
 * Executes an ASK query against an RDF/JS store.
 *
 * @param {any} store
 * @param {string} sparql
 * @param {any} [engine]
 * @returns {Promise<boolean>}
 */
export async function runAsk(store, sparql, engine = getComunicaEngine()) {
  if (!store) {
    throw new TypeError('runAsk() requires a store.');
  }
  if (!sparql) {
    throw new TypeError('runAsk() requires SPARQL text.');
  }

  if (typeof engine.queryBoolean === 'function') {
    return engine.queryBoolean(sparql, {
      sources: [{ type: 'rdfjsSource', value: store }]
    });
  }

  if (typeof engine.query === 'function') {
    const result = await engine.query(sparql, {
      sources: [{ type: 'rdfjsSource', value: store }]
    });

    if (!result || !('booleanResult' in result)) {
      throw new Error('Comunica query() result does not expose booleanResult for ASK.');
    }

    return Boolean(await result.booleanResult);
  }

  throw new Error('Comunica engine supports neither queryBoolean() nor query().');
}

/**
 * Loads and validates the manifest JSON.
 *
 * @param {string} [manifestUrl=DEFAULT_MANIFEST_URL]
 * @returns {Promise<OcqManifest>}
 */
export async function loadManifest(manifestUrl = DEFAULT_MANIFEST_URL) {
  const response = await fetch(manifestUrl);

  if (!response.ok) {
    throw new Error(`Failed to fetch manifest: ${response.status} ${response.statusText}`);
  }

  /** @type {unknown} */
  const rawManifest = await response.json();

  /** @type {{ queries?: unknown }} */
  const manifestLike =
    rawManifest && typeof rawManifest === 'object'
      ? /** @type {{ queries?: unknown }} */ (rawManifest)
      : {};

  if (!Array.isArray(manifestLike.queries)) {
    throw new Error('Manifest JSON is invalid: expected an object with a queries array.');
  }

  return /** @type {OcqManifest} */ (rawManifest);
}

/**
 * Loads SPARQL query text for one manifest query definition.
 *
 * @param {OcqManifestQuery} queryDefinition
 * @param {string} [queryBasePath=DEFAULT_QUERY_BASE_PATH]
 * @returns {Promise<string>}
 */
export async function loadQueryText(
  queryDefinition,
  queryBasePath = DEFAULT_QUERY_BASE_PATH
) {
  if (!queryDefinition || !queryDefinition.file || !queryDefinition.id) {
    throw new Error('Invalid query definition: missing id or file.');
  }

  const url = `${queryBasePath}${queryDefinition.file}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Failed to fetch query ${queryDefinition.id} from ${url}: ${response.status} ${response.statusText}`
    );
  }

  return response.text();
}

/**
 * Guesses the ontology IRI by locating a subject typed owl:Ontology.
 *
 * @param {any} store
 * @returns {string}
 */
export function guessOntologyIri(store) {
  const quads = store.getQuads(null, null, null, null);

  for (const quad of quads) {
    if (
      quad?.predicate?.value === RDF_TYPE_IRI &&
      quad?.object?.value === OWL_ONTOLOGY_IRI
    ) {
      return quad.subject.value;
    }
  }

  return UNKNOWN_ONTOLOGY_IRI;
}

/**
 * Returns the set of labeled resources based on rdfs:label.
 *
 * @param {any} store
 * @returns {string[]}
 */
export function collectLabeledResources(store) {
  const labeled = new Set();
  const quads = store.getQuads(null, RDFS_LABEL_IRI, null, null);

  for (const quad of quads) {
    if (quad?.subject?.value) {
      labeled.add(quad.subject.value);
    }
  }

  return Array.from(labeled);
}

/**
 * Maps SELECT polarity to result status.
 *
 * @param {OcqManifestQuery['polarity']} polarity
 * @param {string} queryId
 * @returns {OcqQueryResultStatus}
 */
export function getSelectStatusFromPolarity(polarity, queryId) {
  switch (polarity) {
    case 'matchMeansFail':
      return 'fail';
    case 'matchMeansPass':
      return 'pass';
    default:
      throw new Error(`Unsupported SELECT polarity for ${queryId}: ${String(polarity)}`);
  }
}

/**
 * Maps ASK polarity and boolean result to result status.
 *
 * @param {OcqManifestQuery['polarity']} polarity
 * @param {boolean} askResult
 * @param {string} queryId
 * @returns {OcqQueryResultStatus}
 */
export function getAskStatusFromPolarity(polarity, askResult, queryId) {
  switch (polarity) {
    case 'trueMeansPass':
      return askResult ? 'pass' : 'fail';
    case 'trueMeansFail':
      return askResult ? 'fail' : 'pass';
    case 'falseMeansPass':
      return askResult ? 'fail' : 'pass';
    case 'falseMeansFail':
      return askResult ? 'pass' : 'fail';
    default:
      throw new Error(`Unsupported ASK polarity for ${queryId}: ${String(polarity)}`);
  }
}

/**
 * Picks the resource IRI for a SELECT result row.
 *
 * @param {Record<string, string>} row
 * @param {string} resourceVar
 * @returns {string | null}
 */
export function getResourceFromSelectRow(row, resourceVar) {
  if (!row || typeof row !== 'object') {
    return null;
  }

  if (row[resourceVar]) {
    return row[resourceVar];
  }

  if (row.resource) {
    return row.resource;
  }

  const firstValue = Object.values(row)[0];
  return typeof firstValue === 'string' ? firstValue : null;
}

/**
 * Evaluates a single manifest query definition against the store.
 *
 * @param {any} store
 * @param {OcqManifestQuery} queryDefinition
 * @param {string} queryText
 * @returns {Promise<OcqQueryResultRow[]>}
 */
export async function evaluateSingleQuery(store, queryDefinition, queryText) {
  const criterionId = queryDefinition.checksCriterion || null;
  /** @type {OcqSeverity} */
  const severity = queryDefinition.severity || 'info';
  /** @type {OcqQueryScope} */
  const scope = queryDefinition.scope || 'resource';

  if (queryDefinition.kind === 'SELECT') {
    const rows = await runSelect(store, queryText);
    const resourceVar = queryDefinition.resourceVar || 'resource';
    const status = getSelectStatusFromPolarity(queryDefinition.polarity, queryDefinition.id);

    return rows.map((row) => {
      const resource = getResourceFromSelectRow(row, resourceVar);

      return {
        resource,
        queryId: queryDefinition.id,
        criterionId,
        status,
        severity,
        scope,
        details: row
      };
    });
  }

  if (queryDefinition.kind === 'ASK') {
    const askResult = await runAsk(store, queryText);
    const status = getAskStatusFromPolarity(
      queryDefinition.polarity,
      askResult,
      queryDefinition.id
    );
    const ontologyIri = guessOntologyIri(store);

    return [
      {
        resource: ontologyIri,
        queryId: queryDefinition.id,
        criterionId,
        status,
        severity,
        scope,
        details: { askResult }
      }
    ];
  }

  throw new Error(
    `Unsupported query kind for ${queryDefinition.id}: ${String(queryDefinition.kind)}`
  );
}

/**
 * Evaluates all manifest queries against an ontology text input.
 *
 * @param {string} ontologyText
 * @param {string} [fileName='ontology.ttl']
 * @param {EvaluateAllQueriesOptions} [options]
 * @returns {Promise<EvaluateAllQueriesOutput>}
 */
export async function evaluateAllQueries(
  ontologyText,
  fileName = 'ontology.ttl',
  options = {}
) {
  const manifestUrl = options.manifestUrl || DEFAULT_MANIFEST_URL;
  const queryBasePath = options.queryBasePath || DEFAULT_QUERY_BASE_PATH;

  const store = await loadOntologyIntoStore(ontologyText, fileName);
  const manifest = await loadManifest(manifestUrl);

  /** @type {OcqQueryResultRow[]} */
  const allResults = [];

  for (const queryDefinition of manifest.queries) {
    try {
      console.time(queryDefinition.id);
      const queryText = await loadQueryText(queryDefinition, queryBasePath);
      const rows = await evaluateSingleQuery(store, queryDefinition, queryText);
      console.timeEnd(queryDefinition.id);
      allResults.push(...rows);
    } catch (error) {
      console.error(`Error evaluating query ${queryDefinition.id}:`, error);
    }
  }

  return {
    results: allResults,
    resources: collectLabeledResources(store),
    ontologyIri: guessOntologyIri(store)
  };
}
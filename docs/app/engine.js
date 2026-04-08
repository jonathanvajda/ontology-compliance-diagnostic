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

/** @typedef {import('./types.js').Manifest} Manifest */
/** @typedef {import('./types.js').ManifestQuery} ManifestQuery */
/** @typedef {import('./types.js').PreflightSummary} PreflightSummary */
/** @typedef {import('./types.js').OntologyMetadata} OntologyMetadata */
/** @typedef {import('./types.js').QueryResultRow} QueryResultRow */
/** @typedef {import('./types.js').QueryResultStatus} QueryResultStatus */
/** @typedef {import('./types.js').QueryScope} QueryScope */
/** @typedef {import('./types.js').ResourceDetail} ResourceDetail */
/** @typedef {import('./types.js').ResourceDetailField} ResourceDetailField */
/** @typedef {import('./types.js').Severity} Severity */

import {
  detectRdfFormat,
  parseRdfInput,
  RDF_EXTENSIONS,
  RDF_FORMATS
} from './rdf-io.js';
import {
  getCurationStatusLabel,
  getCurationStatusRank
} from './grader.js';

/**
 * @typedef {Object} EvaluateAllQueriesOptions
 * @property {string} [manifestUrl]
 * @property {string} [queryBasePath]
 * @property {Manifest | null | undefined} [manifest]
 * @property {string[] | Set<string> | null | undefined} [resultResourceFilter]
 * @property {string[] | null | undefined} [resourceInventory]
 * @property {any} [resourceDetailsStore]
 * @property {any} [ontologyMetadataStore]
 * @property {(progress: { fileName: string, queryId: string, completedQueries: number, totalQueries: number }) => void} [onQueryProgress]
 */

/**
 * @typedef {Object} EvaluateAllQueriesOutput
 * @property {QueryResultRow[]} results
 * @property {string[]} resources
 * @property {Record<string, ResourceDetail>} resourceDetails
 * @property {string} ontologyIri
 * @property {OntologyMetadata} ontologyMetadata
 */

/** @type {Window & { Comunica?: any }} */
const runtimeWindow = window;

/** @type {{ newEngine?: Function, QueryEngine?: any }} */
const COMUNICA_GLOBAL = runtimeWindow.Comunica || {};

/** @type {any | null} */
let cachedComunicaEngine = null;

export const DEFAULT_MANIFEST_URL = './queries/manifest.json';
export const DEFAULT_QUERY_BASE_PATH = 'queries/';
export const DEFAULT_STANDARDS_MANIFEST_URL = './queries/standards-manifest.json';

export const RDF_TYPE_IRI = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
export const RDFS_LABEL_IRI = 'http://www.w3.org/2000/01/rdf-schema#label';
export const OWL_ONTOLOGY_IRI = 'http://www.w3.org/2002/07/owl#Ontology';
export const OWL_IMPORTS_IRI = 'http://www.w3.org/2002/07/owl#imports';
export const OWL_VERSION_IRI = 'http://www.w3.org/2002/07/owl#versionIRI';
export const OWL_VERSION_INFO_IRI = 'http://www.w3.org/2002/07/owl#versionInfo';
export const DCTERMS_TITLE_IRI = 'http://purl.org/dc/terms/title';
export const DCTERMS_DESCRIPTION_IRI = 'http://purl.org/dc/terms/description';
export const DCTERMS_LICENSE_IRI = 'http://purl.org/dc/terms/license';
export const DCTERMS_ACCESS_RIGHTS_IRI = 'http://purl.org/dc/terms/accessRights';
export const DCTERMS_BIBLIOGRAPHIC_CITATION_IRI = 'http://purl.org/dc/terms/bibliographicCitation';
export const UNKNOWN_ONTOLOGY_IRI = 'urn:ontology:unknown';
export const OWL_NAMED_INDIVIDUAL_IRI = 'http://www.w3.org/2002/07/owl#NamedIndividual';
export const OWL_CLASS_IRI = 'http://www.w3.org/2002/07/owl#Class';
export const OWL_OBJECT_PROPERTY_IRI = 'http://www.w3.org/2002/07/owl#ObjectProperty';
export const OWL_DATATYPE_PROPERTY_IRI = 'http://www.w3.org/2002/07/owl#DatatypeProperty';
export const OWL_ANNOTATION_PROPERTY_IRI = 'http://www.w3.org/2002/07/owl#AnnotationProperty';
export const OWL_INVERSE_OF_IRI = 'http://www.w3.org/2002/07/owl#inverseOf';
export const RDFS_COMMENT_IRI = 'http://www.w3.org/2000/01/rdf-schema#comment';
export const RDFS_SUBCLASS_OF_IRI = 'http://www.w3.org/2000/01/rdf-schema#subClassOf';
export const RDFS_SUBPROPERTY_OF_IRI = 'http://www.w3.org/2000/01/rdf-schema#subPropertyOf';
export const RDFS_DOMAIN_IRI = 'http://www.w3.org/2000/01/rdf-schema#domain';
export const RDFS_RANGE_IRI = 'http://www.w3.org/2000/01/rdf-schema#range';
export const RDFS_IS_DEFINED_BY_IRI = 'http://www.w3.org/2000/01/rdf-schema#isDefinedBy';
export const SKOS_DEFINITION_IRI = 'http://www.w3.org/2004/02/skos/core#definition';
export const SKOS_ALT_LABEL_IRI = 'http://www.w3.org/2004/02/skos/core#altLabel';
export const SKOS_EXAMPLE_IRI = 'http://www.w3.org/2004/02/skos/core#example';
export const SKOS_SCOPE_NOTE_IRI = 'http://www.w3.org/2004/02/skos/core#scopeNote';
export const OBO_IAO_0000115_IRI = 'http://purl.obolibrary.org/obo/IAO_0000115';
export const OBO_IAO_0000118_IRI = 'http://purl.obolibrary.org/obo/IAO_0000118';
export const OBO_IAO_0000112_IRI = 'http://purl.obolibrary.org/obo/IAO_0000112';
export const OBO_IAO_0000119_IRI = 'http://purl.obolibrary.org/obo/IAO_0000119';
export const OBO_IAO_0000114_IRI = 'http://purl.obolibrary.org/obo/IAO_0000114';
export const OBO_IAO_0000231_IRI = 'http://purl.obolibrary.org/obo/IAO_0000231';
export const OBO_IAO_0000232_IRI = 'http://purl.obolibrary.org/obo/IAO_0000232';
export const OBO_IAO_0100001_IRI = 'http://purl.obolibrary.org/obo/IAO_0100001';
export const CCO_ACRONYM_IRI = 'http://www.ontologyrepository.com/CommonCoreOntologies/ont00001753';
export const CCO_CURATED_IN_ONTOLOGY_IRI = 'http://www.ontologyrepository.com/CommonCoreOntologies/ont00001760';

/** @type {ReadonlyArray<{ id: string, predicateIri: string, label: string }>} */
const RESOURCE_DETAIL_PREDICATES = Object.freeze([
  { id: 'rdfType', predicateIri: RDF_TYPE_IRI, label: 'RDF type' },
  { id: 'label', predicateIri: RDFS_LABEL_IRI, label: 'Label' },
  { id: 'definitionSkos', predicateIri: SKOS_DEFINITION_IRI, label: 'Definition' },
  { id: 'definitionIao', predicateIri: OBO_IAO_0000115_IRI, label: 'Definition (IAO:0000115)' },
  { id: 'altLabelSkos', predicateIri: SKOS_ALT_LABEL_IRI, label: 'Alternative label' },
  { id: 'altTermIao', predicateIri: OBO_IAO_0000118_IRI, label: 'Alternative term (IAO:0000118)' },
  { id: 'acronym', predicateIri: CCO_ACRONYM_IRI, label: 'Acronym' },
  { id: 'exampleSkos', predicateIri: SKOS_EXAMPLE_IRI, label: 'Example' },
  { id: 'exampleIao', predicateIri: OBO_IAO_0000112_IRI, label: 'Example of usage (IAO:0000112)' },
  { id: 'scopeNote', predicateIri: SKOS_SCOPE_NOTE_IRI, label: 'Scope note' },
  { id: 'bibliographicCitation', predicateIri: DCTERMS_BIBLIOGRAPHIC_CITATION_IRI, label: 'Bibliographic citation' },
  { id: 'definitionSource', predicateIri: OBO_IAO_0000119_IRI, label: 'Definition source (IAO:0000119)' },
  { id: 'isDefinedBy', predicateIri: RDFS_IS_DEFINED_BY_IRI, label: 'Is defined by' },
  { id: 'curatedInOntology', predicateIri: CCO_CURATED_IN_ONTOLOGY_IRI, label: 'Is curated in ontology' },
  { id: 'curationStatus', predicateIri: OBO_IAO_0000114_IRI, label: 'Has curation status' },
  { id: 'obsolescenceReason', predicateIri: OBO_IAO_0000231_IRI, label: 'Has obsolescence reason' },
  { id: 'curatorNote', predicateIri: OBO_IAO_0000232_IRI, label: 'Curator note' },
  { id: 'termReplacedBy', predicateIri: OBO_IAO_0100001_IRI, label: 'Term replaced by' },
  { id: 'subClassOf', predicateIri: RDFS_SUBCLASS_OF_IRI, label: 'SubClassOf' },
  { id: 'subPropertyOf', predicateIri: RDFS_SUBPROPERTY_OF_IRI, label: 'SubPropertyOf' },
  { id: 'inverseOf', predicateIri: OWL_INVERSE_OF_IRI, label: 'Inverse property' },
  { id: 'domain', predicateIri: RDFS_DOMAIN_IRI, label: 'Domain' },
  { id: 'range', predicateIri: RDFS_RANGE_IRI, label: 'Range' },
  { id: 'comment', predicateIri: RDFS_COMMENT_IRI, label: 'Comment' }
]);

/** @type {Readonly<Record<string, string>>} */
const KNOWN_IRI_LABELS = Object.freeze({
  [OWL_CLASS_IRI]: 'owl:Class',
  [OWL_NAMED_INDIVIDUAL_IRI]: 'owl:NamedIndividual',
  [OWL_OBJECT_PROPERTY_IRI]: 'owl:ObjectProperty',
  [OWL_DATATYPE_PROPERTY_IRI]: 'owl:DatatypeProperty',
  [OWL_ANNOTATION_PROPERTY_IRI]: 'owl:AnnotationProperty'
});

/** @type {Readonly<Record<string, string>>} */
const RESOURCE_DETAIL_LABELS_BY_PREDICATE = Object.freeze(
  RESOURCE_DETAIL_PREDICATES.reduce((accumulator, descriptor) => {
    accumulator[descriptor.predicateIri] = descriptor.label;
    return accumulator;
  }, /** @type {Record<string, string>} */ ({}))
);

export const SUPPORTED_RDF_FORMATS = RDF_FORMATS;
export const SUPPORTED_RDF_EXTENSIONS = RDF_EXTENSIONS;

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
 * @param {string} [fileName]
 * @returns {string}
 */
export function guessRdfFormatFromFilename(fileName) {
  return detectRdfFormat(fileName);
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
  const isSupported = SUPPORTED_RDF_EXTENSIONS.some((extension) => lower.endsWith(extension));
  if (!isSupported) {
    throw new Error(
      'Unsupported ontology file type. Supported inputs are Turtle, N-Triples, N-Quads, TriG, N3, JSON-LD, and RDF/XML.'
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
  const parsed = await parseRdfInput(ontologyText, fileName);
  return parsed.store;
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
 * @returns {Promise<Manifest>}
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

  /** @type {Manifest} */
  const manifest = /** @type {Manifest} */ (rawManifest);
  const standardsUrl = typeof manifest.standardsUrl === 'string' && manifest.standardsUrl.trim()
    ? manifest.standardsUrl.trim()
    : (
      !Array.isArray(manifest.standards)
        ? DEFAULT_STANDARDS_MANIFEST_URL
        : ''
    );

  if (standardsUrl) {
    const resolvedUrl = new URL(standardsUrl, new URL(manifestUrl, window.location.href)).toString();
    const standardsResponse = await fetch(resolvedUrl);

    if (!standardsResponse.ok) {
      throw new Error(
        `Failed to fetch standards manifest: ${standardsResponse.status} ${standardsResponse.statusText}`
      );
    }

    /** @type {unknown} */
    const rawStandardsManifest = await standardsResponse.json();
    /** @type {{ standards?: unknown }} */
    const standardsManifestLike =
      rawStandardsManifest && typeof rawStandardsManifest === 'object'
        ? /** @type {{ standards?: unknown }} */ (rawStandardsManifest)
        : {};

    if (!Array.isArray(standardsManifestLike.standards)) {
      throw new Error('Standards manifest JSON is invalid: expected an object with a standards array.');
    }

    manifest.standards = standardsManifestLike.standards;
  }

  return manifest;
}

/**
 * Loads SPARQL query text for one manifest query definition.
 *
 * @param {ManifestQuery} queryDefinition
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
 * Returns the first object value for one subject/predicate pair.
 *
 * @param {any} store
 * @param {string} subjectIri
 * @param {string} predicateIri
 * @returns {string | null}
 */
export function getFirstObjectValue(store, subjectIri, predicateIri) {
  const quad = store.getQuads(subjectIri, predicateIri, null, null)[0];
  return quad?.object?.value || null;
}

/**
 * Returns all object values for one subject/predicate pair.
 *
 * @param {any} store
 * @param {string} subjectIri
 * @param {string} predicateIri
 * @returns {string[]}
 */
export function getObjectValues(store, subjectIri, predicateIri) {
  return store
    .getQuads(subjectIri, predicateIri, null, null)
    .map(
      /** @param {{ object?: { value?: string } | null | undefined }} quad */
      (quad) => quad?.object?.value || ''
    )
    .filter(
      /** @param {string} value */
      (value) => value !== ''
    );
}

/**
 * Returns all normalized object values for one subject/predicate pair.
 *
 * @param {any} store
 * @param {string} subjectIri
 * @param {string} predicateIri
 * @returns {string[]}
 */
export function getNormalizedObjectValues(store, subjectIri, predicateIri) {
  const rawValues = getObjectValues(store, subjectIri, predicateIri);

  if (predicateIri === OBO_IAO_0000114_IRI) {
    const normalizedStatuses = rawValues
      .map((value) => ({
        iri: value,
        label: getCurationStatusLabel(value)
      }))
      .filter((entry) => entry.iri !== '')
      .sort((a, b) => {
        const rankDiff = getCurationStatusRank(a.iri) - getCurationStatusRank(b.iri);
        if (rankDiff !== 0) {
          return rankDiff;
        }
        return a.label.localeCompare(b.label);
      });

    return Array.from(new Set(normalizedStatuses.map((entry) => entry.label)));
  }

  const values = rawValues
    .map((value) => KNOWN_IRI_LABELS[value] || value)
    .filter((value) => value !== '');

  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

/**
 * Returns a readable label for one predicate IRI.
 *
 * @param {string} predicateIri
 * @returns {string}
 */
export function getPredicateLabel(predicateIri) {
  return RESOURCE_DETAIL_LABELS_BY_PREDICATE[predicateIri] || predicateIri;
}

/**
 * Returns a display value for one literal term.
 *
 * @param {any} term
 * @returns {string}
 */
function getLiteralDisplayValue(term) {
  const value = String(term?.value || '');
  const language = String(term?.language || '');
  const datatypeIri = String(term?.datatype?.value || '');

  if (language) {
    return `"${value}"@${language}`;
  }
  if (datatypeIri && datatypeIri !== 'http://www.w3.org/2001/XMLSchema#string') {
    return `"${value}"^^${datatypeIri}`;
  }
  return value;
}

/**
 * Returns a display value for one named node.
 *
 * @param {any} store
 * @param {string} iri
 * @param {string} predicateIri
 * @returns {string}
 */
function getNamedNodeDisplayValue(store, iri, predicateIri) {
  if (!iri) {
    return '';
  }
  if (predicateIri === OBO_IAO_0000114_IRI) {
    return getCurationStatusLabel(iri);
  }

  const label = getFirstObjectValue(store, iri, RDFS_LABEL_IRI);
  return label || KNOWN_IRI_LABELS[iri] || iri;
}

/**
 * Converts one RDF/JS term to a stable assertion-object view model.
 *
 * @param {any} store
 * @param {string} predicateIri
 * @param {any} term
 * @returns {import('./types.js').ResourceAssertionObject}
 */
function toAssertionObject(store, predicateIri, term) {
  const termType = String(term?.termType || 'Literal');
  if (termType === 'NamedNode') {
    const value = String(term?.value || '');
    return {
      termType: 'NamedNode',
      value,
      displayValue: getNamedNodeDisplayValue(store, value, predicateIri)
    };
  }
  if (termType === 'BlankNode') {
    const value = String(term?.value || '');
    return {
      termType: 'BlankNode',
      value,
      displayValue: `_:${value}`
    };
  }

  const value = String(term?.value || '');
  return {
    termType: 'Literal',
    value,
    displayValue: getLiteralDisplayValue(term),
    ...(term?.language ? { language: String(term.language) } : {}),
    ...(term?.datatype?.value ? { datatypeIri: String(term.datatype.value) } : {})
  };
}

/**
 * Sorts assertion rows in a stable display order.
 *
 * @param {import('./types.js').ResourceAssertion[]} assertions
 * @returns {import('./types.js').ResourceAssertion[]}
 */
function sortAssertions(assertions) {
  return assertions.sort((left, right) => {
    const predicateCompare = String(left.predicateLabel).localeCompare(String(right.predicateLabel));
    if (predicateCompare !== 0) {
      return predicateCompare;
    }
    return String(left.object.displayValue).localeCompare(String(right.object.displayValue));
  });
}

/**
 * Extracts all outgoing assertions for one resource.
 *
 * @param {any} store
 * @param {string} resourceIri
 * @returns {import('./types.js').ResourceAssertion[]}
 */
export function extractOutgoingAssertions(store, resourceIri) {
  const quads = store?.getQuads ? store.getQuads(resourceIri, null, null, null) : [];
  /** @type {import('./types.js').ResourceAssertion[]} */
  const assertions = [];

  for (const quad of quads) {
    assertions.push({
      subject: resourceIri,
      predicateIri: String(quad?.predicate?.value || ''),
      predicateLabel: getPredicateLabel(String(quad?.predicate?.value || '')),
      object: toAssertionObject(store, String(quad?.predicate?.value || ''), quad?.object),
      direction: 'outgoing'
    });
  }

  return sortAssertions(assertions);
}

/**
 * Extracts all incoming assertions for one resource.
 *
 * @param {any} store
 * @param {string} resourceIri
 * @returns {import('./types.js').ResourceAssertion[]}
 */
export function extractIncomingAssertions(store, resourceIri) {
  const quads = store?.getQuads ? store.getQuads(null, null, resourceIri, null) : [];
  /** @type {import('./types.js').ResourceAssertion[]} */
  const assertions = [];

  for (const quad of quads) {
    const subject = String(quad?.subject?.value || '');
    assertions.push({
      subject,
      predicateIri: String(quad?.predicate?.value || ''),
      predicateLabel: getPredicateLabel(String(quad?.predicate?.value || '')),
      object: {
        termType: 'NamedNode',
        value: resourceIri,
        displayValue: getNamedNodeDisplayValue(store, resourceIri, String(quad?.predicate?.value || ''))
      },
      direction: 'incoming'
    });
  }

  return sortAssertions(assertions);
}

/**
 * Extracts compact resource details for one resource IRI.
 *
 * @param {any} store
 * @param {string} resourceIri
 * @returns {ResourceDetail}
 */
export function extractResourceDetail(store, resourceIri) {
  /** @type {ResourceDetailField[]} */
  const fields = [];

  for (const descriptor of RESOURCE_DETAIL_PREDICATES) {
    const values = getNormalizedObjectValues(store, resourceIri, descriptor.predicateIri);
    if (!values.length) {
      continue;
    }

    fields.push({
      id: descriptor.id,
      label: descriptor.label,
      values
    });
  }

  return {
    resource: resourceIri,
    fields,
    recognizedFields: fields,
    outgoingAssertions: extractOutgoingAssertions(store, resourceIri),
    incomingAssertions: extractIncomingAssertions(store, resourceIri)
  };
}

/**
 * Extracts compact resource details for all relevant resources in the store.
 *
 * @param {any} store
 * @param {string[]} resources
 * @param {QueryResultRow[]} [results=[]]
 * @returns {Record<string, ResourceDetail>}
 */
export function extractResourceDetails(store, resources, results = []) {
  /** @type {Set<string>} */
  const resourceSet = new Set(Array.isArray(resources) ? resources.filter(Boolean) : []);

  for (const row of Array.isArray(results) ? results : []) {
    if (row?.resource) {
      resourceSet.add(row.resource);
    }
  }

  /** @type {Record<string, ResourceDetail>} */
  const detailsByResource = {};

  for (const resourceIri of resourceSet) {
    detailsByResource[resourceIri] = extractResourceDetail(store, resourceIri);
  }

  return detailsByResource;
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
 * Returns named resources directly asserted as subjects in the supplied store.
 *
 * @param {any} store
 * @returns {string[]}
 */
export function collectAssertedNamedResources(store) {
  const resources = new Set();
  const quads = store?.getQuads ? store.getQuads(null, null, null, null) : [];

  for (const quad of quads) {
    if (quad?.subject?.termType === 'NamedNode' && quad.subject.value) {
      resources.add(quad.subject.value);
    }
  }

  return Array.from(resources).sort((left, right) => left.localeCompare(right));
}

/**
 * Extracts ontology metadata and simple run facts from the loaded store.
 *
 * @param {any} store
 * @param {string} fileName
 * @returns {OntologyMetadata}
 */
export function extractOntologyMetadata(store, fileName) {
  const ontologyIri = guessOntologyIri(store);
  const labeledResources = collectLabeledResources(store);
  const quads = store.getQuads(null, null, null, null);

  return {
    fileName: fileName || 'ontology.ttl',
    ontologyIri,
    title:
      getFirstObjectValue(store, ontologyIri, DCTERMS_TITLE_IRI) ||
      getFirstObjectValue(store, ontologyIri, RDFS_LABEL_IRI),
    description: getFirstObjectValue(store, ontologyIri, DCTERMS_DESCRIPTION_IRI),
    versionIri: getFirstObjectValue(store, ontologyIri, OWL_VERSION_IRI),
    versionInfo: getFirstObjectValue(store, ontologyIri, OWL_VERSION_INFO_IRI),
    license: getFirstObjectValue(store, ontologyIri, DCTERMS_LICENSE_IRI),
    accessRights: getFirstObjectValue(store, ontologyIri, DCTERMS_ACCESS_RIGHTS_IRI),
    imports: getObjectValues(store, ontologyIri, OWL_IMPORTS_IRI).sort(),
    tripleCount: quads.length,
    labeledResourceCount: labeledResources.length
  };
}

/**
 * Derives a namespace stem from an IRI.
 *
 * @param {string} iri
 * @returns {string | null}
 */
export function getNamespaceFromIri(iri) {
  if (typeof iri !== 'string' || !/^https?:|^urn:/.test(iri)) {
    return null;
  }

  const hashIndex = iri.lastIndexOf('#');
  if (hashIndex >= 0) {
    return iri.slice(0, hashIndex + 1);
  }

  const slashIndex = iri.lastIndexOf('/');
  if (slashIndex >= 0) {
    return iri.slice(0, slashIndex + 1);
  }

  return null;
}

/**
 * Extracts namespace candidates from RDF terms present in the store.
 *
 * @param {any} store
 * @returns {string[]}
 */
export function extractNamespacesFromStore(store) {
  const namespaces = new Set();
  const quads = store?.getQuads ? store.getQuads(null, null, null, null) : [];

  for (const quad of quads) {
    const values = [
      quad?.subject?.termType === 'NamedNode' ? quad.subject.value : null,
      quad?.predicate?.termType === 'NamedNode' ? quad.predicate.value : null,
      quad?.object?.termType === 'NamedNode' ? quad.object.value : null
    ];

    for (const value of values) {
      const namespace = getNamespaceFromIri(value || '');
      if (namespace) {
        namespaces.add(namespace);
      }
    }
  }

  return Array.from(namespaces).sort((a, b) => a.localeCompare(b));
}

/**
 * Derives default included namespaces for one ontology summary.
 *
 * @param {PreflightSummary} summary
 * @returns {string[]}
 */
export function deriveDefaultIncludedNamespaces(summary) {
  const ontologyNamespace = getNamespaceFromIri(summary?.ontologyIri || '');

  if (ontologyNamespace) {
    return [ontologyNamespace];
  }

  return Array.isArray(summary?.discoveredNamespaces)
    ? summary.discoveredNamespaces.slice(0, 3)
    : [];
}

/**
 * Builds a lightweight preflight summary from an already-loaded store.
 *
 * @param {any} store
 * @param {string} [fileName='ontology.ttl']
 * @returns {PreflightSummary}
 */
export function buildPreflightSummaryFromStore(store, fileName = 'ontology.ttl') {
  const metadata = extractOntologyMetadata(store, fileName);
  const discoveredNamespaces = extractNamespacesFromStore(store);

  return {
    fileName: fileName || 'ontology.ttl',
    ontologyIri: metadata.ontologyIri,
    metadata,
    imports: Array.isArray(metadata.imports) ? metadata.imports : [],
    discoveredNamespaces,
    resourceCountEstimate: metadata.labeledResourceCount || 0
  };
}

/**
 * Builds a lightweight preflight summary from ontology text.
 *
 * @param {string} ontologyText
 * @param {string} [fileName='ontology.ttl']
 * @returns {Promise<PreflightSummary>}
 */
export async function buildPreflightSummary(ontologyText, fileName = 'ontology.ttl') {
  const store = await loadOntologyIntoStore(ontologyText, fileName);
  return buildPreflightSummaryFromStore(store, fileName);
}

/**
 * Maps SELECT polarity to result status.
 *
 * @param {ManifestQuery['polarity']} polarity
 * @param {string} queryId
 * @returns {QueryResultStatus}
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
 * @param {ManifestQuery['polarity']} polarity
 * @param {boolean} askResult
 * @param {string} queryId
 * @returns {QueryResultStatus}
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
 * @param {ManifestQuery} queryDefinition
 * @param {string} queryText
 * @returns {Promise<QueryResultRow[]>}
 */
export async function evaluateSingleQuery(store, queryDefinition, queryText) {
  const criterionId = queryDefinition.checksCriterion || null;
  /** @type {Severity} */
  const severity = queryDefinition.severity || 'info';
  /** @type {QueryScope} */
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
 * Evaluates all manifest queries against an already-loaded RDF store.
 *
 * @param {any} store
 * @param {string} [fileName='ontology.ttl']
 * @param {EvaluateAllQueriesOptions & { manifest?: Manifest | null | undefined }} [options]
 * @returns {Promise<EvaluateAllQueriesOutput>}
 */
export async function evaluateQueriesAgainstStore(
  store,
  fileName = 'ontology.ttl',
  options = {}
) {
  if (!store || typeof store.getQuads !== 'function') {
    throw new TypeError('evaluateQueriesAgainstStore() requires an RDF/JS-compatible store.');
  }

  const manifestUrl = options.manifestUrl || DEFAULT_MANIFEST_URL;
  const queryBasePath = options.queryBasePath || DEFAULT_QUERY_BASE_PATH;
  const manifest = options.manifest || await loadManifest(manifestUrl);
  const ontologyMetadataStore = options.ontologyMetadataStore || store;
  const resourceDetailsStore = options.resourceDetailsStore || store;
  const ontologyMetadata = extractOntologyMetadata(ontologyMetadataStore, fileName);
  const totalQueries = Array.isArray(manifest.queries) ? manifest.queries.length : 0;
  const resources = Array.isArray(options.resourceInventory)
    ? Array.from(new Set(options.resourceInventory.filter(Boolean))).sort((left, right) => left.localeCompare(right))
    : collectLabeledResources(resourceDetailsStore);
  const resultResourceFilter = options.resultResourceFilter instanceof Set
    ? options.resultResourceFilter
    : Array.isArray(options.resultResourceFilter)
      ? new Set(options.resultResourceFilter.filter(Boolean))
      : null;

  /** @type {QueryResultRow[]} */
  const allResults = [];
  let completedQueries = 0;

  for (const queryDefinition of manifest.queries) {
    try {
      console.time(queryDefinition.id);
      const queryText = await loadQueryText(queryDefinition, queryBasePath);
      const rows = await evaluateSingleQuery(store, queryDefinition, queryText);
      console.timeEnd(queryDefinition.id);
      const filteredRows = filterResultsByResourceSet(rows, resultResourceFilter);
      allResults.push(...filteredRows);
    } catch (error) {
      console.error(`Error evaluating query ${queryDefinition.id}:`, error);
    } finally {
      completedQueries += 1;
      if (typeof options.onQueryProgress === 'function') {
        options.onQueryProgress({
          fileName,
          queryId: queryDefinition.id,
          completedQueries,
          totalQueries
        });
      }
    }
  }

  const resourceDetails = extractResourceDetails(resourceDetailsStore, resources, allResults);

  return {
    results: allResults,
    resources,
    resourceDetails,
    ontologyIri: ontologyMetadata.ontologyIri,
    ontologyMetadata
  };
}

/**
 * Returns true when the query scope should be filtered by resource ownership.
 *
 * @param {string | null | undefined} scope
 * @returns {boolean}
 */
function isResourceScopedQueryScope(scope) {
  return scope === 'resource' || scope === 'TBox';
}

/**
 * Filters resource/TBox query rows to a supplied owned-resource set.
 *
 * Ontology-scoped rows are preserved unchanged.
 *
 * @param {QueryResultRow[]} rows
 * @param {Set<string> | null | undefined} ownedResources
 * @returns {QueryResultRow[]}
 */
export function filterResultsByResourceSet(rows, ownedResources) {
  if (!(ownedResources instanceof Set)) {
    return Array.isArray(rows) ? rows : [];
  }

  return (Array.isArray(rows) ? rows : []).filter((row) => {
    if (!row || !isResourceScopedQueryScope(row.scope)) {
      return true;
    }
    return !!row.resource && ownedResources.has(row.resource);
  });
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
  const store = await loadOntologyIntoStore(ontologyText, fileName);
  return evaluateQueriesAgainstStore(store, fileName, options);
}

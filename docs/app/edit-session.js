// app/edit-session.js
// @ts-check

import { CURATION_STATUS_IRIS } from './grader.js';
import {
  OBO_IAO_0000114_IRI,
  OBO_IAO_0000231_IRI,
  OBO_IAO_0000232_IRI,
  OBO_IAO_0100001_IRI,
  RDFS_COMMENT_IRI
} from './engine.js';
import {
  parseRdfInput,
  serializeRdfStore
} from './rdf-io.js';

/** @typedef {import('./rdf-io.js').RdfFormat} RdfFormat */
/** @typedef {import('./types.js').EditableObjectValue} EditableObjectValue */
/** @typedef {import('./types.js').ParsedOntologyState} ParsedOntologyState */
/** @typedef {import('./types.js').StagedResourceEdit} StagedResourceEdit */
/** @typedef {import('./types.js').SupplementalOntologyFile} SupplementalOntologyFile */

export const EDITABLE_NOTE_PREDICATES = Object.freeze([
  OBO_IAO_0000232_IRI,
  OBO_IAO_0000231_IRI,
  OBO_IAO_0100001_IRI,
  RDFS_COMMENT_IRI
]);

export const KNOWN_CURATION_STATUS_OPTIONS = Object.freeze([
  CURATION_STATUS_IRIS.UNCURATED,
  CURATION_STATUS_IRIS.METADATA_INCOMPLETE,
  CURATION_STATUS_IRIS.METADATA_COMPLETE,
  CURATION_STATUS_IRIS.PENDING_FINAL_VETTING,
  CURATION_STATUS_IRIS.REQUIRES_DISCUSSION,
  CURATION_STATUS_IRIS.READY_FOR_RELEASE
]);

/**
 * Creates one retained parsed-ontology state from file text.
 *
 * @param {string} text
 * @param {string} fileName
 * @returns {Promise<ParsedOntologyState>}
 */
export async function createParsedOntologyState(text, fileName) {
  const parsed = await parseRdfInput(text, fileName);
  return {
    ...parsed,
    fileName,
    originalText: text
  };
}

/**
 * Returns the N3 runtime store constructor.
 *
 * @returns {any}
 */
function getStoreConstructor() {
  const runtimeWindow = typeof window !== 'undefined' ? window : globalThis;
  const Store = runtimeWindow?.N3?.Store;
  if (!Store) {
    throw new Error('N3.Store not found on window.N3. Check that n3.min.js is loaded.');
  }
  return Store;
}

/**
 * Returns the N3 runtime data factory.
 *
 * @returns {any}
 */
function getDataFactory() {
  const runtimeWindow = typeof window !== 'undefined' ? window : globalThis;
  const dataFactory = runtimeWindow?.N3?.DataFactory;
  if (!dataFactory) {
    throw new Error('N3.DataFactory not found on window.N3. Check that n3.min.js is loaded.');
  }
  return dataFactory;
}

/**
 * Returns a deep-ish clone of one RDF/JS store.
 *
 * @param {any} store
 * @returns {any}
 */
export function cloneStore(store) {
  const Store = getStoreConstructor();
  return new Store(store?.getQuads ? store.getQuads(null, null, null, null) : []);
}

/**
 * Returns a cloned parsed-ontology state.
 *
 * @param {ParsedOntologyState} parsedOntology
 * @returns {ParsedOntologyState}
 */
export function cloneParsedOntologyState(parsedOntology) {
  return {
    ...parsedOntology,
    prefixes: { ...(parsedOntology?.prefixes || {}) },
    store: cloneStore(parsedOntology?.store)
  };
}

/**
 * Builds one merged inspection store from the primary ontology plus read-only closure ontologies.
 *
 * @param {ParsedOntologyState | null | undefined} primaryOntology
 * @param {SupplementalOntologyFile[] | null | undefined} supplementalOntologies
 * @returns {any}
 */
export function buildMergedInspectionStore(primaryOntology, supplementalOntologies = []) {
  const merged = cloneStore(primaryOntology?.store);
  const quads = [];

  for (const supplemental of Array.isArray(supplementalOntologies) ? supplementalOntologies : []) {
    if (supplemental?.parsedOntology?.store?.getQuads) {
      quads.push(...supplemental.parsedOntology.store.getQuads(null, null, null, null));
    }
  }

  if (quads.length && typeof merged.addQuads === 'function') {
    merged.addQuads(quads);
  } else {
    for (const quad of quads) {
      merged.addQuad(quad);
    }
  }

  return merged;
}

/**
 * Converts one editable object value into an RDF/JS term.
 *
 * @param {EditableObjectValue} objectValue
 * @returns {any}
 */
export function editableObjectValueToTerm(objectValue) {
  const dataFactory = getDataFactory();
  const value = String(objectValue?.value || '');

  if (objectValue?.termType === 'NamedNode') {
    return dataFactory.namedNode(value);
  }

  const language = String(objectValue?.language || '').trim();
  const datatypeIri = String(objectValue?.datatypeIri || '').trim();

  if (language) {
    return dataFactory.literal(value, language);
  }
  if (datatypeIri) {
    return dataFactory.literal(value, dataFactory.namedNode(datatypeIri));
  }
  return dataFactory.literal(value);
}

/**
 * Returns true when two RDF/JS terms match by semantic identity.
 *
 * @param {any} left
 * @param {any} right
 * @returns {boolean}
 */
function termsEqual(left, right) {
  if (left && typeof left.equals === 'function') {
    return left.equals(right);
  }

  return (
    String(left?.termType || '') === String(right?.termType || '') &&
    String(left?.value || '') === String(right?.value || '') &&
    String(left?.language || '') === String(right?.language || '') &&
    String(left?.datatype?.value || '') === String(right?.datatype?.value || '')
  );
}

/**
 * Replaces all values for one subject/predicate pair.
 *
 * @param {any} store
 * @param {string} subjectIri
 * @param {string} predicateIri
 * @param {EditableObjectValue[]} objects
 * @returns {void}
 */
export function replacePredicateValues(store, subjectIri, predicateIri, objects) {
  const dataFactory = getDataFactory();
  const existing = store.getQuads(subjectIri, predicateIri, null, null);
  const graph = existing[0]?.graph?.termType ? existing[0].graph : dataFactory.defaultGraph();

  if (existing.length) {
    store.removeQuads(existing);
  }

  for (const objectValue of Array.isArray(objects) ? objects : []) {
    const objectTerm = editableObjectValueToTerm(objectValue);
    store.addQuad(
      dataFactory.quad(
        dataFactory.namedNode(subjectIri),
        dataFactory.namedNode(predicateIri),
        objectTerm,
        graph
      )
    );
  }
}

/**
 * Adds one new assertion if it is not already present.
 *
 * @param {any} store
 * @param {string} subjectIri
 * @param {string} predicateIri
 * @param {EditableObjectValue} object
 * @returns {void}
 */
export function addAssertion(store, subjectIri, predicateIri, object) {
  const dataFactory = getDataFactory();
  const objectTerm = editableObjectValueToTerm(object);
  const existing = store.getQuads(subjectIri, predicateIri, null, null);

  if (existing.some((quad) => termsEqual(quad?.object, objectTerm))) {
    return;
  }

  store.addQuad(
    dataFactory.quad(
      dataFactory.namedNode(subjectIri),
      dataFactory.namedNode(predicateIri),
      objectTerm,
      existing[0]?.graph?.termType ? existing[0].graph : dataFactory.defaultGraph()
    )
  );
}

/**
 * Removes one matching assertion if present.
 *
 * @param {any} store
 * @param {string} subjectIri
 * @param {string} predicateIri
 * @param {EditableObjectValue[]} objects
 * @returns {void}
 */
export function removeAssertions(store, subjectIri, predicateIri, objects) {
  const removableTerms = (Array.isArray(objects) ? objects : []).map(editableObjectValueToTerm);
  const existing = store.getQuads(subjectIri, predicateIri, null, null);
  const matches = existing.filter((quad) =>
    removableTerms.some((term) => termsEqual(term, quad?.object))
  );

  if (matches.length) {
    store.removeQuads(matches);
  }
}

/**
 * Applies staged edits to the supplied store.
 *
 * @param {any} store
 * @param {StagedResourceEdit[] | null | undefined} stagedEdits
 * @returns {any}
 */
export function applyStagedEditsToStore(store, stagedEdits) {
  const targetStore = cloneStore(store);

  for (const edit of Array.isArray(stagedEdits) ? stagedEdits : []) {
    if (!edit?.subject || !edit?.predicateIri) {
      continue;
    }

    if (edit.kind === 'set-codesignated-values') {
      replacePredicateValues(targetStore, edit.subject, edit.predicateIri, edit.objects);
      continue;
    }

    if (edit.kind === 'add-assertion') {
      for (const object of Array.isArray(edit.objects) ? edit.objects : []) {
        addAssertion(targetStore, edit.subject, edit.predicateIri, object);
      }
      continue;
    }

    if (edit.kind === 'remove-assertion') {
      removeAssertions(targetStore, edit.subject, edit.predicateIri, edit.objects);
    }
  }

  return targetStore;
}

/**
 * Serializes the primary ontology store for download.
 *
 * @param {ParsedOntologyState} primaryOntology
 * @param {RdfFormat} [format]
 * @returns {Promise<string>}
 */
export async function exportPrimaryOntology(primaryOntology, format) {
  const targetFormat = format || primaryOntology?.sourceFormat;
  return serializeRdfStore(primaryOntology.store, targetFormat, {
    prefixes: primaryOntology?.prefixes || {},
    baseIri: primaryOntology?.baseIri || null
  });
}

/**
 * Creates a stable id for one staged edit entry.
 *
 * @returns {string}
 */
export function createStagedEditId() {
  return `edit-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

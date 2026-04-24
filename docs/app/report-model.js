// app/report-model.js
// @ts-check

import {
  collectAssertedNamedResources,
  collectLabeledResources,
  evaluateAllQueries,
  evaluateQueriesAgainstStore,
  extractExternalIriDependencies,
  OBO_IAO_0000114_IRI
} from './engine.js';
import {
  computePerResourceCuration,
  computeOntologyReport
} from './grader.js';

/** @typedef {import('./types.js').Manifest} Manifest */
/** @typedef {import('./types.js').EvaluatedReport} EvaluatedReport */
/** @typedef {import('./types.js').InspectionScope} InspectionScope */
/** @typedef {import('./types.js').QueryResultRow} QueryResultRow */

/**
 * @typedef {Object} InspectProgress
 * @property {string} fileName
 * @property {string} queryId
 * @property {number} completedQueries
 * @property {number} totalQueries
 */

/**
 * @typedef {Object} InspectFilesOptions
 * @property {(progress: InspectProgress) => void} [onQueryProgress]
 * @property {any} [primaryStore]
 */

/**
 * Input for building one inspected ontology report bundle.
 *
 * @typedef {Object} BuildInspectionItemInput
 * @property {string} fileName
 * @property {string} ontologyIri
 * @property {string | null | undefined} inspectedAt
 * @property {import('./types.js').OntologyMetadata | null | undefined} ontologyMetadata
 * @property {QueryResultRow[]} results
 * @property {string[]} resources
 * @property {Record<string, import('./types.js').ResourceDetail>} [resourceDetails]
 * @property {InspectionScope | null | undefined} inspectionScope
 * @property {Manifest | null | undefined} manifest
 */

/**
 * Builds one inspected ontology report bundle.
 *
 * This preserves the current saved-run payload shape.
 *
 * @param {BuildInspectionItemInput} input
 * @returns {EvaluatedReport}
 */
export function buildInspectionItem(input) {
  const fileName = String(input?.fileName || '');
  const ontologyIri = String(input?.ontologyIri || '');
  const inspectedAt = String(input?.inspectedAt || new Date().toISOString());
  const ontologyMetadata = input?.ontologyMetadata || null;
  const results = Array.isArray(input?.results) ? input.results : [];
  const resources = Array.isArray(input?.resources) ? input.resources : [];
  const resourceDetails = input?.resourceDetails || {};
  const inspectionScope = input?.inspectionScope || null;
  const manifest = input?.manifest || null;

  const perResource = computePerResourceCuration(results, manifest, resources, inspectionScope);
  const enrichedPerResource = perResource.map((row) => {
    const resourceDetail = resourceDetails?.[row.resource];
    const statusAssertion = Array.isArray(resourceDetail?.outgoingAssertions)
      ? resourceDetail.outgoingAssertions.find(
        (assertion) => assertion.predicateIri === OBO_IAO_0000114_IRI
      )
      : null;

    return {
      ...row,
      ...(statusAssertion
        ? {
          currentStatusIri: statusAssertion.object.value,
          currentStatusLabel: statusAssertion.object.displayValue
        }
        : {})
    };
  });
  const ontologyReport = computeOntologyReport(
    results,
    manifest,
    ontologyIri,
    ontologyMetadata,
    inspectionScope
  );

  return {
    inspectedAt,
    fileName,
    ontologyIri,
    ontologyMetadata,
    inspectionScope,
    ontologyReport,
    perResource: enrichedPerResource,
    resourceDetails,
    results
  };
}

/**
 * Inspects ontology text and returns one evaluated report bundle.
 *
 * @param {string} ontologyText
 * @param {string} fileName
 * @param {Manifest | null | undefined} manifest
 * @param {InspectionScope | null | undefined} [inspectionScope]
 * @param {InspectFilesOptions} [options]
 * @returns {Promise<EvaluatedReport>}
 */
export async function inspectOntologyText(
  ontologyText,
  fileName,
  manifest,
  inspectionScope,
  options = {}
) {
  if (typeof ontologyText !== 'string') {
    throw new TypeError('inspectOntologyText() requires ontologyText to be a string.');
  }

  const { results, resources, resourceDetails, ontologyIri, ontologyMetadata } = await evaluateAllQueries(
    ontologyText,
    fileName || 'ontology.ttl',
    {
      manifest,
      onQueryProgress: options.onQueryProgress
    }
  );

  return buildInspectionItem({
    fileName,
    ontologyIri,
    inspectedAt: new Date().toISOString(),
    ontologyMetadata,
    results,
    resources,
    resourceDetails,
    inspectionScope,
    manifest
  });
}

/**
 * Inspects an already-loaded RDF store and returns one evaluated report bundle.
 *
 * @param {any} store
 * @param {string} fileName
 * @param {Manifest | null | undefined} manifest
 * @param {InspectionScope | null | undefined} [inspectionScope]
 * @param {InspectFilesOptions} [options]
 * @returns {Promise<EvaluatedReport>}
 */
export async function inspectStore(store, fileName, manifest, inspectionScope, options = {}) {
  const primaryStore = options.primaryStore || store;
  const resultResourceFilter = collectAssertedNamedResources(primaryStore);
  const resourceInventory = Array.from(
    new Set([
      ...collectLabeledResources(primaryStore),
      ...resultResourceFilter
    ])
  ).sort((left, right) => left.localeCompare(right));
  const { results, resources, resourceDetails, ontologyIri, ontologyMetadata } =
    await evaluateQueriesAgainstStore(store, fileName || 'ontology.ttl', {
      manifest,
      resultResourceFilter,
      resourceInventory,
      resourceDetailsStore: primaryStore,
      ontologyMetadataStore: primaryStore,
      onQueryProgress: options.onQueryProgress
    });
  const ontologyMetadataWithDependencies = {
    ...ontologyMetadata,
    externalIriDependencies: extractExternalIriDependencies(primaryStore, store)
  };

  return buildInspectionItem({
    fileName,
    ontologyIri,
    inspectedAt: new Date().toISOString(),
    ontologyMetadata: ontologyMetadataWithDependencies,
    results,
    resources,
    resourceDetails,
    inspectionScope,
    manifest
  });
}

/**
 * Inspects one browser File and returns one evaluated report bundle.
 *
 * @param {File} file
 * @param {Manifest | null | undefined} manifest
 * @param {InspectionScope | null | undefined} [inspectionScope]
 * @param {InspectFilesOptions} [options]
 * @returns {Promise<EvaluatedReport>}
 */
export async function inspectFile(file, manifest, inspectionScope, options = {}) {
  if (!(file instanceof File)) {
    throw new TypeError('inspectFile() requires a File.');
  }

  const text = await file.text();
  return inspectOntologyText(text, file.name, manifest, inspectionScope, options);
}

/**
 * Inspects many browser File objects and returns report bundles in input order.
 *
 * @param {File[]} files
 * @param {Manifest | null | undefined} manifest
 * @param {Map<string, InspectionScope> | null | undefined} [inspectionScopesByFileName]
 * @param {InspectFilesOptions} [options]
 * @returns {Promise<EvaluatedReport[]>}
 */
export async function inspectFiles(files, manifest, inspectionScopesByFileName, options = {}) {
  const fileList = Array.isArray(files) ? files : [];

  /** @type {EvaluatedReport[]} */
  const reports = [];

  for (const file of fileList) {
    if (!(file instanceof File)) {
      continue;
    }

    const inspectionScope = inspectionScopesByFileName?.get(file.name) || null;
    const report = await inspectFile(file, manifest, inspectionScope, options);
    reports.push(report);
  }

  return reports;
}

// app/report-model.js
// @ts-check

import { evaluateAllQueries } from './engine.js';
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
    perResource,
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

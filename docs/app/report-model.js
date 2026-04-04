// app/report-model.js
// @ts-check

import { evaluateAllQueries } from './engine.js';
import {
  computePerResourceCuration,
  computeOntologyReport
} from './grader.js';

/** @typedef {import('./types.js').OcqManifest} OcqManifest */
/** @typedef {import('./types.js').OcqEvaluatedReport} OcqEvaluatedReport */
/** @typedef {import('./types.js').OcqInspectionScope} OcqInspectionScope */
/** @typedef {import('./types.js').OcqQueryResultRow} OcqQueryResultRow */

/**
 * Input for building one inspected ontology report bundle.
 *
 * @typedef {Object} BuildInspectionItemInput
 * @property {string} fileName
 * @property {string} ontologyIri
 * @property {string | null | undefined} inspectedAt
 * @property {import('./types.js').OcqOntologyMetadata | null | undefined} ontologyMetadata
 * @property {OcqQueryResultRow[]} results
 * @property {string[]} resources
 * @property {OcqInspectionScope | null | undefined} inspectionScope
 * @property {OcqManifest | null | undefined} manifest
 */

/**
 * Builds one inspected ontology report bundle.
 *
 * This preserves the current saved-run payload shape.
 *
 * @param {BuildInspectionItemInput} input
 * @returns {OcqEvaluatedReport}
 */
export function buildInspectionItem(input) {
  const fileName = String(input?.fileName || '');
  const ontologyIri = String(input?.ontologyIri || '');
  const inspectedAt = String(input?.inspectedAt || new Date().toISOString());
  const ontologyMetadata = input?.ontologyMetadata || null;
  const results = Array.isArray(input?.results) ? input.results : [];
  const resources = Array.isArray(input?.resources) ? input.resources : [];
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
    results
  };
}

/**
 * Inspects ontology text and returns one evaluated report bundle.
 *
 * @param {string} ontologyText
 * @param {string} fileName
 * @param {OcqManifest | null | undefined} manifest
 * @param {OcqInspectionScope | null | undefined} [inspectionScope]
 * @returns {Promise<OcqEvaluatedReport>}
 */
export async function inspectOntologyText(ontologyText, fileName, manifest, inspectionScope) {
  if (typeof ontologyText !== 'string') {
    throw new TypeError('inspectOntologyText() requires ontologyText to be a string.');
  }

  const { results, resources, ontologyIri, ontologyMetadata } = await evaluateAllQueries(
    ontologyText,
    fileName || 'ontology.ttl'
  );

  return buildInspectionItem({
    fileName,
    ontologyIri,
    inspectedAt: new Date().toISOString(),
    ontologyMetadata,
    results,
    resources,
    inspectionScope,
    manifest
  });
}

/**
 * Inspects one browser File and returns one evaluated report bundle.
 *
 * @param {File} file
 * @param {OcqManifest | null | undefined} manifest
 * @param {OcqInspectionScope | null | undefined} [inspectionScope]
 * @returns {Promise<OcqEvaluatedReport>}
 */
export async function inspectFile(file, manifest, inspectionScope) {
  if (!(file instanceof File)) {
    throw new TypeError('inspectFile() requires a File.');
  }

  const text = await file.text();
  return inspectOntologyText(text, file.name, manifest, inspectionScope);
}

/**
 * Inspects many browser File objects and returns report bundles in input order.
 *
 * @param {File[]} files
 * @param {OcqManifest | null | undefined} manifest
 * @param {Map<string, OcqInspectionScope> | null | undefined} [inspectionScopesByFileName]
 * @returns {Promise<OcqEvaluatedReport[]>}
 */
export async function inspectFiles(files, manifest, inspectionScopesByFileName) {
  const fileList = Array.isArray(files) ? files : [];

  /** @type {OcqEvaluatedReport[]} */
  const reports = [];

  for (const file of fileList) {
    if (!(file instanceof File)) {
      continue;
    }

    const inspectionScope = inspectionScopesByFileName?.get(file.name) || null;
    const report = await inspectFile(file, manifest, inspectionScope);
    reports.push(report);
  }

  return reports;
}

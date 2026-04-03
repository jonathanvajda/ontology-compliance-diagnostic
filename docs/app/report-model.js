// app/report-model.js
// @ts-check

import { evaluateAllQueries } from './engine.js';
import {
  computePerResourceCuration,
  computeOntologyReport
} from './grader.js';

/** @typedef {import('./types.js').OcqManifest} OcqManifest */
/** @typedef {import('./types.js').OcqEvaluatedReport} OcqEvaluatedReport */
/** @typedef {import('./types.js').OcqQueryResultRow} OcqQueryResultRow */

/**
 * Input for building one inspected ontology report bundle.
 *
 * @typedef {Object} BuildInspectionItemInput
 * @property {string} fileName
 * @property {string} ontologyIri
 * @property {OcqQueryResultRow[]} results
 * @property {string[]} resources
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
  const results = Array.isArray(input?.results) ? input.results : [];
  const resources = Array.isArray(input?.resources) ? input.resources : [];
  const manifest = input?.manifest || null;

  const perResource = computePerResourceCuration(results, manifest, resources);
  const ontologyReport = computeOntologyReport(results, manifest, ontologyIri);

  return {
    fileName,
    ontologyIri,
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
 * @returns {Promise<OcqEvaluatedReport>}
 */
export async function inspectOntologyText(ontologyText, fileName, manifest) {
  if (typeof ontologyText !== 'string') {
    throw new TypeError('inspectOntologyText() requires ontologyText to be a string.');
  }

  const { results, resources, ontologyIri } = await evaluateAllQueries(
    ontologyText,
    fileName || 'ontology.ttl'
  );

  return buildInspectionItem({
    fileName,
    ontologyIri,
    results,
    resources,
    manifest
  });
}

/**
 * Inspects one browser File and returns one evaluated report bundle.
 *
 * @param {File} file
 * @param {OcqManifest | null | undefined} manifest
 * @returns {Promise<OcqEvaluatedReport>}
 */
export async function inspectFile(file, manifest) {
  if (!(file instanceof File)) {
    throw new TypeError('inspectFile() requires a File.');
  }

  const text = await file.text();
  return inspectOntologyText(text, file.name, manifest);
}

/**
 * Inspects many browser File objects and returns report bundles in input order.
 *
 * @param {File[]} files
 * @param {OcqManifest | null | undefined} manifest
 * @returns {Promise<OcqEvaluatedReport[]>}
 */
export async function inspectFiles(files, manifest) {
  const fileList = Array.isArray(files) ? files : [];

  /** @type {OcqEvaluatedReport[]} */
  const reports = [];

  for (const file of fileList) {
    if (!(file instanceof File)) {
      continue;
    }

    const report = await inspectFile(file, manifest);
    reports.push(report);
  }

  return reports;
}
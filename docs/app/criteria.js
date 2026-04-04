// app/criteria.js
// @ts-check

import { getReportStandards } from './shared.js';

/** @typedef {import('./types.js').OcqManifest} OcqManifest */
/** @typedef {import('./types.js').OcqManifestQuery} OcqManifestQuery */
/** @typedef {import('./types.js').OcqManifestStandard} OcqManifestStandard */
/**
 * @typedef {Object} OcqCriterionDefinition
 * @property {string} id
 * @property {string} label
 * @property {'requirement' | 'recommendation'} type
 * @property {string} guidance
 * @property {'usually low' | 'usually high' | 'case-by-case'} remediationEffort
 * @property {OcqManifestQuery[]} queries
 */

/**
 * Populates the standard filter select.
 *
 * @param {OcqManifest | null | undefined} manifest
 * @param {HTMLSelectElement | null | undefined} selectElement
 * @returns {void}
 */
export function populateStandardFilter(manifest, selectElement) {
  if (!(selectElement instanceof HTMLSelectElement)) {
    return;
  }

  const currentValue = selectElement.value;
  selectElement.innerHTML = '<option value="">Any</option>';

  const standards = Array.isArray(manifest?.standards) ? manifest.standards : [];

  for (const standard of standards) {
    if (!standard?.id) {
      continue;
    }

    const option = document.createElement('option');
    option.value = standard.id;
    option.textContent =
      String(standard.label || standard.id) +
      (standard.type ? ` (${standard.type})` : '');
    selectElement.appendChild(option);
  }

  if (
    currentValue &&
    Array.from(selectElement.options).some((option) => option.value === currentValue)
  ) {
    selectElement.value = currentValue;
  }
}

/**
 * Returns manifest queries associated with a criterion id.
 *
 * @param {OcqManifest | null | undefined} manifest
 * @param {string | null | undefined} criterionId
 * @returns {OcqManifestQuery[]}
 */
export function getCriterionQueries(manifest, criterionId) {
  const selectedCriterionId = criterionId || '';
  const queries = Array.isArray(manifest?.queries) ? manifest.queries : [];

  if (!selectedCriterionId) {
    return [];
  }

  return queries.filter((query) => query?.checksCriterion === selectedCriterionId);
}

/**
 * Returns one standard entry from the manifest.
 *
 * @param {OcqManifest | null | undefined} manifest
 * @param {string | null | undefined} criterionId
 * @returns {OcqManifestStandard | null}
 */
export function getManifestStandard(manifest, criterionId) {
  const selectedCriterionId = criterionId || '';
  const standards = Array.isArray(manifest?.standards) ? manifest.standards : [];

  if (!selectedCriterionId) {
    return null;
  }

  return standards.find((standard) => standard?.id === selectedCriterionId) || null;
}

/**
 * Returns normalized criterion metadata for rendering and export.
 *
 * @param {OcqManifest | null | undefined} manifest
 * @param {string | null | undefined} criterionId
 * @returns {OcqCriterionDefinition | null}
 */
export function getCriterionDefinition(manifest, criterionId) {
  const selectedCriterionId = criterionId || '';

  if (!selectedCriterionId) {
    return null;
  }

  const standard = getManifestStandard(manifest, selectedCriterionId);
  const queries = getCriterionQueries(manifest, selectedCriterionId);
  const type = standard?.type === 'recommendation' ? 'recommendation' : 'requirement';
  const label = String(standard?.label || selectedCriterionId).trim().slice(0, 50) || selectedCriterionId;
  const guidance = String(standard?.guidance || '').trim().slice(0, 400);
  const remediationEffort = standard?.remediationEffort === 'usually low' ||
    standard?.remediationEffort === 'usually high' ||
    standard?.remediationEffort === 'case-by-case'
    ? standard.remediationEffort
    : 'case-by-case';

  return {
    id: selectedCriterionId,
    label,
    type,
    guidance,
    remediationEffort,
    queries
  };
}

export { getReportStandards };

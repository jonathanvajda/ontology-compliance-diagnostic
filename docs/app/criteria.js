// app/criteria.js
// @ts-check

/** @typedef {import('./types.js').OcqManifest} OcqManifest */
/** @typedef {import('./types.js').OcqManifestStandard} OcqManifestStandard */
/** @typedef {import('./types.js').OcqOntologyReport} OcqOntologyReport */
/** @typedef {import('./types.js').OcqOntologyReportStandardRow} OcqOntologyReportStandardRow */

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
    option.textContent = standard.id + (standard.type ? ` (${standard.type})` : '');
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
 * Returns the standards array from an ontology report.
 *
 * @param {OcqOntologyReport | null | undefined} report
 * @returns {OcqOntologyReportStandardRow[]}
 */
export function getReportStandards(report) {
  return Array.isArray(report?.standards) ? report.standards : [];
}
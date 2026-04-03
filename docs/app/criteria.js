/**
 * Populates the standard filter select.
 *
 * @param {OcqManifest | null | undefined} manifest
 * @returns {void}
 */
export function populateStandardFilter(manifest) {
  if (!standardFilterSelect) {
    return;
  }

  const currentValue = standardFilterSelect.value;
  standardFilterSelect.innerHTML = '<option value="">Any</option>';

  const standards = Array.isArray(manifest?.standards) ? manifest.standards : [];

  for (const standard of standards) {
    if (!standard?.id) {
      continue;
    }

    const option = document.createElement('option');
    option.value = standard.id;
    option.textContent = standard.id + (standard.type ? ` (${standard.type})` : '');
    standardFilterSelect.appendChild(option);
  }

  if (
    currentValue &&
    Array.from(standardFilterSelect.options).some((option) => option.value === currentValue)
  ) {
    standardFilterSelect.value = currentValue;
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
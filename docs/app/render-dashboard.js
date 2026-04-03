// app/render-dashboard.js
// @ts-check

/** @typedef {import('./types.js').OcqEvaluatedReport} OcqEvaluatedReport */
/** @typedef {import('./types.js').OcqOntologyReport} OcqOntologyReport */
/** @typedef {import('./types.js').OcqOntologyReportStandardRow} OcqOntologyReportStandardRow */

/** @type {HTMLElement | null} */
const dashboardContainer = document.getElementById('dashboardContainer');

/**
 * Escapes text for safe HTML insertion.
 *
 * @param {unknown} value
 * @returns {string}
 */
function escapeHtml(value) {
  if (value == null) {
    return '';
  }

  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Returns the standards array from an ontology report.
 *
 * @param {OcqOntologyReport | null | undefined} report
 * @returns {OcqOntologyReportStandardRow[]}
 */
function getReportStandards(report) {
  return Array.isArray(report?.standards) ? report.standards : [];
}

/**
 * Returns the stable key for a batch row.
 *
 * @param {OcqEvaluatedReport} item
 * @returns {string}
 */
export function getBatchKey(item) {
  const fileName = item?.fileName ?? '';
  const ontologyIri = item?.ontologyIri ?? item?.ontologyReport?.ontologyIri ?? '';
  return `${fileName}::${ontologyIri}`;
}

/**
 * Renders the batch dashboard.
 *
 * @param {OcqEvaluatedReport[] | null | undefined} batchReports
 * @param {string | null} [selectedBatchKey=null]
 * @returns {void}
 */
export function renderDashboard(batchReports, selectedBatchKey = null) {
  if (!dashboardContainer) {
    return;
  }

  if (!Array.isArray(batchReports) || batchReports.length === 0) {
    dashboardContainer.innerHTML = '<p>No ontologies evaluated.</p>';
    return;
  }

  let html = '<h2 class="ocq-title">Ontology dashboard</h2>';
  html += '<table class="ocq-table">';
  html += '<thead class="ocq-table-head"><tr>';
  html += '<th class="ocq-table-th">File</th>';
  html += '<th class="ocq-table-th">Ontology IRI</th>';
  html += '<th class="ocq-table-th">Status</th>';
  html += '<th class="ocq-table-th"># Failed Requirements</th>';
  html += '<th class="ocq-table-th"># Failed Recommendations</th>';
  html += '</tr></thead><tbody>';

  for (const item of batchReports) {
    const report = item.ontologyReport;
    const standards = getReportStandards(report);

    const failedRequirements = standards.filter(
      (standard) => standard.type === 'requirement' && standard.status === 'fail'
    ).length;

    const failedRecommendations = standards.filter(
      (standard) => standard.type === 'recommendation' && standard.status === 'fail'
    ).length;

    const batchKey = getBatchKey(item);
    const isSelected = selectedBatchKey === batchKey;

    html += '<tr class="ocq-table-tr ocq-row-clickable ocq-batch-row' +
      (isSelected ? ' ocq-batch-row--selected' : '') +
      '" tabindex="0" role="button" data-batch-key="' +
      escapeHtml(batchKey) +
      '">';

    html += '<td class="ocq-table-td ocq-mono">' + escapeHtml(item.fileName) + '</td>';
    html += '<td class="ocq-table-td ocq-mono">' + escapeHtml(report?.ontologyIri || '') + '</td>';
    html += '<td class="ocq-table-td ocq-mono">' + escapeHtml(report?.statusLabel || '') + '</td>';
    html += '<td class="ocq-table-td ocq-mono">' + escapeHtml(String(failedRequirements)) + '</td>';
    html += '<td class="ocq-table-td ocq-mono">' + escapeHtml(String(failedRecommendations)) + '</td>';
    html += '</tr>';
  }

  html += '</tbody></table>';
  dashboardContainer.innerHTML = html;
}
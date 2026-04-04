// app/render-dashboard.js
// @ts-check

import { escapeHtml, getReportStandards } from './shared.js';

/** @typedef {import('./types.js').OcqEvaluatedReport} OcqEvaluatedReport */

/** @type {HTMLElement | null} */
const dashboardContainer = document.getElementById('dashboardContainer');

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
 * @param {HTMLElement | null | undefined} [container=dashboardContainer]
 * @returns {void}
 */
export function renderDashboard(
  batchReports,
  selectedBatchKey = null,
  container = dashboardContainer
) {
  if (!container) {
    return;
  }

  if (!Array.isArray(batchReports) || batchReports.length === 0) {
    container.innerHTML = '<p>No ontologies evaluated.</p>';
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
  container.innerHTML = html;
}

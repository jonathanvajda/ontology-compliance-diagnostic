// app/render-dashboard.js
// @ts-check

import { escapeHtml, getReportStandards } from './shared.js';

/** @typedef {import('./types.js').EvaluatedReport} EvaluatedReport */

/** @type {HTMLElement | null} */
const dashboardContainer = document.getElementById('dashboardContainer');

/**
 * Returns the stable key for a batch row.
 *
 * @param {EvaluatedReport} item
 * @returns {string}
 */
export function getBatchKey(item) {
  const inspectedAt = item?.inspectedAt ?? '';
  const fileName = item?.fileName ?? '';
  const ontologyIri = item?.ontologyIri ?? item?.ontologyReport?.ontologyIri ?? '';
  return `${inspectedAt}::${fileName}::${ontologyIri}`;
}

/**
 * Renders the batch dashboard.
 *
 * @param {EvaluatedReport[] | null | undefined} batchReports
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

  let html = '<h2 class="ocd-title">Ontology dashboard</h2>';
  html += '<table class="ocd-table">';
  html += '<thead class="ocd-table-head"><tr>';
  html += '<th class="ocd-table-th">Run</th>';
  html += '<th class="ocd-table-th">File</th>';
  html += '<th class="ocd-table-th">Ontology IRI</th>';
  html += '<th class="ocd-table-th">Title</th>';
  html += '<th class="ocd-table-th">Version</th>';
  html += '<th class="ocd-table-th">Status</th>';
  html += '<th class="ocd-table-th">Ontology Fails</th>';
  html += '<th class="ocd-table-th">Element Fails</th>';
  html += '</tr></thead><tbody>';

  for (const item of batchReports) {
    const report = item.ontologyReport;
    const ontologyStandards = Array.isArray(report?.ontologyStandards)
      ? report.ontologyStandards
      : [];
    const contentStandards = Array.isArray(report?.contentStandards)
      ? report.contentStandards
      : getReportStandards(report).filter((standard) => standard.scopeCategory !== 'ontology');
    const metadata = item.ontologyMetadata || report?.metadata || null;

    const failedOntologyChecks = ontologyStandards.filter(
      (standard) => standard.status === 'fail'
    ).length;

    const failedContentChecks = contentStandards.filter(
      (standard) => standard.status === 'fail'
    ).length;

    const batchKey = getBatchKey(item);
    const isSelected = selectedBatchKey === batchKey;

    html += '<tr class="ocd-table-tr ocd-row-clickable ocd-batch-row' +
      (isSelected ? ' ocd-batch-row--selected' : '') +
      '" tabindex="0" role="button" data-batch-key="' +
      escapeHtml(batchKey) +
      '">';

    html += '<td class="ocd-table-td ocd-mono">' + escapeHtml(item.inspectedAt || '') + '</td>';
    html += '<td class="ocd-table-td ocd-mono">' + escapeHtml(item.fileName) + '</td>';
    html += '<td class="ocd-table-td ocd-mono">' + escapeHtml(report?.ontologyIri || '') + '</td>';
    html += '<td class="ocd-table-td">' + escapeHtml(metadata?.title || '') + '</td>';
    html += '<td class="ocd-table-td ocd-mono">' + escapeHtml(metadata?.versionInfo || metadata?.versionIri || '') + '</td>';
    html += '<td class="ocd-table-td ocd-mono">' + escapeHtml(report?.statusLabel || '') + '</td>';
    html += '<td class="ocd-table-td ocd-mono">' + escapeHtml(String(failedOntologyChecks)) + '</td>';
    html += '<td class="ocd-table-td ocd-mono">' + escapeHtml(String(failedContentChecks)) + '</td>';
    html += '</tr>';
  }

  html += '</tbody></table>';
  container.innerHTML = html;
}

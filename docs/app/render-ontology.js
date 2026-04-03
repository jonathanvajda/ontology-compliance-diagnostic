// app/render-ontology.js
// @ts-check

import { getReportStandards } from './criteria.js';

/** @typedef {import('./types.js').OcqOntologyReport} OcqOntologyReport */

/** @type {HTMLElement | null} */
const ontologyReportContainer = document.getElementById('ontologyReportContainer');

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
 * Renders the ontology report card.
 *
 * @param {OcqOntologyReport | null | undefined} report
 * @returns {void}
 */
export function renderOntologyReport(report) {
  if (!ontologyReportContainer) {
    return;
  }

  if (!report) {
    ontologyReportContainer.innerHTML = '';
    return;
  }

  const standards = getReportStandards(report);

  let html = '<h2 class="ocq-title">Ontology report card</h2>';
  html += '<p><strong>Ontology IRI:</strong> ' + escapeHtml(report.ontologyIri) + '</p>';
  html += '<p><strong>Ontology curation status:</strong> ' + escapeHtml(report.statusLabel) + '</p>';

  if (!standards.length) {
    html += '<p>No standards found.</p>';
    ontologyReportContainer.innerHTML = html;
    return;
  }

  html += '<table class="ocq-table">';
  html += '<thead class="ocq-table-head"><tr>';
  html += '<th class="ocq-table-th">Standardization Code</th>';
  html += '<th class="ocq-table-th">Type</th>';
  html += '<th class="ocq-table-th">Status</th>';
  html += '<th class="ocq-table-th">Failed Resources</th>';
  html += '</tr></thead><tbody>';

  for (const standard of standards) {
    const typeLabel = standard.type === 'recommendation' ? 'recommendation' : 'requirement';
    const failedCount = standard.failedResourcesCount || 0;
    const statusBadgeClass =
      standard.status === 'pass'
        ? 'ocq-badge ocq-badge-success'
        : 'ocq-badge ocq-badge-danger';

    html += '<tr class="ocq-table-tr ocq-row-clickable" tabindex="0" data-standard-id="' +
      escapeHtml(standard.id) +
      '">';

    html += '<td class="ocq-table-td">' + escapeHtml(standard.id) + '</td>';
    html += '<td class="ocq-table-td">' + escapeHtml(typeLabel) + '</td>';
    html += '<td class="ocq-table-td"><span class="' + statusBadgeClass + '">' + escapeHtml(standard.status) + '</span></td>';
    html += '<td class="ocq-table-td">' + escapeHtml(String(failedCount)) + '</td>';
    html += '</tr>';
  }

  html += '</tbody></table>';
  ontologyReportContainer.innerHTML = html;
}
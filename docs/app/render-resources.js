// app/render-resources.js
// @ts-check

import { cssEscapeAttr, escapeHtml } from './shared.js';

/** @typedef {import('./types.js').OcqFailureIndex} OcqFailureIndex */
/** @typedef {import('./types.js').OcqPerResourceCurationRow} OcqPerResourceCurationRow */

/** @type {HTMLElement | null} */
const curationTableContainer = document.getElementById('curationTableContainer');

/**
 * Escapes text for safe HTML insertion.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function renderCurationTable(
  perResourceRows,
  container = curationTableContainer
) {
  if (!container) {
    return;
  }

  if (!Array.isArray(perResourceRows) || perResourceRows.length === 0) {
    container.innerHTML = '<p>No curation results to display.</p>';
    return;
  }

  /** @type {Record<string, string>} */
  const statusBadgeClasses = {
    'uncurated': 'ocq-badge ocq-badge-danger',
    'metadata incomplete': 'ocq-badge ocq-badge-warn',
    'metadata complete': 'ocq-badge ocq-badge-success',
    'pending final vetting': 'ocq-badge ocq-badge-info'
  };

  let html = '<h2 class="ocq-title">Per-resource curation</h2>';
  html += '<table class="ocq-table">';
  html += '<thead class="ocq-table-head"><tr>';
  html += '<th class="ocq-table-th">Resource</th>';
  html += '<th class="ocq-table-th">Suggested Curation Status</th>';
  html += '<th class="ocq-table-th">Failed Requirements</th>';
  html += '<th class="ocq-table-th">Failed Recommendations</th>';
  html += '<th class="ocq-table-th">Details</th>';
  html += '</tr></thead><tbody>';

  for (const row of perResourceRows) {
    const failedRequirements = Array.isArray(row.failedRequirements)
      ? row.failedRequirements.join(', ')
      : '—';

    const failedRecommendations = Array.isArray(row.failedRecommendations)
      ? row.failedRecommendations.join(', ')
      : '—';

    const statusBadgeClass = statusBadgeClasses[row.statusLabel] || 'ocq-badge';

    html += '<tr>';
    html += '<td class="ocq-table-td ocq-mono">' + escapeHtml(row.resource) + '</td>';
    html += '<td class="ocq-table-td ocq-mono"><span class="' + statusBadgeClass + '">' + escapeHtml(row.statusLabel) + '</span></td>';
    html += '<td class="ocq-table-td ocq-mono">' + escapeHtml(failedRequirements || '—') + '</td>';
    html += '<td class="ocq-table-td ocq-mono">' + escapeHtml(failedRecommendations || '—') + '</td>';
    html += '<td class="ocq-table-td ocq-mono">';
    html += '<button class="ocq-btn ocq-btn-tertiary ocq-btn-small" type="button" data-toggle-resource-detail="' +
      escapeHtml(row.resource) +
      '">View</button>';
    html += '</td>';
    html += '</tr>';

    html += '<tr class="ocq-table-tr ocq-resource-detail-row" data-resource-detail-row="' +
      escapeHtml(row.resource) +
      '" style="display:none;">';
    html += '<td class="ocq-table-td" colspan="999">';
    html += '<div class="ocq-resource-detail"></div>';
    html += '</td>';
    html += '</tr>';
  }

  html += '</tbody></table>';
  container.innerHTML = html;
}

/**
 * Builds HTML for the resource-failure detail panel.
 *
 * @param {string} resourceIri
 * @param {OcqFailureIndex | null | undefined} failuresIndex
 * @returns {string}
 */
export function renderResourceFailureDetailHtml(resourceIri, failuresIndex) {
  if (!failuresIndex) {
    return '<div class="ocq-muted">No failure index available.</div>';
  }

  const byCriterion = failuresIndex.get(resourceIri);
  if (!byCriterion || byCriterion.size === 0) {
    return '<div class="ocq-muted">No failing queries for this resource.</div>';
  }

  let html = '';
  html += '<table class="ocq-table" style="margin-top:10px;">';
  html += '<thead class="ocq-table-head"><tr>';
  html += '<th class="ocq-table-th">Standardization Code</th>';
  html += '<th class="ocq-table-th">Failing query IDs</th>';
  html += '</tr></thead><tbody>';

  for (const [criterionId, queryIdSet] of byCriterion.entries()) {
    html += '<tr class="ocq-table-tr">';
    html += '<td class="ocq-table-td ocq-mono">' + escapeHtml(criterionId) + '</td>';
    html += '<td class="ocq-table-td ocq-mono">' + escapeHtml(Array.from(queryIdSet).join(', ')) + '</td>';
    html += '</tr>';
  }

  html += '</tbody></table>';
  return html;
}

/**
 * Toggles the detail row for one resource.
 *
 * @param {string} resourceIri
 * @param {OcqFailureIndex | null | undefined} failuresIndex
 * @param {HTMLElement | null | undefined} [container=curationTableContainer]
 * @returns {void}
 */
export function toggleResourceDetail(
  resourceIri,
  failuresIndex,
  container = curationTableContainer
) {
  if (!container) {
    return;
  }

  const detailRow = container.querySelector(
    `tr[data-resource-detail-row="${cssEscapeAttr(resourceIri)}"]`
  );

  if (!(detailRow instanceof HTMLTableRowElement)) {
    return;
  }

  const isOpen = detailRow.style.display !== 'none';
  if (isOpen) {
    detailRow.style.display = 'none';
    return;
  }

  detailRow.style.display = '';

  const panel = detailRow.querySelector('.ocq-resource-detail');
  if (!(panel instanceof HTMLElement)) {
    return;
  }

  panel.innerHTML = renderResourceFailureDetailHtml(resourceIri, failuresIndex);
}

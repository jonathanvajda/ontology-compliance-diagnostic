// app/render-resources.js
// @ts-check

import { cssEscapeAttr, escapeHtml } from './shared.js';

/** @typedef {import('./types.js').FailureIndex} FailureIndex */
/** @typedef {import('./types.js').PerResourceCurationRow} PerResourceCurationRow */
/** @typedef {import('./types.js').ResourceDetail} ResourceDetail */

/** @type {HTMLElement | null} */
const curationTableContainer = document.getElementById('curationTableContainer');

/**
 * Renders the per-resource curation table.
 *
 * @param {PerResourceCurationRow[] | null | undefined} perResourceRows
 * @param {FailureIndex | null | undefined} failuresIndex
 * @param {Record<string, ResourceDetail> | null | undefined} resourceDetailsByIri
 * @param {HTMLElement | null | undefined} [container=curationTableContainer]
 * @returns {void}
 */
export function renderCurationTable(
  perResourceRows,
  failuresIndex,
  resourceDetailsByIri,
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
    'uncurated': 'ocd-badge ocd-badge-danger',
    'metadata incomplete': 'ocd-badge ocd-badge-warn',
    'metadata complete': 'ocd-badge ocd-badge-success',
    'pending final vetting': 'ocd-badge ocd-badge-info'
  };

  let html = '<h2 class="ocd-title">Per-resource curation</h2>';
  html += '<table class="ocd-table">';
  html += '<thead class="ocd-table-head"><tr>';
  html += '<th class="ocd-table-th">Resource</th>';
  html += '<th class="ocd-table-th">Suggested Curation Status</th>';
  html += '<th class="ocd-table-th">Failed Requirements</th>';
  html += '<th class="ocd-table-th">Failed Recommendations</th>';
  html += '<th class="ocd-table-th">Details</th>';
  html += '</tr></thead><tbody>';

  for (const row of perResourceRows) {
    const failedRequirements = Array.isArray(row.failedRequirements)
      ? row.failedRequirements.join(', ')
      : '—';

    const failedRecommendations = Array.isArray(row.failedRecommendations)
      ? row.failedRecommendations.join(', ')
      : '—';

    const statusBadgeClass = statusBadgeClasses[row.statusLabel] || 'ocd-badge';

    html += '<tr>';
    html += '<td class="ocd-table-td ocd-mono">' + escapeHtml(row.resource) + '</td>';
    html += '<td class="ocd-table-td ocd-mono"><span class="' + statusBadgeClass + '">' + escapeHtml(row.statusLabel) + '</span></td>';
    html += '<td class="ocd-table-td ocd-mono">' + escapeHtml(failedRequirements || '—') + '</td>';
    html += '<td class="ocd-table-td ocd-mono">' + escapeHtml(failedRecommendations || '—') + '</td>';
    html += '<td class="ocd-table-td ocd-mono">';
    html += '<button class="ocd-btn ocd-btn-tertiary ocd-btn-small" type="button" data-toggle-resource-detail="' +
      escapeHtml(row.resource) +
      '">View</button>';
    html += '</td>';
    html += '</tr>';

    html += '<tr class="ocd-table-tr ocd-resource-detail-row" data-resource-detail-row="' +
      escapeHtml(row.resource) +
      '" style="display:none;">';
    html += '<td class="ocd-table-td" colspan="999">';
    html += '<div class="ocd-resource-detail">' +
      renderResourceDetailHtml(row.resource, failuresIndex, resourceDetailsByIri) +
      '</div>';
    html += '</td>';
    html += '</tr>';
  }

  html += '</tbody></table>';
  container.innerHTML = html;
  return;
}

/**
 * Builds HTML for the resource-failure detail panel.
 *
 * @param {string} resourceIri
 * @param {FailureIndex | null | undefined} failuresIndex
 * @param {Record<string, ResourceDetail> | null | undefined} resourceDetailsByIri
 * @returns {string}
 */
export function renderResourceDetailHtml(resourceIri, failuresIndex, resourceDetailsByIri) {
  let html = '';
  const resourceDetail = resourceDetailsByIri?.[resourceIri] || null;
  const byCriterion = failuresIndex?.get(resourceIri) || null;

  if (resourceDetail && Array.isArray(resourceDetail.fields) && resourceDetail.fields.length) {
    html += '<div class="ocd-resource-detail-section">';
    html += '<div class="ocd-detail-section-title">Resource details</div>';
    html += '<dl class="ocd-resource-meta-list">';

    for (const field of resourceDetail.fields) {
      const values = Array.isArray(field?.values) ? field.values : [];
      if (!values.length) {
        continue;
      }

      html += '<div class="ocd-resource-meta-row">';
      html += '<dt>' + escapeHtml(field.label) + '</dt>';
      html += '<dd>' + escapeHtml(values.join(' | ')) + '</dd>';
      html += '</div>';
    }

    html += '</dl>';
    html += '</div>';
  }

  html += '<div class="ocd-resource-detail-section">';
  html += '<div class="ocd-detail-section-title">Failing checks</div>';

  if (!byCriterion || byCriterion.size === 0) {
    html += '<div class="ocd-muted">No failing queries for this resource.</div>';
  } else {
    html += '<table class="ocd-table ocd-table-wide" style="margin-top:10px;">';
    html += '<thead class="ocd-table-head"><tr>';
    html += '<th class="ocd-table-th">Standardization Code</th>';
    html += '<th class="ocd-table-th">Failing query IDs</th>';
    html += '</tr></thead><tbody>';

    for (const [criterionId, queryIdSet] of byCriterion.entries()) {
      html += '<tr class="ocd-table-tr">';
      html += '<td class="ocd-table-td ocd-mono">' + escapeHtml(criterionId) + '</td>';
      html += '<td class="ocd-table-td ocd-mono">' + escapeHtml(Array.from(queryIdSet).join(', ')) + '</td>';
      html += '</tr>';
    }

    html += '</tbody></table>';
  }

  html += '</div>';

  if (!html) {
    return '<div class="ocd-muted">No resource details available.</div>';
  }

  return html;
}

/**
 * Toggles the detail row for one resource.
 *
 * @param {string} resourceIri
 * @param {FailureIndex | null | undefined} failuresIndex
 * @param {Record<string, ResourceDetail> | null | undefined} resourceDetailsByIri
 * @param {HTMLElement | null | undefined} [container=curationTableContainer]
 * @returns {void}
 */
export function toggleResourceDetail(
  resourceIri,
  failuresIndex,
  resourceDetailsByIri,
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

  const panel = detailRow.querySelector('.ocd-resource-detail');
  if (!(panel instanceof HTMLElement)) {
    return;
  }

  panel.innerHTML = renderResourceDetailHtml(resourceIri, failuresIndex, resourceDetailsByIri);
}

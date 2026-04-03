/**
 * Renders the per-resource curation table.
 *
 * @param {OcqPerResourceCurationRow[] | null | undefined} perResourceRows
 * @returns {void}
 */
export function renderCurationTable(perResourceRows) {
  if (!curationTableContainer) {
    return;
  }

  if (!Array.isArray(perResourceRows) || perResourceRows.length === 0) {
    curationTableContainer.innerHTML = '<p>No curation results to display.</p>';
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
  curationTableContainer.innerHTML = html;
}

/**
 * Builds HTML for the resource-failure detail panel.
 *
 * @param {string} resourceIri
 * @returns {string}
 */
export function renderResourceFailureDetailHtml(resourceIri) {
  if (!lastFailuresIndex) {
    return '<div class="ocq-muted">No failure index available.</div>';
  }

  const byCriterion = lastFailuresIndex.get(resourceIri);
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
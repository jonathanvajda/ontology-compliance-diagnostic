/**
 * Renders the standard-detail panel.
 *
 * @param {string} criterionId
 * @returns {void}
 */
export function renderStandardDetail(criterionId) {
  if (!standardDetailContainer) {
    return;
  }

  if (!lastOntologyReport || !lastResults) {
    standardDetailContainer.innerHTML = '<p>No data available for standard details.</p>';
    return;
  }

  const standards = getReportStandards(lastOntologyReport);
  const selectedStandard = standards.find((standard) => standard.id === criterionId);

  if (!selectedStandard) {
    standardDetailContainer.innerHTML = `<p>No details found for ${escapeHtml(criterionId)}.</p>`;
    return;
  }

  const failingRows = lastResults.filter(
    (row) => getResultCriterionId(row) === criterionId && row.status === 'fail'
  );

  const queryIds = Array.from(
    new Set(
      failingRows
        .map((row) => row.queryId || '')
        .filter((queryId) => queryId !== '')
    )
  ).sort();

  const resources = Array.from(
    new Set(
      failingRows
        .map((row) => row.resource || '')
        .filter((resource) => resource !== '')
    )
  ).sort();

  const entries = getStandardDetailEntries(criterionId);

  let html = '';
  html += '<div class="ocq-detail">';
  html += '  <div class="ocq-detail-header">';
  html += `    <h3 class="ocq-detail-title">Standard: ${escapeHtml(selectedStandard.id)}</h3>`;
  html += '    <button class="ocq-btn" type="button" data-standard-close>Close</button>';
  html += '  </div>';

  html +=
    '  <div class="ocq-detail-meta">Status: <strong>' +
    escapeHtml(selectedStandard.status) +
    '</strong> (' +
    escapeHtml(selectedStandard.type) +
    ')</div>';

  html +=
    '  <div class="ocq-detail-meta">Failing resources: <strong>' +
    escapeHtml(resources.length) +
    '</strong></div>';

  if (queryIds.length) {
    html +=
      '  <div class="ocq-detail-meta">Queries involved: <span class="ocq-mono">' +
      escapeHtml(queryIds.join(', ')) +
      '</span></div>';
  }

  if (!entries.length) {
    html += '  <p>No failing resources found in details.</p>';
  } else {
    html += '  <table class="ocq-table">';
    html += '    <thead class="ocq-table-head">';
    html += '      <tr>';
    html += '        <th class="ocq-table-th">Resource IRI</th>';
    html += '        <th class="ocq-table-th">Failing query IDs</th>';
    html += '      </tr>';
    html += '    </thead>';
    html += '    <tbody>';

    for (const entry of entries) {
      html += '      <tr>';
      html += '        <td class="ocq-table-td ocq-mono">' + escapeHtml(entry.resource) + '</td>';
      html += '        <td class="ocq-table-td ocq-mono">' + escapeHtml(entry.queryIds.join(', ')) + '</td>';
      html += '      </tr>';
    }

    html += '    </tbody>';
    html += '  </table>';
  }

  html += '</div>';

  standardDetailContainer.innerHTML = html;
}
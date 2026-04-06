// app/render-standards.js
// @ts-check

import { getCriterionDefinition } from './criteria.js';
import { getResultCriterionId } from './grader.js';
import { escapeHtml, getReportStandards } from './shared.js';

/** @typedef {import('./types.js').Manifest} Manifest */
/** @typedef {import('./types.js').OntologyReport} OntologyReport */
/** @typedef {import('./types.js').QueryResultRow} QueryResultRow */

/**
 * @typedef {Object} StandardDetailEntry
 * @property {string} resource
 * @property {string[]} queryIds
 */

/** @type {HTMLElement | null} */
const standardDetailContainer = document.getElementById('standardDetailContainer');

/**
 * Returns standard-detail rows for a selected criterion id.
 *
 * @param {string | null | undefined} criterionId
 * @param {QueryResultRow[] | null | undefined} results
 * @returns {StandardDetailEntry[]}
 */
export function getStandardDetailEntries(criterionId, results) {
  const selectedCriterionId = criterionId || '';

  if (!selectedCriterionId || !Array.isArray(results)) {
    return [];
  }

  const failingRows = results.filter(
    (row) => row.criterionId === selectedCriterionId && row.status === 'fail'
  );

  /** @type {Map<string, Set<string>>} */
  const failuresByResource = new Map();

  for (const row of failingRows) {
    const resource = row.resource || '';
    const queryId = row.queryId || '';

    if (!resource) {
      continue;
    }

    if (!failuresByResource.has(resource)) {
      failuresByResource.set(resource, new Set());
    }

    const queryIds = failuresByResource.get(resource);
    if (queryIds && queryId) {
      queryIds.add(queryId);
    }
  }

  return Array.from(failuresByResource.entries())
    .map(([resource, queryIdSet]) => ({
      resource,
      queryIds: Array.from(queryIdSet).sort()
    }))
    .sort((a, b) => String(a.resource).localeCompare(String(b.resource)));
}

/**
 * Renders the standard-detail panel.
 *
 * @param {string} criterionId
 * @param {Manifest | null | undefined} manifest
 * @param {OntologyReport | null | undefined} ontologyReport
 * @param {QueryResultRow[] | null | undefined} results
 * @param {HTMLElement | null | undefined} [container=standardDetailContainer]
 * @returns {void}
 */
export function renderStandardDetail(
  criterionId,
  manifest,
  ontologyReport,
  results,
  container = standardDetailContainer
) {
  if (!container) {
    return;
  }

  if (!ontologyReport || !Array.isArray(results)) {
    container.innerHTML = '<p>No data available for standard details.</p>';
    return;
  }

  const standards = getReportStandards(ontologyReport);
  const selectedStandard = standards.find((standard) => standard.id === criterionId);
  const criterion = getCriterionDefinition(manifest, criterionId);

  if (!selectedStandard) {
    container.innerHTML =
      `<p>No details found for ${escapeHtml(criterionId)}.</p>`;
    return;
  }

  const failingRows = results.filter(
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

  const entries = getStandardDetailEntries(criterionId, results);
  const relatedQueries = Array.isArray(criterion?.queries) ? criterion.queries : [];

  let html = '';
  html += '<div class="ocd-modal-dialog ocd-detail" role="dialog" aria-modal="true" aria-labelledby="ocqStandardDetailTitle">';
  html += '  <div class="ocd-detail-header">';
  html += `    <h3 id="ocqStandardDetailTitle" class="ocd-detail-title">${escapeHtml(criterion?.label || selectedStandard.id)}</h3>`;
  html += '    <button class="ocd-modal-close" type="button" data-standard-close aria-label="Close standard detail">&times;</button>';
  html += '  </div>';

  html += '  <div class="ocd-detail-section">';
  html += '    <div class="ocd-detail-section-title">Criterion</div>';
  html += `    <div class="ocd-detail-meta ocd-mono">${escapeHtml(selectedStandard.id)}</div>`;
  html +=
    '    <div class="ocd-detail-meta">Status: <strong>' +
    escapeHtml(selectedStandard.status) +
    '</strong> (' +
    escapeHtml(selectedStandard.type) +
    ')</div>';
  html +=
    '    <div class="ocd-detail-meta">Remediation effort: <strong>' +
    escapeHtml(criterion?.remediationEffort || 'case-by-case') +
    '</strong></div>';
  html +=
    '    <div class="ocd-detail-meta">Failing resources: <strong>' +
    escapeHtml(resources.length) +
    '</strong></div>';
  html += '  </div>';

  if (criterion?.guidance) {
    html += '  <div class="ocd-detail-section">';
    html += '    <div class="ocd-detail-section-title">Brief guidance</div>';
    html += `    <p>${escapeHtml(criterion.guidance)}</p>`;
    html += '  </div>';
  }

  if (relatedQueries.length || queryIds.length) {
    html += '  <div class="ocd-detail-section">';
    html += '    <div class="ocd-detail-section-title">Related checks</div>';
    html += '    <ul class="ocd-detail-list">';

    for (const query of relatedQueries) {
      const queryTitle = String(query?.title || '').trim();
      const queryId = String(query?.id || '').trim();
      const queryLabel = queryTitle || queryId;

      if (!queryLabel) {
        continue;
      }

      html += '      <li>' + escapeHtml(queryLabel);
      if (queryId && queryTitle && queryId !== queryTitle) {
        html += ` <span class="ocd-table-meta ocd-mono">(${escapeHtml(queryId)})</span>`;
      }
      html += '</li>';
    }

    if (!relatedQueries.length && queryIds.length) {
      html += `      <li><span class="ocd-mono">${escapeHtml(queryIds.join(', '))}</span></li>`;
    }

    html += '    </ul>';
    html += '  </div>';
  }

  if (!entries.length) {
    html += '  <p>No failing resources found in details.</p>';
  } else {
    html += '  <table class="ocd-table">';
    html += '    <thead class="ocd-table-head">';
    html += '      <tr>';
    html += '        <th class="ocd-table-th">Resource IRI</th>';
    html += '        <th class="ocd-table-th">Failing query IDs</th>';
    html += '      </tr>';
    html += '    </thead>';
    html += '    <tbody>';

    for (const entry of entries) {
      html += '      <tr>';
      html +=
        '        <td class="ocd-table-td ocd-mono">' +
        escapeHtml(entry.resource) +
        '</td>';
      html +=
        '        <td class="ocd-table-td ocd-mono">' +
        escapeHtml(entry.queryIds.join(', ')) +
        '</td>';
      html += '      </tr>';
    }

    html += '    </tbody>';
    html += '  </table>';
  }

  html += '</div>';

  container.innerHTML = html;
}

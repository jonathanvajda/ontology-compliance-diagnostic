// app/render-resources.js
// @ts-check

import {
  CURATION_STATUS_IRIS,
  CURATION_STATUS_LABELS
} from './grader.js';
import {
  OBO_IAO_0000231_IRI,
  OBO_IAO_0000232_IRI,
  OBO_IAO_0100001_IRI,
  RDFS_COMMENT_IRI
} from './engine.js';
import { cssEscapeAttr, escapeHtml } from './shared.js';

/** @typedef {import('./types.js').FailureIndex} FailureIndex */
/** @typedef {import('./types.js').PerResourceCurationRow} PerResourceCurationRow */
/** @typedef {import('./types.js').ResourceAssertion} ResourceAssertion */
/** @typedef {import('./types.js').ResourceDetail} ResourceDetail */

/** @type {HTMLElement | null} */
const curationTableContainer = document.getElementById('curationTableContainer');

const STATUS_OPTIONS = Object.freeze([
  CURATION_STATUS_IRIS.UNCURATED,
  CURATION_STATUS_IRIS.METADATA_INCOMPLETE,
  CURATION_STATUS_IRIS.METADATA_COMPLETE,
  CURATION_STATUS_IRIS.PENDING_FINAL_VETTING,
  CURATION_STATUS_IRIS.REQUIRES_DISCUSSION,
  CURATION_STATUS_IRIS.READY_FOR_RELEASE
]);

/**
 * Renders the per-resource curation table.
 *
 * @param {PerResourceCurationRow[] | null | undefined} perResourceRows
 * @param {FailureIndex | null | undefined} failuresIndex
 * @param {Record<string, ResourceDetail> | null | undefined} resourceDetailsByIri
 * @param {Set<string> | null | undefined} [selectedResources]
 * @param {HTMLElement | null | undefined} [container=curationTableContainer]
 * @returns {void}
 */
export function renderCurationTable(
  perResourceRows,
  failuresIndex,
  resourceDetailsByIri,
  selectedResources = null,
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
    'pending final vetting': 'ocd-badge ocd-badge-info',
    'requires discussion': 'ocd-badge ocd-badge-warn',
    'ready for release': 'ocd-badge ocd-badge-success'
  };

  let html = '<h2 class="ocd-title">Per-resource curation</h2>';
  html += '<table class="ocd-table ocd-table-wide">';
  html += '<thead class="ocd-table-head"><tr>';
  html += '<th class="ocd-table-th">Select</th>';
  html += '<th class="ocd-table-th">Resource</th>';
  html += '<th class="ocd-table-th">Current Status</th>';
  html += '<th class="ocd-table-th">Suggested Status</th>';
  html += '<th class="ocd-table-th">Failed Requirements</th>';
  html += '<th class="ocd-table-th">Failed Recommendations</th>';
  html += '<th class="ocd-table-th">Details</th>';
  html += '</tr></thead><tbody>';

  for (const row of perResourceRows) {
    const failedRequirements = Array.isArray(row.failedRequirements)
      ? row.failedRequirements.join(', ')
      : '-';

    const failedRecommendations = Array.isArray(row.failedRecommendations)
      ? row.failedRecommendations.join(', ')
      : '-';

    const statusBadgeClass = statusBadgeClasses[row.statusLabel] || 'ocd-badge';
    const currentStatusClass = statusBadgeClasses[row.currentStatusLabel || ''] || 'ocd-badge';
    const isSelected = selectedResources instanceof Set && selectedResources.has(row.resource);
    const hasFailures =
      (Array.isArray(row.failedRequirements) && row.failedRequirements.length > 0) ||
      (Array.isArray(row.failedRecommendations) && row.failedRecommendations.length > 0);

    html += '<tr>';
    html += '<td class="ocd-table-td">';
    html += '<input type="checkbox" data-select-resource="' + escapeHtml(row.resource) + '"' +
      (isSelected ? ' checked' : '') +
      (hasFailures ? '' : ' disabled') +
      ' />';
    html += '</td>';
    html += '<td class="ocd-table-td ocd-mono">' + escapeHtml(row.resource) + '</td>';
    html += '<td class="ocd-table-td ocd-mono">';
    if (row.currentStatusLabel) {
      html += '<span class="' + currentStatusClass + '">' + escapeHtml(row.currentStatusLabel) + '</span>';
    } else {
      html += '<span class="ocd-muted">Not asserted</span>';
    }
    html += '</td>';
    html += '<td class="ocd-table-td ocd-mono"><span class="' + statusBadgeClass + '">' + escapeHtml(row.statusLabel) + '</span></td>';
    html += '<td class="ocd-table-td ocd-mono">' + escapeHtml(failedRequirements || '-') + '</td>';
    html += '<td class="ocd-table-td ocd-mono">' + escapeHtml(failedRecommendations || '-') + '</td>';
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
      renderResourceDetailHtml(row, failuresIndex, resourceDetailsByIri) +
      '</div>';
    html += '</td>';
    html += '</tr>';
  }

  html += '</tbody></table>';
  container.innerHTML = html;
}

/**
 * Renders one assertion table.
 *
 * @param {string} title
 * @param {ResourceAssertion[]} assertions
 * @param {'outgoing' | 'incoming'} direction
 * @returns {string}
 */
function renderAssertionSection(title, assertions, direction) {
  let html = '<details class="ocd-resource-detail-section ocd-collapsible-section">';
  html += '<summary class="ocd-collapsible-summary">';
  html += escapeHtml(title);
  html += '<span class="ocd-table-meta">' + escapeHtml(`${assertions.length} assertion(s)`) + '</span>';
  html += '</summary>';

  if (!assertions.length) {
    html += '<div class="ocd-muted">No assertions found.</div>';
    html += '</details>';
    return html;
  }

  html += '<table class="ocd-table ocd-table-wide">';
  html += '<thead class="ocd-table-head"><tr>';
  if (direction === 'incoming') {
    html += '<th class="ocd-table-th">Subject</th>';
  }
  html += '<th class="ocd-table-th">Predicate</th>';
  html += '<th class="ocd-table-th">Object</th>';
  html += '</tr></thead><tbody>';

  for (const assertion of assertions) {
    const showPredicateIri = assertion.predicateLabel !== assertion.predicateIri;
    const showObjectMeta = assertion.object.displayValue !== assertion.object.value;

    html += '<tr class="ocd-table-tr">';
    if (direction === 'incoming') {
      html += '<td class="ocd-table-td ocd-mono">' + escapeHtml(assertion.subject) + '</td>';
    }
    html += '<td class="ocd-table-td">';
    html += '<div>' + escapeHtml(assertion.predicateLabel) + '</div>';
    if (showPredicateIri) {
      html += '<div class="ocd-table-meta ocd-mono">' + escapeHtml(assertion.predicateIri) + '</div>';
    }
    html += '</td>';
    html += '<td class="ocd-table-td">';
    html += '<div>' + escapeHtml(assertion.object.displayValue) + '</div>';
    if (showObjectMeta) {
      html += '<div class="ocd-table-meta ocd-mono">' + escapeHtml(assertion.object.termType) + ': ' + escapeHtml(assertion.object.value) + '</div>';
    }
    html += '</td>';
    html += '</tr>';
  }

  html += '</tbody></table>';
  html += '</details>';
  return html;
}

/**
 * Renders the staging controls for one resource detail panel.
 *
 * @param {PerResourceCurationRow} row
 * @returns {string}
 */
function renderResourceEditor(row) {
  let html = '<details class="ocd-resource-detail-section ocd-collapsible-section">';
  html += '<summary class="ocd-collapsible-summary">Stage resource edits</summary>';
  html += '<div class="ocd-editor-grid">';
  html += '<label class="ocd-filter">';
  html += '<span class="ocd-label">Set curation status</span>';
  html += '<select class="ocd-input ocd-select" data-resource-status-select="' + escapeHtml(row.resource) + '">';
  html += '<option value="" selected>Keep current values</option>';

  for (const statusIri of STATUS_OPTIONS) {
    html += '<option value="' + escapeHtml(statusIri) + '">' +
      escapeHtml(CURATION_STATUS_LABELS[statusIri] || statusIri) +
      '</option>';
  }

  html += '</select>';
  html += '</label>';
  html += '<label class="ocd-filter">';
  html += '<span class="ocd-label">Curator note</span>';
  html += '<textarea class="ocd-input ocd-textarea" rows="2" data-resource-note="' + escapeHtml(row.resource) + '" data-predicate-iri="' + escapeHtml(OBO_IAO_0000232_IRI) + '"></textarea>';
  html += '</label>';
  html += '<label class="ocd-filter">';
  html += '<span class="ocd-label">Has obsolescence reason</span>';
  html += '<textarea class="ocd-input ocd-textarea" rows="2" data-resource-note="' + escapeHtml(row.resource) + '" data-predicate-iri="' + escapeHtml(OBO_IAO_0000231_IRI) + '"></textarea>';
  html += '</label>';
  html += '<label class="ocd-filter">';
  html += '<span class="ocd-label">Term replaced by</span>';
  html += '<input class="ocd-input" type="text" data-resource-note="' + escapeHtml(row.resource) + '" data-predicate-iri="' + escapeHtml(OBO_IAO_0100001_IRI) + '" placeholder="IRI" />';
  html += '</label>';
  html += '<label class="ocd-filter">';
  html += '<span class="ocd-label">Comment</span>';
  html += '<textarea class="ocd-input ocd-textarea" rows="2" data-resource-note="' + escapeHtml(row.resource) + '" data-predicate-iri="' + escapeHtml(RDFS_COMMENT_IRI) + '"></textarea>';
  html += '</label>';
  html += '</div>';

  html += '<details class="ocd-resource-detail-section ocd-collapsible-section ocd-collapsible-nested">';
  html += '<summary class="ocd-collapsible-summary">Stage arbitrary relation</summary>';
  html += '<div class="ocd-editor-grid">';
  html += '<label class="ocd-filter">';
  html += '<span class="ocd-label">Predicate IRI</span>';
  html += '<input class="ocd-input ocd-mono" type="text" data-arbitrary-predicate="' + escapeHtml(row.resource) + '" placeholder="http://example.org/predicate" />';
  html += '</label>';
  html += '<label class="ocd-filter">';
  html += '<span class="ocd-label">Object type</span>';
  html += '<select class="ocd-input ocd-select" data-arbitrary-object-type="' + escapeHtml(row.resource) + '">';
  html += '<option value="NamedNode">IRI</option>';
  html += '<option value="Literal">Literal</option>';
  html += '</select>';
  html += '</label>';
  html += '<label class="ocd-filter">';
  html += '<span class="ocd-label">Object value</span>';
  html += '<input class="ocd-input" type="text" data-arbitrary-object-value="' + escapeHtml(row.resource) + '" placeholder="Value or IRI" />';
  html += '</label>';
  html += '<label class="ocd-filter">';
  html += '<span class="ocd-label">Literal language</span>';
  html += '<input class="ocd-input" type="text" data-arbitrary-object-language="' + escapeHtml(row.resource) + '" placeholder="en" />';
  html += '</label>';
  html += '<label class="ocd-filter">';
  html += '<span class="ocd-label">Literal datatype IRI</span>';
  html += '<input class="ocd-input ocd-mono" type="text" data-arbitrary-object-datatype="' + escapeHtml(row.resource) + '" placeholder="http://www.w3.org/2001/XMLSchema#string" />';
  html += '</label>';
  html += '</div>';
  html += '</details>';

  html += '<div class="ocd-actions" style="margin-top:12px;">';
  html += '<button class="ocd-btn ocd-btn-primary" type="button" data-stage-resource-edit="' + escapeHtml(row.resource) + '" data-suggested-status="' + escapeHtml(row.statusIri) + '">Stage resource edits</button>';
  html += '<button class="ocd-btn ocd-btn-secondary" type="button" data-apply-suggested-status="' + escapeHtml(row.resource) + '" data-suggested-status="' + escapeHtml(row.statusIri) + '">Use suggested status</button>';
  html += '</div>';
  html += '</details>';
  return html;
}

/**
 * Builds HTML for the resource-failure detail panel.
 *
 * @param {PerResourceCurationRow} row
 * @param {FailureIndex | null | undefined} failuresIndex
 * @param {Record<string, ResourceDetail> | null | undefined} resourceDetailsByIri
 * @returns {string}
 */
export function renderResourceDetailHtml(row, failuresIndex, resourceDetailsByIri) {
  let html = '';
  const resourceIri = row.resource;
  const resourceDetail = resourceDetailsByIri?.[resourceIri] || null;
  const byCriterion = failuresIndex?.get(resourceIri) || null;

  const recognizedFields = Array.isArray(resourceDetail?.recognizedFields)
    ? resourceDetail.recognizedFields
    : Array.isArray(resourceDetail?.fields)
      ? resourceDetail.fields
      : [];

  if (recognizedFields.length) {
    html += '<div class="ocd-resource-detail-section">';
    html += '<div class="ocd-detail-section-title">Recognized fields</div>';
    html += '<dl class="ocd-resource-meta-list">';

    for (const field of recognizedFields) {
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

  html += renderAssertionSection(
    'All outgoing assertions',
    Array.isArray(resourceDetail?.outgoingAssertions) ? resourceDetail.outgoingAssertions : [],
    'outgoing'
  );

  html += renderAssertionSection(
    'Incoming assertions',
    Array.isArray(resourceDetail?.incomingAssertions) ? resourceDetail.incomingAssertions : [],
    'incoming'
  );

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
  html += renderResourceEditor(row);

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
 * @param {PerResourceCurationRow[] | null | undefined} [perResourceRows]
 * @param {HTMLElement | null | undefined} [container=curationTableContainer]
 * @returns {void}
 */
export function toggleResourceDetail(
  resourceIri,
  failuresIndex,
  resourceDetailsByIri,
  perResourceRows = null,
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

  const row = Array.isArray(perResourceRows)
    ? perResourceRows.find((item) => item.resource === resourceIri)
    : null;

  if (!row) {
    return;
  }

  detailRow.style.display = '';

  const panel = detailRow.querySelector('.ocd-resource-detail');
  if (!(panel instanceof HTMLElement)) {
    return;
  }

  panel.innerHTML = renderResourceDetailHtml(row, failuresIndex, resourceDetailsByIri);
}

// app/render-edit-session.js
// @ts-check

import { CURATION_STATUS_LABELS } from './grader.js';
import {
  OBO_IAO_0000231_IRI,
  OBO_IAO_0000232_IRI,
  OBO_IAO_0100001_IRI,
  RDFS_COMMENT_IRI,
  SUPPORTED_RDF_FORMATS
} from './engine.js';
import { KNOWN_CURATION_STATUS_OPTIONS } from './edit-session.js';
import { escapeHtml } from './shared.js';

/** @typedef {import('./types.js').EditSessionState} EditSessionState */

/** @type {HTMLElement | null} */
const editSessionContainer = document.getElementById('editSessionContainer');

/**
 * Returns one display label for an RDF format.
 *
 * @param {string} format
 * @returns {string}
 */
function getFormatLabel(format) {
  switch (format) {
    case SUPPORTED_RDF_FORMATS.TURTLE:
      return 'Turtle';
    case SUPPORTED_RDF_FORMATS.N_TRIPLES:
      return 'N-Triples';
    case SUPPORTED_RDF_FORMATS.N_QUADS:
      return 'N-Quads';
    case SUPPORTED_RDF_FORMATS.TRIG:
      return 'TriG';
    case SUPPORTED_RDF_FORMATS.N3:
      return 'N3';
    case SUPPORTED_RDF_FORMATS.JSON_LD:
      return 'JSON-LD';
    case SUPPORTED_RDF_FORMATS.RDF_XML:
      return 'RDF/XML';
    default:
      return format;
  }
}

/**
 * Renders the edit-session workspace.
 *
 * @param {EditSessionState | null | undefined} editSession
 * @param {HTMLElement | null | undefined} [container=editSessionContainer]
 * @returns {void}
 */
export function renderEditSession(editSession, container = editSessionContainer) {
  if (!container) {
    return;
  }

  if (!editSession?.primaryOntology) {
    container.innerHTML = `
      <h2 class="ocd-title">Editable curation workspace</h2>
      <p class="ocd-muted">Run an inspection from currently loaded ontology files to stage edits, rerun checks, and export an updated ontology file.</p>
    `;
    return;
  }

  const selectedResources = Array.isArray(editSession.selectedResources)
    ? editSession.selectedResources
    : [];
  const stagedEdits = Array.isArray(editSession.stagedEdits)
    ? editSession.stagedEdits
    : [];
  const supplementalCount = Array.isArray(editSession.supplementalOntologies)
    ? editSession.supplementalOntologies.length
    : 0;
  const rerunReport = editSession.rerunReport || null;
  const primaryFormat = String(editSession.primaryOntology.sourceFormat || SUPPORTED_RDF_FORMATS.TURTLE);

  let html = '<h2 class="ocd-title">Editable curation workspace</h2>';
  html += '<p class="ocd-muted">Stage bulk resource changes, rerun the full inspection against the merged in-browser store, then export the updated primary ontology.</p>';
  html += '<div class="ocd-edit-session-grid">';

  html += '<div class="ocd-edit-session-card">';
  html += '<strong>Session</strong>';
  html += '<div class="ocd-table-meta">Primary ontology: <span class="ocd-mono">' + escapeHtml(editSession.primaryOntology.fileName) + '</span></div>';
  html += '<div class="ocd-table-meta">Default export format: <span class="ocd-mono">' + escapeHtml(getFormatLabel(primaryFormat)) + '</span></div>';
  html += '<div class="ocd-table-meta">Supplemental closure ontologies: <strong>' + escapeHtml(String(supplementalCount)) + '</strong></div>';
  html += '<div class="ocd-table-meta">Selected failed resources: <strong>' + escapeHtml(String(selectedResources.length)) + '</strong></div>';
  if (selectedResources.length) {
    html += '<div class="ocd-table-meta ocd-mono">' + escapeHtml(selectedResources.join(', ')) + '</div>';
  }
  html += '</div>';

  html += '<div class="ocd-edit-session-card">';
  html += '<strong>Bulk edit selected resources</strong>';
  html += '<div class="ocd-editor-grid" style="margin-top:12px;">';
  html += '<label class="ocd-filter">';
  html += '<span class="ocd-label">Curation status</span>';
  html += '<select id="bulkEditStatusSelect" class="ocd-input ocd-select">';
  html += '<option value="">Do not change status</option>';
  for (const statusIri of KNOWN_CURATION_STATUS_OPTIONS) {
    html += '<option value="' + escapeHtml(statusIri) + '">' +
      escapeHtml(CURATION_STATUS_LABELS[statusIri] || statusIri) +
      '</option>';
  }
  html += '</select>';
  html += '</label>';
  html += '<label class="ocd-filter">';
  html += '<span class="ocd-label">Curator note</span>';
  html += '<textarea id="bulkCuratorNoteInput" class="ocd-input ocd-textarea" rows="2" data-predicate-iri="' + escapeHtml(OBO_IAO_0000232_IRI) + '"></textarea>';
  html += '</label>';
  html += '<label class="ocd-filter">';
  html += '<span class="ocd-label">Has obsolescence reason</span>';
  html += '<textarea id="bulkObsolescenceReasonInput" class="ocd-input ocd-textarea" rows="2" data-predicate-iri="' + escapeHtml(OBO_IAO_0000231_IRI) + '"></textarea>';
  html += '</label>';
  html += '<label class="ocd-filter">';
  html += '<span class="ocd-label">Term replaced by</span>';
  html += '<input id="bulkTermReplacedByInput" class="ocd-input ocd-mono" type="text" data-predicate-iri="' + escapeHtml(OBO_IAO_0100001_IRI) + '" placeholder="IRI" />';
  html += '</label>';
  html += '<label class="ocd-filter">';
  html += '<span class="ocd-label">Comment</span>';
  html += '<textarea id="bulkCommentInput" class="ocd-input ocd-textarea" rows="2" data-predicate-iri="' + escapeHtml(RDFS_COMMENT_IRI) + '"></textarea>';
  html += '</label>';
  html += '</div>';
  html += '<div class="ocd-actions" style="margin-top:12px;">';
  html += '<button class="ocd-btn ocd-btn-primary" type="button" data-stage-bulk-edit>Stage bulk edit</button>';
  html += '<button class="ocd-btn ocd-btn-secondary" type="button" data-stage-selected-suggested-status>Stage suggested statuses</button>';
  html += '<button class="ocd-btn ocd-btn-secondary" type="button" data-clear-selected-resources>Clear selected resources</button>';
  html += '</div>';
  html += '</div>';

  html += '<div class="ocd-edit-session-card ocd-edit-session-card-staged">';
  html += '<strong>Staged changes</strong>';
  if (!stagedEdits.length) {
    html += '<p class="ocd-muted" style="margin-top:12px;">No staged edits yet.</p>';
  } else {
    html += '<ol class="ocd-staged-edit-list" style="margin-top:12px;">';
    for (const edit of stagedEdits) {
      html += '<li>';
      html += '<div><span class="ocd-mono">' + escapeHtml(edit.subject) + '</span></div>';
      html += '<div class="ocd-table-meta">' + escapeHtml(edit.kind) + ' on <span class="ocd-mono">' + escapeHtml(edit.predicateIri) + '</span></div>';
      if (Array.isArray(edit.objects) && edit.objects.length) {
        html += '<div class="ocd-table-meta ocd-mono">' + escapeHtml(edit.objects.map((item) => item.value).join(' | ')) + '</div>';
      }
      html += '<button class="ocd-btn ocd-btn-tertiary" type="button" data-remove-staged-edit="' + escapeHtml(edit.id) + '" style="margin-top:6px;">Remove</button>';
      html += '</li>';
    }
    html += '</ol>';
  }
  html += '<div class="ocd-actions" style="margin-top:12px;">';
  html += '<button class="ocd-btn ocd-btn-secondary" type="button" data-clear-staged-edits>Clear all staged edits</button>';
  html += '</div>';
  html += '</div>';

  html += '</div>';

  html += '<div class="ocd-edit-session-card ocd-edit-session-card-actions">';
  html += '<strong>Rerun and export</strong>';
  if (rerunReport?.ontologyReport) {
    html += '<div class="ocd-table-meta" style="margin-top:12px;">Latest rerun ontology status: <strong>' + escapeHtml(rerunReport.ontologyReport.statusLabel || '') + '</strong></div>';
    html += '<div class="ocd-table-meta">Rerun file: <span class="ocd-mono">' + escapeHtml(rerunReport.fileName || '') + '</span></div>';
  } else {
    html += '<p class="ocd-muted" style="margin-top:12px;">No rerun executed yet for the current staged changes.</p>';
  }
  html += '<div class="ocd-editor-grid" style="margin-top:12px;">';
  html += '<label class="ocd-filter">';
  html += '<span class="ocd-label">Export format</span>';
  html += '<select id="editExportFormatSelect" class="ocd-input ocd-select">';
  for (const format of Object.values(SUPPORTED_RDF_FORMATS)) {
    const selected = format === primaryFormat ? ' selected' : '';
    html += '<option value="' + escapeHtml(format) + '"' + selected + '>' + escapeHtml(getFormatLabel(format)) + '</option>';
  }
  html += '</select>';
  html += '</label>';
  html += '</div>';
  html += '<div class="ocd-actions" style="margin-top:12px;">';
  html += '<button class="ocd-btn ocd-btn-primary" type="button" data-rerun-edits>Rerun full inspection</button>';
  html += '<button class="ocd-btn ocd-btn-secondary" type="button" data-export-edited-ontology>Export edited ontology</button>';
  html += '</div>';
  html += '</div>';
  container.innerHTML = html;
}

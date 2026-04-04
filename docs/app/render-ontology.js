// app/render-ontology.js
// @ts-check

import { getCriterionDefinition } from './criteria.js';
import { escapeHtml, getReportStandards } from './shared.js';

/** @typedef {import('./types.js').OcqManifest} OcqManifest */
/** @typedef {import('./types.js').OcqInspectionScope} OcqInspectionScope */
/** @typedef {import('./types.js').OcqOntologyMetadata} OcqOntologyMetadata */
/** @typedef {import('./types.js').OcqOntologyReport} OcqOntologyReport */
/** @typedef {import('./types.js').OcqOntologyReportStandardRow} OcqOntologyReportStandardRow */

/** @type {HTMLElement | null} */
const ontologyReportContainer = document.getElementById('ontologyReportContainer');

/**
 * Renders the ontology report card.
 *
 * @param {OcqOntologyReport | null | undefined} report
 * @param {OcqInspectionScope | null | undefined} [inspectionScope=null]
 * @param {OcqManifest | null | undefined} [manifest=null]
 * @param {HTMLElement | null | undefined} [container=ontologyReportContainer]
 * @returns {void}
 */
export function renderOntologyReport(
  report,
  inspectionScope = null,
  manifest = null,
  container = ontologyReportContainer
) {
  if (!container) {
    return;
  }

  if (!report) {
    container.innerHTML = '';
    return;
  }

  const metadata = report.metadata || null;
  const ontologyStandards = Array.isArray(report.ontologyStandards)
    ? report.ontologyStandards
    : [];
  const contentStandards = Array.isArray(report.contentStandards)
    ? report.contentStandards
    : [];
  const standards = getReportStandards(report);

  let html = '<h2 class="ocq-title">Ontology inspection</h2>';
  html += '<div class="ocq-detail">';
  html += '<h3 class="ocq-detail-title">Ontology metadata for this run</h3>';
  html += renderOntologyMetadata(metadata || {
    fileName: '',
    ontologyIri: report.ontologyIri,
    title: null,
    description: null,
    versionIri: null,
    versionInfo: null,
    license: null,
    accessRights: null,
    imports: [],
    tripleCount: 0,
    labeledResourceCount: 0
  });
  html += '</div>';

  const includedNamespaces = Array.isArray(inspectionScope?.includedNamespaces)
    ? inspectionScope.includedNamespaces
    : [];

  html += '<div class="ocq-detail" style="margin-top:1rem;">';
  html += '<h3 class="ocq-detail-title">Inspection scope</h3>';
  if (includedNamespaces.length) {
    html += '<p class="ocq-muted">Only resource and content checks for these namespaces are counted.</p>';
    html += '<div class="ocq-chip-list">';
    for (const namespace of includedNamespaces) {
      html += '<span class="ocq-chip ocq-mono">' + escapeHtml(namespace) + '</span>';
    }
    html += '</div>';
  } else {
    html += '<p class="ocq-muted">All namespaces are currently included for resource-level inspection.</p>';
  }
  html += '</div>';

  html += '<div class="ocq-detail" style="margin-top:1rem;">';
  html += '<h3 class="ocq-detail-title">Ontology-level standards</h3>';
  html += '<p class="ocq-muted">These checks evaluate the ontology itself and its ontology annotations.</p>';
  html += renderStandardsSection(
    ontologyStandards,
    'No ontology-level standards found.',
    'ontology',
    manifest
  );
  html += '</div>';

  html += '<div class="ocq-detail" style="margin-top:1rem;">';
  html += '<h3 class="ocq-detail-title">Ontology contents standards</h3>';
  html += '<p class="ocq-muted">These checks evaluate classes, properties, individuals, and other resources within the ontology.</p>';
  html += renderStandardsSection(
    contentStandards,
    standards.length ? 'No content/resource standards found.' : 'No standards found.',
    'content',
    manifest
  );
  html += '</div>';

  container.innerHTML = html;
}

/**
 * Renders ontology metadata as a compact definition list.
 *
 * @param {OcqOntologyMetadata} metadata
 * @returns {string}
 */
function renderOntologyMetadata(metadata) {
  const imports = Array.isArray(metadata.imports) ? metadata.imports : [];

  let html = '<dl class="ocq-meta-list">';
  html += renderMetadataRow('File', metadata.fileName || '');
  html += renderMetadataRow('Ontology IRI', metadata.ontologyIri || '');
  html += renderMetadataRow('Title', metadata.title || 'Not found');
  html += renderMetadataRow('Description', metadata.description || 'Not found');
  html += renderMetadataRow('Version IRI', metadata.versionIri || 'Not found');
  html += renderMetadataRow('Version info', metadata.versionInfo || 'Not found');
  html += renderMetadataRow('License', metadata.license || 'Not found');
  html += renderMetadataRow('Access rights', metadata.accessRights || 'Not found');
  html += renderMetadataRow('Imports', imports.length ? imports.join(', ') : 'None found');
  html += renderMetadataRow('Triple count', String(metadata.tripleCount || 0));
  html += renderMetadataRow('Labeled resources', String(metadata.labeledResourceCount || 0));
  html += '</dl>';

  return html;
}

/**
 * Renders one metadata row.
 *
 * @param {string} label
 * @param {string} value
 * @returns {string}
 */
function renderMetadataRow(label, value) {
  return '<div class="ocq-meta-row"><dt><strong>' + escapeHtml(label) + ':</strong></dt><dd>' + escapeHtml(value) + '</dd></div>';
}

/**
 * Renders one standards table.
 *
 * @param {OcqOntologyReportStandardRow[]} standards
 * @param {string} emptyMessage
 * @param {'ontology' | 'content'} scopeCategory
 * @param {OcqManifest | null | undefined} manifest
 * @returns {string}
 */
function renderStandardsSection(standards, emptyMessage, scopeCategory, manifest) {
  if (!standards.length) {
    return '<p>' + escapeHtml(emptyMessage) + '</p>';
  }

  const failedStandards = standards.filter((standard) => standard.status === 'fail');
  const passedStandards = standards.filter((standard) => standard.status === 'pass');

  let html = renderStandardsSummary(standards, scopeCategory);

  html += '<div class="ocq-standards-group">';
  html += '<h4 class="ocq-standards-group-title">Needs attention</h4>';

  if (!failedStandards.length) {
    html += '<p class="ocq-muted">No failed standards in this section.</p>';
  } else {
    html += renderStandardsTable(
      failedStandards,
      scopeCategory,
      manifest
    );
  }

  html += '</div>';

  html += '<details class="ocq-standards-group ocq-standards-pass-group">';
  html += `<summary>Passed checks (${escapeHtml(String(passedStandards.length))})</summary>`;

  if (!passedStandards.length) {
    html += '<p class="ocq-muted">No passed standards to display.</p>';
  } else {
    html += renderStandardsTable(
      passedStandards,
      scopeCategory,
      manifest
    );
  }

  html += '</details>';

  return html;
}

/**
 * Renders a standards summary block.
 *
 * @param {OcqOntologyReportStandardRow[]} standards
 * @param {'ontology' | 'content'} scopeCategory
 * @returns {string}
 */
function renderStandardsSummary(standards, scopeCategory) {
  const requirementStandards = standards.filter((standard) => standard.type === 'requirement');
  const recommendationStandards = standards.filter(
    (standard) => standard.type === 'recommendation'
  );

  let html = '<div class="ocq-summary-grid">';
  html += renderSummaryMetricCard(
    scopeCategory === 'ontology' ? 'Requirements passed' : 'Element requirements passed',
    requirementStandards
  );
  html += renderSummaryMetricCard(
    scopeCategory === 'ontology' ? 'Recommendations passed' : 'Element recommendations passed',
    recommendationStandards
  );
  html += '</div>';
  return html;
}

/**
 * Renders one summary metric card.
 *
 * @param {string} label
 * @param {OcqOntologyReportStandardRow[]} standards
 * @returns {string}
 */
function renderSummaryMetricCard(label, standards) {
  const total = standards.length;
  const passed = standards.filter((standard) => standard.status === 'pass').length;
  const percent = total > 0 ? Math.round((passed / total) * 100) : 0;

  let html = '<div class="ocq-summary-card">';
  html += `<div class="ocq-summary-label">${escapeHtml(label)}</div>`;
  html += `<div class="ocq-summary-value ocq-mono">${escapeHtml(`${passed} of ${total}`)}</div>`;
  html += '<div class="ocq-progress-track" aria-hidden="true">';
  html += `<div class="ocq-progress-fill" style="width:${escapeHtml(String(percent))}%"></div>`;
  html += '</div>';
  html += `<div class="ocq-summary-meta">${escapeHtml(`${percent}%`)}</div>`;
  html += '</div>';
  return html;
}

/**
 * Renders one standards table.
 *
 * @param {OcqOntologyReportStandardRow[]} standards
 * @param {'ontology' | 'content'} scopeCategory
 * @param {OcqManifest | null | undefined} manifest
 * @returns {string}
 */
function renderStandardsTable(standards, scopeCategory, manifest) {
  let html = '<table class="ocq-table ocq-table-wide">';
  html += '<thead class="ocq-table-head"><tr>';
  html += '<th class="ocq-table-th">Criterion</th>';
  html += '<th class="ocq-table-th">Type</th>';
  html += '<th class="ocq-table-th">Status</th>';
  html += '<th class="ocq-table-th">' +
    escapeHtml(scopeCategory === 'ontology' ? 'Ontology failures' : 'Failed resources') +
    '</th>';
  html += '</tr></thead><tbody>';

  for (const standard of standards) {
    const criterion = getCriterionDefinition(manifest, standard.id);
    const typeLabel = standard.type === 'recommendation' ? 'recommendation' : 'requirement';
    const failedCount = standard.failedResourcesCount || 0;
    const statusBadgeClass =
      standard.status === 'pass'
        ? 'ocq-badge ocq-badge-success'
        : 'ocq-badge ocq-badge-danger';

    html += '<tr class="ocq-table-tr ocq-row-clickable" tabindex="0" data-standard-id="' +
      escapeHtml(standard.id) +
      '" data-standard-scope-category="' +
      escapeHtml(standard.scopeCategory) +
      '">';
    html += '<td class="ocq-table-td">';
    html += '<div>' + escapeHtml(criterion?.label || standard.id) + '</div>';
    html += '<div class="ocq-table-meta ocq-mono">' + escapeHtml(standard.id) + '</div>';
    if (criterion?.guidance) {
      html += '<div class="ocq-table-meta">' + escapeHtml(criterion.guidance) + '</div>';
    }
    html += '</td>';
    html += '<td class="ocq-table-td">';
    html += '<div>' + escapeHtml(typeLabel) + '</div>';
    if (criterion?.remediationEffort) {
      html += '<div class="ocq-table-meta">Effort: ' + escapeHtml(criterion.remediationEffort) + '</div>';
    }
    html += '</td>';
    html += '<td class="ocq-table-td"><span class="' + statusBadgeClass + '">' + escapeHtml(standard.status) + '</span></td>';
    html += '<td class="ocq-table-td">' + escapeHtml(String(failedCount)) + '</td>';
    html += '</tr>';
  }

  html += '</tbody></table>';
  return html;
}

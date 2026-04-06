// app/render-ontology.js
// @ts-check

import { getCriterionDefinition } from './criteria.js';
import { escapeHtml, getReportStandards } from './shared.js';

/** @typedef {import('./types.js').Manifest} Manifest */
/** @typedef {import('./types.js').InspectionScope} InspectionScope */
/** @typedef {import('./types.js').OntologyMetadata} OntologyMetadata */
/** @typedef {import('./types.js').OntologyReport} OntologyReport */
/** @typedef {import('./types.js').OntologyReportStandardRow} OntologyReportStandardRow */

/** @type {HTMLElement | null} */
const ontologyReportContainer = document.getElementById('ontologyReportContainer');

/**
 * Renders the ontology report card.
 *
 * @param {OntologyReport | null | undefined} report
 * @param {InspectionScope | null | undefined} [inspectionScope=null]
 * @param {Manifest | null | undefined} [manifest=null]
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

  let html = '<h2 class="ocd-title">Ontology inspection</h2>';
  html += '<div class="ocd-detail">';
  html += '<h3 class="ocd-detail-title">Ontology metadata for this run</h3>';
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

  html += '<div class="ocd-detail" style="margin-top:1rem;">';
  html += '<h3 class="ocd-detail-title">Inspection scope</h3>';
  if (includedNamespaces.length) {
    html += '<p class="ocd-muted">Only resource and content checks for these namespaces are counted.</p>';
    html += '<div class="ocd-chip-list">';
    for (const namespace of includedNamespaces) {
      html += '<span class="ocd-chip ocd-mono">' + escapeHtml(namespace) + '</span>';
    }
    html += '</div>';
  } else {
    html += '<p class="ocd-muted">All namespaces are currently included for resource-level inspection.</p>';
  }
  html += '</div>';

  html += '<div class="ocd-detail" style="margin-top:1rem;">';
  html += '<h3 class="ocd-detail-title">Ontology-level standards</h3>';
  html += '<p class="ocd-muted">These checks evaluate the ontology itself and its ontology annotations.</p>';
  html += renderStandardsSection(
    ontologyStandards,
    'No ontology-level standards found.',
    'ontology',
    manifest
  );
  html += '</div>';

  html += '<div class="ocd-detail" style="margin-top:1rem;">';
  html += '<h3 class="ocd-detail-title">Ontology contents standards</h3>';
  html += '<p class="ocd-muted">These checks evaluate classes, properties, individuals, and other resources within the ontology.</p>';
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
 * @param {OntologyMetadata} metadata
 * @returns {string}
 */
function renderOntologyMetadata(metadata) {
  const imports = Array.isArray(metadata.imports) ? metadata.imports : [];

  let html = '<dl class="ocd-meta-list">';
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
  return '<div class="ocd-meta-row"><dt><strong>' + escapeHtml(label) + ':</strong></dt><dd>' + escapeHtml(value) + '</dd></div>';
}

/**
 * Renders one standards table.
 *
 * @param {OntologyReportStandardRow[]} standards
 * @param {string} emptyMessage
 * @param {'ontology' | 'content'} scopeCategory
 * @param {Manifest | null | undefined} manifest
 * @returns {string}
 */
function renderStandardsSection(standards, emptyMessage, scopeCategory, manifest) {
  if (!standards.length) {
    return '<p>' + escapeHtml(emptyMessage) + '</p>';
  }

  const failedStandards = standards.filter((standard) => standard.status === 'fail');
  const passedStandards = standards.filter((standard) => standard.status === 'pass');

  let html = renderStandardsSummary(standards, scopeCategory);

  html += '<div class="ocd-standards-group">';
  html += '<h4 class="ocd-standards-group-title">Needs attention</h4>';

  if (!failedStandards.length) {
    html += '<p class="ocd-muted">No failed standards in this section.</p>';
  } else {
    html += renderStandardsTable(
      failedStandards,
      scopeCategory,
      manifest
    );
  }

  html += '</div>';

  html += '<details class="ocd-standards-group ocd-standards-pass-group">';
  html += `<summary>Passed checks (${escapeHtml(String(passedStandards.length))})</summary>`;

  if (!passedStandards.length) {
    html += '<p class="ocd-muted">No passed standards to display.</p>';
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
 * @param {OntologyReportStandardRow[]} standards
 * @param {'ontology' | 'content'} scopeCategory
 * @returns {string}
 */
function renderStandardsSummary(standards, scopeCategory) {
  const requirementStandards = standards.filter((standard) => standard.type === 'requirement');
  const recommendationStandards = standards.filter(
    (standard) => standard.type === 'recommendation'
  );

  let html = '<div class="ocd-summary-grid">';
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
 * @param {OntologyReportStandardRow[]} standards
 * @returns {string}
 */
function renderSummaryMetricCard(label, standards) {
  const total = standards.length;
  const passed = standards.filter((standard) => standard.status === 'pass').length;
  const percent = total > 0 ? Math.round((passed / total) * 100) : 0;

  let html = '<div class="ocd-summary-card">';
  html += `<div class="ocd-summary-label">${escapeHtml(label)}</div>`;
  html += `<div class="ocd-summary-value ocd-mono">${escapeHtml(`${passed} of ${total}`)}</div>`;
  html += '<div class="ocd-progress-track" aria-hidden="true">';
  html += `<div class="ocd-progress-fill" style="width:${escapeHtml(String(percent))}%"></div>`;
  html += '</div>';
  html += `<div class="ocd-summary-meta">${escapeHtml(`${percent}%`)}</div>`;
  html += '</div>';
  return html;
}

/**
 * Renders one standards table.
 *
 * @param {OntologyReportStandardRow[]} standards
 * @param {'ontology' | 'content'} scopeCategory
 * @param {Manifest | null | undefined} manifest
 * @returns {string}
 */
function renderStandardsTable(standards, scopeCategory, manifest) {
  let html = '<table class="ocd-table ocd-table-wide">';
  html += '<thead class="ocd-table-head"><tr>';
  html += '<th class="ocd-table-th">Criterion</th>';
  html += '<th class="ocd-table-th">Type</th>';
  html += '<th class="ocd-table-th">Status</th>';
  html += '<th class="ocd-table-th">' +
    escapeHtml(scopeCategory === 'ontology' ? 'Ontology failures' : 'Failed resources') +
    '</th>';
  html += '</tr></thead><tbody>';

  for (const standard of standards) {
    const criterion = getCriterionDefinition(manifest, standard.id);
    const typeLabel = standard.type === 'recommendation' ? 'recommendation' : 'requirement';
    const failedCount = standard.failedResourcesCount || 0;
    const statusBadgeClass =
      standard.status === 'pass'
        ? 'ocd-badge ocd-badge-success'
        : 'ocd-badge ocd-badge-danger';

    html += '<tr class="ocd-table-tr ocd-row-clickable" tabindex="0" data-standard-id="' +
      escapeHtml(standard.id) +
      '" data-standard-scope-category="' +
      escapeHtml(standard.scopeCategory) +
      '">';
    html += '<td class="ocd-table-td">';
    html += '<div>' + escapeHtml(criterion?.label || standard.id) + '</div>';
    html += '<div class="ocd-table-meta ocd-mono">' + escapeHtml(standard.id) + '</div>';
    if (criterion?.guidance) {
      html += '<div class="ocd-table-meta">' + escapeHtml(criterion.guidance) + '</div>';
    }
    html += '</td>';
    html += '<td class="ocd-table-td">';
    html += '<div>' + escapeHtml(typeLabel) + '</div>';
    if (criterion?.remediationEffort) {
      html += '<div class="ocd-table-meta">Effort: ' + escapeHtml(criterion.remediationEffort) + '</div>';
    }
    html += '</td>';
    html += '<td class="ocd-table-td"><span class="' + statusBadgeClass + '">' + escapeHtml(standard.status) + '</span></td>';
    html += '<td class="ocd-table-td">' + escapeHtml(String(failedCount)) + '</td>';
    html += '</tr>';
  }

  html += '</tbody></table>';
  return html;
}

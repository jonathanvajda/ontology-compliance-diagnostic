// app/report-export.js
// @ts-check

import { getStandardDetailEntries } from './render-standards.js';
import { getCriterionDefinition } from './criteria.js';
import {
  escapeHtml,
  getReportStandards,
  rowsToCsv
} from './shared.js';

/** @typedef {import('./types.js').OcqEvaluatedReport} OcqEvaluatedReport */
/** @typedef {import('./types.js').OcqExportState} OcqExportState */
/** @typedef {import('./types.js').OcqOntologyMetadata} OcqOntologyMetadata */
/** @typedef {import('./types.js').OcqOntologyReport} OcqOntologyReport */
/** @typedef {import('./types.js').OcqPerResourceCurationRow} OcqPerResourceCurationRow */
/** @typedef {import('./types.js').OcqQueryResultRow} OcqQueryResultRow */

/**
 * Downloads a text file.
 *
 * @param {string} text
 * @param {string} fileName
 * @param {string} mimeType
 * @returns {void}
 */
export function downloadTextFile(text, fileName, mimeType) {
  const blob = new Blob([text], { type: mimeType || 'text/plain' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  URL.revokeObjectURL(url);
}

/**
 * Serializes result rows as CSV.
 *
 * @param {OcqQueryResultRow[] | null | undefined} results
 * @param {string} ontologyIri
 * @returns {string}
 */
export function buildResultsCsv(results, ontologyIri) {
  /** @type {Array<Array<unknown>>} */
  const rows = [[
    'ontologyIri',
    'resource',
    'queryId',
    'criterionId',
    'status',
    'severity',
    'scope'
  ]];

  for (const row of Array.isArray(results) ? results : []) {
    rows.push([
      ontologyIri || '',
      row.resource || '',
      row.queryId || '',
      row.criterionId || '',
      row.status || '',
      row.severity || '',
      row.scope || ''
    ]);
  }

  return rowsToCsv(rows);
}

/**
 * Serializes an ontology report as YAML-like text.
 *
 * @param {OcqOntologyReport | null | undefined} report
 * @returns {string}
 */
export function buildOntologyReportYaml(report) {
  if (!report) {
    return '# No ontology report\n';
  }

  const lines = [];
  lines.push(`ontologyIri: "${String(report.ontologyIri).replace(/"/g, '\\"')}"`);
  lines.push(`status: "${String(report.statusLabel).replace(/"/g, '\\"')}"`);
  lines.push('standards:');

  for (const standard of getReportStandards(report)) {
    lines.push(`  - id: "${String(standard.id).replace(/"/g, '\\"')}"`);
    lines.push(`    type: "${String(standard.type).replace(/"/g, '\\"')}"`);
    lines.push(`    status: "${String(standard.status).replace(/"/g, '\\"')}"`);
    lines.push(`    failedResourcesCount: ${standard.failedResourcesCount || 0}`);
  }

  return lines.join('\n') + '\n';
}

/**
 * Builds CSV for filtered per-resource rows.
 *
 * @param {OcqPerResourceCurationRow[] | null | undefined} perResourceRows
 * @returns {string}
 */
export function buildFilteredResourcesCsv(perResourceRows) {
  /** @type {Array<Array<unknown>>} */
  const rows = [[
    'resource',
    'statusIri',
    'statusLabel',
    'failedRequirementsCount',
    'failedRecommendationsCount',
    'failedRequirements',
    'failedRecommendations'
  ]];

  for (const row of Array.isArray(perResourceRows) ? perResourceRows : []) {
    const failedRequirements = Array.isArray(row.failedRequirements) ? row.failedRequirements : [];
    const failedRecommendations = Array.isArray(row.failedRecommendations)
      ? row.failedRecommendations
      : [];

    rows.push([
      row.resource || '',
      row.statusIri || '',
      row.statusLabel || '',
      String(failedRequirements.length),
      String(failedRecommendations.length),
      failedRequirements.join(' | '),
      failedRecommendations.join(' | ')
    ]);
  }

  return rowsToCsv(rows);
}

/**
 * Builds CSV for one selected standard detail.
 *
 * @param {string | null | undefined} criterionId
 * @param {OcqQueryResultRow[] | null | undefined} results
 * @returns {string}
 */
export function buildStandardDetailCsv(criterionId, results) {
  const selectedCriterionId = criterionId || '';

  if (!selectedCriterionId) {
    throw new Error('No standard selected.');
  }

  const entries = getStandardDetailEntries(selectedCriterionId, results);

  /** @type {Array<Array<unknown>>} */
  const rows = [['criterionId', 'resource', 'queryIds']];

  for (const entry of entries) {
    rows.push([
      selectedCriterionId,
      entry.resource,
      entry.queryIds.join(' | ')
    ]);
  }

  return rowsToCsv(rows);
}

/**
 * Builds CSV summary for batch results.
 *
 * @param {OcqEvaluatedReport[] | null | undefined} batchReports
 * @returns {string}
 */
export function buildBatchSummaryCsv(batchReports) {
  const batch = Array.isArray(batchReports) ? batchReports : [];

  if (!batch.length) {
    throw new Error('No batch results available.');
  }

  /** @type {Array<Array<unknown>>} */
  const rows = [[
    'fileName',
    'ontologyIri',
    'statusIri',
    'statusLabel',
    'failedRequirements',
    'failedRecommendations',
    'totalRequirements',
    'totalRecommendations'
  ]];

  for (const item of batch) {
    const report = item.ontologyReport;
    const standards = getReportStandards(report);

    const failedRequirements = standards.filter(
      (standard) => standard.type === 'requirement' && standard.status === 'fail'
    ).length;

    const failedRecommendations = standards.filter(
      (standard) => standard.type === 'recommendation' && standard.status === 'fail'
    ).length;

    const totalRequirements = standards.filter(
      (standard) => standard.type === 'requirement'
    ).length;

    const totalRecommendations = standards.filter(
      (standard) => standard.type === 'recommendation'
    ).length;

    rows.push([
      item.fileName || '',
      report?.ontologyIri || '',
      report?.statusIri || '',
      report?.statusLabel || '',
      String(failedRequirements),
      String(failedRecommendations),
      String(totalRequirements),
      String(totalRecommendations)
    ]);
  }

  return rowsToCsv(rows);
}

/**
 * Builds an HTML report for the current view.
 *
 * @param {OcqExportState} state
 * @returns {string}
 */
export function buildHtmlReport(state) {
  const createdAt = new Date().toISOString();
  const metadata = state.ontologyMetadata || null;
  const manifest = state.manifest || null;
  const inspectionScope = state.inspectionScope || null;
  const report = state.ontologyReport || null;
  const perResourceRows = Array.isArray(state.perResourceRows) ? state.perResourceRows : [];
  const results = Array.isArray(state.results) ? state.results : [];
  const resultsCount = results.length;
  const selectedCriterionId = state.selectedCriterionId || '';
  const standardDetailEntries = getStandardDetailEntries(selectedCriterionId, results);

  const css = `
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; margin: 24px; }
    h1,h2,h3 { margin: 0.2rem 0 0.6rem; }
    .meta { color: #333; margin: 0.25rem 0; }
    .card { border: 1px solid #ddd; border-radius: 12px; padding: 14px; margin: 14px 0; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th, td { border-bottom: 1px solid #eee; padding: 8px; text-align: left; vertical-align: top; }
    th { background: #fafafa; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.92em; }
    .pill { display: inline-block; padding: 2px 10px; border-radius: 999px; border: 1px solid #ddd; font-size: 0.9em; }
    @media print { body { margin: 12mm; } .card { break-inside: avoid; } }
  `;

  let html = '';
  html += '<!doctype html><html><head><meta charset="utf-8" />';
  html += '<meta name="viewport" content="width=device-width, initial-scale=1" />';
  html += '<title>Ontology Checks Report</title>';
  html += `<style>${css}</style>`;
  html += '</head><body>';

  html += '<h1>Ontology Checks Report</h1>';
  html += `<div class="meta">Created: <span class="mono">${escapeHtml(createdAt)}</span></div>`;
  html += `<div class="meta">Results rows: <span class="mono">${escapeHtml(resultsCount)}</span></div>`;

  html += '<div class="card">';
  html += '<h2>View state</h2>';
  html += `<div class="meta">Curation status filter: <span class="mono">${escapeHtml(state.statusFilter || 'All')}</span></div>`;
  html += `<div class="meta">Fails standard filter: <span class="mono">${escapeHtml(state.standardFilter || 'Any')}</span></div>`;
  html += `<div class="meta">Selected standard: <span class="mono">${escapeHtml(selectedCriterionId || '(none)')}</span></div>`;
  html += `<div class="meta">Included namespaces: <span class="mono">${escapeHtml((inspectionScope?.includedNamespaces || []).join(', ') || 'All')}</span></div>`;
  html += '</div>';

  html += '<div class="card"><h2>Ontology metadata</h2>';
  if (!metadata) {
    html += '<p>No ontology metadata loaded.</p>';
  } else {
    html += `<div class="meta">File: <span class="mono">${escapeHtml(metadata.fileName || '')}</span></div>`;
    html += `<div class="meta">Ontology IRI: <span class="mono">${escapeHtml(metadata.ontologyIri || '')}</span></div>`;
    html += `<div class="meta">Title: ${escapeHtml(metadata.title || 'Not found')}</div>`;
    html += `<div class="meta">Version IRI: <span class="mono">${escapeHtml(metadata.versionIri || 'Not found')}</span></div>`;
    html += `<div class="meta">Version info: <span class="mono">${escapeHtml(metadata.versionInfo || 'Not found')}</span></div>`;
    html += `<div class="meta">License: <span class="mono">${escapeHtml(metadata.license || 'Not found')}</span></div>`;
    html += `<div class="meta">Access rights: <span class="mono">${escapeHtml(metadata.accessRights || 'Not found')}</span></div>`;
    html += `<div class="meta">Imports: <span class="mono">${escapeHtml((metadata.imports || []).join(', ') || 'None found')}</span></div>`;
    html += `<div class="meta">Triple count: <span class="mono">${escapeHtml(metadata.tripleCount || 0)}</span></div>`;
    html += `<div class="meta">Labeled resources: <span class="mono">${escapeHtml(metadata.labeledResourceCount || 0)}</span></div>`;
  }
  html += '</div>';

  html += '<div class="card"><h2>Ontology standards</h2>';
  if (!report) {
    html += '<p>No ontology report loaded.</p>';
  } else {
    html += `<div class="meta">Overall status: <span class="pill">${escapeHtml(report.statusLabel || '')}</span></div>`;

    html += '<h3>Ontology-level checks</h3>';
    html += '<table><thead><tr><th>criterion</th><th>type</th><th>status</th><th>failedResourcesCount</th></tr></thead><tbody>';

    for (const standard of report.ontologyStandards || []) {
      const criterion = getCriterionDefinition(manifest, standard.id);
      html += '<tr>';
      html += '<td>';
      html += `<div>${escapeHtml(criterion?.label || standard.id)}</div>`;
      html += `<div class="mono">${escapeHtml(standard.id)}</div>`;
      if (criterion?.guidance) {
        html += `<div>${escapeHtml(criterion.guidance)}</div>`;
      }
      html += '</td>';
      html += '<td>';
      html += `${escapeHtml(standard.type)}`;
      if (criterion?.remediationEffort) {
        html += `<div>${escapeHtml(criterion.remediationEffort)}</div>`;
      }
      html += '</td>';
      html += `<td>${escapeHtml(standard.status)}</td>`;
      html += `<td class="mono">${escapeHtml(standard.failedResourcesCount ?? '')}</td>`;
      html += '</tr>';
    }

    html += '</tbody></table>';

    html += '<h3>Ontology contents checks</h3>';
    html += '<table><thead><tr><th>criterion</th><th>type</th><th>status</th><th>failedResourcesCount</th></tr></thead><tbody>';

    for (const standard of report.contentStandards || []) {
      const criterion = getCriterionDefinition(manifest, standard.id);
      html += '<tr>';
      html += '<td>';
      html += `<div>${escapeHtml(criterion?.label || standard.id)}</div>`;
      html += `<div class="mono">${escapeHtml(standard.id)}</div>`;
      if (criterion?.guidance) {
        html += `<div>${escapeHtml(criterion.guidance)}</div>`;
      }
      html += '</td>';
      html += '<td>';
      html += `${escapeHtml(standard.type)}`;
      if (criterion?.remediationEffort) {
        html += `<div>${escapeHtml(criterion.remediationEffort)}</div>`;
      }
      html += '</td>';
      html += `<td>${escapeHtml(standard.status)}</td>`;
      html += `<td class="mono">${escapeHtml(standard.failedResourcesCount ?? '')}</td>`;
      html += '</tr>';
    }

    html += '</tbody></table>';
  }
  html += '</div>';

  if (selectedCriterionId) {
    const criterion = getCriterionDefinition(manifest, selectedCriterionId);
    html += '<div class="card"><h2>Standard detail</h2>';
    if (criterion) {
      html += `<div class="meta">Label: ${escapeHtml(criterion.label)}</div>`;
      html += `<div class="meta">Criterion ID: <span class="mono">${escapeHtml(criterion.id)}</span></div>`;
      html += `<div class="meta">Remediation effort: ${escapeHtml(criterion.remediationEffort)}</div>`;
      if (criterion.guidance) {
        html += `<div class="meta">Brief guidance: ${escapeHtml(criterion.guidance)}</div>`;
      }
    }

    if (!standardDetailEntries.length) {
      html += '<p>No failing resources found for selected standard.</p>';
    } else {
      html += '<table><thead><tr><th>Resource IRI</th><th>Failing query IDs</th></tr></thead><tbody>';

      for (const entry of standardDetailEntries) {
        html += '<tr>';
        html += `<td class="mono">${escapeHtml(entry.resource)}</td>`;
        html += `<td class="mono">${escapeHtml(entry.queryIds.join(', '))}</td>`;
        html += '</tr>';
      }

      html += '</tbody></table>';
    }

    html += '</div>';
  }

  html += '<div class="card"><h2>Per-resource curation (filtered)</h2>';
  html += `<div class="meta">Rows: <span class="mono">${escapeHtml(perResourceRows.length)}</span></div>`;

  if (!perResourceRows.length) {
    html += '<p>No resources in current view.</p>';
  } else {
    html += '<table><thead><tr><th>resource</th><th>statusLabel</th><th>failedRequirements</th><th>failedRecommendations</th></tr></thead><tbody>';

    for (const row of perResourceRows) {
      const failedRequirements = Array.isArray(row.failedRequirements) ? row.failedRequirements : [];
      const failedRecommendations = Array.isArray(row.failedRecommendations)
        ? row.failedRecommendations
        : [];

      html += '<tr>';
      html += `<td class="mono">${escapeHtml(row.resource || '')}</td>`;
      html += `<td>${escapeHtml(row.statusLabel || '')}</td>`;
      html += `<td class="mono">${escapeHtml(failedRequirements.join(', '))}</td>`;
      html += `<td class="mono">${escapeHtml(failedRecommendations.join(', '))}</td>`;
      html += '</tr>';
    }

    html += '</tbody></table>';
  }

  html += '</div>';
  html += '</body></html>';

  return html;
}

// app/main.js
// @ts-check

import {
  evaluateAllQueries,
  loadManifest,
  DEFAULT_MANIFEST_URL
} from './engine.js';

import {
  computePerResourceCuration,
  computeOntologyReport,
  buildFailuresIndex,
  getResultCriterionId
} from './grader.js';

import {
  saveRun,
  listRuns,
  getRun,
  deleteRun,
  getLastRunId
} from './storage.js';

import {
 renderOntologyReport
} from './render-ontology.js';

import { renderDashboard, getBatchKey } from './render-dashboard.js';

import {
  renderCurationTable,
  renderResourceFailureDetailHtml
} from './render-resources.js';

import {
  renderStandardDetail,
  getStandardDetailEntries
} from './render-standards.js';

import {
  populateStandardFilter,
  getReportStandards
} from './criteria.js';

/** @typedef {import('./types.js').OcqManifest} OcqManifest */
/** @typedef {import('./types.js').OcqSavedRun} OcqSavedRun */
/** @typedef {import('./types.js').OcqUiStateSnapshot} OcqUiStateSnapshot */
/** @typedef {import('./types.js').OcqEvaluatedReport} OcqEvaluatedReport */
/** @typedef {import('./types.js').OcqSingleRunPayload} OcqSingleRunPayload */
/** @typedef {import('./types.js').OcqBatchRunPayload} OcqBatchRunPayload */
/** @typedef {import('./types.js').OcqQueryResultRow} OcqQueryResultRow */
/** @typedef {import('./types.js').OcqPerResourceCurationRow} OcqPerResourceCurationRow */
/** @typedef {import('./types.js').OcqOntologyReport} OcqOntologyReport */
/** @typedef {import('./types.js').OcqOntologyReportStandardRow} OcqOntologyReportStandardRow */
/** @typedef {import('./types.js').OcqFailureIndex} OcqFailureIndex */

/**
 * @typedef {Object} OcqDownloadAction
 * @property {string} label
 * @property {() => boolean} isAvailable
 * @property {() => string} build
 * @property {() => string} getFileName
 * @property {string} mimeType
 */

/**
 * @typedef {Object} StandardDetailEntry
 * @property {string} resource
 * @property {string[]} queryIds
 */

/** @type {HTMLInputElement | null} */
const filesInput = /** @type {HTMLInputElement | null} */ (
  document.getElementById('ontologyFiles')
);

/** @type {HTMLButtonElement | null} */
const runChecksButton = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('runChecksBtn')
);

/** @type {HTMLButtonElement | null} */
const runBatchChecksButton = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('runBatchBtn')
);

/** @type {HTMLSelectElement | null} */
const downloadActionSelect = /** @type {HTMLSelectElement | null} */ (
  document.getElementById('downloadActionSelect')
);

/** @type {HTMLButtonElement | null} */
const downloadSelectedButton = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('downloadSelectedBtn')
);

/** @type {HTMLElement | null} */
const statusElement = document.getElementById('status');

/** @type {HTMLInputElement | null} */
const resourceSearchInput = /** @type {HTMLInputElement | null} */ (
  document.getElementById('resourceSearch')
);

/** @type {HTMLElement | null} */
const curationTableContainer = document.getElementById('curationTableContainer');

/** @type {HTMLElement | null} */
const ontologyReportContainer = document.getElementById('ontologyReportContainer');

/** @type {HTMLElement | null} */
const standardDetailContainer = document.getElementById('standardDetailContainer');

/** @type {HTMLElement | null} */
const dashboardContainer = document.getElementById('dashboardContainer');

/** @type {HTMLSelectElement | null} */
const savedRunsSelect = /** @type {HTMLSelectElement | null} */ (
  document.getElementById('savedRunsSelect')
);

/** @type {HTMLButtonElement | null} */
const loadSavedRunButton = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('loadSavedRunBtn')
);

/** @type {HTMLButtonElement | null} */
const deleteSavedRunButton = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('deleteSavedRunBtn')
);

/** @type {HTMLElement | null} */
const appRoot = document.getElementById('appRoot');

/** @type {HTMLButtonElement | null} */
const themeToggleButton = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('ocqThemeToggleBtn')
);

/** @type {HTMLSelectElement | null} */
const statusFilterSelect = /** @type {HTMLSelectElement | null} */ (
  document.getElementById('statusFilter')
);

/** @type {HTMLSelectElement | null} */
const standardFilterSelect = /** @type {HTMLSelectElement | null} */ (
  document.getElementById('standardFilter')
);

/** @type {HTMLButtonElement | null} */
const clearFiltersButton = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('clearFiltersBtn')
);

/** @type {HTMLElement | null} */
const curationFiltersSummaryElement = document.getElementById('curationFiltersSummary');

/** @type {OcqManifest | null} */
let lastManifest = null;

/** @type {OcqQueryResultRow[] | null} */
let lastResults = null;

/** @type {OcqPerResourceCurationRow[] | null} */
let lastPerResource = null;

/** @type {OcqPerResourceCurationRow[] | null} */
let lastPerResourceFull = null;

/** @type {OcqFailureIndex | null} */
let lastFailuresIndex = null;

/** @type {OcqOntologyReport | null} */
let lastOntologyReport = null;

/** @type {OcqEvaluatedReport[] | null} */
let lastBatchReports = null;

/** @type {string | null} */
let selectedBatchKey = null;

/** @type {number | null} */
let resourceSearchTimer = null;

/** @type {string | null} */
let lastSelectedCriterionId = null;

/** @type {HTMLTableRowElement | null} */
let lastSelectedStandardRow = null;

let ontologyReportEventsWired = false;
let batchDashboardEventsWired = false;
let standardDetailEventsWired = false;

/**
 * Sets the status text.
 *
 * @param {string} message
 * @returns {void}
 */
export function setStatus(message) {
  if (statusElement) {
    statusElement.textContent = message;
  }
}

/**
 * Escapes text for safe HTML insertion.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function escapeHtml(value) {
  if (value == null) {
    return '';
  }

  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Escapes a value for use in a CSS attribute selector.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function cssEscapeAttr(value) {
  return String(value == null ? '' : value).replace(/"/g, '\\"');
}

/**
 * Returns a safe file-name fragment.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function safeFilePart(value) {
  return String(value == null ? '' : value)
    .trim()
    .replace(/[^\w.-]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Returns a timestamp suitable for file names.
 *
 * @returns {string}
 */
export function getTimestampForFileName() {
  const date = new Date();
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}_${hh}-${mi}-${ss}`;
}

/**
 * Returns an ISO-derived file stamp.
 *
 * @returns {string}
 */
export function isoFileStamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

/**
 * Escapes one CSV field.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function csvEscape(value) {
  const text = value == null ? '' : String(value);
  const needsWrap = /[",\n\r]/.test(text);
  const escaped = text.replace(/"/g, '""');
  return needsWrap ? `"${escaped}"` : escaped;
}

/**
 * Converts rows to CSV text.
 *
 * @param {Array<Array<unknown>>} rows
 * @returns {string}
 */
export function rowsToCsv(rows) {
  return rows.map((row) => row.map(csvEscape).join(',')).join('\n') + '\n';
}

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
 * @param {OcqQueryResultRow[]} results
 * @param {string} ontologyIri
 * @returns {string}
 */
export function toCsv(results, ontologyIri) {
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

  if (!Array.isArray(results) || results.length === 0) {
    return rowsToCsv(rows);
  }

  for (const row of results) {
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
 * @param {OcqOntologyReport | null} report
 * @returns {string}
 */
export function ontologyReportToYaml(report) {
  if (!report) {
    return '# No ontology report\n';
  }

  const lines = [];
  lines.push(`ontologyIri: "${String(report.ontologyIri).replace(/"/g, '\\"')}"`);
  lines.push(`status: "${String(report.statusLabel).replace(/"/g, '\\"')}"`);
  lines.push('standards:');

  for (const standard of report.standards || []) {
    lines.push(`  - id: "${String(standard.id).replace(/"/g, '\\"')}"`);
    lines.push(`    type: "${String(standard.type).replace(/"/g, '\\"')}"`);
    lines.push(`    status: "${String(standard.status).replace(/"/g, '\\"')}"`);
    lines.push(`    failedResourcesCount: ${standard.failedResourcesCount || 0}`);
  }

  return lines.join('\n') + '\n';
}

/**
 * Returns the current UI state snapshot for persistence.
 *
 * @returns {OcqUiStateSnapshot}
 */
export function getUiStateSnapshot() {
  return {
    statusFilter: statusFilterSelect ? statusFilterSelect.value : '',
    standardFilter: standardFilterSelect ? standardFilterSelect.value : '',
    selectedBatchKey: selectedBatchKey || null,
    selectedCriterionId: lastSelectedCriterionId || null
  };
}

/**
 * Applies a stored UI state snapshot.
 *
 * @param {OcqUiStateSnapshot | null | undefined} state
 * @returns {void}
 */
export function applyUiStateSnapshot(state) {
  if (!state) {
    return;
  }

  if (statusFilterSelect) {
    statusFilterSelect.value = state.statusFilter || '';
  }

  if (standardFilterSelect) {
    standardFilterSelect.value = state.standardFilter || '';
  }
}

/**
 * Formats a saved run as an option label.
 *
 * @param {OcqSavedRun} run
 * @returns {string}
 */
export function formatRunOption(run) {
  const kind = run.kind === 'batch' ? 'Batch' : 'Single';
  const labelSuffix = run.label ? ` — ${run.label}` : '';
  return `${kind} — ${run.createdAt}${labelSuffix}`;
}

/**
 * Refreshes the saved-runs dropdown.
 *
 * @returns {Promise<void>}
 */
export async function refreshSavedRunsUi() {
  if (!savedRunsSelect) {
    return;
  }

  const runs = await listRuns(50);
  savedRunsSelect.innerHTML = '<option value="">Saved runs…</option>';

  for (const run of runs) {
    const option = document.createElement('option');
    option.value = run.id;
    option.textContent = formatRunOption(run);
    savedRunsSelect.appendChild(option);
  }
}

/**
 * Sets the app theme.
 *
 * @param {'ocq-theme-light' | 'ocq-theme-dark'} themeClass
 * @returns {void}
 */
export function setTheme(themeClass) {
  if (!appRoot) {
    return;
  }

  appRoot.classList.remove('ocq-theme-light', 'ocq-theme-dark');
  appRoot.classList.add(themeClass);
  localStorage.setItem('ocq-theme', themeClass);
}

/**
 * Toggles the current app theme.
 *
 * @returns {void}
 */
export function toggleTheme() {
  if (!appRoot) {
    return;
  }

  const isDark = appRoot.classList.contains('ocq-theme-dark');
  setTheme(isDark ? 'ocq-theme-light' : 'ocq-theme-dark');
}

/**
 * Initializes theme from localStorage.
 *
 * @returns {void}
 */
export function initTheme() {
  const savedTheme = localStorage.getItem('ocq-theme');
  if (savedTheme === 'ocq-theme-dark' || savedTheme === 'ocq-theme-light') {
    setTheme(savedTheme);
  }
}

/**
 * Clears main rendered panels.
 *
 * @returns {void}
 */
export function clearRenderedViews() {
  if (dashboardContainer) {
    dashboardContainer.innerHTML = '';
  }
  if (ontologyReportContainer) {
    ontologyReportContainer.innerHTML = '';
  }
  if (curationTableContainer) {
    curationTableContainer.innerHTML = '';
  }
  if (standardDetailContainer) {
    standardDetailContainer.innerHTML = '';
  }
}

/**
 * Clears transient selection state.
 *
 * @returns {void}
 */
export function clearRunSelectionState() {
  selectedBatchKey = null;
  lastBatchReports = null;
  lastSelectedCriterionId = null;

  if (lastSelectedStandardRow) {
    lastSelectedStandardRow.classList.remove('ocq-row-selected');
  }
  lastSelectedStandardRow = null;
}

/**
 * Applies current resource filters and rerenders the curation table.
 *
 * @returns {void}
 */
export function applyResourceFilters() {
  if (!Array.isArray(lastPerResourceFull)) {
    lastPerResource = [];
    renderCurationTable([]);

    if (curationFiltersSummaryElement) {
      curationFiltersSummaryElement.textContent = 'Showing 0 of 0 resources.';
    }

    refreshDownloadOptions();
    return;
  }

  const statusValue = statusFilterSelect ? String(statusFilterSelect.value || '') : '';
  const standardValue = standardFilterSelect ? String(standardFilterSelect.value || '') : '';
  const searchValue = resourceSearchInput
    ? String(resourceSearchInput.value || '').trim().toLowerCase()
    : '';

  let filtered = lastPerResourceFull.slice();

  if (statusValue) {
    filtered = filtered.filter((row) => String(row?.statusLabel || '') === statusValue);
  }

  if (standardValue) {
    filtered = filtered.filter((row) => {
      const failedRequirements = Array.isArray(row?.failedRequirements)
        ? row.failedRequirements
        : [];
      const failedRecommendations = Array.isArray(row?.failedRecommendations)
        ? row.failedRecommendations
        : [];

      return (
        failedRequirements.includes(standardValue) ||
        failedRecommendations.includes(standardValue)
      );
    });
  }

  if (searchValue) {
    filtered = filtered.filter((row) =>
      String(row?.resource || '').toLowerCase().includes(searchValue)
    );
  }

  lastPerResource = filtered;

  if (curationFiltersSummaryElement) {
    curationFiltersSummaryElement.textContent =
      `Showing ${filtered.length} of ${lastPerResourceFull.length} resources.`;
  }

  renderCurationTable(filtered);
  refreshDownloadOptions();
}

/**
 * Clears resource filters and reapplies them.
 *
 * @returns {void}
 */
export function clearResourceFilters() {
  if (statusFilterSelect) {
    statusFilterSelect.value = '';
  }

  if (standardFilterSelect) {
    standardFilterSelect.value = '';
  }

  if (resourceSearchInput) {
    resourceSearchInput.value = '';
  }

  lastPerResource = Array.isArray(lastPerResourceFull)
    ? lastPerResourceFull.slice()
    : [];

  applyResourceFilters();
}

/**
 * Clears the standard-detail panel and selected row highlight.
 *
 * @returns {void}
 */
export function clearStandardDetailPanel() {
  if (lastSelectedStandardRow) {
    lastSelectedStandardRow.classList.remove('ocq-row-selected');
  }

  lastSelectedStandardRow = null;
  lastSelectedCriterionId = null;

  if (standardDetailContainer) {
    standardDetailContainer.innerHTML = '';
  }

  refreshDownloadOptions();
}

/**
 * Wires the standard-detail close handler once.
 *
 * @returns {void}
 */
export function wireStandardDetailCloseOnce() {
  if (!standardDetailContainer || standardDetailEventsWired) {
    return;
  }

  standardDetailContainer.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) {
      return;
    }

    const closeButton = event.target.closest('button[data-standard-close]');
    if (!closeButton) {
      return;
    }

    clearStandardDetailPanel();
  });

  standardDetailEventsWired = true;
}

/**
 * Toggles the detail row for one resource.
 *
 * @param {string} resourceIri
 * @returns {void}
 */
export function toggleResourceDetail(resourceIri) {
  if (!curationTableContainer) {
    return;
  }

  const detailRow = curationTableContainer.querySelector(
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

  panel.innerHTML = renderResourceFailureDetailHtml(resourceIri);
}

/**
 * Handles clicks on ontology-report rows.
 *
 * @param {MouseEvent} event
 * @returns {void}
 */
export function onOntologyReportRowClick(event) {
  if (!(event.target instanceof Element)) {
    return;
  }

  const row = event.target.closest('tr[data-standard-id]');
  if (!(row instanceof HTMLTableRowElement)) {
    return;
  }

  const criterionId = row.getAttribute('data-standard-id');
  if (!criterionId) {
    return;
  }

  if (lastSelectedCriterionId === criterionId) {
    clearStandardDetailPanel();
    return;
  }

  if (lastSelectedStandardRow) {
    lastSelectedStandardRow.classList.remove('ocq-row-selected');
  }

  row.classList.add('ocq-row-selected');
  lastSelectedStandardRow = row;
  lastSelectedCriterionId = criterionId;

  renderStandardDetail(criterionId);
  refreshDownloadOptions();
}

/**
 * Loads a selected batch item into the single-run panels.
 *
 * @param {OcqEvaluatedReport} reportObject
 * @returns {void}
 */
export function loadBatchSelection(reportObject) {
  lastResults = reportObject.results || [];
  lastFailuresIndex = buildFailuresIndex(lastResults);
  lastPerResourceFull = reportObject.perResource || [];
  lastPerResource = reportObject.perResource || [];
  lastOntologyReport = reportObject.ontologyReport || null;

  if (lastManifest) {
    populateStandardFilter(lastManifest);
  }

  renderOntologyReport(lastOntologyReport);
  applyResourceFilters();
}

/**
 * Handles selection of one batch row.
 *
 * @param {string} batchKey
 * @returns {void}
 */
export function onBatchRowSelected(batchKey) {
  if (!Array.isArray(lastBatchReports) || !lastBatchReports.length) {
    return;
  }

  if (selectedBatchKey === batchKey) {
    selectedBatchKey = null;
    renderDashboard(lastBatchReports, selectedBatchKey);
    refreshDownloadOptions();
    return;
  }

  selectedBatchKey = batchKey;

  const selectedReport = lastBatchReports.find(
    (report) => getBatchKey(report) === batchKey
  );

  if (!selectedReport) {
    return;
  }

  loadBatchSelection(selectedReport);
  renderDashboard(lastBatchReports, selectedBatchKey);

  setStatus(`Selected: ${selectedReport.fileName}`);
  refreshDownloadOptions();
}

/**
 * Wires batch dashboard selection once.
 *
 * @returns {void}
 */
export function wireBatchDashboardSelectionOnce() {
  if (!dashboardContainer || batchDashboardEventsWired) {
    return;
  }

  dashboardContainer.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) {
      return;
    }

    const row = event.target.closest('tr[data-batch-key]');
    if (!(row instanceof HTMLTableRowElement)) {
      return;
    }

    const batchKey = row.getAttribute('data-batch-key');
    if (!batchKey) {
      return;
    }

    onBatchRowSelected(batchKey);
  });

  dashboardContainer.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }

    if (!(event.target instanceof Element)) {
      return;
    }

    const row = event.target.closest('tr[data-batch-key]');
    if (!(row instanceof HTMLTableRowElement)) {
      return;
    }

    event.preventDefault();

    const batchKey = row.getAttribute('data-batch-key');
    if (!batchKey) {
      return;
    }

    onBatchRowSelected(batchKey);
  });

  batchDashboardEventsWired = true;
}

/**
 * Builds CSV for the filtered per-resource rows.
 *
 * @returns {string}
 */
export function buildFilteredResourcesCsv() {
  const data = Array.isArray(lastPerResource) ? lastPerResource : [];

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

  for (const row of data) {
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
 * Builds CSV for the selected standard detail.
 *
 * @param {string | null | undefined} criterionId
 * @returns {string}
 */
export function buildStandardDetailCsv(criterionId) {
  const selectedCriterionId = criterionId || lastSelectedCriterionId || '';

  if (!selectedCriterionId) {
    throw new Error('No standard selected.');
  }

  const entries = getStandardDetailEntries(selectedCriterionId);

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
  const batch = Array.isArray(batchReports)
    ? batchReports
    : Array.isArray(lastBatchReports)
      ? lastBatchReports
      : [];

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
 * @returns {string}
 */
export function buildHtmlReport() {
  const createdAt = new Date().toISOString();
  const currentStatusFilter = statusFilterSelect ? statusFilterSelect.value : '';
  const currentStandardFilter = standardFilterSelect ? standardFilterSelect.value : '';
  const selectedCriterionId = lastSelectedCriterionId || '';

  const report = lastOntologyReport || null;
  const perResourceRows = Array.isArray(lastPerResource) ? lastPerResource : [];
  const resultsCount = Array.isArray(lastResults) ? lastResults.length : 0;
  const standardDetailEntries = getStandardDetailEntries(selectedCriterionId);

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
  html += `<div class="meta">Curation status filter: <span class="mono">${escapeHtml(currentStatusFilter || 'All')}</span></div>`;
  html += `<div class="meta">Fails standard filter: <span class="mono">${escapeHtml(currentStandardFilter || 'Any')}</span></div>`;
  html += `<div class="meta">Selected standard: <span class="mono">${escapeHtml(selectedCriterionId || '(none)')}</span></div>`;
  html += '</div>';

  html += '<div class="card"><h2>Ontology report</h2>';
  if (!report) {
    html += '<p>No ontology report loaded.</p>';
  } else {
    html += `<div class="meta">Ontology IRI: <span class="mono">${escapeHtml(report.ontologyIri || '')}</span></div>`;
    html += `<div class="meta">Overall status: <span class="pill">${escapeHtml(report.statusLabel || '')}</span></div>`;

    const standards = getReportStandards(report);
    html += '<table><thead><tr><th>id</th><th>type</th><th>status</th><th>failedResourcesCount</th></tr></thead><tbody>';

    for (const standard of standards) {
      html += '<tr>';
      html += `<td class="mono">${escapeHtml(standard.id)}</td>`;
      html += `<td>${escapeHtml(standard.type)}</td>`;
      html += `<td>${escapeHtml(standard.status)}</td>`;
      html += `<td class="mono">${escapeHtml(standard.failedResourcesCount ?? '')}</td>`;
      html += '</tr>';
    }

    html += '</tbody></table>';
  }
  html += '</div>';

  if (selectedCriterionId) {
    html += '<div class="card"><h2>Standard detail</h2>';

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

/** @type {Record<string, OcqDownloadAction>} */
const downloadActions = {
  resultsCsv: {
    label: 'Results CSV',
    isAvailable: () => Array.isArray(lastResults) && lastResults.length > 0,
    build: () => toCsv(lastResults || [], lastOntologyReport?.ontologyIri || ''),
    getFileName: () => `ocq-results_${getTimestampForFileName()}.csv`,
    mimeType: 'text/csv;charset=utf-8'
  },

  ontologyYaml: {
    label: 'Ontology Report YAML',
    isAvailable: () => !!lastOntologyReport,
    build: () => ontologyReportToYaml(lastOntologyReport),
    getFileName: () => `ocq-ontology-report_${getTimestampForFileName()}.yaml`,
    mimeType: 'text/yaml;charset=utf-8'
  },

  htmlReport: {
    label: 'HTML Report',
    isAvailable: () =>
      !!lastOntologyReport || (Array.isArray(lastResults) && lastResults.length > 0),
    build: () => buildHtmlReport(),
    getFileName: () => `ocq-report_${getTimestampForFileName()}.html`,
    mimeType: 'text/html;charset=utf-8'
  },

  filteredResourcesCsv: {
    label: 'Filtered Resources CSV',
    isAvailable: () => Array.isArray(lastPerResource) && lastPerResource.length > 0,
    build: () => buildFilteredResourcesCsv(),
    getFileName: () => `ocq-filtered-resources_${getTimestampForFileName()}.csv`,
    mimeType: 'text/csv;charset=utf-8'
  },

  standardDetailCsv: {
    label: 'Standard Detail CSV',
    isAvailable: () =>
      !!lastSelectedCriterionId &&
      Array.isArray(lastResults) &&
      lastResults.length > 0,
    build: () => buildStandardDetailCsv(lastSelectedCriterionId),
    getFileName: () =>
      `ocq-standard-detail_${safeFilePart(lastSelectedCriterionId || 'standard')}_${getTimestampForFileName()}.csv`,
    mimeType: 'text/csv;charset=utf-8'
  },

  batchSummaryCsv: {
    label: 'Batch Summary CSV',
    isAvailable: () => Array.isArray(lastBatchReports) && lastBatchReports.length > 0,
    build: () => buildBatchSummaryCsv(lastBatchReports),
    getFileName: () => `ocq-batch-summary_${getTimestampForFileName()}.csv`,
    mimeType: 'text/csv;charset=utf-8'
  }
};

/**
 * Refreshes download-option availability.
 *
 * @returns {void}
 */
export function refreshDownloadOptions() {
  if (!downloadActionSelect || !downloadSelectedButton) {
    return;
  }

  const currentValue = downloadActionSelect.value;

  for (const option of Array.from(downloadActionSelect.options)) {
    if (!option.value) {
      continue;
    }

    const action = downloadActions[option.value];
    option.disabled = !action || !action.isAvailable();
  }

  const selectedAction = downloadActions[currentValue];
  const selectedIsValid = !!selectedAction && selectedAction.isAvailable();

  if (!selectedIsValid) {
    downloadActionSelect.value = '';
  }

  downloadSelectedButton.disabled = !downloadActionSelect.value;
}

/**
 * Handles the currently selected download action.
 *
 * @returns {void}
 */
export function handleDownloadSelected() {
  if (!downloadActionSelect) {
    return;
  }

  const actionKey = downloadActionSelect.value;
  const action = downloadActions[actionKey];

  if (!action) {
    setStatus('Choose a download type first.');
    return;
  }

  if (!action.isAvailable()) {
    setStatus(`"${action.label}" is not available for the current state.`);
    refreshDownloadOptions();
    return;
  }

  try {
    const content = action.build();
    const fileName = action.getFileName();

    downloadTextFile(content, fileName, action.mimeType);
    setStatus(`Downloaded ${action.label}.`);
  } catch (error) {
    console.error(error);
    setStatus(error instanceof Error ? error.message : 'Download failed.');
  }
}

/**
 * Loads the manifest and populates the standard filter.
 *
 * @returns {Promise<OcqManifest>}
 */
export async function ensureManifestLoaded() {
  if (lastManifest) {
    return lastManifest;
  }

  lastManifest = await loadManifest(DEFAULT_MANIFEST_URL);
  populateStandardFilter(lastManifest);
  return lastManifest;
}

/**
 * Evaluates one file and returns its full report bundle.
 *
 * @param {File} file
 * @returns {Promise<OcqEvaluatedReport>}
 */
export async function evaluateFile(file) {
  const text = await file.text();
  const { results, resources, ontologyIri } = await evaluateAllQueries(text, file.name);
  const manifest = await ensureManifestLoaded();

  const perResource = computePerResourceCuration(results, manifest, resources);
  const ontologyReport = computeOntologyReport(results, manifest, ontologyIri);

  return {
    fileName: file.name,
    ontologyIri,
    ontologyReport,
    perResource,
    results
  };
}

/**
 * Hydrates the UI from a saved run.
 *
 * @param {OcqSavedRun | null} run
 * @returns {Promise<void>}
 */
export async function hydrateRun(run) {
  if (!run) {
    return;
  }

  await ensureManifestLoaded();
  applyUiStateSnapshot(run.uiState);
  clearStandardDetailPanel();

  /** @type {unknown} */
  const payload = run.payload;

  if (run.kind === 'batch') {
    /** @type {OcqBatchRunPayload} */
    const batchPayload = Array.isArray(payload)
      ? /** @type {OcqBatchRunPayload} */ (payload)
      : [];

    lastBatchReports = batchPayload;
    selectedBatchKey = run.uiState?.selectedBatchKey || null;

    lastResults = null;
    lastFailuresIndex = null;
    lastOntologyReport = null;
    lastPerResourceFull = null;
    lastPerResource = null;

    renderDashboard(lastBatchReports, selectedBatchKey);

    if (selectedBatchKey) {
      const selectedReport = lastBatchReports.find(
        (report) => getBatchKey(report) === selectedBatchKey
      );

      if (selectedReport) {
        loadBatchSelection(selectedReport);
        renderDashboard(lastBatchReports, selectedBatchKey);
      }
    }

    applyResourceFilters();

    const selectedCriterionId = run.uiState?.selectedCriterionId || null;
    /** @type {OcqOntologyReport | null} */
    const activeOntologyReport = selectedBatchKey
      ? (lastBatchReports.find((report) => getBatchKey(report) === selectedBatchKey)?.ontologyReport || null)
      : null;

    if (
      selectedCriterionId &&
      activeOntologyReport &&
      activeOntologyReport.standards.some(
        /** @param {OcqOntologyReportStandardRow} standard */
        (standard) => standard.id === selectedCriterionId
      )
    ) {
      lastSelectedCriterionId = selectedCriterionId;
      renderStandardDetail(selectedCriterionId);

      const row = ontologyReportContainer?.querySelector(
        `tr[data-standard-id="${cssEscapeAttr(selectedCriterionId)}"]`
      );

      if (row instanceof HTMLTableRowElement) {
        row.classList.add('ocq-row-selected');
        lastSelectedStandardRow = row;
      }
    }

    setStatus(`Loaded saved batch run (${run.createdAt}).`);
    refreshDownloadOptions();
    return;
  }

  /** @type {OcqSingleRunPayload | null} */
  const reportObject = !Array.isArray(payload) && payload
    ? /** @type {OcqSingleRunPayload} */ (payload)
    : null;

  if (!reportObject) {
    setStatus('Saved run payload is invalid for a single run.');
    refreshDownloadOptions();
    return;
  }

  lastResults = reportObject.results || [];
  lastFailuresIndex = buildFailuresIndex(lastResults);
  lastOntologyReport = reportObject.ontologyReport || null;
  lastPerResourceFull = reportObject.perResource || [];
  lastPerResource = reportObject.perResource || [];
  lastBatchReports = null;
  selectedBatchKey = null;

  renderOntologyReport(lastOntologyReport);
  applyResourceFilters();

  const selectedCriterionId = run.uiState?.selectedCriterionId || null;
  if (
    selectedCriterionId &&
    lastOntologyReport?.standards?.some((standard) => standard.id === selectedCriterionId)
  ) {
    lastSelectedCriterionId = selectedCriterionId;
    renderStandardDetail(selectedCriterionId);

    const row = ontologyReportContainer?.querySelector(
      `tr[data-standard-id="${cssEscapeAttr(selectedCriterionId)}"]`
    );

    if (row instanceof HTMLTableRowElement) {
      row.classList.add('ocq-row-selected');
      lastSelectedStandardRow = row;
    }
  }

  setStatus(`Loaded saved single run (${run.createdAt}).`);
  refreshDownloadOptions();
}

/**
 * Runs checks for the first selected file.
 *
 * @returns {Promise<void>}
 */
export async function runSingleChecks() {
  if (!filesInput) {
    window.alert('File input #ontologyFiles not found.');
    return;
  }

  const files = Array.from(filesInput.files || []);
  const file = files[0];

  if (!file) {
    window.alert('Please select an ontology file first.');
    return;
  }

  setStatus('Reading file…');
  clearRenderedViews();
  clearRunSelectionState();

  lastResults = null;
  lastPerResource = null;
  lastPerResourceFull = null;
  lastFailuresIndex = null;
  lastOntologyReport = null;

  try {
    const text = await file.text();
    setStatus('Running checks…');

    const { results, resources, ontologyIri } = await evaluateAllQueries(text, file.name);
    const manifest = await ensureManifestLoaded();

    const perResource = computePerResourceCuration(results, manifest, resources);
    const ontologyReport = computeOntologyReport(results, manifest, ontologyIri);

    lastResults = results;
    lastFailuresIndex = buildFailuresIndex(lastResults);
    lastPerResourceFull = perResource;
    lastPerResource = perResource;
    lastOntologyReport = ontologyReport;
    lastManifest = manifest;
    lastBatchReports = null;
    selectedBatchKey = null;

    await saveRun({
      kind: 'single',
      label: file.name,
      payload: {
        fileName: file.name,
        ontologyIri,
        ontologyReport,
        perResource,
        results
      },
      uiState: getUiStateSnapshot()
    });

    await refreshSavedRunsUi();
    populateStandardFilter(manifest);
    renderOntologyReport(ontologyReport);
    applyResourceFilters();

    setStatus(
      `Checks completed. ${results.length} result rows across ${perResource.length} resources.`
    );
    refreshDownloadOptions();
  } catch (error) {
    console.error('Error running checks:', error);
    setStatus(error instanceof Error ? `Error: ${error.message}` : 'Error running checks.');
  }
}

/**
 * Runs checks for all selected files.
 *
 * @returns {Promise<void>}
 */
export async function runBatchChecks() {
  if (!filesInput) {
    window.alert('Batch input #ontologyFiles not found in the DOM.');
    return;
  }

  const files = Array.from(filesInput.files || []);
  if (!files.length) {
    window.alert('Please select one or more ontology files.');
    return;
  }

  setStatus('Running batch checks…');

  if (curationTableContainer) {
    curationTableContainer.innerHTML = '';
  }
  if (ontologyReportContainer) {
    ontologyReportContainer.innerHTML = '';
  }
  if (standardDetailContainer) {
    standardDetailContainer.innerHTML = '';
  }

  clearRunSelectionState();

  lastResults = null;
  lastFailuresIndex = null;
  lastPerResourceFull = null;
  lastPerResource = null;
  lastOntologyReport = null;

  await ensureManifestLoaded();

  /** @type {OcqEvaluatedReport[]} */
  const batchReports = [];

  for (const file of files) {
    const report = await evaluateFile(file);
    batchReports.push(report);
  }

  lastBatchReports = batchReports;
  selectedBatchKey = null;

  renderDashboard(lastBatchReports, selectedBatchKey);

  await saveRun({
    kind: 'batch',
    label: `${batchReports.length} file(s)`,
    payload: lastBatchReports,
    uiState: getUiStateSnapshot()
  });

  await refreshSavedRunsUi();
  setStatus(`Completed ${batchReports.length} ontology checks. Click a row to drill down.`);
  refreshDownloadOptions();
}

/**
 * Initializes all event handlers and restores saved state.
 *
 * @returns {Promise<void>}
 */
export async function initializeApp() {
  initTheme();
  wireStandardDetailCloseOnce();
  wireBatchDashboardSelectionOnce();

  if (curationTableContainer) {
    curationTableContainer.addEventListener('click', (event) => {
      if (!(event.target instanceof Element)) {
        return;
      }

      const button = event.target.closest('button[data-toggle-resource-detail]');
      if (!(button instanceof HTMLButtonElement)) {
        return;
      }

      const resourceIri = button.getAttribute('data-toggle-resource-detail');
      if (!resourceIri) {
        return;
      }

      toggleResourceDetail(resourceIri);
    });
  }

  if (resourceSearchInput) {
    resourceSearchInput.addEventListener('input', () => {
      if (resourceSearchTimer != null) {
        window.clearTimeout(resourceSearchTimer);
      }

      resourceSearchTimer = window.setTimeout(() => {
        applyResourceFilters();
      }, 150);
    });
  }

  if (statusFilterSelect) {
    statusFilterSelect.addEventListener('change', applyResourceFilters);
  }

  if (standardFilterSelect) {
    standardFilterSelect.addEventListener('change', applyResourceFilters);
  }

  if (clearFiltersButton) {
    clearFiltersButton.addEventListener('click', clearResourceFilters);
  }

  if (themeToggleButton) {
    themeToggleButton.addEventListener('click', toggleTheme);
  }

  if (downloadActionSelect && downloadSelectedButton) {
    downloadActionSelect.addEventListener('change', () => {
      downloadSelectedButton.disabled = !downloadActionSelect.value;
    });

    downloadSelectedButton.addEventListener('click', handleDownloadSelected);
  }

  if (runChecksButton) {
    runChecksButton.addEventListener('click', () => {
      void runSingleChecks();
    });
  }

  if (runBatchChecksButton) {
    runBatchChecksButton.addEventListener('click', () => {
      void runBatchChecks();
    });
  }

  if (loadSavedRunButton) {
    loadSavedRunButton.addEventListener('click', () => {
      void (async () => {
        const runId = savedRunsSelect ? savedRunsSelect.value : '';
        if (!runId) {
          window.alert('Choose a saved run first.');
          return;
        }

        const run = await getRun(runId);
        await hydrateRun(run);
      })();
    });
  }

  if (deleteSavedRunButton) {
    deleteSavedRunButton.addEventListener('click', () => {
      void (async () => {
        const runId = savedRunsSelect ? savedRunsSelect.value : '';
        if (!runId) {
          window.alert('Choose a saved run first.');
          return;
        }

        await deleteRun(runId);
        await refreshSavedRunsUi();
        setStatus('Deleted saved run.');
      })();
    });
  }

  await refreshSavedRunsUi();

  const lastRunId = await getLastRunId();
  if (lastRunId) {
    const run = await getRun(lastRunId);
    if (run) {
      await hydrateRun(run);
    }
  }

  refreshDownloadOptions();
}

void initializeApp();
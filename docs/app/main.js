// app/main.js
// @ts-check

import {
  loadManifest,
  DEFAULT_MANIFEST_URL,
  buildPreflightSummary,
  deriveDefaultIncludedNamespaces
} from './engine.js';
import { buildFailuresIndex } from './grader.js';
import { inspectFiles } from './report-model.js';
import { saveRun, listRuns, getRun, deleteRun, getLastRunId } from './storage.js';
import { populateStandardFilter } from './criteria.js';
import {
  escapeHtml,
  cssEscapeAttr,
  getTimestampForFileName,
  safeFilePart
} from './shared.js';
import { renderOntologyReport } from './render-ontology.js';
import { renderDashboard, getBatchKey } from './render-dashboard.js';
import {
  renderCurationTable,
  toggleResourceDetail
} from './render-resources.js';
import { renderStandardDetail } from './render-standards.js';
import {
  buildBatchSummaryCsv,
  buildFilteredResourcesCsv,
  buildHtmlReport,
  buildOntologyReportYaml,
  buildResultsCsv,
  buildStandardDetailCsv,
  downloadTextFile
} from './report-export.js';

/** @typedef {import('./types.js').OcqBatchRunPayload} OcqBatchRunPayload */
/** @typedef {import('./types.js').OcqEvaluatedReport} OcqEvaluatedReport */
/** @typedef {import('./types.js').OcqFailureIndex} OcqFailureIndex */
/** @typedef {import('./types.js').OcqManifest} OcqManifest */
/** @typedef {import('./types.js').OcqOntologyMetadata} OcqOntologyMetadata */
/** @typedef {import('./types.js').OcqOntologyReport} OcqOntologyReport */
/** @typedef {import('./types.js').OcqPreparedOntologyFile} OcqPreparedOntologyFile */
/** @typedef {import('./types.js').OcqPerResourceCurationRow} OcqPerResourceCurationRow */
/** @typedef {import('./types.js').OcqQueryResultRow} OcqQueryResultRow */
/** @typedef {import('./types.js').OcqSavedRun} OcqSavedRun */
/** @typedef {import('./types.js').OcqUiStateSnapshot} OcqUiStateSnapshot */

/**
 * @typedef {Object} OcqDownloadAction
 * @property {string} label
 * @property {() => boolean} isAvailable
 * @property {() => string} build
 * @property {() => string} getFileName
 * @property {string} mimeType
 */

/** @type {HTMLInputElement | null} */
const filesInput = /** @type {HTMLInputElement | null} */ (
  document.getElementById('ontologyFiles')
);
/** @type {HTMLButtonElement | null} */
const runInspectionButton = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('runInspectionBtn')
);
/** @type {HTMLButtonElement | null} */
const loadFilesForInspectionButton = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('loadFilesForInspectionBtn')
);
/** @type {HTMLSelectElement | null} */
const downloadActionSelect = /** @type {HTMLSelectElement | null} */ (
  document.getElementById('downloadActionSelect')
);
/** @type {HTMLButtonElement | null} */
const downloadSelectedButton = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('downloadSelectedBtn')
);
/** @type {HTMLButtonElement | null} */
const printReportButton = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('printReportBtn')
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
/** @type {HTMLElement | null} */
const preflightContainer = document.getElementById('preflightContainer');
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
/** @type {OcqOntologyMetadata | null} */
let lastOntologyMetadata = null;
/** @type {OcqEvaluatedReport[] | null} */
let lastBatchReports = null;
/** @type {import('./types.js').OcqInspectionScope | null} */
let lastInspectionScope = null;
/** @type {string | null} */
let selectedBatchKey = null;
/** @type {number | null} */
let resourceSearchTimer = null;
/** @type {string | null} */
let lastSelectedCriterionId = null;
/** @type {HTMLTableRowElement | null} */
let lastSelectedStandardRow = null;
/** @type {OcqPreparedOntologyFile[]} */
let preparedOntologyFiles = [];

/**
 * Sets the status text.
 *
 * @param {string} message
 * @returns {void}
 */
function setStatus(message) {
  if (statusElement) {
    statusElement.textContent = message;
  }
}

/**
 * Enables or disables the run button based on preflight readiness.
 *
 * @returns {void}
 */
function updateRunButtonState() {
  if (!runInspectionButton) {
    return;
  }

  const isReady = preparedOntologyFiles.length > 0;
  runInspectionButton.disabled = !isReady;
  runInspectionButton.classList.toggle('ocq-btn-primary', isReady);
  runInspectionButton.classList.toggle('ocq-btn-secondary', !isReady);
}

/**
 * Returns the current UI state snapshot for persistence.
 *
 * @returns {OcqUiStateSnapshot}
 */
function getUiStateSnapshot() {
  return {
    statusFilter: statusFilterSelect ? statusFilterSelect.value : '',
    standardFilter: standardFilterSelect ? standardFilterSelect.value : '',
    selectedBatchKey,
    selectedCriterionId: lastSelectedCriterionId
  };
}

/**
 * Applies a stored UI state snapshot.
 *
 * @param {OcqUiStateSnapshot | null | undefined} state
 * @returns {void}
 */
function applyUiStateSnapshot(state) {
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
 * Formats a saved run label.
 *
 * @param {OcqSavedRun} run
 * @returns {string}
 */
function formatRunOption(run) {
  const kind = run.kind === 'batch' ? 'Batch' : 'Single';
  const labelSuffix = run.label ? ` - ${run.label}` : '';
  return `${kind} - ${run.createdAt}${labelSuffix}`;
}

/**
 * Refreshes the saved-runs dropdown.
 *
 * @returns {Promise<void>}
 */
async function refreshSavedRunsUi() {
  if (!savedRunsSelect) {
    return;
  }

  const runs = await listRuns(50);
  savedRunsSelect.innerHTML = '<option value="">Saved runs...</option>';

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
function setTheme(themeClass) {
  if (!appRoot) {
    return;
  }

  appRoot.classList.remove('ocq-theme-light', 'ocq-theme-dark');
  appRoot.classList.add(themeClass);
  localStorage.setItem('ocq-theme', themeClass);
}

/**
 * Toggles the app theme.
 *
 * @returns {void}
 */
function toggleTheme() {
  if (!appRoot) {
    return;
  }

  const isDark = appRoot.classList.contains('ocq-theme-dark');
  setTheme(isDark ? 'ocq-theme-light' : 'ocq-theme-dark');
}

/**
 * Restores the theme from local storage.
 *
 * @returns {void}
 */
function initTheme() {
  const savedTheme = localStorage.getItem('ocq-theme');
  if (savedTheme === 'ocq-theme-dark' || savedTheme === 'ocq-theme-light') {
    setTheme(savedTheme);
  }
}

/**
 * Clears the rendered view containers.
 *
 * @returns {void}
 */
function clearRenderedViews() {
  renderDashboard(lastBatchReports, selectedBatchKey, dashboardContainer);
  renderOntologyReport(null, lastInspectionScope, lastManifest, ontologyReportContainer);
  renderCurationTable([], curationTableContainer);

  if (standardDetailContainer) {
    standardDetailContainer.innerHTML = '';
  }
}

/**
 * Clears current preflight state and UI.
 *
 * @returns {void}
 */
function clearPreflightState() {
  preparedOntologyFiles = [];
  renderPreflightUi();
  updateRunButtonState();
}

/**
 * Clears the current standard selection.
 *
 * @returns {void}
 */
function clearStandardSelection() {
  if (lastSelectedStandardRow) {
    lastSelectedStandardRow.classList.remove('ocq-row-selected');
  }

  lastSelectedStandardRow = null;
  lastSelectedCriterionId = null;

  if (standardDetailContainer) {
    standardDetailContainer.innerHTML = '';
    standardDetailContainer.classList.remove('ocq-modal-open');
    standardDetailContainer.setAttribute('aria-hidden', 'true');
  }
}

/**
 * Opens the standard detail modal.
 *
 * @returns {void}
 */
function openStandardDetailModal() {
  if (!standardDetailContainer) {
    return;
  }

  standardDetailContainer.classList.add('ocq-modal-open');
  standardDetailContainer.setAttribute('aria-hidden', 'false');
}

/**
 * Clears active inspection data.
 *
 * @returns {void}
 */
function clearInspectionDataState() {
  lastResults = null;
  lastPerResource = null;
  lastPerResourceFull = null;
  lastFailuresIndex = null;
  lastOntologyMetadata = null;
  lastOntologyReport = null;
  lastInspectionScope = null;
}

/**
 * Resets the current inspection state and view.
 *
 * @returns {void}
 */
function resetInspectionView() {
  clearStandardSelection();
  selectedBatchKey = null;
  clearInspectionDataState();
  clearRenderedViews();
}

/**
 * Updates the resource filter summary.
 *
 * @returns {void}
 */
function renderResourceFilterSummary() {
  if (!curationFiltersSummaryElement) {
    return;
  }

  const filteredCount = Array.isArray(lastPerResource) ? lastPerResource.length : 0;
  const totalCount = Array.isArray(lastPerResourceFull) ? lastPerResourceFull.length : 0;
  curationFiltersSummaryElement.textContent = `Showing ${filteredCount} of ${totalCount} resources.`;
}

/**
 * Renders the currently selected ontology/resource views.
 *
 * @returns {void}
 */
function renderActiveInspectionViews() {
  renderOntologyReport(
    lastOntologyReport,
    lastInspectionScope,
    lastManifest,
    ontologyReportContainer
  );
  renderCurationTable(lastPerResource, curationTableContainer);
  renderResourceFilterSummary();
}

/**
 * Renders the preflight staging UI.
 *
 * @returns {void}
 */
function renderPreflightUi() {
  if (!preflightContainer) {
    return;
  }

  if (!preparedOntologyFiles.length) {
    preflightContainer.innerHTML = `
      <h2 class="ocq-title">Inspection staging</h2>
      <p class="ocq-muted">Analyze selected files to review ontology metadata, imports, and candidate namespaces before running checks.</p>
    `;
    return;
  }

  let html = '<h2 class="ocq-title">Inspection staging</h2>';
  html += '<p class="ocq-muted">Choose which namespaces should count as in-scope for resource-level inspection. Ontology-level checks will still run on the ontology itself.</p>';
  html += '<div class="ocq-preflight-list">';

  for (const prepared of preparedOntologyFiles) {
    const summary = prepared.summary;
    const selectedNamespaces = prepared.inspectionScope?.includedNamespaces || [];
    const imports = Array.isArray(summary.imports) ? summary.imports : [];
    const discoveredNamespaces = Array.isArray(summary.discoveredNamespaces)
      ? summary.discoveredNamespaces
      : [];

    html += '<div class="ocq-preflight-card">';
    html += '<div class="ocq-preflight-header">';
    html += `<h3 class="ocq-preflight-title">${escapeHtml(summary.fileName)}</h3>`;
    html += `<span class="ocq-chip">${escapeHtml(String(summary.resourceCountEstimate))} labeled resources</span>`;
    html += '</div>';
    html += '<div class="ocq-preflight-grid">';
    html += '<div class="ocq-preflight-block">';
    html += '<strong>Ontology</strong>';
    html += `<div class="ocq-table-meta ocq-mono">${escapeHtml(summary.ontologyIri || 'urn:ontology:unknown')}</div>`;
    html += `<div class="ocq-table-meta">Title: ${escapeHtml(summary.metadata?.title || 'Not found')}</div>`;
    html += `<div class="ocq-table-meta">Version IRI: ${escapeHtml(summary.metadata?.versionIri || 'Not found')}</div>`;
    html += '</div>';
    html += '<div class="ocq-preflight-block">';
    html += '<strong>Imports</strong>';

    if (imports.length) {
      html += '<div class="ocq-chip-list">';
      for (const importIri of imports) {
        html += `<span class="ocq-chip ocq-mono">${escapeHtml(importIri)}</span>`;
      }
      html += '</div>';
    } else {
      html += '<div class="ocq-table-meta">None found</div>';
    }

    html += '</div>';
    html += '<div class="ocq-preflight-block">';
    html += '<strong>Included namespaces</strong>';
    html += '<div class="ocq-checkbox-list">';

    for (const namespace of discoveredNamespaces) {
      const checkboxId = `scope-${encodeURIComponent(summary.fileName)}-${encodeURIComponent(namespace)}`;
      const isChecked = selectedNamespaces.includes(namespace);
      html += '<label class="ocq-checkbox" for="' + escapeHtml(checkboxId) + '">';
      html += '<input type="checkbox" data-scope-file="' + escapeHtml(summary.fileName) + '" data-scope-namespace="' + escapeHtml(namespace) + '" id="' + escapeHtml(checkboxId) + '"' + (isChecked ? ' checked' : '') + ' />';
      html += '<span class="ocq-mono">' + escapeHtml(namespace) + '</span>';
      html += '</label>';
    }

    html += '</div>';
    html += '</div>';
    html += '</div>';
    html += '</div>';
  }

  html += '</div>';
  preflightContainer.innerHTML = html;
}

/**
 * Applies resource filters and rerenders the resource section.
 *
 * @returns {void}
 */
function applyResourceFilters() {
  if (!Array.isArray(lastPerResourceFull)) {
    lastPerResource = [];
    renderActiveInspectionViews();
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
  renderActiveInspectionViews();
  refreshDownloadOptions();
}

/**
 * Clears the resource filters and rerenders the table.
 *
 * @returns {void}
 */
function clearResourceFilters() {
  if (statusFilterSelect) {
    statusFilterSelect.value = '';
  }

  if (standardFilterSelect) {
    standardFilterSelect.value = '';
  }

  if (resourceSearchInput) {
    resourceSearchInput.value = '';
  }

  applyResourceFilters();
}

/**
 * Applies one inspected report bundle into UI state.
 *
 * @param {OcqEvaluatedReport} reportObject
 * @param {OcqManifest | null | undefined} manifest
 * @param {boolean} [preserveBatchReports=false]
 * @returns {void}
 */
function applyInspectionItemToState(reportObject, manifest, preserveBatchReports = false) {
  lastResults = reportObject.results || [];
  lastInspectionScope = reportObject.inspectionScope || null;
  lastFailuresIndex = buildFailuresIndex(lastResults, lastInspectionScope);
  lastPerResourceFull = reportObject.perResource || [];
  lastPerResource = reportObject.perResource || [];
  lastOntologyMetadata = reportObject.ontologyMetadata || null;
  lastOntologyReport = reportObject.ontologyReport || null;
  lastManifest = manifest || lastManifest;
  if (!preserveBatchReports) {
    lastBatchReports = null;
    selectedBatchKey = null;
  }

  if (lastManifest) {
    populateStandardFilter(lastManifest, standardFilterSelect);
  }
}

/**
 * Restores one selected criterion in the ontology table and detail panel.
 *
 * @param {string | null | undefined} criterionId
 * @returns {void}
 */
function restoreSelectedCriterion(criterionId) {
  const selectedCriterionId = criterionId || '';
  clearStandardSelection();

  if (
    !selectedCriterionId ||
    !lastOntologyReport ||
    !Array.isArray(lastResults) ||
    !lastOntologyReport.standards.some((standard) => standard.id === selectedCriterionId)
  ) {
    refreshDownloadOptions();
    return;
  }

  lastSelectedCriterionId = selectedCriterionId;
  renderStandardDetail(
    selectedCriterionId,
    lastManifest,
    lastOntologyReport,
    lastResults,
    standardDetailContainer
  );
  openStandardDetailModal();

  const row = ontologyReportContainer?.querySelector(
    `tr[data-standard-id="${cssEscapeAttr(selectedCriterionId)}"]`
  );

  if (row instanceof HTMLTableRowElement) {
    row.classList.add('ocq-row-selected');
    lastSelectedStandardRow = row;
  }

  refreshDownloadOptions();
}

/**
 * Loads the selected batch item into the active detail panes.
 *
 * @param {OcqEvaluatedReport} reportObject
 * @returns {void}
 */
function loadBatchSelection(reportObject) {
  applyInspectionItemToState(reportObject, lastManifest, true);
  applyResourceFilters();
}

/**
 * Appends new reports to the cumulative dashboard list.
 *
 * @param {OcqEvaluatedReport[] | null | undefined} reports
 * @returns {void}
 */
function appendBatchReports(reports) {
  const nextReports = Array.isArray(reports) ? reports : [];
  const existingReports = Array.isArray(lastBatchReports) ? lastBatchReports : [];
  lastBatchReports = existingReports.concat(nextReports);
}

/**
 * Handles selecting one batch dashboard row.
 *
 * @param {string} batchKey
 * @returns {void}
 */
function onBatchRowSelected(batchKey) {
  if (!Array.isArray(lastBatchReports) || !lastBatchReports.length) {
    return;
  }

  if (selectedBatchKey === batchKey) {
    renderDashboard(lastBatchReports, selectedBatchKey, dashboardContainer);
    return;
  }

  const selectedReport = lastBatchReports.find(
    (report) => getBatchKey(report) === batchKey
  );

  if (!selectedReport) {
    return;
  }

  selectedBatchKey = batchKey;
  loadBatchSelection(selectedReport);
  renderDashboard(lastBatchReports, selectedBatchKey, dashboardContainer);
  setStatus(`Selected: ${selectedReport.fileName}`);
  refreshDownloadOptions();
}

/**
 * Builds the current export state.
 *
 * @returns {import('./types.js').OcqExportState}
 */
function getExportState() {
  return {
    statusFilter: statusFilterSelect ? statusFilterSelect.value : '',
    standardFilter: standardFilterSelect ? standardFilterSelect.value : '',
    selectedCriterionId: lastSelectedCriterionId,
    manifest: lastManifest,
    inspectionScope: lastInspectionScope,
    ontologyMetadata: lastOntologyMetadata,
    ontologyReport: lastOntologyReport,
    perResourceRows: Array.isArray(lastPerResource) ? lastPerResource : [],
    results: Array.isArray(lastResults) ? lastResults : []
  };
}

/**
 * Returns true when current selected files match the prepared preflight state.
 *
 * @returns {boolean}
 */
function hasPreparedFilesForCurrentSelection() {
  if (!filesInput) {
    return false;
  }

  const files = Array.from(filesInput.files || []);
  if (!files.length || files.length !== preparedOntologyFiles.length) {
    return false;
  }

  return files.every((file, index) => preparedOntologyFiles[index]?.file?.name === file.name);
}

/**
 * Analyzes selected files and populates preflight state.
 *
 * @returns {Promise<void>}
 */
async function analyzeSelectedFiles() {
  if (!filesInput) {
    window.alert('File input #ontologyFiles not found.');
    return;
  }

  const files = Array.from(filesInput.files || []);
  if (!files.length) {
    window.alert('Please select one or more ontology files.');
    return;
  }

  setStatus('Analyzing selected ontology files...');

  try {
    const nextPreparedFiles = [];

    for (const file of files) {
      const text = await file.text();
      const summary = await buildPreflightSummary(text, file.name);
      nextPreparedFiles.push({
        file,
        summary,
        inspectionScope: {
          includedNamespaces: deriveDefaultIncludedNamespaces(summary)
        }
      });
    }

    preparedOntologyFiles = nextPreparedFiles;
    renderPreflightUi();
    updateRunButtonState();
    setStatus(`Analyzed ${preparedOntologyFiles.length} ontology file(s). Review namespaces, then run batch checks.`);
  } catch (error) {
    console.error('Error analyzing files:', error);
    clearPreflightState();
    setStatus(error instanceof Error ? `Error: ${error.message}` : 'Error analyzing files.');
  }
}

/** @type {Record<string, OcqDownloadAction>} */
const downloadActions = {
  resultsCsv: {
    label: 'Results CSV',
    isAvailable: () => Array.isArray(lastResults) && lastResults.length > 0,
    build: () => buildResultsCsv(lastResults, lastOntologyReport?.ontologyIri || ''),
    getFileName: () => `ocq-results_${getTimestampForFileName()}.csv`,
    mimeType: 'text/csv;charset=utf-8'
  },
  ontologyYaml: {
    label: 'Ontology Report YAML',
    isAvailable: () => !!lastOntologyReport,
    build: () => buildOntologyReportYaml(lastOntologyReport),
    getFileName: () => `ocq-ontology-report_${getTimestampForFileName()}.yaml`,
    mimeType: 'text/yaml;charset=utf-8'
  },
  htmlReport: {
    label: 'HTML Report',
    isAvailable: () =>
      !!lastOntologyReport || (Array.isArray(lastResults) && lastResults.length > 0),
    build: () => buildHtmlReport(getExportState()),
    getFileName: () => `ocq-report_${getTimestampForFileName()}.html`,
    mimeType: 'text/html;charset=utf-8'
  },
  filteredResourcesCsv: {
    label: 'Filtered Resources CSV',
    isAvailable: () => Array.isArray(lastPerResource) && lastPerResource.length > 0,
    build: () => buildFilteredResourcesCsv(lastPerResource),
    getFileName: () => `ocq-filtered-resources_${getTimestampForFileName()}.csv`,
    mimeType: 'text/csv;charset=utf-8'
  },
  standardDetailCsv: {
    label: 'Standard Detail CSV',
    isAvailable: () =>
      !!lastSelectedCriterionId &&
      Array.isArray(lastResults) &&
      lastResults.length > 0,
    build: () => buildStandardDetailCsv(lastSelectedCriterionId, lastResults),
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
 * Returns true when the current state can be printed.
 *
 * @returns {boolean}
 */
function isPrintAvailable() {
  return !!lastOntologyReport || (Array.isArray(lastResults) && lastResults.length > 0);
}

/**
 * Updates the print button availability.
 *
 * @returns {void}
 */
function updatePrintButtonState() {
  if (!printReportButton) {
    return;
  }

  printReportButton.disabled = !isPrintAvailable();
}

/**
 * Refreshes download-option availability.
 *
 * @returns {void}
 */
function refreshDownloadOptions() {
  if (!downloadActionSelect || !downloadSelectedButton) {
    updatePrintButtonState();
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
  updatePrintButtonState();
}

/**
 * Handles the selected download action.
 *
 * @returns {void}
 */
function handleDownloadSelected() {
  if (!downloadActionSelect) {
    return;
  }

  const action = downloadActions[downloadActionSelect.value];
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
    downloadTextFile(action.build(), action.getFileName(), action.mimeType);
    setStatus(`Downloaded ${action.label}.`);
  } catch (error) {
    console.error(error);
    setStatus(error instanceof Error ? error.message : 'Download failed.');
  }
}

/**
 * Opens a print-friendly report window for the current state.
 *
 * @returns {void}
 */
function handlePrintReport() {
  if (!isPrintAvailable()) {
    setStatus('Nothing to print yet. Run or load a report first.');
    updatePrintButtonState();
    return;
  }

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    setStatus('Print window was blocked. Allow pop-ups and try again.');
    return;
  }

  const reportHtml = buildHtmlReport(getExportState());
  const printHtml = reportHtml.replace(
    '</body>',
    `<script>
      window.addEventListener('load', () => {
        window.print();
      });
      window.addEventListener('afterprint', () => {
        window.close();
      });
    </script></body>`
  );

  printWindow.document.open();
  printWindow.document.write(printHtml);
  printWindow.document.close();
  setStatus('Opened print view.');
}

/**
 * Loads and caches the manifest.
 *
 * @returns {Promise<OcqManifest>}
 */
async function ensureManifestLoaded() {
  if (lastManifest) {
    return lastManifest;
  }

  lastManifest = await loadManifest(DEFAULT_MANIFEST_URL);
  populateStandardFilter(lastManifest, standardFilterSelect);
  return lastManifest;
}

/**
 * Hydrates the UI from a saved run.
 *
 * @param {OcqSavedRun | null} run
 * @returns {Promise<void>}
 */
async function hydrateRun(run) {
  if (!run) {
    return;
  }

  await ensureManifestLoaded();
  applyUiStateSnapshot(run.uiState);
  clearStandardSelection();

  /** @type {unknown} */
  const payload = run.payload;

  if (run.kind === 'batch') {
    const batchPayload = Array.isArray(payload)
      ? /** @type {OcqBatchRunPayload} */ (payload)
      : [];

    lastBatchReports = batchPayload;
    selectedBatchKey = run.uiState?.selectedBatchKey || null;
    clearInspectionDataState();
    renderDashboard(lastBatchReports, selectedBatchKey, dashboardContainer);

    if (selectedBatchKey) {
      const selectedReport = lastBatchReports.find(
        (report) => getBatchKey(report) === selectedBatchKey
      );

      if (selectedReport) {
        loadBatchSelection(selectedReport);
        renderDashboard(lastBatchReports, selectedBatchKey, dashboardContainer);
      }
    } else {
      renderActiveInspectionViews();
    }

    restoreSelectedCriterion(run.uiState?.selectedCriterionId);
    setStatus(`Loaded saved batch run (${run.createdAt}).`);
    refreshDownloadOptions();
    return;
  }

  const reportObject = !Array.isArray(payload) && payload
    ? /** @type {OcqEvaluatedReport} */ (payload)
    : null;

  if (!reportObject) {
    setStatus('Saved run payload is invalid for a single run.');
    refreshDownloadOptions();
    return;
  }

  applyInspectionItemToState(reportObject, lastManifest);
  applyResourceFilters();
  restoreSelectedCriterion(run.uiState?.selectedCriterionId);
  setStatus(`Loaded saved single run (${run.createdAt}).`);
  refreshDownloadOptions();
}

/**
 * Runs inspection over the selected files.
 *
 * @returns {Promise<void>}
 */
async function runInspectionFromSelectedFiles() {
  if (!filesInput) {
    window.alert('File input #ontologyFiles not found.');
    return;
  }

  const files = Array.from(filesInput.files || []);
  if (!files.length) {
    window.alert('Please select one or more ontology files.');
    return;
  }

  if (!hasPreparedFilesForCurrentSelection()) {
    window.alert('Analyze the selected files before running checks so you can confirm the inspection scope.');
    return;
  }

  setStatus('Running inspection...');
  resetInspectionView();

  try {
    const manifest = await ensureManifestLoaded();
    const inspectionScopesByFileName = new Map(
      preparedOntologyFiles.map((prepared) => [
        prepared.file.name,
        prepared.inspectionScope
      ])
    );
    const reportsWithScope = await inspectFiles(files, manifest, inspectionScopesByFileName);
    lastManifest = manifest;
    appendBatchReports(reportsWithScope);
    clearInspectionDataState();
    clearStandardSelection();
    renderDashboard(lastBatchReports, selectedBatchKey, dashboardContainer);

    if (reportsWithScope.length) {
      selectedBatchKey = getBatchKey(reportsWithScope[reportsWithScope.length - 1]);
      loadBatchSelection(reportsWithScope[reportsWithScope.length - 1]);
      renderDashboard(lastBatchReports, selectedBatchKey, dashboardContainer);
    } else {
      renderActiveInspectionViews();
    }

    setStatus(`Completed inspection of ${files.length} ontology file(s). Dashboard now lists ${lastBatchReports?.length || 0} ontology result(s).`);
    refreshDownloadOptions();

    void (async () => {
      try {
        await saveRun({
          kind: 'batch',
          label: `${reportsWithScope.length} ontology file(s)`,
          payload: reportsWithScope,
          uiState: getUiStateSnapshot()
        });

        await refreshSavedRunsUi();
      } catch (error) {
        console.error('Error saving batch run:', error);
      }
    })();
  } catch (error) {
    console.error('Error running inspection:', error);
    setStatus(error instanceof Error ? `Error: ${error.message}` : 'Error running inspection.');
    refreshDownloadOptions();
  }
}

/**
 * Initializes the application.
 *
 * @returns {Promise<void>}
 */
async function initializeApp() {
  initTheme();
  renderPreflightUi();
  updateRunButtonState();

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

      toggleResourceDetail(resourceIri, lastFailuresIndex, curationTableContainer);
    });
  }

  if (ontologyReportContainer) {
    ontologyReportContainer.addEventListener('click', (event) => {
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
        clearStandardSelection();
        refreshDownloadOptions();
        return;
      }

      clearStandardSelection();
      row.classList.add('ocq-row-selected');
      lastSelectedStandardRow = row;
      lastSelectedCriterionId = criterionId;

      renderStandardDetail(
        criterionId,
        lastManifest,
        lastOntologyReport,
        lastResults,
        standardDetailContainer
      );
      openStandardDetailModal();
      refreshDownloadOptions();
    });
  }

  if (standardDetailContainer) {
    standardDetailContainer.addEventListener('click', (event) => {
      if (!(event.target instanceof Element)) {
        return;
      }

      if (event.target === standardDetailContainer) {
        clearStandardSelection();
        refreshDownloadOptions();
        return;
      }

      const closeButton = event.target.closest('button[data-standard-close]');
      if (!closeButton) {
        return;
      }

      clearStandardSelection();
      refreshDownloadOptions();
    });
  }

  if (dashboardContainer) {
    dashboardContainer.addEventListener('click', (event) => {
      if (!(event.target instanceof Element)) {
        return;
      }

      const row = event.target.closest('tr[data-batch-key]');
      if (!(row instanceof HTMLTableRowElement)) {
        return;
      }

      const batchKey = row.getAttribute('data-batch-key');
      if (batchKey) {
        onBatchRowSelected(batchKey);
      }
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
      if (batchKey) {
        onBatchRowSelected(batchKey);
      }
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

  if (filesInput) {
    filesInput.addEventListener('change', () => {
      clearPreflightState();
      setStatus('Selected files changed. Analyze files to review scope before running checks.');
    });
  }

  if (preflightContainer) {
    preflightContainer.addEventListener('change', (event) => {
      if (!(event.target instanceof HTMLInputElement)) {
        return;
      }

      const fileName = event.target.getAttribute('data-scope-file');
      const namespace = event.target.getAttribute('data-scope-namespace');
      if (!fileName || !namespace) {
        return;
      }

      const prepared = preparedOntologyFiles.find((item) => item.summary.fileName === fileName);
      if (!prepared) {
        return;
      }

      const current = new Set(prepared.inspectionScope.includedNamespaces || []);
      if (event.target.checked) {
        current.add(namespace);
      } else {
        current.delete(namespace);
      }

      prepared.inspectionScope.includedNamespaces = Array.from(current).sort();
      renderPreflightUi();
    });
  }

  if (themeToggleButton) {
    themeToggleButton.addEventListener('click', toggleTheme);
  }

  if (downloadActionSelect) {
    downloadActionSelect.addEventListener('change', refreshDownloadOptions);
  }

  if (downloadSelectedButton) {
    downloadSelectedButton.addEventListener('click', handleDownloadSelected);
  }

  if (printReportButton) {
    printReportButton.disabled = true;
    printReportButton.addEventListener('click', handlePrintReport);
  }

  if (runInspectionButton) {
    runInspectionButton.disabled = true;
    runInspectionButton.addEventListener('click', () => {
      void runInspectionFromSelectedFiles();
    });
  }

  if (loadFilesForInspectionButton) {
    loadFilesForInspectionButton.addEventListener('click', () => {
      void analyzeSelectedFiles();
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
  } else {
    renderPreflightUi();
    renderActiveInspectionViews();
    renderDashboard([], null, dashboardContainer);
  }

  updateRunButtonState();
  refreshDownloadOptions();
  updatePrintButtonState();
}

void initializeApp();

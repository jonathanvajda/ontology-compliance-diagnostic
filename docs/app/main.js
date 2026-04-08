// app/main.js
// @ts-check

import {
  loadManifest,
  DEFAULT_MANIFEST_URL,
  buildPreflightSummaryFromStore,
  deriveDefaultIncludedNamespaces,
  extractResourceDetail,
  SUPPORTED_RDF_FORMATS
} from './engine.js';
import { buildFailuresIndex } from './grader.js';
import { inspectStore } from './report-model.js';
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
import { renderEditSession } from './render-edit-session.js';
import {
  applyStagedEditsToStore,
  buildMergedInspectionStore,
  cloneParsedOntologyState,
  createParsedOntologyState,
  createStagedEditId,
  exportPrimaryOntology
} from './edit-session.js';
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

/** @typedef {import('./types.js').BatchRunPayload} BatchRunPayload */
/** @typedef {import('./types.js').EvaluatedReport} EvaluatedReport */
/** @typedef {import('./types.js').FailureIndex} FailureIndex */
/** @typedef {import('./types.js').Manifest} Manifest */
/** @typedef {import('./types.js').OntologyMetadata} OntologyMetadata */
/** @typedef {import('./types.js').OntologyReport} OntologyReport */
/** @typedef {import('./types.js').EditSessionState} EditSessionState */
/** @typedef {import('./types.js').PreparedOntologyFile} PreparedOntologyFile */
/** @typedef {import('./types.js').PerResourceCurationRow} PerResourceCurationRow */
/** @typedef {import('./types.js').QueryResultRow} QueryResultRow */
/** @typedef {import('./types.js').ResourceDetail} ResourceDetail */
/** @typedef {import('./types.js').SavedRun} SavedRun */
/** @typedef {import('./types.js').StagedResourceEdit} StagedResourceEdit */
/** @typedef {import('./types.js').SupplementalOntologyFile} SupplementalOntologyFile */
/** @typedef {import('./types.js').UiStateSnapshot} UiStateSnapshot */

/**
 * @typedef {Object} DownloadAction
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
/** @type {HTMLElement | null} */
const queryCounterElement = document.getElementById('queryCounter');
/** @type {HTMLInputElement | null} */
const resourceSearchInput = /** @type {HTMLInputElement | null} */ (
  document.getElementById('resourceSearch')
);
/** @type {HTMLElement | null} */
const curationTableContainer = document.getElementById('curationTableContainer');
/** @type {HTMLElement | null} */
const editSessionContainer = document.getElementById('editSessionContainer');
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
const curationFiltersContainer = document.getElementById('curationFiltersContainer');
/** @type {HTMLElement | null} */
const curationFiltersSummaryElement = document.getElementById('curationFiltersSummary');

/** @type {Manifest | null} */
let lastManifest = null;
/** @type {QueryResultRow[] | null} */
let lastResults = null;
/** @type {PerResourceCurationRow[] | null} */
let lastPerResource = null;
/** @type {PerResourceCurationRow[] | null} */
let lastPerResourceFull = null;
/** @type {FailureIndex | null} */
let lastFailuresIndex = null;
/** @type {OntologyReport | null} */
let lastOntologyReport = null;
/** @type {OntologyMetadata | null} */
let lastOntologyMetadata = null;
/** @type {Record<string, ResourceDetail> | null} */
let lastResourceDetails = null;
/** @type {ResourceDetail | null} */
let lastOntologyDetail = null;
/** @type {EvaluatedReport[] | null} */
let lastBatchReports = null;
/** @type {import('./types.js').InspectionScope | null} */
let lastInspectionScope = null;
/** @type {string | null} */
let selectedBatchKey = null;
/** @type {number | null} */
let resourceSearchTimer = null;
/** @type {string | null} */
let lastSelectedCriterionId = null;
/** @type {HTMLTableRowElement | null} */
let lastSelectedStandardRow = null;
/** @type {PreparedOntologyFile[]} */
let preparedOntologyFiles = [];
/** @type {Map<string, { primaryOntology: import('./types.js').ParsedOntologyState, supplementalOntologies: SupplementalOntologyFile[] }>} */
let reportSourceByBatchKey = new Map();
/** @type {EditSessionState} */
let activeEditSession = {
  batchKey: null,
  selectedFileName: null,
  primaryOntology: null,
  supplementalOntologies: [],
  selectedResources: [],
  stagedEdits: [],
  rerunReport: null
};
/** @type {Array<{ fileName: string, completedQueries: number, totalQueries: number }>} */
let queryProgressEntries = [];
/** @type {boolean} */
let preflightCollapsed = false;

const SUPPLEMENTAL_IMPORT_ACCEPT_ATTR = '.ttl,.turtle,.rdf,.owl,.xml,.nt,.ntriples,.nq,.trig,.n3,.jsonld,.json-ld';

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
 * Returns a fresh edit-session state.
 *
 * @returns {EditSessionState}
 */
function createEmptyEditSession() {
  return {
    batchKey: null,
    selectedFileName: null,
    primaryOntology: null,
    supplementalOntologies: [],
    selectedResources: [],
    stagedEdits: [],
    rerunReport: null
  };
}

/**
 * Renders the edit-session workspace.
 *
 * @returns {void}
 */
function renderEditSessionUi() {
  renderEditSession(activeEditSession, editSessionContainer);
}

/**
 * Resets the editable session.
 *
 * @returns {void}
 */
function resetEditSession() {
  activeEditSession = createEmptyEditSession();
  renderEditSessionUi();
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
  runInspectionButton.classList.toggle('ocd-btn-primary', isReady);
  runInspectionButton.classList.toggle('ocd-btn-secondary', !isReady);
}

/**
 * Renders the query progress panel.
 *
 * @returns {void}
 */
function renderQueryProgress() {
  if (!queryCounterElement) {
    return;
  }

  if (!Array.isArray(queryProgressEntries) || !queryProgressEntries.length) {
    queryCounterElement.innerHTML = '';
    return;
  }

  let html = '<div class="ocd-progress-board">';

  for (const entry of queryProgressEntries) {
    const total = Math.max(0, Number(entry.totalQueries) || 0);
    const completed = Math.min(total, Math.max(0, Number(entry.completedQueries) || 0));
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
    const isComplete = total > 0 && completed >= total;
    const progressLabel = isComplete ? 'Inspection complete' : `${completed} of ${total}`;

    html += '<div class="ocd-progress-card">';
    html += '<div class="ocd-progress-header">';
    html += `<strong>${escapeHtml(entry.fileName)}</strong>`;
    html += `<span class="ocd-mono">${escapeHtml(progressLabel)}</span>`;
    html += '</div>';
    html += '<div class="ocd-progress-track" aria-hidden="true">';
    html += `<div class="ocd-progress-fill" style="width:${escapeHtml(String(percent))}%"></div>`;
    html += '</div>';
    html += `<div class="ocd-progress-meta"><span>${escapeHtml(`${percent}%`)}</span></div>`;
    html += '</div>';
  }

  html += '</div>';
  queryCounterElement.innerHTML = html;
}

/**
 * Resets the query progress panel.
 *
 * @returns {void}
 */
function clearQueryProgress() {
  queryProgressEntries = [];
  renderQueryProgress();
}

/**
 * Initializes query progress entries for the selected files.
 *
 * @param {File[]} files
 * @param {number} totalQueries
 * @returns {void}
 */
function initializeQueryProgress(files, totalQueries) {
  queryProgressEntries = files.map((file) => ({
    fileName: file.name,
    completedQueries: 0,
    totalQueries
  }));
  renderQueryProgress();
}

/**
 * Updates query progress for one ontology.
 *
 * @param {{ fileName: string, completedQueries: number, totalQueries: number }} progress
 * @returns {void}
 */
function updateQueryProgress(progress) {
  const fileName = String(progress?.fileName || '');
  if (!fileName) {
    return;
  }

  const existing = queryProgressEntries.find((entry) => entry.fileName === fileName);
  if (existing) {
    existing.completedQueries = progress.completedQueries;
    existing.totalQueries = progress.totalQueries;
  } else {
    queryProgressEntries.push({
      fileName,
      completedQueries: progress.completedQueries,
      totalQueries: progress.totalQueries
    });
  }

  renderQueryProgress();
}

/**
 * Renders completed query progress from existing reports.
 *
 * @param {EvaluatedReport[] | null | undefined} reports
 * @param {Manifest | null | undefined} manifest
 * @returns {void}
 */
function syncQueryProgressFromReports(reports, manifest) {
  const items = Array.isArray(reports) ? reports : [];
  const totalQueries = Array.isArray(manifest?.queries) ? manifest.queries.length : 0;

  queryProgressEntries = items.map((report) => {
    const observedQueries = new Set(
      Array.isArray(report?.results)
        ? report.results.map((row) => String(row?.queryId || '')).filter((queryId) => queryId)
        : []
    ).size;
    const completedQueries = totalQueries > 0 ? totalQueries : observedQueries;

    return {
      fileName: String(report?.fileName || ''),
      completedQueries,
      totalQueries
    };
  });

  renderQueryProgress();
}

/**
 * Returns the current UI state snapshot for persistence.
 *
 * @returns {UiStateSnapshot}
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
 * @param {UiStateSnapshot | null | undefined} state
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
 * @param {SavedRun} run
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
 * @param {'ocd-theme-light' | 'ocd-theme-dark'} themeClass
 * @returns {void}
 */
function setTheme(themeClass) {
  if (!appRoot) {
    return;
  }

  appRoot.classList.remove('ocd-theme-light', 'ocd-theme-dark');
  appRoot.classList.add(themeClass);
  localStorage.setItem('ocd-theme', themeClass);
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

  const isDark = appRoot.classList.contains('ocd-theme-dark');
  setTheme(isDark ? 'ocd-theme-light' : 'ocd-theme-dark');
}

/**
 * Restores the theme from local storage.
 *
 * @returns {void}
 */
function initTheme() {
  const savedTheme = localStorage.getItem('ocd-theme');
  if (savedTheme === 'ocd-theme-dark' || savedTheme === 'ocd-theme-light') {
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
  renderOntologyReport(null, lastInspectionScope, lastManifest, null, ontologyReportContainer);
  renderCurationTable([], lastFailuresIndex, lastResourceDetails, new Set(), curationTableContainer);
  updateCurationFiltersVisibility();
  renderEditSessionUi();

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
  preflightCollapsed = false;
  renderPreflightUi();
  updateRunButtonState();
}

/**
 * Returns the total number of attached supplemental ontologies across prepared primary files.
 *
 * @returns {number}
 */
function countPreparedSupplementalOntologies() {
  return preparedOntologyFiles.reduce(
    (count, prepared) => count + (Array.isArray(prepared.supplementalOntologies) ? prepared.supplementalOntologies.length : 0),
    0
  );
}

/**
 * Returns direct and transitive import IRIs known for one prepared ontology.
 *
 * Direct imports come from the primary ontology. Transitive imports are discovered
 * from any attached closure files for the same prepared ontology.
 *
 * @param {PreparedOntologyFile} prepared
 * @returns {{ directImports: string[], transitiveImports: string[], allImports: string[] }}
 */
function getKnownImportTargets(prepared) {
  const directImports = Array.isArray(prepared?.summary?.imports)
    ? prepared.summary.imports.filter(Boolean)
    : [];
  const allImports = new Set(directImports);

  for (const supplemental of prepared?.supplementalOntologies || []) {
    for (const importIri of supplemental?.summary?.imports || []) {
      if (importIri) {
        allImports.add(importIri);
      }
    }
  }

  const directImportSet = new Set(directImports);
  const sortedAllImports = Array.from(allImports).sort((left, right) => left.localeCompare(right));
  const sortedDirectImports = Array.from(directImportSet).sort((left, right) => left.localeCompare(right));
  const transitiveImports = sortedAllImports.filter((importIri) => !directImportSet.has(importIri));

  return {
    directImports: sortedDirectImports,
    transitiveImports,
    allImports: sortedAllImports
  };
}

/**
 * Returns the attached closure file names that declare one import IRI.
 *
 * @param {PreparedOntologyFile} prepared
 * @param {string} importIri
 * @returns {string[]}
 */
function getImportSourceFileNames(prepared, importIri) {
  return (prepared?.supplementalOntologies || [])
    .filter((supplemental) => Array.isArray(supplemental?.summary?.imports) && supplemental.summary.imports.includes(importIri))
    .map((supplemental) => supplemental.file.name)
    .sort((left, right) => left.localeCompare(right));
}

/**
 * Returns assigned supplemental ontologies for a declared import on a specific prepared file.
 *
 * @param {string} fileName
 * @param {string} importIri
 * @returns {SupplementalOntologyFile[]}
 */
function findSupplementalOntologiesForImport(fileName, importIri) {
  const prepared = preparedOntologyFiles.find((item) => item.summary.fileName === fileName);
  if (!prepared) {
    return [];
  }

  return (prepared.supplementalOntologies || []).filter((item) => item.importIri === importIri);
}

/**
 * Returns a stable attachment id for one supplemental ontology file.
 *
 * @param {string} importIri
 * @param {File} file
 * @returns {string}
 */
function getSupplementalAttachmentId(importIri, file) {
  return [
    importIri,
    file.name || '',
    String(file.size || 0),
    String(file.lastModified || 0)
  ].join('::');
}

/**
 * Clears the current standard selection.
 *
 * @returns {void}
 */
function clearStandardSelection() {
  if (lastSelectedStandardRow) {
    lastSelectedStandardRow.classList.remove('ocd-row-selected');
  }

  lastSelectedStandardRow = null;
  lastSelectedCriterionId = null;

  if (standardDetailContainer) {
    standardDetailContainer.innerHTML = '';
    standardDetailContainer.classList.remove('ocd-modal-open');
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

  standardDetailContainer.classList.add('ocd-modal-open');
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
  lastResourceDetails = null;
  lastOntologyDetail = null;
  lastOntologyReport = null;
  lastInspectionScope = null;
  updateCurationFiltersVisibility();
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
  clearQueryProgress();
  resetEditSession();
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
 * Shows resource filters only when curation rows are available.
 *
 * @returns {void}
 */
function updateCurationFiltersVisibility() {
  if (!curationFiltersContainer) {
    return;
  }

  const hasRows = Array.isArray(lastPerResourceFull) && lastPerResourceFull.length > 0;
  curationFiltersContainer.hidden = !hasRows;
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
    lastOntologyDetail,
    ontologyReportContainer
  );
  renderCurationTable(
    lastPerResource,
    lastFailuresIndex,
    lastResourceDetails,
    new Set(activeEditSession?.selectedResources || []),
    curationTableContainer
  );
  updateCurationFiltersVisibility();
  renderResourceFilterSummary();
  renderEditSessionUi();
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
      <p class="ocd-muted ocd-inline-preflight-empty">Load files to review ontology metadata, declared imports, candidate namespaces, and any import-linked closure files before running inspection.</p>
    `;
    return;
  }

  let html = '<details class="ocd-preflight-shell"' + (preflightCollapsed ? '' : ' open') + '>';
  html += '<summary class="ocd-preflight-summary">';
  html += '<span class="ocd-title">Inspection staging options</span>';
  html += `<span class="ocd-muted">${escapeHtml(`${preparedOntologyFiles.length} file(s) ready`)}</span>`;
  html += '</summary>';
  html += '<p class="ocd-muted">Choose which namespaces should count as in-scope for resource-level inspection. When an ontology declares <code>owl:imports</code>, you can also attach a local ontology file for that import here. Ontology-level checks will still run on the ontology itself.</p>';
  html += '<div class="ocd-preflight-list">';

  for (const prepared of preparedOntologyFiles) {
    const summary = prepared.summary;
    const selectedNamespaces = prepared.inspectionScope?.includedNamespaces || [];
    const { directImports, transitiveImports, allImports } = getKnownImportTargets(prepared);
    const discoveredNamespaces = Array.isArray(summary.discoveredNamespaces)
      ? summary.discoveredNamespaces
      : [];

    html += '<div class="ocd-preflight-card">';
    html += '<div class="ocd-preflight-header">';
    html += `<h3 class="ocd-preflight-title">${escapeHtml(summary.fileName)}</h3>`;
    html += `<span class="ocd-chip">${escapeHtml(String(summary.resourceCountEstimate))} labeled resources</span>`;
    html += '</div>';
    html += '<div class="ocd-preflight-grid">';
    html += '<div class="ocd-preflight-block">';
    html += '<strong>Ontology</strong>';
    html += `<div class="ocd-table-meta ocd-mono">${escapeHtml(summary.ontologyIri || 'urn:ontology:unknown')}</div>`;
    html += `<div class="ocd-table-meta">Title: ${escapeHtml(summary.metadata?.title || 'Not found')}</div>`;
    html += `<div class="ocd-table-meta">Version IRI: ${escapeHtml(summary.metadata?.versionIri || 'Not found')}</div>`;
    html += '</div>';
    html += '<div class="ocd-preflight-block">';
    html += '<strong>Imports</strong>';

    if (allImports.length) {
      html += '<div class="ocd-preflight-import-list">';
      for (const importIri of allImports) {
        const supplementalFiles = findSupplementalOntologiesForImport(summary.fileName, importIri);
        const importSources = getImportSourceFileNames(prepared, importIri);
        const inputId = `import-file-${encodeURIComponent(summary.fileName)}-${encodeURIComponent(importIri)}`;
        html += '<div class="ocd-preflight-import-row">';
        html += `<div class="ocd-table-meta ocd-mono">${escapeHtml(importIri)}</div>`;
        if (transitiveImports.includes(importIri) && importSources.length) {
          html += '<div class="ocd-table-meta">Also declared by attached closure file(s): ' + escapeHtml(importSources.join(', ')) + '</div>';
        }
        html += `<label class="ocd-label" for="${escapeHtml(inputId)}">Add ontology file(s) for this import</label>`;
        html += '<input class="ocd-input ocd-input-file" type="file" multiple accept="' + escapeHtml(SUPPLEMENTAL_IMPORT_ACCEPT_ATTR) + '" id="' + escapeHtml(inputId) + '" data-scope-file="' + escapeHtml(summary.fileName) + '" data-import-iri="' + escapeHtml(importIri) + '" />';
        if (supplementalFiles.length) {
          html += '<div class="ocd-table-meta">Attached closure files:</div>';
          html += '<div class="ocd-preflight-import-attachment-list">';
          for (const supplemental of supplementalFiles) {
            html += '<div class="ocd-preflight-import-attachment">';
            html += 'Using <span class="ocd-mono">' + escapeHtml(supplemental.file.name) + '</span>';
            if (supplemental.summary?.ontologyIri && supplemental.summary.ontologyIri !== importIri) {
              html += ' <span class="ocd-muted">(parsed ontology IRI: ' + escapeHtml(supplemental.summary.ontologyIri) + ')</span>';
            }
            html += '<button class="ocd-btn ocd-btn-tertiary ocd-btn-small" type="button" data-scope-file="' + escapeHtml(summary.fileName) + '" data-remove-import-supplemental="' + escapeHtml(supplemental.attachmentId) + '">Remove</button>';
            html += '</div>';
          }
          html += '</div>';
        }
        html += '</div>';
      }
      html += '</div>';
    } else {
      html += '<div class="ocd-table-meta">None found. Import-linked closure upload controls are hidden until the ontology declares an import.</div>';
    }

    if (directImports.length && transitiveImports.length) {
      html += '<div class="ocd-table-meta">Additional import targets discovered from attached closure files are shown alongside the ontology&apos;s direct imports.</div>';
    }

    html += '</div>';
    html += '<div class="ocd-preflight-block">';
    html += '<strong>Included namespaces</strong>';
    html += '<div class="ocd-checkbox-list">';

    for (const namespace of discoveredNamespaces) {
      const checkboxId = `scope-${encodeURIComponent(summary.fileName)}-${encodeURIComponent(namespace)}`;
      const isChecked = selectedNamespaces.includes(namespace);
      html += '<label class="ocd-checkbox" for="' + escapeHtml(checkboxId) + '">';
      html += '<input type="checkbox" data-scope-file="' + escapeHtml(summary.fileName) + '" data-scope-namespace="' + escapeHtml(namespace) + '" id="' + escapeHtml(checkboxId) + '"' + (isChecked ? ' checked' : '') + ' />';
      html += '<span class="ocd-mono">' + escapeHtml(namespace) + '</span>';
      html += '</label>';
    }

    html += '</div>';
    html += '</div>';
    html += '</div>';
    html += '</div>';
  }

  if (countPreparedSupplementalOntologies()) {
    html += '<div class="ocd-preflight-card">';
    html += '<div class="ocd-preflight-header">';
    html += '<h3 class="ocd-preflight-title">Attached import closure files</h3>';
    html += `<span class="ocd-chip">${escapeHtml(String(countPreparedSupplementalOntologies()))} file(s)</span>`;
    html += '</div>';
    html += '<p class="ocd-muted">These files were attached to declared imports. They will be merged into inspection and rerun evaluation but will not be rewritten during export.</p>';
    html += '<div class="ocd-chip-list">';
    for (const prepared of preparedOntologyFiles) {
      for (const supplemental of prepared.supplementalOntologies || []) {
        html += `<span class="ocd-chip ocd-mono">${escapeHtml(prepared.summary.fileName)}: ${escapeHtml(supplemental.importIri)} -> ${escapeHtml(supplemental.summary.fileName)}</span>`;
      }
    }
    html += '</div>';
    html += '</div>';
  }

  html += '</div>';
  html += '</details>';
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
 * @param {EvaluatedReport} reportObject
 * @param {Manifest | null | undefined} manifest
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
  lastResourceDetails = reportObject.resourceDetails || {};
  lastOntologyReport = reportObject.ontologyReport || null;
  lastOntologyDetail = reportObject.ontologyIri
    ? (lastResourceDetails?.[reportObject.ontologyIri] || extractResourceDetailFromEditOrReport(reportObject.ontologyIri))
    : null;
  lastManifest = manifest || lastManifest;
  if (!preserveBatchReports) {
    lastBatchReports = null;
    selectedBatchKey = null;
  }

  if (lastManifest) {
    populateStandardFilter(lastManifest, standardFilterSelect);
  }

  syncQueryProgressFromReports(
    preserveBatchReports && Array.isArray(lastBatchReports) && lastBatchReports.length
      ? lastBatchReports
      : [reportObject],
    lastManifest
  );
}

/**
 * Returns ontology detail from the current editable session when available.
 *
 * @param {string} ontologyIri
 * @returns {ResourceDetail | null}
 */
function extractResourceDetailFromEditOrReport(ontologyIri) {
  if (activeEditSession?.primaryOntology?.store && ontologyIri) {
    try {
      return extractResourceDetail(activeEditSession.primaryOntology.store, ontologyIri);
    } catch (_error) {
      return null;
    }
  }
  return null;
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
    row.classList.add('ocd-row-selected');
    lastSelectedStandardRow = row;
  }

  refreshDownloadOptions();
}

/**
 * Loads editable source state for the selected report when the live source ontology is available.
 *
 * @param {EvaluatedReport} reportObject
 * @returns {void}
 */
function syncEditSessionForReport(reportObject) {
  const batchKey = selectedBatchKey || getBatchKey(reportObject);
  if (
    activeEditSession?.batchKey === batchKey &&
    activeEditSession?.primaryOntology
  ) {
    renderEditSessionUi();
    return;
  }

  const source = reportSourceByBatchKey.get(batchKey);
  if (!source) {
    resetEditSession();
    return;
  }

  const primaryOntology = cloneParsedOntologyState(source.primaryOntology);

  activeEditSession = {
    batchKey,
    selectedFileName: reportObject.fileName || null,
    primaryOntology,
    supplementalOntologies: source.supplementalOntologies.map((item) => ({
      ...item,
      parsedOntology: cloneParsedOntologyState(item.parsedOntology)
    })),
    selectedResources: [],
    stagedEdits: [],
    rerunReport: null
  };

  lastOntologyDetail = reportObject.ontologyIri
    ? extractResourceDetail(primaryOntology.store, reportObject.ontologyIri)
    : null;
  renderEditSessionUi();
}

/**
 * Re-renders views that reflect edit-session state.
 *
 * @returns {void}
 */
function refreshEditAwareViews() {
  renderActiveInspectionViews();
  refreshDownloadOptions();
}

/**
 * Replaces or appends one staged edit.
 *
 * @param {StagedResourceEdit} nextEdit
 * @returns {void}
 */
function upsertStagedEdit(nextEdit) {
  const currentEdits = Array.isArray(activeEditSession?.stagedEdits)
    ? activeEditSession.stagedEdits
    : [];
  const nextEdits = currentEdits.filter((edit) => !(
    edit.kind === nextEdit.kind &&
    edit.subject === nextEdit.subject &&
    edit.predicateIri === nextEdit.predicateIri
  ));

  nextEdits.push(nextEdit);
  activeEditSession.stagedEdits = nextEdits;
}

/**
 * Stages one predicate replacement.
 *
 * @param {string} subjectIri
 * @param {string} predicateIri
 * @param {import('./types.js').EditableObjectValue[]} objects
 * @returns {void}
 */
function stageReplacement(subjectIri, predicateIri, objects) {
  upsertStagedEdit({
    id: createStagedEditId(),
    kind: 'set-codesignated-values',
    subject: subjectIri,
    predicateIri,
    objects
  });
}

/**
 * Stages one added assertion.
 *
 * @param {string} subjectIri
 * @param {string} predicateIri
 * @param {import('./types.js').EditableObjectValue} object
 * @returns {void}
 */
function stageAssertion(subjectIri, predicateIri, object) {
  upsertStagedEdit({
    id: createStagedEditId(),
    kind: 'add-assertion',
    subject: subjectIri,
    predicateIri,
    objects: [object]
  });
}

/**
 * Updates selected failed resources in the edit session.
 *
 * @param {string} resourceIri
 * @param {boolean} isSelected
 * @returns {void}
 */
function setResourceSelected(resourceIri, isSelected) {
  const next = new Set(activeEditSession?.selectedResources || []);
  if (isSelected) {
    next.add(resourceIri);
  } else {
    next.delete(resourceIri);
  }
  activeEditSession.selectedResources = Array.from(next).sort((left, right) => left.localeCompare(right));
  refreshEditAwareViews();
}

/**
 * Removes one staged edit by id.
 *
 * @param {string} editId
 * @returns {void}
 */
function removeStagedEdit(editId) {
  activeEditSession.stagedEdits = (activeEditSession?.stagedEdits || []).filter(
    (edit) => edit.id !== editId
  );
  refreshEditAwareViews();
}

/**
 * Stages the current bulk edit form.
 *
 * @returns {void}
 */
function stageBulkEdit() {
  const selectedResources = Array.isArray(activeEditSession?.selectedResources)
    ? activeEditSession.selectedResources
    : [];

  if (!selectedResources.length) {
    window.alert('Select one or more failed resources first.');
    return;
  }

  const statusValue = /** @type {HTMLSelectElement | null} */ (
    document.getElementById('bulkEditStatusSelect')
  )?.value || '';
  const curatorNote = /** @type {HTMLTextAreaElement | null} */ (
    document.getElementById('bulkCuratorNoteInput')
  )?.value?.trim() || '';
  const obsolescenceReason = /** @type {HTMLTextAreaElement | null} */ (
    document.getElementById('bulkObsolescenceReasonInput')
  )?.value?.trim() || '';
  const termReplacedBy = /** @type {HTMLInputElement | null} */ (
    document.getElementById('bulkTermReplacedByInput')
  )?.value?.trim() || '';
  const commentValue = /** @type {HTMLTextAreaElement | null} */ (
    document.getElementById('bulkCommentInput')
  )?.value?.trim() || '';

  if (!statusValue && !curatorNote && !obsolescenceReason && !termReplacedBy && !commentValue) {
    window.alert('Enter at least one bulk change before staging it.');
    return;
  }

  for (const resourceIri of selectedResources) {
    if (statusValue) {
      stageReplacement(resourceIri, 'http://purl.obolibrary.org/obo/IAO_0000114', [{
        termType: 'NamedNode',
        value: statusValue
      }]);
    }
    if (curatorNote) {
      stageReplacement(resourceIri, 'http://purl.obolibrary.org/obo/IAO_0000232', [{
        termType: 'Literal',
        value: curatorNote
      }]);
    }
    if (obsolescenceReason) {
      stageReplacement(resourceIri, 'http://purl.obolibrary.org/obo/IAO_0000231', [{
        termType: 'Literal',
        value: obsolescenceReason
      }]);
    }
    if (termReplacedBy) {
      stageReplacement(resourceIri, 'http://purl.obolibrary.org/obo/IAO_0100001', [{
        termType: 'NamedNode',
        value: termReplacedBy
      }]);
    }
    if (commentValue) {
      stageReplacement(resourceIri, 'http://www.w3.org/2000/01/rdf-schema#comment', [{
        termType: 'Literal',
        value: commentValue
      }]);
    }
  }

  setStatus(`Staged bulk edits for ${selectedResources.length} selected resource(s).`);
  refreshEditAwareViews();
}

/**
 * Stages each selected resource's currently suggested curation status.
 *
 * @returns {void}
 */
function stageSuggestedStatusesForSelection() {
  const selectedResources = Array.isArray(activeEditSession?.selectedResources)
    ? activeEditSession.selectedResources
    : [];

  if (!selectedResources.length) {
    window.alert('Select one or more failed resources first.');
    return;
  }

  const rows = Array.isArray(lastPerResourceFull) ? lastPerResourceFull : [];
  let stagedCount = 0;

  for (const resourceIri of selectedResources) {
    const row = rows.find((item) => item.resource === resourceIri);
    if (!row?.statusIri) {
      continue;
    }

    stageReplacement(resourceIri, 'http://purl.obolibrary.org/obo/IAO_0000114', [{
      termType: 'NamedNode',
      value: row.statusIri
    }]);
    stagedCount += 1;
  }

  if (!stagedCount) {
    window.alert('No suggested statuses were available for the selected resources.');
    return;
  }

  setStatus(`Staged suggested statuses for ${stagedCount} selected resource(s).`);
  refreshEditAwareViews();
}

/**
 * Stages edits from one expanded resource panel.
 *
 * @param {string} resourceIri
 * @returns {void}
 */
function stageResourcePanelEdits(resourceIri) {
  const statusSelect = curationTableContainer?.querySelector(
    `[data-resource-status-select="${cssEscapeAttr(resourceIri)}"]`
  );
  const noteInputs = Array.from(
    curationTableContainer?.querySelectorAll(
      `[data-resource-note="${cssEscapeAttr(resourceIri)}"]`
    ) || []
  );
  const arbitraryPredicate = /** @type {HTMLInputElement | null} */ (
    curationTableContainer?.querySelector(
      `[data-arbitrary-predicate="${cssEscapeAttr(resourceIri)}"]`
    )
  );
  const arbitraryObjectType = /** @type {HTMLSelectElement | null} */ (
    curationTableContainer?.querySelector(
      `[data-arbitrary-object-type="${cssEscapeAttr(resourceIri)}"]`
    )
  );
  const arbitraryObjectValue = /** @type {HTMLInputElement | null} */ (
    curationTableContainer?.querySelector(
      `[data-arbitrary-object-value="${cssEscapeAttr(resourceIri)}"]`
    )
  );
  const arbitraryObjectLanguage = /** @type {HTMLInputElement | null} */ (
    curationTableContainer?.querySelector(
      `[data-arbitrary-object-language="${cssEscapeAttr(resourceIri)}"]`
    )
  );
  const arbitraryObjectDatatype = /** @type {HTMLInputElement | null} */ (
    curationTableContainer?.querySelector(
      `[data-arbitrary-object-datatype="${cssEscapeAttr(resourceIri)}"]`
    )
  );

  let stagedCount = 0;
  if (statusSelect instanceof HTMLSelectElement && statusSelect.value) {
    stageReplacement(resourceIri, 'http://purl.obolibrary.org/obo/IAO_0000114', [{
      termType: 'NamedNode',
      value: statusSelect.value
    }]);
    stagedCount += 1;
  }

  for (const input of noteInputs) {
    if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)) {
      continue;
    }

    const predicateIri = input.getAttribute('data-predicate-iri') || '';
    const value = String(input.value || '').trim();
    if (!predicateIri || !value) {
      continue;
    }

    stageReplacement(resourceIri, predicateIri, [{
      termType: predicateIri === 'http://purl.obolibrary.org/obo/IAO_0100001' ? 'NamedNode' : 'Literal',
      value
    }]);
    stagedCount += 1;
  }

  if (
    arbitraryPredicate instanceof HTMLInputElement &&
    arbitraryObjectType instanceof HTMLSelectElement &&
    arbitraryObjectValue instanceof HTMLInputElement
  ) {
    const predicateIri = String(arbitraryPredicate.value || '').trim();
    const objectValue = String(arbitraryObjectValue.value || '').trim();
    if (predicateIri && objectValue) {
      stageAssertion(resourceIri, predicateIri, {
        termType: arbitraryObjectType.value === 'Literal' ? 'Literal' : 'NamedNode',
        value: objectValue,
        ...(arbitraryObjectLanguage?.value?.trim() ? { language: arbitraryObjectLanguage.value.trim() } : {}),
        ...(arbitraryObjectDatatype?.value?.trim() ? { datatypeIri: arbitraryObjectDatatype.value.trim() } : {})
      });
      stagedCount += 1;
    }
  }

  if (!stagedCount) {
    window.alert('No resource edits were entered to stage.');
    return;
  }

  setStatus(`Staged ${stagedCount} edit(s) for ${resourceIri}.`);
  refreshEditAwareViews();
}

/**
 * Stages ontology-subject edits from the ontology report card.
 *
 * @param {string} ontologyIri
 * @returns {void}
 */
function stageOntologyEdits(ontologyIri) {
  const noteInputs = Array.from(
    ontologyReportContainer?.querySelectorAll(
      `[data-ontology-note="${cssEscapeAttr(ontologyIri)}"]`
    ) || []
  );
  let stagedCount = 0;

  for (const input of noteInputs) {
    if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)) {
      continue;
    }

    const predicateIri = input.getAttribute('data-predicate-iri') || '';
    const value = String(input.value || '').trim();
    if (!predicateIri || !value) {
      continue;
    }

    stageReplacement(ontologyIri, predicateIri, [{
      termType: predicateIri === 'http://purl.obolibrary.org/obo/IAO_0100001' ? 'NamedNode' : 'Literal',
      value
    }]);
    stagedCount += 1;
  }

  const arbitraryPredicate = /** @type {HTMLInputElement | null} */ (
    ontologyReportContainer?.querySelector(
      `[data-ontology-arbitrary-predicate="${cssEscapeAttr(ontologyIri)}"]`
    )
  );
  const arbitraryObjectType = /** @type {HTMLSelectElement | null} */ (
    ontologyReportContainer?.querySelector(
      `[data-ontology-arbitrary-object-type="${cssEscapeAttr(ontologyIri)}"]`
    )
  );
  const arbitraryObjectValue = /** @type {HTMLInputElement | null} */ (
    ontologyReportContainer?.querySelector(
      `[data-ontology-arbitrary-object-value="${cssEscapeAttr(ontologyIri)}"]`
    )
  );
  const arbitraryObjectLanguage = /** @type {HTMLInputElement | null} */ (
    ontologyReportContainer?.querySelector(
      `[data-ontology-arbitrary-object-language="${cssEscapeAttr(ontologyIri)}"]`
    )
  );
  const arbitraryObjectDatatype = /** @type {HTMLInputElement | null} */ (
    ontologyReportContainer?.querySelector(
      `[data-ontology-arbitrary-object-datatype="${cssEscapeAttr(ontologyIri)}"]`
    )
  );

  if (
    arbitraryPredicate instanceof HTMLInputElement &&
    arbitraryObjectType instanceof HTMLSelectElement &&
    arbitraryObjectValue instanceof HTMLInputElement
  ) {
    const predicateIri = String(arbitraryPredicate.value || '').trim();
    const objectValue = String(arbitraryObjectValue.value || '').trim();
    if (predicateIri && objectValue) {
      stageAssertion(ontologyIri, predicateIri, {
        termType: arbitraryObjectType.value === 'Literal' ? 'Literal' : 'NamedNode',
        value: objectValue,
        ...(arbitraryObjectLanguage?.value?.trim() ? { language: arbitraryObjectLanguage.value.trim() } : {}),
        ...(arbitraryObjectDatatype?.value?.trim() ? { datatypeIri: arbitraryObjectDatatype.value.trim() } : {})
      });
      stagedCount += 1;
    }
  }

  if (!stagedCount) {
    window.alert('No ontology edits were entered to stage.');
    return;
  }

  setStatus(`Staged ${stagedCount} ontology edit(s).`);
  refreshEditAwareViews();
}

/**
 * Builds the edited primary ontology state.
 *
 * @returns {import('./types.js').ParsedOntologyState | null}
 */
function buildEditedPrimaryOntology() {
  if (!activeEditSession?.primaryOntology) {
    return null;
  }

  return {
    ...cloneParsedOntologyState(activeEditSession.primaryOntology),
    store: applyStagedEditsToStore(
      activeEditSession.primaryOntology.store,
      activeEditSession.stagedEdits
    )
  };
}

/**
 * Reruns inspection for the staged editable session.
 *
 * @returns {Promise<void>}
 */
async function rerunEditSessionInspection() {
  if (!activeEditSession?.primaryOntology || !lastManifest) {
    window.alert('Run an inspection from loaded ontology files before rerunning edits.');
    return;
  }

  const editedPrimary = buildEditedPrimaryOntology();
  if (!editedPrimary) {
    return;
  }

  setStatus('Re-running inspection for staged edits...');
  try {
    const mergedStore = buildMergedInspectionStore(
      editedPrimary,
      activeEditSession.supplementalOntologies
    );
    const report = await inspectStore(
      mergedStore,
      activeEditSession.selectedFileName || editedPrimary.fileName,
      lastManifest,
      lastInspectionScope,
      {
        primaryStore: editedPrimary.store,
        onQueryProgress: (progress) => {
          updateQueryProgress(progress);
          setStatus(
            `Re-running inspection for ${progress.fileName}: ${progress.completedQueries} of ${progress.totalQueries} queries complete.`
          );
        }
      }
    );

    activeEditSession.rerunReport = report;
    applyInspectionItemToState(report, lastManifest, true);
    lastOntologyDetail = report.ontologyIri
      ? extractResourceDetail(editedPrimary.store, report.ontologyIri)
      : null;
    renderActiveInspectionViews();
    setStatus('Completed rerun for staged edits.');
  } catch (error) {
    console.error('Error rerunning staged edits:', error);
    setStatus(error instanceof Error ? error.message : 'Error rerunning staged edits.');
  }
}

/**
 * Returns a file extension for one RDF format.
 *
 * @param {string} format
 * @returns {string}
 */
function getFileExtensionForFormat(format) {
  switch (format) {
    case SUPPORTED_RDF_FORMATS.TURTLE:
      return '.ttl';
    case SUPPORTED_RDF_FORMATS.N_TRIPLES:
      return '.nt';
    case SUPPORTED_RDF_FORMATS.N_QUADS:
      return '.nq';
    case SUPPORTED_RDF_FORMATS.TRIG:
      return '.trig';
    case SUPPORTED_RDF_FORMATS.N3:
      return '.n3';
    case SUPPORTED_RDF_FORMATS.JSON_LD:
      return '.jsonld';
    case SUPPORTED_RDF_FORMATS.RDF_XML:
      return '.rdf';
    default:
      return '.ttl';
  }
}

/**
 * Returns a MIME type for one RDF format.
 *
 * @param {string} format
 * @returns {string}
 */
function getMimeTypeForFormat(format) {
  return `${format};charset=utf-8`;
}

/**
 * Exports the edited primary ontology.
 *
 * @returns {Promise<void>}
 */
async function exportEditedOntology() {
  const editedPrimary = buildEditedPrimaryOntology();
  if (!editedPrimary) {
    window.alert('No editable primary ontology is available for export.');
    return;
  }

  const exportFormatSelect = /** @type {HTMLSelectElement | null} */ (
    document.getElementById('editExportFormatSelect')
  );
  const targetFormat = exportFormatSelect?.value || editedPrimary.sourceFormat;

  try {
    const serialized = await exportPrimaryOntology(editedPrimary, /** @type {any} */ (targetFormat));
    const fileStem = safeFilePart(
      editedPrimary.fileName.replace(/\.[^.]+$/, '') || 'ontology'
    ) || 'ontology';
    const fileName = `${fileStem}_edited_${getTimestampForFileName()}${getFileExtensionForFormat(targetFormat)}`;
    downloadTextFile(serialized, fileName, getMimeTypeForFormat(targetFormat));
    setStatus(`Exported edited ontology as ${fileName}.`);
  } catch (error) {
    console.error('Error exporting edited ontology:', error);
    setStatus(error instanceof Error ? error.message : 'Error exporting edited ontology.');
  }
}

/**
 * Loads the selected batch item into the active detail panes.
 *
 * @param {EvaluatedReport} reportObject
 * @returns {void}
 */
function loadBatchSelection(reportObject) {
  applyInspectionItemToState(reportObject, lastManifest, true);
  syncEditSessionForReport(reportObject);
  applyResourceFilters();
}

/**
 * Appends new reports to the cumulative dashboard list.
 *
 * @param {EvaluatedReport[] | null | undefined} reports
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
 * @returns {import('./types.js').ExportState}
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
 * Adds one supplemental ontology assignment for a declared import.
 *
 * @param {string} fileName
 * @param {string} importIri
 * @param {File} file
 * @returns {Promise<void>}
 */
async function assignSupplementalOntologyForImport(fileName, importIri, file) {
  const text = await file.text();
  const parsedOntology = await createParsedOntologyState(text, file.name);
  const summary = buildPreflightSummaryFromStore(parsedOntology.store, file.name);
  const attachmentId = getSupplementalAttachmentId(importIri, file);

  preparedOntologyFiles = preparedOntologyFiles.map((prepared) => {
    if (prepared.summary.fileName !== fileName) {
      return prepared;
    }

    const supplementalOntologies = (prepared.supplementalOntologies || [])
      .filter((item) => item.attachmentId !== attachmentId)
      .concat([{
        attachmentId,
        file,
        importIri,
        parsedOntology,
        summary
      }])
      .sort((left, right) => {
        const importCompare = left.importIri.localeCompare(right.importIri);
        if (importCompare !== 0) {
          return importCompare;
        }
        return left.file.name.localeCompare(right.file.name);
      });

    return {
      ...prepared,
      supplementalOntologies
    };
  });
}

/**
 * Removes one supplemental ontology assignment by attachment id.
 *
 * @param {string} fileName
 * @param {string} attachmentId
 * @returns {void}
 */
function removeSupplementalOntologyForImport(fileName, attachmentId) {
  preparedOntologyFiles = preparedOntologyFiles.map((prepared) => {
    if (prepared.summary.fileName !== fileName) {
      return prepared;
    }

    return {
      ...prepared,
      supplementalOntologies: (prepared.supplementalOntologies || []).filter((item) => item.attachmentId !== attachmentId)
    };
  });
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
    const previousPreparedByFileName = new Map(
      preparedOntologyFiles.map((prepared) => [prepared.summary.fileName, prepared])
    );

    for (const file of files) {
      const text = await file.text();
      const parsedOntology = await createParsedOntologyState(text, file.name);
      const summary = buildPreflightSummaryFromStore(parsedOntology.store, file.name);
      const previousPrepared = previousPreparedByFileName.get(file.name);
      const previousSupplemental = Array.isArray(previousPrepared?.supplementalOntologies)
        ? previousPrepared.supplementalOntologies
        : [];
      const validImports = new Set(summary.imports || []);
      for (const supplemental of previousSupplemental) {
        for (const importIri of supplemental?.summary?.imports || []) {
          if (importIri) {
            validImports.add(importIri);
          }
        }
      }
      nextPreparedFiles.push({
        file,
        summary,
        inspectionScope: {
          includedNamespaces: deriveDefaultIncludedNamespaces(summary)
        },
        parsedOntology,
        supplementalOntologies: previousSupplemental.filter((item) => validImports.has(item.importIri))
      });
    }

    preparedOntologyFiles = nextPreparedFiles;
    preflightCollapsed = false;
    renderPreflightUi();
    updateRunButtonState();
    setStatus(`Analyzed ${preparedOntologyFiles.length} ontology file(s). ${countPreparedSupplementalOntologies()} import closure file(s) are currently attached in preflight. Review namespaces and imports, then run batch checks.`);
  } catch (error) {
    console.error('Error analyzing files:', error);
    clearPreflightState();
    setStatus(error instanceof Error ? `Error: ${error.message}` : 'Error analyzing files.');
  }
}

/** @type {Record<string, DownloadAction>} */
const downloadActions = {
  resultsCsv: {
    label: 'Results CSV',
    isAvailable: () => Array.isArray(lastResults) && lastResults.length > 0,
    build: () => buildResultsCsv(lastResults, lastOntologyReport?.ontologyIri || ''),
    getFileName: () => `ocd-results_${getTimestampForFileName()}.csv`,
    mimeType: 'text/csv;charset=utf-8'
  },
  ontologyYaml: {
    label: 'Ontology Report YAML',
    isAvailable: () => !!lastOntologyReport,
    build: () => buildOntologyReportYaml(lastOntologyReport),
    getFileName: () => `ocd-ontology-report_${getTimestampForFileName()}.yaml`,
    mimeType: 'text/yaml;charset=utf-8'
  },
  htmlReport: {
    label: 'HTML Report',
    isAvailable: () =>
      !!lastOntologyReport || (Array.isArray(lastResults) && lastResults.length > 0),
    build: () => buildHtmlReport(getExportState()),
    getFileName: () => `ocd-report_${getTimestampForFileName()}.html`,
    mimeType: 'text/html;charset=utf-8'
  },
  filteredResourcesCsv: {
    label: 'Filtered Resources CSV',
    isAvailable: () => Array.isArray(lastPerResource) && lastPerResource.length > 0,
    build: () => buildFilteredResourcesCsv(lastPerResource),
    getFileName: () => `ocd-filtered-resources_${getTimestampForFileName()}.csv`,
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
      `ocd-standard-detail_${safeFilePart(lastSelectedCriterionId || 'standard')}_${getTimestampForFileName()}.csv`,
    mimeType: 'text/csv;charset=utf-8'
  },
  batchSummaryCsv: {
    label: 'Batch Summary CSV',
    isAvailable: () => Array.isArray(lastBatchReports) && lastBatchReports.length > 0,
    build: () => buildBatchSummaryCsv(lastBatchReports),
    getFileName: () => `ocd-batch-summary_${getTimestampForFileName()}.csv`,
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
 * @returns {Promise<Manifest>}
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
 * @param {SavedRun | null} run
 * @returns {Promise<void>}
 */
async function hydrateRun(run) {
  if (!run) {
    return;
  }

  await ensureManifestLoaded();
  reportSourceByBatchKey = new Map();
  resetEditSession();
  applyUiStateSnapshot(run.uiState);
  clearStandardSelection();

  /** @type {unknown} */
  const payload = run.payload;

  if (run.kind === 'batch') {
    const batchPayload = Array.isArray(payload)
      ? /** @type {BatchRunPayload} */ (payload)
      : [];

    lastBatchReports = batchPayload;
    selectedBatchKey = run.uiState?.selectedBatchKey || null;
    clearInspectionDataState();
    syncQueryProgressFromReports(lastBatchReports, lastManifest);
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
    ? /** @type {EvaluatedReport} */ (payload)
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
  preflightCollapsed = true;
  renderPreflightUi();

  try {
    const manifest = await ensureManifestLoaded();
    initializeQueryProgress(files, Array.isArray(manifest?.queries) ? manifest.queries.length : 0);
    /** @type {EvaluatedReport[]} */
    const reportsWithScope = [];

    for (const prepared of preparedOntologyFiles) {
      const mergedStore = buildMergedInspectionStore(
        prepared.parsedOntology,
        prepared.supplementalOntologies
      );
      const report = await inspectStore(
        mergedStore,
        prepared.file.name,
        manifest,
        prepared.inspectionScope,
        {
          primaryStore: prepared.parsedOntology.store,
          onQueryProgress: (progress) => {
            updateQueryProgress(progress);
            setStatus(
              `Running inspection for ${progress.fileName}: ${progress.completedQueries} of ${progress.totalQueries} queries complete.`
            );
          }
        }
      );
      reportsWithScope.push(report);
    }
    lastManifest = manifest;
    appendBatchReports(reportsWithScope);
    reportSourceByBatchKey = new Map(reportSourceByBatchKey);
    for (let index = 0; index < reportsWithScope.length; index += 1) {
      const report = reportsWithScope[index];
      const prepared = preparedOntologyFiles[index];
      if (!report || !prepared) {
        continue;
      }

      reportSourceByBatchKey.set(getBatchKey(report), {
        primaryOntology: cloneParsedOntologyState(prepared.parsedOntology),
        supplementalOntologies: prepared.supplementalOntologies.map((item) => ({
          ...item,
          parsedOntology: cloneParsedOntologyState(item.parsedOntology)
        }))
      });
    }
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
  updateCurationFiltersVisibility();
  clearQueryProgress();

  if (curationTableContainer) {
    curationTableContainer.addEventListener('click', (event) => {
      if (!(event.target instanceof Element)) {
        return;
      }

      const stageResourceButton = event.target.closest('button[data-stage-resource-edit]');
      if (stageResourceButton instanceof HTMLButtonElement) {
        const resourceIri = stageResourceButton.getAttribute('data-stage-resource-edit');
        if (resourceIri) {
          stageResourcePanelEdits(resourceIri);
        }
        return;
      }

      const useSuggestedStatusButton = event.target.closest('button[data-apply-suggested-status]');
      if (useSuggestedStatusButton instanceof HTMLButtonElement) {
        const resourceIri = useSuggestedStatusButton.getAttribute('data-apply-suggested-status');
        const suggestedStatus = useSuggestedStatusButton.getAttribute('data-suggested-status') || '';
        if (resourceIri) {
          const select = curationTableContainer.querySelector(
            `[data-resource-status-select="${cssEscapeAttr(resourceIri)}"]`
          );
          if (select instanceof HTMLSelectElement) {
            select.value = suggestedStatus;
          }
        }
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

      toggleResourceDetail(
        resourceIri,
        lastFailuresIndex,
        lastResourceDetails,
        lastPerResource,
        curationTableContainer
      );
    });

    curationTableContainer.addEventListener('change', (event) => {
      if (!(event.target instanceof HTMLInputElement)) {
        return;
      }

      const resourceIri = event.target.getAttribute('data-select-resource');
      if (!resourceIri) {
        return;
      }

      setResourceSelected(resourceIri, event.target.checked);
    });
  }

  if (ontologyReportContainer) {
    ontologyReportContainer.addEventListener('click', (event) => {
      if (!(event.target instanceof Element)) {
        return;
      }

      const stageOntologyButton = event.target.closest('button[data-stage-ontology-edit]');
      if (stageOntologyButton instanceof HTMLButtonElement) {
        const ontologyIri = stageOntologyButton.getAttribute('data-stage-ontology-edit');
        if (ontologyIri) {
          stageOntologyEdits(ontologyIri);
        }
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
      row.classList.add('ocd-row-selected');
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

  if (editSessionContainer) {
    editSessionContainer.addEventListener('click', (event) => {
      if (!(event.target instanceof Element)) {
        return;
      }

      if (event.target.closest('[data-stage-bulk-edit]')) {
        stageBulkEdit();
        return;
      }

      if (event.target.closest('[data-stage-selected-suggested-status]')) {
        stageSuggestedStatusesForSelection();
        return;
      }

      if (event.target.closest('[data-clear-selected-resources]')) {
        activeEditSession.selectedResources = [];
        refreshEditAwareViews();
        return;
      }

      if (event.target.closest('[data-clear-staged-edits]')) {
        activeEditSession.stagedEdits = [];
        activeEditSession.rerunReport = null;
        refreshEditAwareViews();
        return;
      }

      const removeButton = event.target.closest('[data-remove-staged-edit]');
      if (removeButton instanceof HTMLButtonElement) {
        const editId = removeButton.getAttribute('data-remove-staged-edit');
        if (editId) {
          removeStagedEdit(editId);
        }
        return;
      }

      if (event.target.closest('[data-rerun-edits]')) {
        void rerunEditSessionInspection();
        return;
      }

      if (event.target.closest('[data-export-edited-ontology]')) {
        void exportEditedOntology();
      }
    });
  }

  if (filesInput) {
    filesInput.addEventListener('change', () => {
      clearPreflightState();
      clearQueryProgress();
      preflightCollapsed = false;
      reportSourceByBatchKey = new Map();
      resetEditSession();
      setStatus('Selected files changed. Analyze files to review scope before running checks.');
    });
  }

  if (preflightContainer) {
    preflightContainer.addEventListener('change', (event) => {
      if (!(event.target instanceof HTMLInputElement)) {
        return;
      }

      const fileName = event.target.getAttribute('data-scope-file');
      const importIri = event.target.getAttribute('data-import-iri');
      if (fileName && importIri && event.target.type === 'file') {
        const files = Array.from(event.target.files || []);
        if (!files.length) {
          return;
        }

        void (async () => {
          setStatus(`Loading import closure file for ${importIri}...`);
          try {
            for (const file of files) {
              await assignSupplementalOntologyForImport(fileName, importIri, file);
            }
            reportSourceByBatchKey = new Map();
            resetEditSession();
            renderPreflightUi();
            setStatus(`Attached ${files.length} closure file(s) for import ${importIri} in ${fileName}. Run inspection to evaluate with this closure set.`);
          } catch (error) {
            console.error('Error loading import closure file:', error);
            setStatus(error instanceof Error ? `Error: ${error.message}` : 'Error loading import closure file.');
          }
        })();
        return;
      }

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

    preflightContainer.addEventListener('click', (event) => {
      if (!(event.target instanceof Element)) {
        return;
      }

      const removeButton = event.target.closest('[data-remove-import-supplemental]');
      if (!(removeButton instanceof HTMLButtonElement)) {
        return;
      }

      const attachmentId = removeButton.getAttribute('data-remove-import-supplemental');
      const fileName = removeButton.getAttribute('data-scope-file');
      if (!fileName || !attachmentId) {
        return;
      }

      removeSupplementalOntologyForImport(fileName, attachmentId);
      reportSourceByBatchKey = new Map();
      resetEditSession();
      renderPreflightUi();
      setStatus(`Removed one attached import closure file from ${fileName}.`);
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

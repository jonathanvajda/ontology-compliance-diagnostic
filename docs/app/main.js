// app/main.js (ES module)

import { evaluateAllQueries } from './engine.js';
import {
  computePerResourceCuration,
  computeOntologyReport
} from './grader.js';

import { saveRun, listRuns, getRun, deleteRun, getLastRunId } from './storage.js';

// --- DOM elements ---
// Reuse the same input (#ontologyFiles) for both single and batch runs
const filesInput = document.getElementById('ontologyFiles');
const btnRun = document.getElementById('runChecksBtn');
const runBatchBtn = document.getElementById('runBatchBtn');
const downloadActionSelect = document.getElementById('downloadActionSelect');
const downloadSelectedBtn = document.getElementById('downloadSelectedBtn');
const statusEl = document.getElementById('status');
const resourceSearchEl = document.getElementById('resourceSearch');
const curationTableContainer = document.getElementById('curationTableContainer');
const ontologyReportContainer = document.getElementById('ontologyReportContainer');
const requirementDetailContainer = document.getElementById('requirementDetailContainer');
const dashboardContainer = document.getElementById('dashboardContainer');
const savedRunsSelect = document.getElementById('savedRunsSelect');
const loadSavedRunBtn = document.getElementById('loadSavedRunBtn');
const deleteSavedRunBtn = document.getElementById('deleteSavedRunBtn');
const printReportBtn = document.getElementById('printReportBtn');


if (curationTableContainer) {
  curationTableContainer.addEventListener('click', function (event) {
    const btn = event.target.closest('button[data-toggle-resource-detail]');
    if (!btn) return;

    const resourceIri = btn.getAttribute('data-toggle-resource-detail');
    if (!resourceIri) return;

    toggleResourceDetail(resourceIri);
  });
}


let lastManifest = null;
let lastResults = null;
let lastPerResource = null;
let lastFailuresIndex = null; 
let lastOntologyReport = null;
let requirementFilterPopulated = false;  // prevents duplicate option inserts
let ontologyReportEventsWired = false;
let lastBatchReports = null;     // Array of { fileName, ontologyIri, ontologyReport, perResource, results }
let selectedBatchKey = null;     // stable selection key for dashboard rows
let resourceSearchTimer = null;

// Phase 6.2 — saved runs UI
let lastSelectedRequirementId = null;
let lastSelectedRequirementRow = null;

function buildFailuresIndex(results) {
  const byResource = new Map();

  if (!Array.isArray(results)) return byResource;

  for (const row of results) {
    if (!row || row.status !== 'fail') continue;

    const { resource, requirementId, queryId } = row;
    if (!resource || !requirementId || !queryId) continue;

    if (!byResource.has(resource)) byResource.set(resource, new Map());
    const byReq = byResource.get(resource);

    if (!byReq.has(requirementId)) byReq.set(requirementId, new Set());
    byReq.get(requirementId).add(queryId);
  }

  return byResource;
}

function safeIdFromIri(iri) {
  return String(iri || '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 80);
}

if (resourceSearchEl) {
  resourceSearchEl.addEventListener('input', () => {
    if (resourceSearchTimer) clearTimeout(resourceSearchTimer);
    resourceSearchTimer = setTimeout(() => {
      applyResourceFilters();
    }, 150);
  });
}

function cssEscapeAttr(value) {
  return String(value).replace(/"/g, '\\"');
}

let lastPerResourceFull = null; // unfiltered source of truth

const statusFilterEl = document.getElementById('statusFilter');
const requirementFilterEl = document.getElementById('requirementFilter');
const clearFiltersBtn = document.getElementById('clearFiltersBtn');
const curationFiltersSummaryEl = document.getElementById('curationFiltersSummary');

function applyResourceFilters() {
  if (!Array.isArray(lastPerResourceFull)) {
    lastPerResource = [];
    renderCurationTable([]);
    if (curationFiltersSummaryEl) {
      curationFiltersSummaryEl.textContent = 'Showing 0 of 0 resources.';
    }
    return;
  }

  const statusValue = statusFilterEl ? String(statusFilterEl.value || '') : '';
  const requirementValue = requirementFilterEl ? String(requirementFilterEl.value || '') : '';
  const searchValue = (resourceSearchEl ? String(resourceSearchEl.value || '') : '')
    .trim()
    .toLowerCase();

  let filtered = lastPerResourceFull.slice();

  if (statusValue) {
    filtered = filtered.filter(function (r) {
      return String(r?.statusLabel || '') === statusValue;
    });
  }

  if (requirementValue) {
    filtered = filtered.filter(function (r) {
      const fr = Array.isArray(r?.failedRequirements) ? r.failedRequirements : [];
      const frec = Array.isArray(r?.failedRecommendations) ? r.failedRecommendations : [];
      return fr.includes(requirementValue) || frec.includes(requirementValue);
    });
  }

  if (searchValue) {
    filtered = filtered.filter(function (r) {
      return String(r?.resource || '').toLowerCase().includes(searchValue);
    });
  }

  lastPerResource = filtered;

  if (curationFiltersSummaryEl) {
    curationFiltersSummaryEl.textContent =
      'Showing ' + filtered.length + ' of ' + lastPerResourceFull.length + ' resources.';
  }

  renderCurationTable(filtered);

  if (typeof refreshDownloadOptions === 'function') {
    refreshDownloadOptions();
  }
}

function clearResourceFilters() {
  if (statusFilterEl) statusFilterEl.value = '';
  if (requirementFilterEl) requirementFilterEl.value = '';
  if (resourceSearchEl) resourceSearchEl.value = '';

  lastPerResource = Array.isArray(lastPerResourceFull)
    ? lastPerResourceFull.slice()
    : [];

  applyResourceFilters();
}

if (statusFilterEl) statusFilterEl.addEventListener('change', applyResourceFilters);
if (requirementFilterEl) requirementFilterEl.addEventListener('change', applyResourceFilters);
if (clearFiltersBtn) clearFiltersBtn.addEventListener('click', clearResourceFilters);

function ocqGetUiStateSnapshot() {
  return {
    statusFilter: statusFilterEl ? statusFilterEl.value : '',
    requirementFilter: requirementFilterEl ? requirementFilterEl.value : '',
    selectedBatchKey: selectedBatchKey || null,
    selectedRequirementId: lastSelectedRequirementId || null
  };
}

function ocqApplyUiStateSnapshot(state) {
  if (!state) return;

  if (statusFilterEl) statusFilterEl.value = state.statusFilter || '';
  if (requirementFilterEl) requirementFilterEl.value = state.requirementFilter || '';
}

async function ocqHydrateRun(run) {
  if (!run) return;

  await ensureManifestLoaded();

  // Apply stored UI filters first
  ocqApplyUiStateSnapshot(run.uiState);

  // Reset view containers (optional; keeps things tidy)
  // dashboardContainer.innerHTML = '';
  // ontologyReportContainer.innerHTML = '';
  // curationTableContainer.innerHTML = '';
  clearRequirementDetailPanel();

  if (run.kind === 'batch') {
    // payload is batchReports[]
    lastBatchReports = Array.isArray(run.payload) ? run.payload : [];
    selectedBatchKey = run.uiState?.selectedBatchKey || null;

    renderDashboard(lastBatchReports);

    // if we had a selected batch row, load it into panes
    if (selectedBatchKey) {
      const match = lastBatchReports.find(r => getBatchKey(r) === selectedBatchKey);
      if (match) {
        loadBatchSelection(match);
        renderDashboard(lastBatchReports);
      }
    }

    // Now apply filters to whatever is loaded in panes
    applyResourceFilters();

    // restore requirement selection if possible
    const reqId = run.uiState?.selectedRequirementId || null;
    if (reqId && lastOntologyReport?.requirements?.some(r => r.id === reqId)) {
      lastSelectedRequirementId = reqId;
      renderRequirementDetail(reqId);

      const row = ontologyReportContainer?.querySelector(
        'tr[data-requirement-id="' + cssEscapeAttr(reqId) + '"]'
      );
      if (row) {
        row.classList.add('ocq-row-selected');
        lastSelectedRequirementRow = row;
      }
    }

    if (statusEl) statusEl.textContent = `Loaded saved batch run (${run.createdAt}).`;
    refreshDownloadOptions();
    return;
  }

  // single
  const reportObj = run.payload;

  lastResults = reportObj?.results || [];
  lastFailuresIndex = buildFailuresIndex(lastResults);
  lastOntologyReport = reportObj?.ontologyReport || null;
  lastPerResourceFull = reportObj?.perResource || [];
  lastPerResource = reportObj?.perResource || [];
  selectedBatchKey = null;
  lastBatchReports = null;

  renderOntologyReport(lastOntologyReport);
  applyResourceFilters();

  const reqId = run.uiState?.selectedRequirementId || null;
  if (reqId && lastOntologyReport?.requirements?.some(r => r.id === reqId)) {
    lastSelectedRequirementId = reqId;
    renderRequirementDetail(reqId);

    const row = ontologyReportContainer?.querySelector(
      'tr[data-requirement-id="' + cssEscapeAttr(reqId) + '"]'
    );
    if (row) {
      row.classList.add('ocq-row-selected');
      lastSelectedRequirementRow = row;
    }
  }

  if (statusEl) statusEl.textContent = `Loaded saved single run (${run.createdAt}).`;
  refreshDownloadOptions();
}

function ocqFormatRunOption(run) {
  const kind = run.kind === 'batch' ? 'Batch' : 'Single';
  const label = run.label ? ` — ${run.label}` : '';
  return `${kind} — ${run.createdAt}${label}`;
}

async function refreshSavedRunsUi() {
  if (!savedRunsSelect) return;

  const runs = await listRuns(50);

  savedRunsSelect.innerHTML = '<option value="">Saved runs…</option>';
  for (const run of runs) {
    const opt = document.createElement('option');
    opt.value = run.id;
    opt.textContent = ocqFormatRunOption(run);
    savedRunsSelect.appendChild(opt);
  }
}


const appRoot = document.getElementById('appRoot');
const themeToggleBtn = document.getElementById('ocqThemeToggleBtn');

function setTheme(themeClass) {
  if (!appRoot) return;

  appRoot.classList.remove('ocq-theme-light', 'ocq-theme-dark');
  appRoot.classList.add(themeClass);

  localStorage.setItem('ocq-theme', themeClass);
}

function toggleTheme() {
  if (!appRoot) return;

  const isDark = appRoot.classList.contains('ocq-theme-dark');
  setTheme(isDark ? 'ocq-theme-light' : 'ocq-theme-dark');
}

// Init on load
(function initTheme() {
  const saved = localStorage.getItem('ocq-theme');
  if (saved === 'ocq-theme-dark' || saved === 'ocq-theme-light') {
    setTheme(saved);
  }
})();

if (themeToggleBtn) {
  themeToggleBtn.addEventListener('click', toggleTheme);
}


function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Phase 6.1 — stable key for batch row selection
function getBatchKey(item) {
  const fn = item?.fileName ?? '';
  const oi = item?.ontologyIri ?? (item?.ontologyReport?.ontologyIri ?? '');
  return `${fn}::${oi}`;
}

function loadBatchSelection(reportObj) {
  // Assign to existing single-run globals so existing UI works unchanged
  lastResults = reportObj.results || [];
  lastFailuresIndex = buildFailuresIndex(lastResults);

  lastPerResourceFull = reportObj.perResource || [];
  lastPerResource = reportObj.perResource || [];

  lastOntologyReport = reportObj.ontologyReport || null;

  // Ensure the filters are wired to the current manifest (shared)
  if (lastManifest) populateRequirementFilter(lastManifest);

  // Render single-run view panes using existing codepaths
  renderOntologyReport(lastOntologyReport);
  applyResourceFilters(); // will call renderCurationTable(filtered)
}

function onBatchRowSelected(batchKey) {
  if (!Array.isArray(lastBatchReports) || !lastBatchReports.length) return;

  // Toggle-close behavior (click same row again)
  if (selectedBatchKey === batchKey) {
    selectedBatchKey = null;
    renderDashboard(lastBatchReports);
    refreshDownloadOptions();
    return;
  }

  selectedBatchKey = batchKey;

  const reportObj = lastBatchReports.find(r => getBatchKey(r) === batchKey);
  if (!reportObj) return;

  loadBatchSelection(reportObj);
  renderDashboard(lastBatchReports); // keep dashboard visible + highlight selected row

  if (statusEl) {
    statusEl.textContent = `Selected: ${reportObj.fileName}`;
  }
  refreshDownloadOptions();
}

function wireBatchDashboardSelection() {
  if (!dashboardContainer) return;

  // Click selection (event delegation)
  dashboardContainer.addEventListener('click', (event) => {
    const row = event.target.closest('tr[data-batch-key]');
    if (!row) return;
    const key = row.getAttribute('data-batch-key');
    if (!key) return;
    onBatchRowSelected(key);
  });

  // Keyboard selection (Enter / Space)
  dashboardContainer.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const row = event.target.closest('tr[data-batch-key]');
    if (!row) return;
    event.preventDefault();
    const key = row.getAttribute('data-batch-key');
    if (!key) return;
    onBatchRowSelected(key);
  });
}

// Run all queries + grading for a single File object
async function evaluateFile(file) {
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

// ==============================
// Requirement detail: FIXED
// - No inline onclick
// - Delegated close handler wired once (no multiplying listeners)
// - Uses a single clearRequirementDetailPanel() in global scope
// - Close button uses data-requirement-close
// - Escapes rendered values
// - Keeps all content inside .ocq-detail
// ==============================

// Wire-once flag
let requirementDetailEventsWired = false;

/**
 * Clears requirement detail panel + clears any selected requirement row highlight.
 */
function clearRequirementDetailPanel() {
  if (lastSelectedRequirementRow) {
    lastSelectedRequirementRow.classList.remove('ocq-row-selected');
  }
  lastSelectedRequirementRow = null;
  lastSelectedRequirementId = null;

  if (requirementDetailContainer) {
    requirementDetailContainer.innerHTML = '';
  }

  refreshDownloadOptions();
}

/**
 * Wires the close button handler once using event delegation.
 * Call this once during init (top-level), or before first renderRequirementDetail().
 */
function wireRequirementDetailCloseOnce() {
  if (!requirementDetailContainer || requirementDetailEventsWired) return;

  requirementDetailContainer.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-requirement-close]');
    if (!btn) return;
    clearRequirementDetailPanel();
  });

  requirementDetailEventsWired = true;
}

// Call once during startup (safe to call multiple times)
wireRequirementDetailCloseOnce();

/**
 * Renders the requirement detail panel for a selected requirementId.
 */
function renderRequirementDetail(requirementId) {
  // Make sure we have somewhere to render
  if (!requirementDetailContainer) {
    console.warn('requirementDetailContainer element not found.');
    return;
  }

  // Make sure we have data to work with
  if (!lastOntologyReport || !lastResults) {
    console.warn('No ontology report or results available for requirement detail.');
    requirementDetailContainer.innerHTML = '<p>No data available for requirement details.</p>';
    return;
  }

  // 1) Find the requirement object in the ontology-level report
  const req = lastOntologyReport.requirements.find(r => r.id === requirementId);
  if (!req) {
    console.warn('Requirement not found in lastOntologyReport:', requirementId);
    requirementDetailContainer.innerHTML = `<p>No details found for ${escapeHtml(requirementId)}.</p>`;
    return;
  }

  // 2) Compute failing rows for this requirement
  const failingRows = lastResults.filter(
    r => r.requirementId === requirementId && r.status === 'fail'
  );

  const queryIds = Array.from(new Set(failingRows.map(r => r.queryId))).sort();
  const resources = Array.from(new Set(failingRows.map(r => r.resource))).sort();

  // Optional: group by resource → [queryIds]
  const failuresByResource = new Map();
  for (const row of failingRows) {
    if (!failuresByResource.has(row.resource)) {
      failuresByResource.set(row.resource, new Set());
    }
    failuresByResource.get(row.resource).add(row.queryId);
  }

  const entries = Array.from(failuresByResource.entries())
    .map(([resource, qSet]) => ({
      resource,
      queryIds: Array.from(qSet).sort()
    }))
    .sort((a, b) => String(a.resource).localeCompare(String(b.resource)));

  // 3) Render into the detail container (everything inside .ocq-detail)
  let html = '';
  html += '<div class="ocq-detail">';
  html += '  <div class="ocq-detail-header">';
  html += '    <h3 class="ocq-detail-title">Requirement: ' + escapeHtml(req.id) + '</h3>';
  html += '    <button class="ocq-btn" type="button" data-requirement-close>Close</button>';
  html += '  </div>';

  html += '  <div class="ocq-detail-meta">Status: <strong>' + escapeHtml(req.status) + '</strong> (' + escapeHtml(req.type) + ')</div>';
  html += '  <div class="ocq-detail-meta">Failing resources: <strong>' + escapeHtml(resources.length) + '</strong></div>';

  if (queryIds.length) {
    html += '  <div class="ocq-detail-meta">Queries involved: <span class="ocq-mono">' + escapeHtml(queryIds.join(', ')) + '</span></div>';
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

    for (const item of entries) {
      html += '      <tr>';
      html += '        <td class="ocq-table-td ocq-mono">' + escapeHtml(item.resource) + '</td>';
      html += '        <td class="ocq-table-td ocq-mono">' + escapeHtml(item.queryIds.join(', ')) + '</td>';
      html += '      </tr>';
    }

    html += '    </tbody>';
    html += '  </table>';
  }

  html += '</div>';

  requirementDetailContainer.innerHTML = html;
}


function toggleResourceDetail(resourceIri) {
  if (!curationTableContainer) return;

  const detailRow = curationTableContainer.querySelector(
    'tr[data-resource-detail-row="' + cssEscapeAttr(resourceIri) + '"]'
  );
  if (!detailRow) return;

  const isOpen = detailRow.style.display !== 'none';

  if (isOpen) {
    detailRow.style.display = 'none';
    return;
  }

  detailRow.style.display = '';

  const panel = detailRow.querySelector('.ocq-resource-detail');
  if (!panel) return;

  panel.innerHTML = renderResourceFailureDetailHtml(resourceIri);
}

function renderResourceFailureDetailHtml(resourceIri) {
  if (!lastFailuresIndex) {
    return '<div class="ocq-muted">No failure index available.</div>';
  }

  const byReq = lastFailuresIndex.get(resourceIri);
  if (!byReq || byReq.size === 0) {
    return '<div class="ocq-muted">No failing queries for this resource.</div>';
  }

  let html = '';
  html += '<table class="ocq-table" style="margin-top:10px;">';
  html += '<thead class="ocq-table-head"><tr>' +
          '<th class="ocq-table-th">Standardization Code</th>' +
          '<th class="ocq-table-th">Failing query IDs</th>' +
          '</tr></thead><tbody>';

  for (const [reqId, qSet] of byReq.entries()) {
    html +=
      '<tr class="ocq-table-tr">' +
        '<td class="ocq-table-td ocq-mono">' + escapeHtml(reqId) + '</td>' +
        '<td class="ocq-table-td ocq-mono">' +
          escapeHtml(Array.from(qSet).join(', ')) +
        '</td>' +
      '</tr>';
  }

  html += '</tbody></table>';
  return html;
}

function onOntologyReportRowClick(event) {
  const row = event.target.closest('tr[data-requirement-id]');
  if (!row) return;

  const requirementId = row.getAttribute('data-requirement-id');
  if (!requirementId) return;

  // Toggle behavior: same row clicked again
  if (lastSelectedRequirementId === requirementId) {
    row.classList.remove('ocq-row-selected');
    requirementDetailContainer.innerHTML = '';
    lastSelectedRequirementId = null;
    lastSelectedRequirementRow = null;
    refreshDownloadOptions();
    return;
  }

  // Clear previous selection
  if (lastSelectedRequirementRow) {
    lastSelectedRequirementRow.classList.remove('ocq-row-selected');
  }

  // Select new row
  row.classList.add('ocq-row-selected');
  lastSelectedRequirementRow = row;
  lastSelectedRequirementId = requirementId;

  renderRequirementDetail(requirementId);
  refreshDownloadOptions();
}


// --- Dashboard for batch mode ---
function renderDashboard(batchReports) {
  if (!dashboardContainer) return;

  if (!batchReports || !batchReports.length) {
    dashboardContainer.innerHTML = '<p>No ontologies evaluated.</p>';
    return;
  }

  let html = '<h2 class="ocq-title">Ontology dashboard</h2>';
  html += '<table class="ocq-table">';
  html += '<thead class="ocq-table-head"><tr>' +
          '<th class="ocq-table-th">File</th>' +
          '<th class="ocq-table-th">Ontology IRI</th>' +
          '<th class="ocq-table-th">Status</th>' +
          '<th class="ocq-table-th"># Failed Requirements</th>' +
          '<th class="ocq-table-th"># Failed Recommendations</th>' +
          '</tr></thead><tbody>';

  for (const item of batchReports) {
    const report = item.ontologyReport;
    const failedReqs = report.requirements
      .filter(r => r.type === 'requirement' && r.status === 'fail').length;
    const failedRecs = report.requirements
      .filter(r => r.type === 'recommendation' && r.status === 'fail').length;

    const key = getBatchKey(item);
    const isSelected = (selectedBatchKey === key);

    html +=
      '<tr class="ocq-table-tr ocq-row-clickable ocq-batch-row' + (isSelected ? ' ocq-batch-row--selected' : '') + '"' +
          ' tabindex="0"' +
          ' role="button"' +
          ' data-batch-key="' + escapeHtml(key) + '">' +
        `<td class="ocq-table-td ocq-mono">${escapeHtml(item.fileName)}</td>` +
        `<td class="ocq-table-td ocq-mono">${escapeHtml(report.ontologyIri)}</td>` +
        `<td class="ocq-table-td ocq-mono">${escapeHtml(report.statusLabel)}</td>` +
        `<td class="ocq-table-td ocq-mono">${failedReqs}</td>` +
        `<td class="ocq-table-td ocq-mono">${failedRecs}</td>` +
      '</tr>';
  }

  html += '</tbody></table>';
  dashboardContainer.innerHTML = html;
}

// --- Per-resource table ---
function renderCurationTable(perResource) {
  if (!perResource || perResource.length === 0) {
    curationTableContainer.innerHTML = '<p>No curation results to display.</p>';
    return;
  }

  let html = '<h2 class="ocq-title">Per-resource curation</h2>';
  html += '<table class="ocq-table">';
  html += '<thead class="ocq-table-head"><tr>' +
          '<th class="ocq-table-th">Resource</th>' +
          '<th class="ocq-table-th">Suggested Curation Status</th>' +
          '<th class="ocq-table-th">Failed Requirements</th>' +
          '<th class="ocq-table-th">Failed Recommendations</th>' +
          '<th class="ocq-table-th">Details</th>' +
          '</tr></thead><tbody>';

  for (const row of perResource) {
    const reqs = row.failedRequirements.join(', ') || '—';
    const recs = row.failedRecommendations.join(', ') || '—';

    const statusBadgeClass = {
      'uncurated': 'ocq-badge ocq-badge-danger',
      'metadata incomplete': 'ocq-badge ocq-badge-warn',
      'metadata complete': 'ocq-badge ocq-badge-success',
      'pending final vetting': 'ocq-badge ocq-badge-info'
    }[row.statusLabel] || 'ocq-badge';

    html += '<tr>' +
            '<td class="ocq-table-td ocq-mono">' + escapeHtml(row.resource) + '</td>' +
            '<td class="ocq-table-td ocq-mono"><span class="' + statusBadgeClass + '">' + escapeHtml(row.statusLabel) + '</span></td>' +
            '<td class="ocq-table-td ocq-mono">' + escapeHtml(reqs) + '</td>' +
            '<td class="ocq-table-td ocq-mono">' + escapeHtml(recs) + '</td>' +
            '<td class="ocq-table-td ocq-mono">' +
              '<button class="ocq-btn ocq-btn-tertiary ocq-btn-small" ' +
                      'type="button" ' +
                      'data-toggle-resource-detail="' + escapeHtml(row.resource) + '">' +
                'View' +
              '</button>' +
            '</td>' +
          '</tr>';
    html +=
          '<tr class="ocq-table-tr ocq-resource-detail-row" ' +
              'data-resource-detail-row="' + escapeHtml(row.resource) + '" ' +
              'style="display:none;">' +
            '<td class="ocq-table-td" colspan="999">' +
              '<div class="ocq-resource-detail"></div>' +
            '</td>' +
          '</tr>';
  }

  html += '</tbody></table>';
  curationTableContainer.innerHTML = html;
}

// --- Ontology report card ---
function renderOntologyReport(report) {
  if (!report) {
    ontologyReportContainer.innerHTML = '';
    return;
  }

  let html = '<h2 class="ocq-title">Ontology report card</h2>';
  html += '<p><strong>Ontology IRI:</strong> ' + escapeHtml(report.ontologyIri) + '</p>';
  html += '<p><strong>Ontology curation status:</strong> ' + escapeHtml(report.statusLabel) + '</p>';

  if (!report.requirements || report.requirements.length === 0) {
    html += '<p>No requirement entries.</p>';
    ontologyReportContainer.innerHTML = html;
    return;
  }

  html += '<table class="ocq-table">';
  html += '<thead class="ocq-table-head"><tr>' +
          '<th class="ocq-table-th">Standardization Code</th>' +
          '<th class="ocq-table-th">Type</th>' +
          '<th class="ocq-table-th">Status</th>' +
          '<th class="ocq-table-th">Failed Resources</th>' +
          '</tr></thead><tbody>';

  for (const r of report.requirements) {
    const typeLabel = r.type === 'recommendation' ? 'recommendation' : 'requirement';
    const failedCount = r.failedResourcesCount || 0;
    const statusBadgeClass =
    r.status === 'pass'
      ? 'ocq-badge ocq-badge-success'
      : 'ocq-badge ocq-badge-danger';
    html += '<tr class="ocq-table-tr ocq-row-clickable" tabindex="0" data-requirement-id="' + escapeHtml(r.id) + '">' +
      '<td class="ocq-table-td">' + escapeHtml(r.id) + '</td>' +
      '<td class="ocq-table-td">' + escapeHtml(typeLabel) + '</td>' +
      '<td class="ocq-table-td"><span class="' + statusBadgeClass + '">' + escapeHtml(r.status) + '</span></td>' +
      '<td class="ocq-table-td">' + escapeHtml(String(failedCount)) + '</td>' +
      '</tr>';
    }

  html += '</tbody></table>';
  ontologyReportContainer.innerHTML = html;

  // Phase 6.1 — wire listeners once (avoid multiplying handlers on re-render)
  if (!ontologyReportEventsWired) {
    ontologyReportContainer.addEventListener('click', onOntologyReportRowClick);
    ontologyReportContainer.addEventListener('keydown', function (event) {
      if (event.key !== 'Enter' && event.key !== ' ') return;

      const row = event.target.closest('tr[data-requirement-id]');
      if (!row) return;

      event.preventDefault(); // prevent space scroll
      row.click();
    });
    ontologyReportEventsWired = true;
  }
}

// --- Download helpers ---
function downloadTextFile(text, fileName, mimeType) {
  const blob = new Blob([text], { type: mimeType || 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function toCsv(results, ontologyIri) {
  if (!Array.isArray(results) || results.length === 0) {
    return 'ontologyIri,resource,queryId,requirementId,status,severity,scope\n';
  }
  const header = ['ontologyIri', 'resource', 'queryId', 'requirementId', 'status', 'severity', 'scope'];
  const rows = [header.join(',')];

  for (const row of results) {
    const cols = [
      ontologyIri || '',
      row.resource || '',
      row.queryId || '',
      row.requirementId || '',
      row.status || '',
      row.severity || '',
      row.scope || ''
    ].map(v => {
      const s = String(v).replace(/"/g, '""');
      return `"${s}"`;
    });
    rows.push(cols.join(','));
  }
  return rows.join('\n');
}

function ontologyReportToYaml(report) {
  if (!report) return '# No ontology report\n';

  const lines = [];
  lines.push('ontologyIri: "' + String(report.ontologyIri).replace(/"/g, '\\"') + '"');
  lines.push('status: "' + String(report.statusLabel).replace(/"/g, '\\"') + '"');
  lines.push('requirements:');
  for (const r of report.requirements || []) {
    lines.push('  - id: "' + String(r.id).replace(/"/g, '\\"') + '"');
    lines.push('    type: "' + String(r.type).replace(/"/g, '\\"') + '"');
    lines.push('    status: "' + String(r.status).replace(/"/g, '\\"') + '"');
    lines.push('    failedResourcesCount: ' + (r.failedResourcesCount || 0));
  }
  return lines.join('\n') + '\n';
}

// -------------------------------
// Phase 6.3 CSV helpers (no clash)
// -------------------------------

function csvEscape(value) {
  const s = value == null ? '' : String(value);
  const needsWrap = /[",\n\r]/.test(s);
  const escaped = s.replace(/"/g, '""');
  return needsWrap ? `"${escaped}"` : escaped;
}

function rowsToCsv(rows) {
  return rows.map(r => r.map(csvEscape).join(',')).join('\n') + '\n';
}


function handleDownloadSelected() {
  const actionKey = downloadActionSelect.value;
  const action = downloadActions[actionKey];

  if (!action) {
    if (statusEl) statusEl.textContent = 'Choose a download type first.';
    return;
  }

  if (!action.isAvailable()) {
    if (statusEl) statusEl.textContent = `"${action.label}" is not available for the current state.`;
    refreshDownloadOptions();
    return;
  }

  try {
    const content = action.build();
    const fileName = action.getFileName();

    downloadTextFile(content, fileName, action.mimeType);
    if (statusEl) statusEl.textContent = `Downloaded ${action.label}.`;
  } catch (err) {
    console.error(err);
    if (statusEl) statusEl.textContent = err && err.message ? err.message : 'Download failed.';
  }
}

downloadActionSelect.addEventListener('change', function () {
  downloadSelectedBtn.disabled = !downloadActionSelect.value;
});

downloadSelectedBtn.addEventListener('click', handleDownloadSelected);


// -------------------------------
// Export action registry
// -------------------------------

// Assumes these exist somewhere in your state:
// lastResults
// lastPerResource
// lastOntologyReport
// lastSelectedRequirementId
// lastBatchReports

function buildResultsCsv() {
  const ontologyIri = lastOntologyReport?.ontologyIri || '';
  return toCsv(lastResults || [], ontologyIri);
}

const downloadActions = {
  resultsCsv: {
    label: 'Results CSV',
    isAvailable: function () {
      return Array.isArray(lastResults) && lastResults.length > 0;
    },
    build: function () {
      const ontologyIri = lastOntologyReport?.ontologyIri || '';
      return toCsv(lastResults || [], ontologyIri);
    },
    getFileName: function () {
      return `ocq-results_${getTimestampForFileName()}.csv`;
    },
    mimeType: 'text/csv;charset=utf-8'
  },

  ontologyYaml: {
    label: 'Ontology Report YAML',
    isAvailable: function () {
      return !!lastOntologyReport;
    },
    build: function () {
      return ontologyReportToYaml(lastOntologyReport);
    },
    getFileName: function () {
      return `ocq-ontology-report_${getTimestampForFileName()}.yaml`;
    },
    mimeType: 'text/yaml;charset=utf-8'
  },

  htmlReport: {
    label: 'HTML Report',
    isAvailable: function () {
      return !!lastOntologyReport || (Array.isArray(lastResults) && lastResults.length > 0);
    },
    build: function () {
      return buildHtmlReport();
    },
    getFileName: function () {
      return `ocq-report_${getTimestampForFileName()}.html`;
    },
    mimeType: 'text/html;charset=utf-8'
  },

  filteredResourcesCsv: {
    label: 'Filtered Resources CSV',
    isAvailable: function () {
      return Array.isArray(lastPerResource) && lastPerResource.length > 0;
    },
    build: function () {
      return buildFilteredResourcesCsv();
    },
    getFileName: function () {
      return `ocq-filtered-resources_${getTimestampForFileName()}.csv`;
    },
    mimeType: 'text/csv;charset=utf-8'
  },

  requirementDetailCsv: {
    label: 'Requirement Detail CSV',
    isAvailable: function () {
      return !!lastSelectedRequirementId &&
        Array.isArray(lastResults) &&
        lastResults.length > 0;
    },
    build: function () {
      return buildRequirementDetailCsv(lastSelectedRequirementId);
    },
    getFileName: function () {
      const req = safeFilePart(lastSelectedRequirementId || 'requirement');
      return `ocq-requirement-detail_${req}_${getTimestampForFileName()}.csv`;
    },
    mimeType: 'text/csv;charset=utf-8'
  },

  batchSummaryCsv: {
    label: 'Batch Summary CSV',
    isAvailable: function () {
      return Array.isArray(lastBatchReports) && lastBatchReports.length > 0;
    },
    build: function () {
      return buildBatchSummaryCsv(lastBatchReports);
    },
    getFileName: function () {
      return `ocq-batch-summary_${getTimestampForFileName()}.csv`;
    },
    mimeType: 'text/csv;charset=utf-8'
  }
};

function refreshDownloadOptions() {
  const currentValue = downloadActionSelect.value;

  for (const option of downloadActionSelect.options) {
    if (!option.value) continue;

    const action = downloadActions[option.value];
    option.disabled = !action || !action.isAvailable();
  }

  const selectedAction = downloadActions[currentValue];
  const selectedIsValid = !!selectedAction && selectedAction.isAvailable();

  if (!selectedIsValid) {
    downloadActionSelect.value = '';
  }

  downloadSelectedBtn.disabled = !downloadActionSelect.value;
}

function safeFilePart(value) {
  return String(value == null ? '' : value)
    .trim()
    .replace(/[^\w.-]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function getTimestampForFileName() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}_${hh}-${mi}-${ss}`;
}


function buildFilteredResourcesCsv() {
  const data = Array.isArray(lastPerResource) ? lastPerResource : [];

  const rows = [[
    'resource',
    'statusIri',
    'statusLabel',
    'failedRequirementsCount',
    'failedRecommendationsCount',
    'failedRequirements',
    'failedRecommendations'
  ]];

  for (const r of data) {
    const failedReqs = Array.isArray(r.failedRequirements) ? r.failedRequirements : [];
    const failedRecs = Array.isArray(r.failedRecommendations) ? r.failedRecommendations : [];

    rows.push([
      r.resource || '',
      r.statusIri || '',
      r.statusLabel || '',
      String(failedReqs.length),
      String(failedRecs.length),
      failedReqs.join(' | '),
      failedRecs.join(' | ')
    ]);
  }

  return rowsToCsv(rows);
}

function buildRequirementDetailCsv(requirementId) {
  const reqId = requirementId || lastSelectedRequirementId || '';
  if (!reqId) throw new Error('No requirement selected.');
  if (!Array.isArray(lastResults)) throw new Error('No results loaded.');

  const failingRows = lastResults.filter(r => r.requirementId === reqId && r.status === 'fail');

  const failuresByResource = new Map();
  for (const row of failingRows) {
    const res = row.resource || '';
    const qid = row.queryId || '';
    if (!res) continue;

    if (!failuresByResource.has(res)) failuresByResource.set(res, new Set());
    if (qid) failuresByResource.get(res).add(qid);
  }

  const entries = Array.from(failuresByResource.entries())
    .map(([resource, qSet]) => ({ resource, queryIds: Array.from(qSet).sort() }))
    .sort((a, b) => String(a.resource).localeCompare(String(b.resource)));

  const rows = [['requirementId', 'resource', 'queryIds']];

  for (const e of entries) {
    rows.push([reqId, e.resource, e.queryIds.join(' | ')]);
  }

  return rowsToCsv(rows);
}

function buildBatchSummaryCsv(batchReports) {
  const batch = Array.isArray(batchReports)
    ? batchReports
    : (Array.isArray(lastBatchReports) ? lastBatchReports : []);

  if (!batch.length) throw new Error('No batch results available.');

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
    const reqs = Array.isArray(report?.requirements) ? report.requirements : [];

    const failedReqs = reqs.filter(r => r.type === 'requirement' && r.status === 'fail').length;
    const failedRecs = reqs.filter(r => r.type === 'recommendation' && r.status === 'fail').length;

    const totalReqs = reqs.filter(r => r.type === 'requirement').length;
    const totalRecs = reqs.filter(r => r.type === 'recommendation').length;

    rows.push([
      item.fileName || '',
      report?.ontologyIri || '',
      report?.statusIri || '',
      report?.statusLabel || '',
      String(failedReqs),
      String(failedRecs),
      String(totalReqs),
      String(totalRecs)
    ]);
  }

  return rowsToCsv(rows);
}

function isoFileStamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

const downloadHtmlReportBtn = document.getElementById('downloadHtmlReportBtn');

function safeText(v) { return escapeHtml(v == null ? '' : String(v)); }

function buildHtmlReport() {
  const now = new Date();
  const createdAt = now.toISOString();
  const statusFilter = statusFilterEl ? statusFilterEl.value : '';
  const requirementFilter = requirementFilterEl ? requirementFilterEl.value : '';
  const selectedReq = lastSelectedRequirementId || '';

  const report = lastOntologyReport || null;
  const perRes = Array.isArray(lastPerResource) ? lastPerResource : [];
  const resultsCount = Array.isArray(lastResults) ? lastResults.length : 0;

  // If a requirement is selected, reuse the same grouping logic as CSV export
  let reqDetailRows = [];
  if (selectedReq && Array.isArray(lastResults)) {
    const failing = lastResults.filter(r => r.requirementId === selectedReq && r.status === 'fail');
    const map = new Map();
    for (const row of failing) {
      const res = row.resource || '';
      const qid = row.queryId || '';
      if (!res) continue;
      if (!map.has(res)) map.set(res, new Set());
      if (qid) map.get(res).add(qid);
    }
    reqDetailRows = Array.from(map.entries())
      .map(([resource, qSet]) => ({ resource, queryIds: Array.from(qSet).sort() }))
      .sort((a, b) => String(a.resource).localeCompare(String(b.resource)));
  }

  // Minimal inline CSS; does not rely on your app CSS
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

  html += `<h1>Ontology Checks Report</h1>`;
  html += `<div class="meta">Created: <span class="mono">${safeText(createdAt)}</span></div>`;
  html += `<div class="meta">Results rows: <span class="mono">${safeText(resultsCount)}</span></div>`;

  html += `<div class="card">`;
  html += `<h2>View state</h2>`;
  html += `<div class="meta">Curation status filter: <span class="mono">${safeText(statusFilter || 'All')}</span></div>`;
  html += `<div class="meta">Fails requirement/recommendation filter: <span class="mono">${safeText(requirementFilter || 'Any')}</span></div>`;
  html += `<div class="meta">Selected requirement: <span class="mono">${safeText(selectedReq || '(none)')}</span></div>`;
  html += `</div>`;

  // Ontology report card
  html += `<div class="card"><h2>Ontology report</h2>`;
  if (!report) {
    html += `<p>No ontology report loaded.</p>`;
  } else {
    html += `<div class="meta">Ontology IRI: <span class="mono">${safeText(report.ontologyIri || '')}</span></div>`;
    html += `<div class="meta">Overall status: <span class="pill">${safeText(report.statusLabel || '')}</span></div>`;

    const reqs = Array.isArray(report.requirements) ? report.requirements : [];
    html += `<table><thead><tr>
      <th>id</th><th>type</th><th>status</th><th>failedResourcesCount</th>
    </tr></thead><tbody>`;
    for (const r of reqs) {
      html += `<tr>
        <td class="mono">${safeText(r.id)}</td>
        <td>${safeText(r.type)}</td>
        <td>${safeText(r.status)}</td>
        <td class="mono">${safeText(r.failedResourcesCount ?? '')}</td>
      </tr>`;
    }
    html += `</tbody></table>`;
  }
  html += `</div>`;

  // Requirement detail (if selected)
  if (selectedReq) {
    html += `<div class="card"><h2>Requirement detail</h2>`;
    if (!reqDetailRows.length) {
      html += `<p>No failing resources found for selected requirement.</p>`;
    } else {
      html += `<table><thead><tr><th>Resource IRI</th><th>Failing query IDs</th></tr></thead><tbody>`;
      for (const row of reqDetailRows) {
        html += `<tr>
          <td class="mono">${safeText(row.resource)}</td>
          <td class="mono">${safeText(row.queryIds.join(', '))}</td>
        </tr>`;
      }
      html += `</tbody></table>`;
    }
    html += `</div>`;
  }

  // Per-resource curation (filtered)
  html += `<div class="card"><h2>Per-resource curation (filtered)</h2>`;
  html += `<div class="meta">Rows: <span class="mono">${safeText(perRes.length)}</span></div>`;
  if (!perRes.length) {
    html += `<p>No resources in current view.</p>`;
  } else {
    html += `<table><thead><tr>
      <th>resource</th><th>statusLabel</th><th>failedRequirements</th><th>failedRecommendations</th>
    </tr></thead><tbody>`;
    for (const r of perRes) {
      const fr = Array.isArray(r.failedRequirements) ? r.failedRequirements : [];
      const frec = Array.isArray(r.failedRecommendations) ? r.failedRecommendations : [];
      html += `<tr>
        <td class="mono">${safeText(r.resource || '')}</td>
        <td>${safeText(r.statusLabel || '')}</td>
        <td class="mono">${safeText(fr.join(', '))}</td>
        <td class="mono">${safeText(frec.join(', '))}</td>
      </tr>`;
    }
    html += `</tbody></table>`;
  }
  html += `</div>`;

  html += '</body></html>';
  return html;
}

if (downloadHtmlReportBtn) {
  downloadHtmlReportBtn.addEventListener('click', () => {
    try {
      const html = buildHtmlReport();
      downloadTextFile(html, `ocq_report_${isoFileStamp()}.html`, 'text/html');
    } catch (e) {
      console.error(e);
      alert(e.message || String(e));
    }
  });
}


// --- Single-file run ("Run checks") ---
btnRun.addEventListener('click', async () => {
  if (!filesInput) {
    alert('File input #ontologyFiles not found.');
    return;
  }

  const files = Array.from(filesInput.files || []);
  const file = files[0];
  if (!file) {
    alert('Please select an ontology file first.');
    return;
  }

  statusEl.textContent = 'Reading file…';
  curationTableContainer.innerHTML = '';
  ontologyReportContainer.innerHTML = '';
  dashboardContainer.innerHTML = '';

  lastResults = null;
  lastPerResource = null;
  lastOntologyReport = null;

  const text = await file.text();
  statusEl.textContent = 'Running checks…';

  try {
    const { results, resources, ontologyIri } = await evaluateAllQueries(text, file.name);
    const manifest = await ensureManifestLoaded();

    const perResource = computePerResourceCuration(results, manifest, resources);
    const ontologyReport = computeOntologyReport(results, manifest, ontologyIri);

    lastResults = results;
    lastFailuresIndex = buildFailuresIndex(lastResults);
    lastPerResourceFull = perResource; // source of truth for filtering
    lastPerResource = perResource;      // keep if you use it elsewhere
    lastOntologyReport = ontologyReport;
    lastManifest = manifest;

    // Phase 6.2 — persist snapshot to IndexedDB (via storage.js)
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
      uiState: ocqGetUiStateSnapshot()
    });
    await refreshSavedRunsUi();

    populateRequirementFilter(manifest);
    applyResourceFilters(); // renders filtered (initially “all”)

    renderOntologyReport(ontologyReport);
    renderCurationTable(perResource);

    statusEl.textContent =
      `Checks completed. ${results.length} result rows across ${perResource.length} resources.`;
    refreshDownloadOptions();
  } catch (err) {
    console.error('Error running checks:', err);
    statusEl.textContent = 'Error: ' + err.message;
  }
});

// --- Batch run ("Run batch checks") ---
runBatchBtn.addEventListener('click', async () => {
  if (!filesInput) {
    alert('Batch input #ontologyFiles not found in the DOM.');
    return;
  }

  const files = Array.from(filesInput.files || []);
  if (!files.length) {
    alert('Please select one or more ontology files.');
    return;
  }

  statusEl.textContent = 'Running batch checks…';
  curationTableContainer.innerHTML = '';
  ontologyReportContainer.innerHTML = '';
  requirementDetailContainer.innerHTML = '';

  // Ensure manifest exists for filters/drill-down
  await ensureManifestLoaded(); // loads + populateRequirementFilter(lastManifest)

  const batch = [];
  for (const file of files) {
    const report = await evaluateFile(file);
    batch.push(report);
  }

  // Phase 6.1 — store batch results so dashboard can drill-down without re-running
  lastBatchReports = batch;
  selectedBatchKey = null;

  renderDashboard(lastBatchReports);

  // Phase 6.2 — persist batch snapshot to IndexedDB (via storage.js)
  await saveRun({
    kind: 'batch',
    label: `${batch.length} file(s)`,
    payload: lastBatchReports,
    uiState: ocqGetUiStateSnapshot()
  });
  await refreshSavedRunsUi();

  statusEl.textContent = `Completed ${batch.length} ontology checks. Click a row to drill down.`;
  refreshDownloadOptions();
});


async function ensureManifestLoaded() {
  if (lastManifest) return lastManifest;
  const res = await fetch('queries/manifest.json');
  lastManifest = await res.json();
  if (!requirementFilterPopulated) {
    populateRequirementFilter(lastManifest);
    requirementFilterPopulated = true;
  }
  return lastManifest;
}

function populateRequirementFilter(manifest) {
  if (!requirementFilterEl) return;

  // Reset to default
  requirementFilterEl.innerHTML = '<option value="">Any</option>';

  const reqs = Array.isArray(manifest?.requirements) ? manifest.requirements : [];
  for (const req of reqs) {
    if (!req?.id) continue;

    const opt = document.createElement('option');
    opt.value = req.id;

    // Keep label simple and diff-friendly; enrich later if desired
    opt.textContent = req.id + (req.type ? ` (${req.type})` : '');

    requirementFilterEl.appendChild(opt);
  }
}

// Phase 6.1 — enable batch drill-down selection
wireBatchDashboardSelection();

if (printReportBtn) {
  printReportBtn.addEventListener('click', () => window.print());
}

if (loadSavedRunBtn) {
  loadSavedRunBtn.addEventListener('click', async () => {
    const id = savedRunsSelect ? savedRunsSelect.value : '';
    if (!id) {
      alert('Choose a saved run first.');
      return;
    }
    const run = await getRun(id);
    await ocqHydrateRun(run);
  });
}

if (deleteSavedRunBtn) {
  deleteSavedRunBtn.addEventListener('click', async () => {
    const id = savedRunsSelect ? savedRunsSelect.value : '';
    if (!id) {
      alert('Choose a saved run first.');
      return;
    }
    await deleteRun(id);
    await refreshSavedRunsUi();
    if (statusEl) statusEl.textContent = 'Deleted saved run.';
  });
}


// Phase 6.2 — initial load: populate dropdown + restore last run if present
(async function initSavedRuns() {
  await refreshSavedRunsUi();

  const lastId = await getLastRunId();
  if (lastId) {
    const run = await getRun(lastId);
    if (run) {
      await ocqHydrateRun(run);
    }
  }
  refreshDownloadOptions();
})();
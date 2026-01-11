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
const btnCsv = document.getElementById('downloadResultsCsvBtn');
const btnYaml = document.getElementById('downloadOntologyYamlBtn');
const statusEl = document.getElementById('status');
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


let lastResults = null;
let lastPerResource = null;
let lastFailuresIndex = null; 
let lastOntologyReport = null;

let ontologyReportEventsWired = false;
let lastBatchReports = null;     // Array of { fileName, ontologyIri, ontologyReport, perResource, results }
let selectedBatchKey = null;     // stable selection key for dashboard rows

// Phase 6.2 — saved runs UI
let lastSelectedRequirementId = null;
let lastSelectedRequirementRow = null;

async function ensureManifestLoaded() {
  if (lastManifest) return lastManifest;
  const manifestRes = await fetch('queries/manifest.json');
  lastManifest = await manifestRes.json();
  populateRequirementFilter(lastManifest);
  return lastManifest;
}

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

function cssEscapeAttr(value) {
  return String(value).replace(/"/g, '\\"');
}

let lastManifest = null;
let lastPerResourceFull = null; // unfiltered source of truth

const statusFilterEl = document.getElementById('statusFilter');
const requirementFilterEl = document.getElementById('requirementFilter');
const clearFiltersBtn = document.getElementById('clearFiltersBtn');
const curationFiltersSummaryEl = document.getElementById('curationFiltersSummary');

function populateRequirementFilter(manifest) {
  if (!requirementFilterEl) return;

  // Reset to default
  requirementFilterEl.innerHTML = '<option value="">Any</option>';

  if (!manifest || !Array.isArray(manifest.requirements)) return;

  for (const req of manifest.requirements) {
    if (!req || !req.id) continue;

    const opt = document.createElement('option');
    opt.value = req.id;

    // Keep label simple and diff-friendly; you can enrich later
    opt.textContent = req.id + (req.type ? ` (${req.type})` : '');

    requirementFilterEl.appendChild(opt);
  }
}

function applyResourceFilters() {
  if (!lastPerResourceFull) return;

  const statusValue = statusFilterEl ? statusFilterEl.value : '';
  const requirementValue = requirementFilterEl ? requirementFilterEl.value : '';

  let filtered = lastPerResourceFull;

  if (statusValue) {
    filtered = filtered.filter(r => r.statusLabel === statusValue);
  }

  if (requirementValue) {
    filtered = filtered.filter(r => {
      const fr = Array.isArray(r.failedRequirements) ? r.failedRequirements : [];
      const frec = Array.isArray(r.failedRecommendations) ? r.failedRecommendations : [];
      return fr.includes(requirementValue) || frec.includes(requirementValue);
    });
  }

  if (curationFiltersSummaryEl) {
    const total = lastPerResourceFull.length;
    const shown = filtered.length;
    curationFiltersSummaryEl.textContent =
      `Showing ${shown} of ${total} resources.`;
  }

  renderCurationTable(filtered);
}

function clearResourceFilters() {
  if (statusFilterEl) statusFilterEl.value = '';
  if (requirementFilterEl) requirementFilterEl.value = '';
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


function clearRequirementDetailPanel() {
  if (lastSelectedRequirementRow) {
    lastSelectedRequirementRow.classList.remove('ocq-row-selected');
  }
  lastSelectedRequirementRow = null;
  lastSelectedRequirementId = null;

  if (requirementDetailContainer) {
    requirementDetailContainer.innerHTML = '';
  }
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
}

function ocqFormatRunOption(run) {
  const kind = run.kind === 'batch' ? 'Batch' : 'Single';
  const label = run.label ? ` — ${run.label}` : '';
  return `${kind} — ${run.createdAt}${label}`;
}

async function refreshSavedRunsUi() {
  if (!savedRunsSelect) return;

  const runs = await ocqListRuns(50);

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
  const manifestRes = await fetch('queries/manifest.json');
  const manifest = await manifestRes.json();

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
    // Unselect
    row.classList.remove('ocq-row-selected');
    requirementDetailContainer.innerHTML = '';
    lastSelectedRequirementId = null;
    lastSelectedRequirementRow = null;
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
function downloadTextFile(filename, text, mimeType) {
  const blob = new Blob([text], { type: mimeType || 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 0);
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

    const manifestRes = await fetch('queries/manifest.json');
    const manifest = await manifestRes.json();

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
      uiState: getUiStateSnapshot() // or your actual snapshot fn name
    });
    await refreshSavedRunsUi();

    populateRequirementFilter(manifest);
    applyResourceFilters(); // renders filtered (initially “all”)

    renderOntologyReport(ontologyReport);
    renderCurationTable(perResource);

    statusEl.textContent =
      `Checks completed. ${results.length} result rows across ${perResource.length} resources.`;
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
    uiState: getUiStateSnapshot() // or ocqGetUiStateSnapshot() if that's your function name
  });
  await refreshSavedRunsUi();

  statusEl.textContent = `Completed ${batch.length} ontology checks. Click a row to drill down.`;
});

// --- Export buttons (use last single-run results) ---
btnCsv.addEventListener('click', () => {
  if (!lastResults) {
    alert('No results to export yet. Run checks first.');
    return;
  }
  const ontologyIri = lastOntologyReport ? lastOntologyReport.ontologyIri : '';
  const csv = toCsv(lastResults, ontologyIri);
  downloadTextFile('ontology-check-results.csv', csv, 'text/csv');
});

btnYaml.addEventListener('click', () => {
  if (!lastOntologyReport) {
    alert('No ontology report to export yet. Run checks first.');
    return;
  }
  const yaml = ontologyReportToYaml(lastOntologyReport);
  downloadTextFile('ontology-report.yaml', yaml, 'text/yaml');
});

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
    const run = await ocqGetRun(id);
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
    await ocqDeleteRun(id);
    await refreshSavedRunsUi();
    if (statusEl) statusEl.textContent = 'Deleted saved run.';
  });
}


// Phase 6.2 — initial load: populate dropdown + restore last run if present
(async function initSavedRuns() {
  await refreshSavedRunsUi();

  const lastId = await ocqGetLastRunId();
  if (lastId) {
    const run = await ocqGetRun(lastId);
    if (run) {
      await ocqHydrateRun(run);
    }
  }
})();

document.getElementById('statusFilter').addEventListener('change', applyResourceFilters);
document.getElementById('requirementFilter').addEventListener('change', applyResourceFilters);

// app/main.js (ES module)

import { evaluateAllQueries } from './engine.js';
import {
  computePerResourceCuration,
  computeOntologyReport
} from './grader.js';

// --- DOM elements ---
// Reuse the same input (#ontologyFiles) for both single and batch runs
const filesInput = document.getElementById('ontologyFiles');
const btnRun = document.getElementById('runChecksBtn');
const runBatchBtn = document.getElementById('runBatchBtn');
const btnCsv = document.getElementById('downloadResultsCsvBtn');
const btnYaml = document.getElementById('downloadOntologyYamlBtn');
const statusEl = document.getElementById('status');
const tableContainer = document.getElementById('curationTableContainer');
const ontologyReportContainer = document.getElementById('ontologyReportContainer');
const requirementDetailContainer = document.getElementById('requirementDetailContainer');
const dashboardContainer = document.getElementById('dashboardContainer');


let lastResults = null;
let lastPerResource = null;
let lastOntologyReport = null;
let lastManifest = null; // if you want it

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
    requirementDetailContainer.innerHTML = `<p>No details found for ${requirementId}.</p>`;
    return;
  }

  // 2) Compute failing rows for this requirement
  const failingRows = lastResults.filter(
    r => r.requirementId === requirementId && r.status === 'fail'
  );

  const queryIds = Array.from(new Set(failingRows.map(r => r.queryId)));
  const resources = Array.from(new Set(failingRows.map(r => r.resource)));

  // Optional: group by resource → [queryIds]
  const failuresByResource = new Map();
  for (const row of failingRows) {
    if (!failuresByResource.has(row.resource)) {
      failuresByResource.set(row.resource, new Set());
    }
    failuresByResource.get(row.resource).add(row.queryId);
  }

  // Turn Set into arrays for rendering
  const entries = Array.from(failuresByResource.entries()).map(([resource, qSet]) => ({
    resource,
    queryIds: Array.from(qSet)
  }));

  // 3) Render into the detail container 

  function clearRequirementDetail() { // this is called in the table header below
    if (lastSelectedRequirementRow) {
      lastSelectedRequirementRow.classList.remove('ocq-row-selected');
    }
    lastSelectedRequirementRow = null;
    lastSelectedRequirementId = null;
    requirementDetailContainer.innerHTML = '';
  }

  let html = '';
  html += '<div class="ocq-detail">';
    html += '<div class="ocq-detail-header">';
      html += '<h3 class="ocq-detail-title">Requirement: ' + escapeHtml(req.id) + '</h3><button class="ocq-btn" type="button" onclick="clearRequirementDetail()"> Close </button>';
    html += '</div>';
    html += '<div class="ocq-detail-meta">Status: <strong>' + escapeHtml(req.status) + '</strong> (' + escapeHtml(req.type) + ')</div>';
    html += '<div class="ocq-detail-meta">Failing resources: <strong>' + escapeHtml(resources.length) + '</strong></div>';
  html += '</div>';





  if (queryIds.length) {
    html += `<p>Queries involved: ${queryIds.join(', ')}</p>`;
  }

  if (!entries.length) {
    html += `<p>No failing resources found in details.</p>`;
  } else {
    html += `<table border="1" cellspacing="0" cellpadding="4">
      <thead>
        <tr>
          <th>Resource IRI</th>
          <th>Failing query IDs</th>
        </tr>
      </thead>
      <tbody>
    `;

    for (const item of entries) {
      html += `
        <tr>
          <td>${item.resource}</td>
          <td>${item.queryIds.join(', ')}</td>
        </tr>
      `;
    }

    html += `</tbody></table>`;
  }

  requirementDetailContainer.innerHTML = html;
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
  if (!batchReports || !batchReports.length) {
    dashboardContainer.innerHTML = '<p>No ontologies evaluated.</p>';
    return;
  }

  let html = '<h2 class="ocq-title">Ontology dashboard</h2>';
  html += '<table border="1" cellpadding="4" cellspacing="0">';
  html += '<thead><tr>' +
          '<th>File</th>' +
          '<th>Ontology IRI</th>' +
          '<th>Status</th>' +
          '<th># Failed Requirements</th>' +
          '<th># Failed Recommendations</th>' +
          '</tr></thead><tbody>';

  for (const item of batchReports) {
    const report = item.ontologyReport;
    const failedReqs = report.requirements
      .filter(r => r.type === 'requirement' && r.status === 'fail').length;
    const failedRecs = report.requirements
      .filter(r => r.type === 'recommendation' && r.status === 'fail').length;

    html += '<tr>' +
            `<td>${escapeHtml(item.fileName)}</td>` +
            `<td>${escapeHtml(report.ontologyIri)}</td>` +
            `<td>${escapeHtml(report.statusLabel)}</td>` +
            `<td>${failedReqs}</td>` +
            `<td>${failedRecs}</td>` +
            '</tr>';
  }

  html += '</tbody></table>';
  dashboardContainer.innerHTML = html;
}

// --- Per-resource table ---
function renderCurationTable(perResource) {
  if (!perResource || perResource.length === 0) {
    tableContainer.innerHTML = '<p>No curation results to display.</p>';
    return;
  }

  let html = '<h2 class="ocq-title">Per-resource curation</h2>';
  html += '<table border="1" cellpadding="4" cellspacing="0">';
  html += '<thead><tr>' +
          '<th>Resource</th>' +
          '<th>Curation Status</th>' +
          '<th>Failed Requirements</th>' +
          '<th>Failed Recommendations</th>' +
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
            '<td>' + escapeHtml(row.resource) + '</td>' +
            '<td><span class="' + statusBadgeClass + '">' + escapeHtml(row.statusLabel) + '</span></td>' +
            '<td>' + escapeHtml(reqs) + '</td>' +
            '<td>' + escapeHtml(recs) + '</td>' +
            '</tr>';
  }

  html += '</tbody></table>';
  tableContainer.innerHTML = html;
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
          '<th class="ocq-table-th">Requirement ID</th>' +
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
  // after innerHTML assignment:
  ontologyReportContainer.addEventListener('click', onOntologyReportRowClick);
  ontologyReportContainer.addEventListener('keydown', function (event) {
    if (event.key !== 'Enter' && event.key !== ' ') return;

    const row = event.target.closest('tr[data-requirement-id]');
    if (!row) return;

    event.preventDefault(); // prevent space scroll
    row.click();
  });

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
  tableContainer.innerHTML = '';
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
    lastPerResource = perResource;
    lastOntologyReport = ontologyReport;

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
  tableContainer.innerHTML = '';
  ontologyReportContainer.innerHTML = '';

  const batch = [];
  for (const file of files) {
    const report = await evaluateFile(file);
    batch.push(report);
  }

  renderDashboard(batch);
  statusEl.textContent = `Completed ${batch.length} ontology checks.`;
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

function populateRequirementFilter(manifest) {
  const select = document.getElementById('requirementFilter');
  manifest.requirements.forEach(req => {
    const opt = document.createElement('option');
    opt.value = req.id;
    opt.textContent = req.id; // or `${req.id} (${req.type})`
    select.appendChild(opt);
  });
}

function applyResourceFilters() {
  if (!lastPerResource) return;
  const statusValue = document.getElementById('statusFilter').value;
  const reqValue = document.getElementById('requirementFilter').value;

  let filtered = lastPerResource;

  if (statusValue) {
    filtered = filtered.filter(row => row.statusLabel === statusValue);
  }

  if (reqValue) {
    filtered = filtered.filter(row => {
      // row.failedRequirements and row.failedRecommendations are arrays of IDs
      return row.failedRequirements.includes(reqValue) ||
             row.failedRecommendations.includes(reqValue);
    });
  }

  renderCurationTable(filtered);
}

document.getElementById('statusFilter').addEventListener('change', applyResourceFilters);
document.getElementById('requirementFilter').addEventListener('change', applyResourceFilters);

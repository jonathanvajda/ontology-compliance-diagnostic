// app/measures-main.js
// @ts-check

import {
  buildPreflightSummaryFromStore,
  extractExternalIriDependencies,
  extractOntologyMetadata
} from './engine.js';
import { computeBasicMeasures } from './measures-model.js';
import {
  buildMergedInspectionStore,
  createParsedOntologyState
} from './edit-session.js';
import {
  buildAllMeasuresCsv,
  buildAllMeasuresHtml,
  buildAllMeasuresJson,
  buildAllMeasuresTsv,
  buildAllMeasuresYaml,
  buildExternalDependenciesSeedText,
  deriveImportCandidates,
  buildMeasuresCsv,
  buildMeasuresHtml,
  buildMeasuresJson,
  buildMeasuresTsv,
  buildMeasuresYaml
} from './measures-export.js';
import { downloadTextFile } from './report-export.js';
import {
  renderImportSnippetModal,
  renderMeasuresResults,
  renderMeasuresRoadmap
} from './render-measures.js';
import { cssEscapeAttr, escapeHtml, getTimestampForFileName, safeFilePart } from './shared.js';

/** @typedef {import('./types.js').ExternalIriDependency} ExternalIriDependency */
/** @typedef {import('./types.js').PreparedOntologyFile} PreparedOntologyFile */
/** @typedef {import('./types.js').SupplementalOntologyFile} SupplementalOntologyFile */

/**
 * @typedef {Object} MeasuresAnalysis
 * @property {string} analysisKey
 * @property {string} fileName
 * @property {string} ontologyIri
 * @property {string | null} title
 * @property {import('./types.js').OntologyMetadata} metadata
 * @property {import('./measures-model.js').MeasureMetric[]} metrics
 * @property {ExternalIriDependency[]} externalIriDependencies
 * @property {number} attachedClosureCount
 * @property {number} knownImportCount
 */

/** @type {HTMLInputElement | null} */
const filesInput = /** @type {HTMLInputElement | null} */ (document.getElementById('ontologyFiles'));
/** @type {HTMLButtonElement | null} */
const loadFilesButton = /** @type {HTMLButtonElement | null} */ (document.getElementById('loadFilesForMeasuresBtn'));
/** @type {HTMLButtonElement | null} */
const runMeasuresButton = /** @type {HTMLButtonElement | null} */ (document.getElementById('runMeasuresBtn'));
/** @type {HTMLSelectElement | null} */
const exportAllMeasuresFormatSelect = /** @type {HTMLSelectElement | null} */ (document.getElementById('exportAllMeasuresFormat'));
/** @type {HTMLButtonElement | null} */
const exportAllMeasuresButton = /** @type {HTMLButtonElement | null} */ (document.getElementById('exportAllMeasuresBtn'));
/** @type {HTMLButtonElement | null} */
const openMeasuresRoadmapButton = /** @type {HTMLButtonElement | null} */ (document.getElementById('openMeasuresRoadmapBtn'));
/** @type {HTMLElement | null} */
const statusElement = document.getElementById('status');
/** @type {HTMLElement | null} */
const preflightContainer = document.getElementById('preflightContainer');
/** @type {HTMLElement | null} */
const measuresResultsContainer = document.getElementById('measuresResultsContainer');
/** @type {HTMLElement | null} */
const measuresRoadmapModal = document.getElementById('measuresRoadmapContainer');
/** @type {HTMLElement | null} */
const importSnippetModal = document.getElementById('importSnippetModal');

const SUPPLEMENTAL_IMPORT_ACCEPT_ATTR = '.ttl,.turtle,.rdf,.owl,.xml,.nt,.ntriples,.nq,.trig,.n3,.jsonld,.json-ld';

/** @type {PreparedOntologyFile[]} */
let preparedOntologyFiles = [];
/** @type {MeasuresAnalysis[]} */
let lastAnalyses = [];
/** @type {boolean} */
let preflightCollapsed = false;
/** @type {'all' | 'direct' | 'approximate' | 'heuristic'} */
let activeConfidenceFilter = 'all';
/** @type {'metrics' | 'dependencies'} */
let activeAnalysisTab = 'metrics';
/** @type {'iri' | 'curated_in'} */
let activeDependencySort = 'iri';
/** @type {'rdfxml' | 'ttl' | 'ntriples' | 'jsonld'} */
let activeImportSnippetFormat = 'ttl';
/** @type {{ analysisKey: string, targetLabel: string, targets: string[] } | null} */
let activeImportSnippetRequest = null;
/** @type {WeakMap<HTMLElement, Element | null>} */
const modalReturnFocusMap = new WeakMap();

/**
 * Sets the status message.
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
 * Opens one lightweight modal container.
 *
 * @param {HTMLElement | null} container
 * @returns {void}
 */
function openModal(container) {
  if (!container) {
    return;
  }
  modalReturnFocusMap.set(container, document.activeElement instanceof Element ? document.activeElement : null);
  container.inert = false;
  container.classList.add('ocd-modal-open');
  container.setAttribute('aria-hidden', 'false');
  const closeButton = container.querySelector('.ocd-modal-close');
  if (closeButton instanceof HTMLElement) {
    closeButton.focus();
  }
}

/**
 * Closes one lightweight modal container.
 *
 * @param {HTMLElement | null} container
 * @returns {void}
 */
function closeModal(container) {
  if (!container) {
    return;
  }
  const activeElement = document.activeElement;
  if (activeElement instanceof HTMLElement && container.contains(activeElement)) {
    activeElement.blur();
  }
  container.classList.remove('ocd-modal-open');
  container.setAttribute('aria-hidden', 'true');
  container.inert = true;
  const returnFocus = modalReturnFocusMap.get(container);
  if (returnFocus instanceof HTMLElement) {
    returnFocus.focus();
  }
}

/**
 * Renders the import snippet modal from current state.
 *
 * @returns {void}
 */
function refreshImportSnippetModal() {
  if (!activeImportSnippetRequest || !importSnippetModal) {
    return;
  }

  const analysis = lastAnalyses.find((item) => item.analysisKey === activeImportSnippetRequest?.analysisKey);
  renderImportSnippetModal({
    analysisTitle: analysis ? `${analysis.fileName} import snippet` : 'Import snippet',
    ontologyIri: analysis?.ontologyIri || 'urn:ontology:unknown',
    targetLabel: activeImportSnippetRequest.targetLabel,
    targets: activeImportSnippetRequest.targets,
    format: activeImportSnippetFormat
  }, importSnippetModal);
}

/**
 * Returns true when current selected files match the prepared state.
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
 * Updates the analyze button state.
 *
 * @returns {void}
 */
function updateRunButtonState() {
  if (runMeasuresButton) {
    const isReady = preparedOntologyFiles.length > 0;
    runMeasuresButton.disabled = !isReady;
    runMeasuresButton.classList.toggle('ocd-btn-primary', isReady);
    runMeasuresButton.classList.toggle('ocd-btn-secondary', !isReady);
  }

  if (exportAllMeasuresButton) {
    exportAllMeasuresButton.disabled = !lastAnalyses.length;
  }
}

/**
 * Returns direct and transitive import IRIs known for one prepared ontology.
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
 * Returns assigned supplemental ontologies for a declared import on one file.
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
 * Renders the preflight UI for measures.
 *
 * @returns {void}
 */
function renderPreflightUi() {
  if (!preflightContainer) {
    return;
  }

  if (!preparedOntologyFiles.length) {
    preflightContainer.innerHTML = '<p class="ocd-muted ocd-inline-preflight-empty">Load ontology files to inspect declared imports and attach local closure files before running external dependency discovery.</p>';
    return;
  }

  let html = '<details class="ocd-preflight-shell"' + (preflightCollapsed ? '' : ' open') + '>';
  html += '<summary class="ocd-preflight-summary">';
  html += '<span class="ocd-title">Measures staging</span>';
  html += `<span class="ocd-muted">${escapeHtml(`${preparedOntologyFiles.length} file(s) ready`)}</span>`;
  html += '</summary>';
  html += '<p class="ocd-muted">Basic measures are computed from the inspected ontology itself. External dependency discovery additionally looks in attached import closure files for labels and curated-in annotations. Attach local ontology files for declared imports when you want richer enrichment.</p>';
  html += '<div class="ocd-preflight-list">';

  for (const prepared of preparedOntologyFiles) {
    const summary = prepared.summary;
    const { allImports, transitiveImports } = getKnownImportTargets(prepared);

    html += '<div class="ocd-preflight-card">';
    html += '<div class="ocd-preflight-header">';
    html += `<h3 class="ocd-preflight-title">${escapeHtml(summary.fileName)}</h3>`;
    html += `<span class="ocd-chip">${escapeHtml(String(summary.metadata?.tripleCount || 0))} triples</span>`;
    html += '</div>';
    html += '<div class="ocd-preflight-grid">';
    html += '<div class="ocd-preflight-block">';
    html += '<strong>Ontology</strong>';
    html += `<div class="ocd-table-meta ocd-mono">${escapeHtml(summary.ontologyIri || 'urn:ontology:unknown')}</div>`;
    html += `<div class="ocd-table-meta">Title: ${escapeHtml(summary.metadata?.title || 'Not found')}</div>`;
    html += `<div class="ocd-table-meta">Version IRI: ${escapeHtml(summary.metadata?.versionIri || 'Not found')}</div>`;
    html += '</div>';
    html += '<div class="ocd-preflight-block">';
    html += '<strong>Imports and closure files</strong>';

    if (allImports.length) {
      html += '<div class="ocd-preflight-import-list">';
      for (const importIri of allImports) {
        const supplementalFiles = findSupplementalOntologiesForImport(summary.fileName, importIri);
        const importSources = getImportSourceFileNames(prepared, importIri);
        const inputId = `measure-import-file-${encodeURIComponent(summary.fileName)}-${encodeURIComponent(importIri)}`;
        html += '<div class="ocd-preflight-import-row">';
        html += `<div class="ocd-table-meta ocd-mono">${escapeHtml(importIri)}</div>`;
        if (transitiveImports.includes(importIri) && importSources.length) {
          html += '<div class="ocd-table-meta">Also declared by attached closure file(s): ' + escapeHtml(importSources.join(', ')) + '</div>';
        }
        html += `<label class="ocd-label" for="${escapeHtml(inputId)}">Attach ontology file(s) for this import</label>`;
        html += '<input class="ocd-input ocd-input-file" type="file" multiple accept="' + escapeHtml(SUPPLEMENTAL_IMPORT_ACCEPT_ATTR) + '" id="' + escapeHtml(inputId) + '" data-measures-file="' + escapeHtml(summary.fileName) + '" data-import-iri="' + escapeHtml(importIri) + '" />';
        if (supplementalFiles.length) {
          html += '<div class="ocd-table-meta">Attached closure files:</div>';
          html += '<div class="ocd-preflight-import-attachment-list">';
          for (const supplemental of supplementalFiles) {
            html += '<div class="ocd-preflight-import-attachment">';
            html += 'Using <span class="ocd-mono">' + escapeHtml(supplemental.file.name) + '</span>';
            if (supplemental.summary?.ontologyIri && supplemental.summary.ontologyIri !== importIri) {
              html += ' <span class="ocd-muted">(parsed ontology IRI: ' + escapeHtml(supplemental.summary.ontologyIri) + ')</span>';
            }
            html += '<button class="ocd-btn ocd-btn-tertiary ocd-btn-small" type="button" data-measures-file="' + escapeHtml(summary.fileName) + '" data-remove-import-supplemental="' + escapeHtml(supplemental.attachmentId) + '">Remove</button>';
            html += '</div>';
          }
          html += '</div>';
        }
        html += '</div>';
      }
      html += '</div>';
    } else {
      html += '<div class="ocd-table-meta">None found. This first scaffold depends only on the primary ontology unless you attach import closure files.</div>';
    }

    html += '</div>';
    html += '</div>';
    html += '</div>';
  }

  html += '</div>';
  html += '</details>';
  preflightContainer.innerHTML = html;
}

/**
 * Clears prepared state and result rendering.
 *
 * @returns {void}
 */
function clearPreparedState() {
  preparedOntologyFiles = [];
  lastAnalyses = [];
  preflightCollapsed = false;
  activeConfidenceFilter = 'all';
  activeAnalysisTab = 'metrics';
  activeDependencySort = 'iri';
  activeImportSnippetFormat = 'ttl';
  activeImportSnippetRequest = null;
  closeModal(importSnippetModal);
  renderPreflightUi();
  renderMeasuresResults([], activeConfidenceFilter, activeAnalysisTab, activeDependencySort);
  updateRunButtonState();
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
  const prepared = preparedOntologyFiles.find((item) => item.summary.fileName === fileName);

  if (!prepared) {
    throw new Error(`Could not find prepared ontology for ${fileName}.`);
  }

  prepared.supplementalOntologies.push({
    attachmentId: getSupplementalAttachmentId(importIri, file),
    file,
    importIri,
    parsedOntology,
    summary
  });
}

/**
 * Removes one supplemental ontology attachment.
 *
 * @param {string} fileName
 * @param {string} attachmentId
 * @returns {void}
 */
function removeSupplementalOntologyForImport(fileName, attachmentId) {
  const prepared = preparedOntologyFiles.find((item) => item.summary.fileName === fileName);
  if (!prepared) {
    return;
  }

  prepared.supplementalOntologies = (prepared.supplementalOntologies || []).filter(
    (item) => item.attachmentId !== attachmentId
  );
}

/**
 * Loads and parses the selected files into preflight state.
 *
 * @returns {Promise<void>}
 */
async function analyzeSelectedFiles() {
  if (!filesInput) {
    return;
  }

  const files = Array.from(filesInput.files || []);
  if (!files.length) {
    window.alert('Please select one or more ontology files.');
    return;
  }

  setStatus('Loading ontology files for measures...');

  try {
    const previousPreparedByFileName = new Map(
      preparedOntologyFiles.map((item) => [item.summary.fileName, item])
    );
    /** @type {PreparedOntologyFile[]} */
    const nextPreparedFiles = [];

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
        inspectionScope: { includedNamespaces: [] },
        parsedOntology,
        supplementalOntologies: previousSupplemental.filter((item) => validImports.has(item.importIri))
      });
    }

    preparedOntologyFiles = nextPreparedFiles;
    lastAnalyses = [];
    preflightCollapsed = false;
    activeConfidenceFilter = 'all';
    activeAnalysisTab = 'metrics';
    activeDependencySort = 'iri';
    activeImportSnippetFormat = 'ttl';
    activeImportSnippetRequest = null;
    closeModal(importSnippetModal);
    renderPreflightUi();
    renderMeasuresResults([], activeConfidenceFilter, activeAnalysisTab, activeDependencySort);
    updateRunButtonState();
    setStatus(`Loaded ${preparedOntologyFiles.length} ontology file(s) for measures. Attach import closure files if you want richer dependency labels and curated-in values, then run measures.`);
  } catch (error) {
    console.error('Error loading ontology files for measures:', error);
    clearPreparedState();
    setStatus(error instanceof Error ? `Error: ${error.message}` : 'Error loading ontology files for measures.');
  }
}

/**
 * Runs basic measures and dependency discovery over the prepared files.
 *
 * @returns {Promise<void>}
 */
async function runMeasuresAnalysis() {
  if (!hasPreparedFilesForCurrentSelection()) {
    window.alert('Load the selected files first so the import closure staging state is current.');
    return;
  }

  setStatus('Running ontology measures...');
  preflightCollapsed = true;
  renderPreflightUi();

  try {
    lastAnalyses = preparedOntologyFiles.map((prepared) => {
      const mergedStore = buildMergedInspectionStore(
        prepared.parsedOntology,
        prepared.supplementalOntologies
      );
      const metadata = extractOntologyMetadata(prepared.parsedOntology.store, prepared.file.name);
      const externalIriDependencies = extractExternalIriDependencies(
        prepared.parsedOntology.store,
        mergedStore
      );
      const metrics = computeBasicMeasures(prepared.parsedOntology.store, {
        sourceFormat: prepared.parsedOntology.sourceFormat,
        externalDependencyCount: externalIriDependencies.length
      });

      return {
        analysisKey: prepared.file.name,
        fileName: prepared.file.name,
        ontologyIri: metadata.ontologyIri,
        title: metadata.title,
        metadata: {
          ...metadata,
          externalIriDependencies
        },
        metrics,
        externalIriDependencies,
        attachedClosureCount: Array.isArray(prepared.supplementalOntologies)
          ? prepared.supplementalOntologies.length
          : 0,
        knownImportCount: getKnownImportTargets(prepared).allImports.length
      };
    });

    renderMeasuresResults(
      lastAnalyses,
      activeConfidenceFilter,
      activeAnalysisTab,
      activeDependencySort,
      measuresResultsContainer
    );
    updateRunButtonState();
    setStatus(`Finished ontology measures for ${lastAnalyses.length} ontology file(s).`);
  } catch (error) {
    console.error('Error running measures analysis:', error);
    setStatus(error instanceof Error ? `Error: ${error.message}` : 'Error running measures analysis.');
  }
}

/**
 * Downloads one analysis seed file.
 *
 * @param {string} analysisKey
 * @returns {void}
 */
function downloadSeedForAnalysis(analysisKey) {
  const analysis = lastAnalyses.find((item) => item.analysisKey === analysisKey);
  if (!analysis) {
    setStatus('Could not find that analysis result.');
    return;
  }

  const fileStem = safeFilePart(
    (analysis.fileName || 'ontology').replace(/\.[^.]+$/, '')
  ) || 'ontology';

  downloadTextFile(
    buildExternalDependenciesSeedText(analysis.externalIriDependencies, activeDependencySort),
    `${fileStem}_ontology-slim-seed_${getTimestampForFileName()}.txt`,
    'text/plain;charset=utf-8'
  );
  setStatus(`Downloaded seed file for ${analysis.fileName}.`);
}

/**
 * Downloads ontology measures in one selected format.
 *
 * @param {string} analysisKey
 * @returns {void}
 */
function downloadMeasuresForAnalysis(analysisKey) {
  const analysis = lastAnalyses.find((item) => item.analysisKey === analysisKey);
  if (!analysis) {
    setStatus('Could not find that analysis result.');
    return;
  }

  const select = /** @type {HTMLSelectElement | null} */ (
    measuresResultsContainer?.querySelector(`[data-measures-export-format="${cssEscapeAttr(analysisKey)}"]`)
  );
  const format = select?.value || 'csv';
  const fileStem = safeFilePart(
    (analysis.fileName || 'ontology').replace(/\.[^.]+$/, '')
  ) || 'ontology';

  /** @type {{ text: string, fileName: string, mimeType: string }} */
  let exportPayload;
  switch (format) {
    case 'tsv':
      exportPayload = {
        text: buildMeasuresTsv(analysis.metrics),
        fileName: `${fileStem}_measures_${getTimestampForFileName()}.tsv`,
        mimeType: 'text/tab-separated-values;charset=utf-8'
      };
      break;
    case 'json':
      exportPayload = {
        text: buildMeasuresJson(analysis.metrics),
        fileName: `${fileStem}_measures_${getTimestampForFileName()}.json`,
        mimeType: 'application/json;charset=utf-8'
      };
      break;
    case 'yaml':
      exportPayload = {
        text: buildMeasuresYaml(analysis.metrics),
        fileName: `${fileStem}_measures_${getTimestampForFileName()}.yaml`,
        mimeType: 'text/yaml;charset=utf-8'
      };
      break;
    case 'html':
      exportPayload = {
        text: buildMeasuresHtml(`${analysis.fileName} ontology measures`, analysis.metrics),
        fileName: `${fileStem}_measures_${getTimestampForFileName()}.html`,
        mimeType: 'text/html;charset=utf-8'
      };
      break;
    case 'csv':
    default:
      exportPayload = {
        text: buildMeasuresCsv(analysis.metrics),
        fileName: `${fileStem}_measures_${getTimestampForFileName()}.csv`,
        mimeType: 'text/csv;charset=utf-8'
      };
      break;
  }

  downloadTextFile(exportPayload.text, exportPayload.fileName, exportPayload.mimeType);
  setStatus(`Downloaded ${format.toUpperCase()} measures export for ${analysis.fileName}.`);
}

/**
 * Downloads all current ontology analyses in one selected format.
 *
 * @returns {void}
 */
function downloadAllAnalyses() {
  if (!lastAnalyses.length) {
    setStatus('Run ontology measures before exporting all analyses.');
    return;
  }

  const format = exportAllMeasuresFormatSelect?.value || 'csv';
  const exportableAnalyses = lastAnalyses.map((analysis) => ({
    fileName: analysis.fileName,
    ontologyIri: analysis.ontologyIri,
    metrics: analysis.metrics
  }));

  /** @type {{ text: string, fileName: string, mimeType: string }} */
  let exportPayload;
  switch (format) {
    case 'tsv':
      exportPayload = {
        text: buildAllMeasuresTsv(exportableAnalyses),
        fileName: `ontology-measures_all_${getTimestampForFileName()}.tsv`,
        mimeType: 'text/tab-separated-values;charset=utf-8'
      };
      break;
    case 'json':
      exportPayload = {
        text: buildAllMeasuresJson(exportableAnalyses),
        fileName: `ontology-measures_all_${getTimestampForFileName()}.json`,
        mimeType: 'application/json;charset=utf-8'
      };
      break;
    case 'yaml':
      exportPayload = {
        text: buildAllMeasuresYaml(exportableAnalyses),
        fileName: `ontology-measures_all_${getTimestampForFileName()}.yaml`,
        mimeType: 'text/yaml;charset=utf-8'
      };
      break;
    case 'html':
      exportPayload = {
        text: buildAllMeasuresHtml('Ontology measures', exportableAnalyses),
        fileName: `ontology-measures_all_${getTimestampForFileName()}.html`,
        mimeType: 'text/html;charset=utf-8'
      };
      break;
    case 'csv':
    default:
      exportPayload = {
        text: buildAllMeasuresCsv(exportableAnalyses),
        fileName: `ontology-measures_all_${getTimestampForFileName()}.csv`,
        mimeType: 'text/csv;charset=utf-8'
      };
      break;
  }

  downloadTextFile(exportPayload.text, exportPayload.fileName, exportPayload.mimeType);
  setStatus(`Downloaded ${format.toUpperCase()} export for ${lastAnalyses.length} ontology analyses.`);
}

/**
 * Initializes the ontology measures page.
 *
 * @returns {void}
 */
function initializeApp() {
  renderPreflightUi();
  renderMeasuresResults([], activeConfidenceFilter, activeAnalysisTab, activeDependencySort);
  renderMeasuresRoadmap();
  updateRunButtonState();

  if (filesInput) {
    filesInput.addEventListener('change', () => {
      clearPreparedState();
      setStatus('Selected files changed. Load files to inspect imports before running measures.');
    });
  }

  if (loadFilesButton) {
    loadFilesButton.addEventListener('click', () => {
      void analyzeSelectedFiles();
    });
  }

  if (runMeasuresButton) {
    runMeasuresButton.disabled = true;
    runMeasuresButton.addEventListener('click', () => {
      void runMeasuresAnalysis();
    });
  }

  if (exportAllMeasuresButton) {
    exportAllMeasuresButton.disabled = true;
    exportAllMeasuresButton.addEventListener('click', downloadAllAnalyses);
  }

  if (openMeasuresRoadmapButton) {
    openMeasuresRoadmapButton.addEventListener('click', () => {
      openModal(measuresRoadmapModal);
    });
  }

  if (measuresRoadmapModal) {
    measuresRoadmapModal.inert = true;
  }

  if (importSnippetModal) {
    importSnippetModal.inert = true;
  }

  if (measuresRoadmapModal) {
    measuresRoadmapModal.addEventListener('click', (event) => {
      if (!(event.target instanceof Element)) {
        return;
      }
      const closeButton = event.target.closest('[data-close-modal="measuresRoadmapModal"]');
      if (closeButton || event.target === measuresRoadmapModal) {
        closeModal(measuresRoadmapModal);
      }
    });
  }

  if (importSnippetModal) {
    importSnippetModal.addEventListener('click', (event) => {
      if (!(event.target instanceof Element)) {
        return;
      }
      const closeButton = event.target.closest('[data-close-modal="importSnippetModal"]');
      if (closeButton || event.target === importSnippetModal) {
        closeModal(importSnippetModal);
      }
    });

    importSnippetModal.addEventListener('change', (event) => {
      if (!(event.target instanceof HTMLSelectElement)) {
        return;
      }
      if (event.target.id !== 'importSnippetModalFormat') {
        return;
      }
      const nextValue = event.target.value;
      if (
        nextValue !== 'ttl' &&
        nextValue !== 'rdfxml' &&
        nextValue !== 'ntriples' &&
        nextValue !== 'jsonld'
      ) {
        return;
      }
      activeImportSnippetFormat = nextValue;
      refreshImportSnippetModal();
      openModal(importSnippetModal);
    });

    importSnippetModal.addEventListener('click', (event) => {
      if (!(event.target instanceof Element)) {
        return;
      }

      const copyButton = event.target.closest('[data-copy-import-snippet]');
      if (!(copyButton instanceof HTMLButtonElement)) {
        return;
      }

      const snippetTextarea = importSnippetModal.querySelector('.ocd-snippet-textarea');
      const snippetText = snippetTextarea instanceof HTMLTextAreaElement ? snippetTextarea.value : '';
      if (!snippetText) {
        return;
      }

      void window.navigator.clipboard.writeText(snippetText)
        .then(() => {
          const previousLabel = copyButton.textContent || 'Copy';
          copyButton.textContent = 'Copied';
          window.setTimeout(() => {
            copyButton.textContent = previousLabel;
          }, 1400);
          setStatus('Copied import snippet to clipboard.');
        })
        .catch((error) => {
          console.error('Error copying import snippet:', error);
          setStatus('Could not copy the import snippet automatically.');
        });
    });
  }

  if (preflightContainer) {
    preflightContainer.addEventListener('change', (event) => {
      if (!(event.target instanceof HTMLInputElement)) {
        return;
      }

      const fileName = event.target.getAttribute('data-measures-file');
      const importIri = event.target.getAttribute('data-import-iri');
      if (!fileName || !importIri || event.target.type !== 'file') {
        return;
      }

      const files = Array.from(event.target.files || []);
      if (!files.length) {
        return;
      }

      void (async () => {
        setStatus(`Loading closure file(s) for ${importIri}...`);
        try {
          for (const file of files) {
            await assignSupplementalOntologyForImport(fileName, importIri, file);
          }
          renderPreflightUi();
          setStatus(`Attached ${files.length} closure file(s) for import ${importIri} in ${fileName}.`);
        } catch (error) {
          console.error('Error loading import closure file:', error);
          setStatus(error instanceof Error ? `Error: ${error.message}` : 'Error loading import closure file.');
        }
      })();
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
      const fileName = removeButton.getAttribute('data-measures-file');
      if (!fileName || !attachmentId) {
        return;
      }

      removeSupplementalOntologyForImport(fileName, attachmentId);
      renderPreflightUi();
      setStatus(`Removed one attached closure file from ${fileName}.`);
    });
  }

  if (measuresResultsContainer) {
    measuresResultsContainer.addEventListener('click', (event) => {
      if (!(event.target instanceof Element)) {
        return;
      }

      const clampToggle = event.target.closest('[data-toggle-clamp="true"]');
      if (clampToggle instanceof HTMLButtonElement) {
        const isExpanded = clampToggle.classList.toggle('ocd-clampable-expanded');
        clampToggle.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
        return;
      }

      const button = event.target.closest('[data-download-measures-seed]');
      if (button instanceof HTMLButtonElement) {
        const analysisKey = button.getAttribute('data-download-measures-seed');
        if (analysisKey) {
          downloadSeedForAnalysis(analysisKey);
        }
        return;
      }

      const exportButton = event.target.closest('[data-download-measures-metrics]');
      if (exportButton instanceof HTMLButtonElement) {
        const analysisKey = exportButton.getAttribute('data-download-measures-metrics');
        if (analysisKey) {
          downloadMeasuresForAnalysis(analysisKey);
        }
        return;
      }

      const tabButton = event.target.closest('[data-measures-tab]');
      if (tabButton instanceof HTMLButtonElement) {
        const tabTarget = tabButton.getAttribute('data-measures-tab-target');
        if (tabTarget === 'metrics' || tabTarget === 'dependencies') {
          activeAnalysisTab = tabTarget;
          renderMeasuresResults(
            lastAnalyses,
            activeConfidenceFilter,
            activeAnalysisTab,
            activeDependencySort,
            measuresResultsContainer
          );
        }
        return;
      }

      const importButton = event.target.closest('[data-open-import-snippet]');
      if (importButton instanceof HTMLButtonElement) {
        const analysisKey = importButton.getAttribute('data-open-import-snippet');
        const importTarget = importButton.getAttribute('data-import-target');
        const analysis = lastAnalyses.find((item) => item.analysisKey === analysisKey);
        if (!analysis || !importTarget) {
          return;
        }

        const { allCandidates, missingCandidates } = deriveImportCandidates(
          analysis.externalIriDependencies,
          analysis.metadata?.imports || []
        );

        let targets = [];
        let targetLabel = 'Import snippet';
        if (importTarget === '__all_missing__') {
          targets = missingCandidates.length ? missingCandidates : allCandidates;
          targetLabel = 'Import all missing candidate ontology IRIs';
        } else if (importTarget === '__all_candidates__') {
          targets = allCandidates;
          targetLabel = 'Import all derived candidate ontology IRIs';
        } else {
          targets = [importTarget];
          targetLabel = `Import this IRI: ${importTarget}`;
        }

        activeImportSnippetRequest = {
          analysisKey,
          targetLabel,
          targets
        };
        refreshImportSnippetModal();
        openModal(importSnippetModal);
      }
    });

    measuresResultsContainer.addEventListener('change', (event) => {
      if (!(event.target instanceof HTMLSelectElement)) {
        return;
      }

      const filterKey = event.target.getAttribute('data-measures-confidence-filter');
      if (!filterKey) {
        return;
      }

      const nextValue = event.target.value;
      if (
        nextValue !== 'all' &&
        nextValue !== 'direct' &&
        nextValue !== 'approximate' &&
        nextValue !== 'heuristic'
      ) {
        return;
      }

      activeConfidenceFilter = nextValue;
      renderMeasuresResults(
        lastAnalyses,
        activeConfidenceFilter,
        activeAnalysisTab,
        activeDependencySort,
        measuresResultsContainer
      );
      return;
    });

    measuresResultsContainer.addEventListener('change', (event) => {
      if (!(event.target instanceof HTMLSelectElement)) {
        return;
      }

      const dependencySortKey = event.target.getAttribute('data-dependency-sort');
      if (dependencySortKey) {
        const nextValue = event.target.value;
        if (nextValue !== 'iri' && nextValue !== 'curated_in') {
          return;
        }

        activeDependencySort = nextValue;
        renderMeasuresResults(
          lastAnalyses,
          activeConfidenceFilter,
          activeAnalysisTab,
          activeDependencySort,
          measuresResultsContainer
        );
        return;
      }

      const importSnippetFormatKey = event.target.getAttribute('data-import-snippet-format');
      if (!importSnippetFormatKey) {
        return;
      }

      const nextValue = event.target.value;
      if (
        nextValue !== 'ttl' &&
        nextValue !== 'rdfxml' &&
        nextValue !== 'ntriples' &&
        nextValue !== 'jsonld'
      ) {
        return;
      }

      activeImportSnippetFormat = nextValue;
      refreshImportSnippetModal();
    });
  }
}

initializeApp();

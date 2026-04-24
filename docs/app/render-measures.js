// app/render-measures.js
// @ts-check

import {
  buildImportSnippetText,
  deriveImportCandidates,
  sortExternalDependencies
} from './measures-export.js';
import { escapeHtml } from './shared.js';

/** @type {HTMLElement | null} */
const measuresResultsContainer = document.getElementById('measuresResultsContainer');
/** @type {HTMLElement | null} */
const measuresRoadmapContainer = document.getElementById('measuresRoadmapContainer');
/** @type {HTMLElement | null} */
const importSnippetModalContainer = document.getElementById('importSnippetModal');

/**
 * Renders one summary metric card.
 *
 * @param {string} label
 * @param {string | number} value
 * @param {string} [meta='']
 * @returns {string}
 */
function renderMetricCard(label, value, meta = '') {
  let html = '<div class="ocd-summary-card">';
  html += `<div class="ocd-summary-label">${escapeHtml(label)}</div>`;
  html += `<div class="ocd-summary-value ocd-mono">${escapeHtml(String(value))}</div>`;
  if (meta) {
    html += `<div class="ocd-summary-meta">${escapeHtml(meta)}</div>`;
  }
  html += '</div>';
  return html;
}

/**
 * Renders one titled summary cluster.
 *
 * @param {string} title
 * @param {string[]} cards
 * @returns {string}
 */
function renderSummaryCluster(title, cards) {
  let html = '<section class="ocd-detail-section">';
  html += `<h3 class="ocd-detail-section-title">${escapeHtml(title)}</h3>`;
  html += '<div class="ocd-summary-grid">';
  html += cards.join('');
  html += '</div>';
  html += '</section>';
  return html;
}

/**
 * Renders one tab button.
 *
 * @param {'metrics' | 'dependencies'} tabId
 * @param {'metrics' | 'dependencies'} activeTab
 * @param {string} label
 * @param {string} analysisKey
 * @returns {string}
 */
function renderAnalysisTabButton(tabId, activeTab, label, analysisKey) {
  const buttonClass = tabId === activeTab
    ? 'ocd-btn ocd-btn-primary'
    : 'ocd-btn ocd-btn-tertiary';
  return `<button class="${buttonClass}" type="button" data-measures-tab="${escapeHtml(analysisKey)}" data-measures-tab-target="${escapeHtml(tabId)}">${escapeHtml(label)}</button>`;
}

/**
 * Renders long text with a click-to-expand affordance.
 *
 * @param {string} value
 * @returns {string}
 */
function renderClampableText(value) {
  const text = String(value || '');
  return `<button class="ocd-clampable ocd-mono" type="button" data-toggle-clamp="true" aria-expanded="false" title="Expand or collapse long value">${escapeHtml(text)}</button>`;
}

/** @type {ReadonlySet<string>} */
const APPROXIMATE_METRICS = Object.freeze(new Set([
  'axiom_count',
  'abox_axiom_count',
  'rbox_axiom_count',
  'tbox_axiom_count',
  'annotation_assertion_count',
  'rule_count'
]));

/** @type {ReadonlySet<string>} */
const HEURISTIC_METRICS = Object.freeze(new Set([
  'axiom_types',
  'axiom_type_count',
  'constructs',
  'expressivity',
  'gci_count',
  'gci_hidden_count',
  'owl2',
  'rdf_but_possibly_not_owl',
  'rdfs',
  'owl2_dl',
  'owl2_el',
  'owl2_ql',
  'owl2_rl',
  'most_freq_concept',
  'profile_exclusions',
  'dl_concern_count',
  'dl_concern_examples'
]));

/**
 * Returns the confidence label for one metric.
 *
 * @param {string} metricName
 * @returns {'direct' | 'approximate' | 'heuristic'}
 */
function getMetricConfidence(metricName) {
  if (HEURISTIC_METRICS.has(metricName)) {
    return 'heuristic';
  }
  if (APPROXIMATE_METRICS.has(metricName)) {
    return 'approximate';
  }
  return 'direct';
}

/**
 * Returns a badge for one metric confidence.
 *
 * @param {'direct' | 'approximate' | 'heuristic'} confidence
 * @returns {string}
 */
function renderConfidenceBadge(confidence) {
  const label = confidence === 'direct'
    ? 'direct'
    : confidence === 'approximate'
      ? 'approximate'
      : 'heuristic';
  const badgeClass = confidence === 'direct'
    ? 'ocd-summary-chip'
    : confidence === 'approximate'
      ? 'ocd-summary-chip ocd-summary-chip-warn'
      : 'ocd-summary-chip ocd-summary-chip-info';
  return `<span class="${badgeClass}">${escapeHtml(label)}</span>`;
}

/**
 * Renders the confidence legend used by the measures table.
 *
 * @returns {string}
 */
function renderConfidenceLegend() {
  let html = '<div class="ocd-detail-section">';
  html += '<h3 class="ocd-detail-section-title">Confidence legend</h3>';
  html += '<div class="ocd-chip-list">';
  html += renderConfidenceBadge('direct');
  html += renderConfidenceBadge('approximate');
  html += renderConfidenceBadge('heuristic');
  html += '</div>';
  html += '<p class="ocd-muted ocd-detail-section-note">Direct metrics read straightforwardly from the parsed RDF graph. Approximate metrics summarize graph patterns that only partially correspond to OWL axioms. Heuristic metrics are lightweight indicators rather than validator-grade results.</p>';
  html += '</div>';
  return html;
}

/**
 * Formats one DL concern example for display.
 *
 * @param {string} value
 * @returns {string}
 */
function formatDlConcernExample(value) {
  const [rawKey, rawRest] = String(value || '').split(': ');
  const details = rawRest || '';

  switch (rawKey) {
    case 'class_and_individual':
      return `Same IRI used as both class and individual: ${details}`;
    case 'class_and_property':
      return `Same IRI used as both class and property: ${details}`;
    case 'object_and_datatype_property':
      return `Same IRI used as both object property and datatype property: ${details}`;
    case 'annotation_and_logical_property':
      return `Same IRI used as both annotation property and logical property: ${details}`;
    case 'swrl_rule':
      return `SWRL rule detected: ${details}`;
    default:
      return value;
  }
}

/**
 * Renders the measures results list.
 *
 * @param {Array<{
 *   analysisKey: string,
 *   fileName: string,
 *   ontologyIri: string,
 *   title: string | null,
 *   metadata: import('./types.js').OntologyMetadata,
 *   metrics: import('./measures-model.js').MeasureMetric[],
 *   externalIriDependencies: import('./types.js').ExternalIriDependency[],
 *   attachedClosureCount: number,
 *   knownImportCount: number
 * }>} analyses
 * @param {'all' | 'direct' | 'approximate' | 'heuristic'} [confidenceFilter='all']
 * @param {'metrics' | 'dependencies'} [activeTab='metrics']
 * @param {'iri' | 'curated_in'} [dependencySort='iri']
 * @param {HTMLElement | null | undefined} [container=measuresResultsContainer]
 * @returns {void}
 */
export function renderMeasuresResults(
  analyses,
  confidenceFilter = 'all',
  activeTab = 'metrics',
  dependencySort = 'iri',
  container = measuresResultsContainer
) {
  if (!container) {
    return;
  }

  const items = Array.isArray(analyses) ? analyses : [];
  if (!items.length) {
    container.innerHTML = '<p class="ocd-muted">No ontology measures yet. Load files, attach import closure files if needed, and run measures.</p>';
    return;
  }

  let html = '';

  for (const analysis of items) {
    const dependencies = sortExternalDependencies(
      Array.isArray(analysis.externalIriDependencies)
        ? analysis.externalIriDependencies
        : [],
      dependencySort
    );
    const metrics = Array.isArray(analysis.metrics) ? analysis.metrics : [];
    const filteredMetrics = confidenceFilter === 'all'
      ? metrics
      : metrics.filter((metric) => getMetricConfidence(metric.metric) === confidenceFilter);
    const metadata = analysis.metadata || /** @type {import('./types.js').OntologyMetadata} */ ({
      fileName: analysis.fileName,
      ontologyIri: analysis.ontologyIri,
      title: analysis.title,
      description: null,
      versionIri: null,
      versionInfo: null,
      license: null,
      accessRights: null,
      imports: [],
      tripleCount: 0,
      labeledResourceCount: 0,
      externalIriDependencies: []
    });

    html += '<section class="ocd-section ocd-card">';
    html += '<div class="ocd-modal-header">';
    html += '<div>';
    html += `<h2 class="ocd-title">${escapeHtml(analysis.fileName)}</h2>`;
    html += `<p class="ocd-muted">${escapeHtml(metadata.title || 'Untitled ontology')}</p>`;
    html += `<div class="ocd-table-meta ocd-mono">${escapeHtml(analysis.ontologyIri || 'urn:ontology:unknown')}</div>`;
    html += '</div>';
    html += '<div class="ocd-actions" role="tablist" aria-label="Analysis sections">';
    html += renderAnalysisTabButton('metrics', activeTab, 'Ontology metrics', analysis.analysisKey);
    html += renderAnalysisTabButton('dependencies', activeTab, 'External dependencies', analysis.analysisKey);
    html += '</div>';
    html += '</div>';
    if (activeTab === 'metrics') {
      html += renderSummaryCluster('Structure', [
        renderMetricCard('Classes', getMetricValue(metrics, 'class_count', 0)),
        renderMetricCard('Individuals', getMetricValue(metrics, 'individual_count', 0)),
        renderMetricCard('Object properties', getMetricValue(metrics, 'obj_property_count', 0)),
        renderMetricCard('Data properties', getMetricValue(metrics, 'dataproperty_count', 0)),
        renderMetricCard('Annotation properties', getMetricValue(metrics, 'annotation_property_count', 0)),
        renderMetricCard('Signature entities', getMetricValue(metrics, 'signature_entity_count', 0)),
        renderMetricCard('Deprecated terms', getMetricValue(metrics, 'deprecated_term_count', 0)),
        renderMetricCard('Most frequent concept', getMetricValue(metrics, 'most_freq_concept', ''))
      ]);

      html += renderSummaryCluster('Axioms And Semantics', [
        renderMetricCard('Axiom count', getMetricValue(metrics, 'axiom_count', 0)),
        renderMetricCard('ABox / RBox / TBox', `${getMetricValue(metrics, 'abox_axiom_count', 0)} / ${getMetricValue(metrics, 'rbox_axiom_count', 0)} / ${getMetricValue(metrics, 'tbox_axiom_count', 0)}`),
        renderMetricCard('Rule count', getMetricValue(metrics, 'rule_count', 0)),
        renderMetricCard('Constructs', getMetricValue(metrics, 'constructs', '')),
        renderMetricCard('Expressivity', getMetricValue(metrics, 'expressivity', '')),
        renderMetricCard('GCI / hidden GCI', `${getMetricValue(metrics, 'gci_count', 0)} / ${getMetricValue(metrics, 'gci_hidden_count', 0)}`)
      ]);

      html += renderSummaryCluster('Profile Heuristics', [
        renderMetricCard('RDF but possibly not OWL', getMetricValue(metrics, 'rdf_but_possibly_not_owl', false)),
        renderMetricCard('RDFS-like', getMetricValue(metrics, 'rdfs', false)),
        renderMetricCard('OWL 2 DL', getMetricValue(metrics, 'owl2_dl', false)),
        renderMetricCard('OWL 2 EL', getMetricValue(metrics, 'owl2_el', false)),
        renderMetricCard('OWL 2 QL', getMetricValue(metrics, 'owl2_ql', false)),
        renderMetricCard('OWL 2 RL', getMetricValue(metrics, 'owl2_rl', false)),
        renderMetricCard('DL concerns', getMetricValue(metrics, 'dl_concern_count', 0))
      ]);

      html += '<dl class="ocd-meta-list">';
      html += `<div class="ocd-meta-row"><dt><strong>Version:</strong></dt><dd class="ocd-mono">${escapeHtml(metadata.versionInfo || metadata.versionIri || 'Not found')}</dd></div>`;
      html += `<div class="ocd-meta-row"><dt><strong>Declared imports:</strong></dt><dd class="ocd-mono">${escapeHtml((metadata.imports || []).join(', ') || 'None found')}</dd></div>`;
      html += '</dl>';

      const profileExclusions = getMetricListValue(metrics, 'profile_exclusions');
      const dlConcernExamples = getMetricListValue(metrics, 'dl_concern_examples');
      html += '<h3 class="ocd-detail-title">Profile exclusions and DL concerns</h3>';
      if (!profileExclusions.length && !dlConcernExamples.length) {
        html += '<p class="ocd-muted">No one-way profile exclusions or concrete DL concern examples were detected by the current heuristic layer.</p>';
      } else {
        if (profileExclusions.length) {
          html += '<div class="ocd-detail-section">';
          html += '<h3 class="ocd-detail-section-title">Sufficient-condition profile exclusions</h3>';
          html += '<ul class="ocd-detail-list">';
          for (const exclusion of profileExclusions) {
            html += `<li class="ocd-table-meta">${escapeHtml(exclusion)}</li>`;
          }
          html += '</ul>';
          html += '</div>';
        }
        if (dlConcernExamples.length) {
          html += '<div class="ocd-detail-section">';
          html += '<h3 class="ocd-detail-section-title">Concrete OWL 2 DL concern examples</h3>';
          html += '<ul class="ocd-detail-list">';
          for (const concern of dlConcernExamples) {
            html += `<li class="ocd-table-meta">${escapeHtml(formatDlConcernExample(concern))}</li>`;
          }
          html += '</ul>';
          html += '</div>';
        }
      }

      html += '<div class="ocd-inline-field-actions" style="margin-bottom:12px;">';
      html += `<label class="ocd-label" for="measures-export-${escapeHtml(analysis.analysisKey)}">Export ontology metrics</label>`;
      html += `<select class="ocd-select" id="measures-export-${escapeHtml(analysis.analysisKey)}" data-measures-export-format="${escapeHtml(analysis.analysisKey)}">`;
      html += '<option value="csv">CSV</option>';
      html += '<option value="tsv">TSV</option>';
      html += '<option value="json">JSON</option>';
      html += '<option value="yaml">YAML</option>';
      html += '<option value="html">HTML</option>';
      html += '</select>';
      html += `<button class="ocd-btn ocd-btn-tertiary" type="button" data-download-measures-metrics="${escapeHtml(analysis.analysisKey)}">Export metrics</button>`;
      html += '</div>';

      html += '<h3 class="ocd-detail-title">Basic measures</h3>';
      html += renderConfidenceLegend();
      html += '<div class="ocd-inline-field-actions" style="margin-bottom:12px;">';
      html += '<label class="ocd-label" for="measures-confidence-filter-' + escapeHtml(analysis.analysisKey) + '">Show</label>';
      html += '<select class="ocd-select" id="measures-confidence-filter-' + escapeHtml(analysis.analysisKey) + '" data-measures-confidence-filter="' + escapeHtml(analysis.analysisKey) + '">';
      html += '<option value="all"' + (confidenceFilter === 'all' ? ' selected' : '') + '>All metrics</option>';
      html += '<option value="direct"' + (confidenceFilter === 'direct' ? ' selected' : '') + '>Direct only</option>';
      html += '<option value="approximate"' + (confidenceFilter === 'approximate' ? ' selected' : '') + '>Approximate only</option>';
      html += '<option value="heuristic"' + (confidenceFilter === 'heuristic' ? ' selected' : '') + '>Heuristic only</option>';
      html += '</select>';
      html += `<span class="ocd-table-meta">${escapeHtml(`${filteredMetrics.length} shown of ${metrics.length}`)}</span>`;
      html += '</div>';
      html += '<table class="ocd-table ocd-table-wide">';
      html += '<thead class="ocd-table-head"><tr>';
      html += '<th class="ocd-table-th">Metric</th>';
      html += '<th class="ocd-table-th">Value</th>';
      html += '<th class="ocd-table-th">Type</th>';
      html += '<th class="ocd-table-th">Confidence</th>';
      html += '<th class="ocd-table-th">Explanation</th>';
      html += '</tr></thead><tbody>';
      for (const metric of filteredMetrics) {
        const confidence = getMetricConfidence(metric.metric);
        html += '<tr class="ocd-table-tr">';
        html += `<td class="ocd-table-td ocd-mono">${escapeHtml(metric.metric)}</td>`;
        html += `<td class="ocd-table-td">${escapeHtml(formatMetricValue(metric.metricValue))}</td>`;
        html += `<td class="ocd-table-td">${escapeHtml(metric.metricType)}</td>`;
        html += `<td class="ocd-table-td">${renderConfidenceBadge(confidence)}</td>`;
        html += `<td class="ocd-table-td">${escapeHtml(metric.explanation)}</td>`;
        html += '</tr>';
      }
      html += '</tbody></table>';
    } else {
      html += renderSummaryCluster('Dependencies And Imports', [
        renderMetricCard('Direct imports', getMetricValue(metrics, 'direct_import_count', 0)),
        renderMetricCard('Known imports', analysis.knownImportCount || 0),
        renderMetricCard('Attached closure files', analysis.attachedClosureCount || 0),
        renderMetricCard('External dependencies', dependencies.length)
      ]);

      if ((metadata.imports || []).length && !analysis.attachedClosureCount) {
        html += '<p class="ocd-muted">This ontology declares imports, but no local closure files are attached yet. Labels and curated-in annotations for external dependencies may be sparse until you add those files above.</p>';
      }

      html += '<div class="ocd-inline-field-actions" style="margin-bottom:12px;">';
      html += `<label class="ocd-label" for="dependency-sort-${escapeHtml(analysis.analysisKey)}">Sort dependencies</label>`;
      html += `<select class="ocd-select" id="dependency-sort-${escapeHtml(analysis.analysisKey)}" data-dependency-sort="${escapeHtml(analysis.analysisKey)}">`;
      html += '<option value="iri"' + (dependencySort === 'iri' ? ' selected' : '') + '>By IRI</option>';
      html += '<option value="curated_in"' + (dependencySort === 'curated_in' ? ' selected' : '') + '>By curated in</option>';
      html += '</select>';
      html += `<button class="ocd-btn ocd-btn-tertiary" type="button" data-download-measures-seed="${escapeHtml(analysis.analysisKey)}">Export seed file</button>`;
      html += '</div>';

      html += '<h3 class="ocd-detail-title">External IRI dependencies</h3>';
      if (!dependencies.length) {
        html += '<p class="ocd-muted">No external IRI dependencies were detected for this run.</p>';
      } else {
        html += '<table class="ocd-table ocd-table-wide">';
        html += '<thead class="ocd-table-head"><tr>';
        html += '<th class="ocd-table-th">IRI</th>';
        html += '<th class="ocd-table-th">Label</th>';
        html += '<th class="ocd-table-th">Curated in</th>';
        html += '<th class="ocd-table-th">Signals</th>';
        html += '</tr></thead><tbody>';

        for (const dependency of dependencies) {
          html += '<tr class="ocd-table-tr">';
          html += `<td class="ocd-table-td">${renderClampableText(dependency.iri || '')}</td>`;
          html += `<td class="ocd-table-td">${escapeHtml(dependency.label || '')}</td>`;
          html += `<td class="ocd-table-td">${renderClampableText(dependency.curatedIn || '')}</td>`;
          html += `<td class="ocd-table-td">${escapeHtml((dependency.reasons || []).join(', '))}</td>`;
          html += '</tr>';
        }

        html += '</tbody></table>';
      }

      const { allCandidates: importCandidates, missingCandidates: missingImportCandidates } = deriveImportCandidates(
        dependencies,
        Array.isArray(metadata.imports) ? metadata.imports : []
      );
      const importSnippetTargets = missingImportCandidates.length ? missingImportCandidates : importCandidates;

      html += '<h3 class="ocd-detail-title">Import candidates</h3>';
      if (!importCandidates.length) {
        html += '<p class="ocd-muted">No import candidates could be derived from the current curated-in values.</p>';
      } else {
        html += '<p class="ocd-muted">These ontology IRIs are derived from the dependency <span class="ocd-mono">curated in</span> column so you can spot likely missing imports and generate import snippets without leaving the page.</p>';
        html += '<div class="ocd-detail-section">';
        html += '<ul class="ocd-detail-list">';
        html += `<li class="ocd-table-meta">Candidate ontology IRIs: ${escapeHtml(String(importCandidates.length))}</li>`;
        html += `<li class="ocd-table-meta">Already declared imports: ${escapeHtml(String(importCandidates.length - missingImportCandidates.length))}</li>`;
        html += `<li class="ocd-table-meta">Missing import candidates: ${escapeHtml(String(missingImportCandidates.length))}</li>`;
        html += '</ul>';
        html += '</div>';
        html += '<div class="ocd-detail-section">';
        html += '<h3 class="ocd-detail-section-title">Derived ontology IRIs</h3>';
        html += '<div class="ocd-candidate-list">';
        for (const iri of importCandidates) {
          const isMissing = missingImportCandidates.includes(iri);
          html += '<div class="ocd-candidate-row">';
          html += `<div class="ocd-candidate-main"><div>${renderClampableText(iri)}</div><div class="ocd-table-meta">${isMissing ? 'Not currently declared in owl:imports.' : 'Already present in the ontology import set.'}</div></div>`;
          html += `<div class="ocd-candidate-actions">${isMissing ? '<span class="ocd-summary-chip ocd-summary-chip-warn">Missing</span>' : '<span class="ocd-summary-chip">Present</span>'}<button class="ocd-btn ocd-btn-tertiary" type="button" data-open-import-snippet="${escapeHtml(analysis.analysisKey)}" data-import-target="${escapeHtml(iri)}">Import this</button></div>`;
          html += '</div>';
        }
        html += '</div>';
        html += '</div>';
        html += '<div class="ocd-inline-field-actions" style="margin-top:12px;">';
        html += `<button class="ocd-btn ocd-btn-primary" type="button" data-open-import-snippet="${escapeHtml(analysis.analysisKey)}" data-import-target="__all_missing__">Import all missing</button>`;
        if (importSnippetTargets.length !== importCandidates.length) {
          html += `<button class="ocd-btn ocd-btn-tertiary" type="button" data-open-import-snippet="${escapeHtml(analysis.analysisKey)}" data-import-target="__all_candidates__">Import all candidates</button>`;
        }
        html += '</div>';
      }
    }

    html += '</section>';
  }

  container.innerHTML = html;
}

/**
 * Returns a metric value by metric key.
 *
 * @param {import('./measures-model.js').MeasureMetric[]} metrics
 * @param {string} metricName
 * @param {string | number} fallback
 * @returns {string | number}
 */
function getMetricValue(metrics, metricName, fallback) {
  const match = metrics.find((metric) => metric.metric === metricName);
  if (!match) {
    return fallback;
  }
  return Array.isArray(match.metricValue)
    ? formatMetricValue(match.metricValue)
    : /** @type {string | number} */ (match.metricValue);
}

/**
 * Returns one list-valued metric as an array.
 *
 * @param {import('./measures-model.js').MeasureMetric[]} metrics
 * @param {string} metricName
 * @returns {string[]}
 */
function getMetricListValue(metrics, metricName) {
  const match = metrics.find((metric) => metric.metric === metricName);
  return Array.isArray(match?.metricValue) ? match.metricValue : [];
}

/**
 * Formats one metric value for display.
 *
 * @param {string | number | boolean | string[]} value
 * @returns {string}
 */
function formatMetricValue(value) {
  if (Array.isArray(value)) {
    return value.join(' | ');
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  return String(value);
}

/**
 * Renders a static roadmap for ROBOT-style measures.
 *
 * @param {HTMLElement | null | undefined} [container=measuresRoadmapContainer]
 * @returns {void}
 */
export function renderMeasuresRoadmap(container = measuresRoadmapContainer) {
  if (!container) {
    return;
  }

  const rows = [
    ['External IRI count / seed export', 'Now', 'Already scaffolded with import-aware enrichment.'],
    ['Declared import count', 'Now', 'Read directly from owl:imports on the ontology header.'],
    ['Class / individual / property counts', 'Now', 'Implemented from asserted rdf:type patterns in the parsed graph.'],
    ['Annotation property count', 'Now', 'Implemented from asserted owl:AnnotationProperty declarations.'],
    ['Datatype and namespace summaries', 'Now', 'Implemented from literal datatypes and namespace bucketing over named nodes.'],
    ['Ontology annotation counts', 'Now', 'Implemented as direct ontology-subject assertions excluding structural predicates.'],
    ['Axiom-ish triple counts', 'Now', 'Implemented as parsed graph statement counts, with the caveat that this is not OWLAPI axiom normalization.'],
    ['Deprecated term count', 'Now', 'Implemented from owl:deprecated true assertions on named resources.'],
    ['ABox / RBox / TBox approximations', 'Now', 'Implemented as RDF-graph heuristics rather than OWLAPI axiom classification.'],
    ['Axiom type summaries', 'Now', 'Implemented as RDF-pattern heuristics such as SubClassOf, Declaration, AnnotationAssertion, and assertion categories.'],
    ['SWRL rule count', 'Now', 'Implemented as subjects typed swrl:Imp.'],
    ['Construct detection', 'Now', 'Implemented from selected OWL RDF predicates such as someValuesFrom, unionOf, and cardinality predicates.'],
    ['Profile-style flags', 'Partial', 'Implemented as lightweight heuristic indicators only, not as OWL profile validators.'],
    ['Expressivity summary', 'Partial', 'Implemented as a coarse construct-derived summary, not a classifier-backed DL expressivity result.'],
    ['GCI metrics', 'Partial', 'Implemented as RDF-graph heuristics over anonymous subclass and equivalent-class patterns.'],
    ['Logical vs annotation axiom split', 'Partial', 'Possible heuristically, but not as trustworthy as OWLAPI/ROBOT.'],
    ['OWL 2 DL profile violations', 'Partial', 'Some browser checks are possible, but full profile validation is not equivalent to ROBOT.'],
    ['Unsatisfiable class counts', 'Not practical in-browser', 'Would require reasoning not present in this stack.'],
    ['Inferred hierarchy metrics', 'Not practical in-browser', 'Needs a reasoner or server-side OWL tooling.']
  ];

  let html = '<div class="ocd-modal-dialog ocd-card">';
  html += '<div class="ocd-modal-header">';
  html += '<div>';
  html += '<h2 class="ocd-title">ROBOT Measure Roadmap</h2>';
  html += '<p class="ocd-muted">This checklist sketches what we can measure well in-browser with parsed RDF stores, and where OWLAPI-backed ROBOT still has a real advantage.</p>';
  html += '</div>';
  html += '<button class="ocd-modal-close" type="button" data-close-modal="measuresRoadmapModal" aria-label="Close roadmap">&times;</button>';
  html += '</div>';
  html += '<div class="ocd-detail-section">';
  html += '<h3 class="ocd-detail-section-title">BLUF</h3>';
  html += '<ul class="ocd-detail-list">';
  html += '<li class="ocd-table-meta">Best current coverage is a browser-side subset of ROBOT essential and extended structural metrics.</li>';
  html += '<li class="ocd-table-meta">Profile-style outputs and DL concern checks are heuristic enough to flag likely issues, but they are not full OWLAPI-grade validators.</li>';
  html += '<li class="ocd-table-meta">Reasoner-backed metrics such as satisfiability and unsatisfiable class counts are not supported in this in-browser stack.</li>';
  html += '</ul>';
  html += '</div>';
  html += '<table class="ocd-table ocd-table-wide ocd-roadmap-table">';
  html += '<thead class="ocd-table-head"><tr>';
  html += '<th class="ocd-table-th">Metric</th>';
  html += '<th class="ocd-table-th">Browser fit</th>';
  html += '<th class="ocd-table-th">Notes</th>';
  html += '</tr></thead><tbody>';

  for (const [metric, fit, note] of rows) {
    html += '<tr class="ocd-table-tr">';
    html += `<td class="ocd-table-td">${escapeHtml(metric)}</td>`;
    html += `<td class="ocd-table-td"><span class="ocd-summary-chip">${escapeHtml(fit)}</span></td>`;
    html += `<td class="ocd-table-td">${escapeHtml(note)}</td>`;
    html += '</tr>';
  }

  html += '</tbody></table>';
  html += '</div>';
  container.innerHTML = html;
}

/**
 * Renders the import snippet modal.
 *
 * @param {{
 *   analysisTitle: string,
 *   ontologyIri: string,
 *   targetLabel: string,
 *   targets: string[],
 *   format: 'rdfxml' | 'ttl' | 'ntriples' | 'jsonld'
 * }} config
 * @param {HTMLElement | null | undefined} [container=importSnippetModalContainer]
 * @returns {void}
 */
export function renderImportSnippetModal(config, container = importSnippetModalContainer) {
  if (!container) {
    return;
  }

  const format = config?.format || 'ttl';
  const targets = Array.isArray(config?.targets) ? config.targets : [];
  const snippet = buildImportSnippetText(config?.ontologyIri || '', targets, format);

  let html = '<div class="ocd-modal-dialog ocd-card">';
  html += '<div class="ocd-modal-header">';
  html += '<div>';
  html += `<h2 class="ocd-title">${escapeHtml(config?.analysisTitle || 'Import snippet')}</h2>`;
  html += `<p class="ocd-muted">${escapeHtml(config?.targetLabel || '')}</p>`;
  html += '</div>';
  html += '<button class="ocd-modal-close" type="button" data-close-modal="importSnippetModal" aria-label="Close import snippet">&times;</button>';
  html += '</div>';
  html += '<div class="ocd-inline-field-actions" style="margin-bottom:12px;">';
  html += '<label class="ocd-label" for="importSnippetModalFormat">Format</label>';
  html += '<select class="ocd-select" id="importSnippetModalFormat">';
  html += '<option value="ttl"' + (format === 'ttl' ? ' selected' : '') + '>TTL</option>';
  html += '<option value="rdfxml"' + (format === 'rdfxml' ? ' selected' : '') + '>RDF/XML</option>';
  html += '<option value="ntriples"' + (format === 'ntriples' ? ' selected' : '') + '>N-Triples</option>';
  html += '<option value="jsonld"' + (format === 'jsonld' ? ' selected' : '') + '>JSON-LD</option>';
  html += '</select>';
  html += '<button class="ocd-btn ocd-btn-tertiary" type="button" data-copy-import-snippet="true">Copy</button>';
  html += '</div>';
  html += '<textarea class="ocd-textarea ocd-mono ocd-snippet-textarea" readonly>' + escapeHtml(snippet) + '</textarea>';
  html += '</div>';
  container.innerHTML = html;
}

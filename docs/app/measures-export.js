// app/measures-export.js
// @ts-check

import { escapeHtml } from './shared.js';

/** @typedef {import('./types.js').ExternalIriDependency} ExternalIriDependency */
/** @typedef {import('./measures-model.js').MeasureMetric} MeasureMetric */
/** @typedef {'iri' | 'curated_in'} DependencySortMode */
/** @typedef {'rdfxml' | 'ttl' | 'ntriples' | 'jsonld'} ImportSnippetFormat */
/**
 * @typedef {Object} ExportableMeasuresAnalysis
 * @property {string} fileName
 * @property {string} ontologyIri
 * @property {MeasureMetric[]} metrics
 */

/**
 * Escapes one seed-file field while preserving the line format.
 *
 * @param {string | null | undefined} value
 * @returns {string}
 */
function escapeSeedField(value) {
  return String(value || '').replace(/\r?\n/g, ' ').replace(/\s+#\s+/g, ' # ').trim();
}

/**
 * Returns external dependencies in one stable order.
 *
 * @param {ExternalIriDependency[] | null | undefined} dependencies
 * @param {DependencySortMode} [sortBy='iri']
 * @returns {ExternalIriDependency[]}
 */
export function sortExternalDependencies(dependencies, sortBy = 'iri') {
  const rows = Array.isArray(dependencies) ? [...dependencies] : [];
  return rows.sort((left, right) => {
    if (sortBy === 'curated_in') {
      const curatedCompare = String(left?.curatedIn || '').localeCompare(String(right?.curatedIn || ''));
      if (curatedCompare !== 0) {
        return curatedCompare;
      }
    }
    return String(left?.iri || '').localeCompare(String(right?.iri || ''));
  });
}

/**
 * Derives curated-in ontology import candidates from dependency rows.
 *
 * @param {ExternalIriDependency[] | null | undefined} dependencies
 * @param {string[] | null | undefined} declaredImports
 * @returns {{ allCandidates: string[], missingCandidates: string[] }}
 */
export function deriveImportCandidates(dependencies, declaredImports) {
  const allCandidates = Array.from(
    new Set(
      (Array.isArray(dependencies) ? dependencies : [])
        .map((dependency) => String(dependency?.curatedIn || ''))
        .filter(Boolean)
    )
  ).sort((left, right) => left.localeCompare(right));

  const declared = new Set(
    Array.isArray(declaredImports)
      ? declaredImports.filter(Boolean).map((value) => String(value))
      : []
  );

  return {
    allCandidates,
    missingCandidates: allCandidates.filter((iri) => !declared.has(iri))
  };
}

/**
 * Serializes ontology-slim seed dependencies as:
 * {iri} # {label} # # {curated in}
 *
 * @param {ExternalIriDependency[] | null | undefined} dependencies
 * @param {DependencySortMode} [sortBy='iri']
 * @returns {string}
 */
export function buildExternalDependenciesSeedText(dependencies, sortBy = 'iri') {
  const rows = sortExternalDependencies(dependencies, sortBy);
  return rows
    .map((dependency) =>
      `${escapeSeedField(dependency?.iri)} # ${escapeSeedField(dependency?.label)} # # ${escapeSeedField(dependency?.curatedIn)}`
    )
    .join('\n') + (rows.length ? '\n' : '');
}

/**
 * Builds an owl:imports snippet for one or more ontology IRIs.
 *
 * @param {string | null | undefined} ontologyIri
 * @param {string[] | null | undefined} importIris
 * @param {ImportSnippetFormat} [format='ttl']
 * @returns {string}
 */
export function buildImportSnippetText(ontologyIri, importIris, format = 'ttl') {
  const subjectIri = String(ontologyIri || '').trim() || 'urn:ontology:unknown';
  const rows = Array.isArray(importIris)
    ? Array.from(new Set(importIris.filter(Boolean).map((value) => String(value))))
    : [];

  switch (format) {
    case 'rdfxml':
      if (rows.length === 1) {
        return `<owl:imports rdf:resource="${rows[0]}"/>`;
      }
      return rows.map((iri) => `<owl:imports rdf:resource="${iri}"/>`).join('\n');
    case 'ntriples':
      return rows.map((iri) => `<${subjectIri}> <http://www.w3.org/2002/07/owl#imports> <${iri}> .`).join('\n');
    case 'jsonld':
      return `${JSON.stringify({
        '@id': subjectIri,
        'http://www.w3.org/2002/07/owl#imports': rows.map((iri) => ({ '@id': iri }))
      }, null, 2)}\n`;
    case 'ttl':
    default:
      if (!rows.length) {
        return '';
      }
      if (rows.length === 1) {
        return `owl:imports <${rows[0]}> .`;
      }
      return `owl:imports\n${rows.map((iri) => `  <${iri}>`).join(',\n')} .`;
  }
}

/**
 * Converts one metric value to a stable string.
 *
 * @param {MeasureMetric['metricValue']} value
 * @returns {string}
 */
function metricValueToString(value) {
  if (Array.isArray(value)) {
    return value.join(' | ');
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  return String(value);
}

/**
 * Escapes one CSV or TSV field.
 *
 * @param {string} value
 * @param {string} delimiter
 * @returns {string}
 */
function delimitedEscape(value, delimiter) {
  const needsWrap = value.includes('"') || value.includes('\n') || value.includes('\r') || value.includes(delimiter);
  const escaped = value.replace(/"/g, '""');
  return needsWrap ? `"${escaped}"` : escaped;
}

/**
 * Serializes measure rows to CSV or TSV.
 *
 * @param {MeasureMetric[] | null | undefined} metrics
 * @param {',' | '\t'} delimiter
 * @returns {string}
 */
function buildDelimitedMetrics(metrics, delimiter) {
  const rows = Array.isArray(metrics) ? metrics : [];
  const header = ['metric', 'metric_value', 'metric_type', 'explanation'];
  const lines = [header.join(delimiter)];

  for (const metric of rows) {
    const fields = [
      metric?.metric || '',
      metricValueToString(metric?.metricValue),
      metric?.metricType || '',
      metric?.explanation || ''
    ].map((value) => delimitedEscape(String(value), delimiter));
    lines.push(fields.join(delimiter));
  }

  return lines.join('\n') + '\n';
}

/**
 * Builds CSV text for ontology measures.
 *
 * @param {MeasureMetric[] | null | undefined} metrics
 * @returns {string}
 */
export function buildMeasuresCsv(metrics) {
  return buildDelimitedMetrics(metrics, ',');
}

/**
 * Builds TSV text for ontology measures.
 *
 * @param {MeasureMetric[] | null | undefined} metrics
 * @returns {string}
 */
export function buildMeasuresTsv(metrics) {
  return buildDelimitedMetrics(metrics, '\t');
}

/**
 * Builds JSON text for ontology measures.
 *
 * @param {MeasureMetric[] | null | undefined} metrics
 * @returns {string}
 */
export function buildMeasuresJson(metrics) {
  return `${JSON.stringify(Array.isArray(metrics) ? metrics : [], null, 2)}\n`;
}

/**
 * Builds YAML-like text for ontology measures.
 *
 * @param {MeasureMetric[] | null | undefined} metrics
 * @returns {string}
 */
export function buildMeasuresYaml(metrics) {
  const rows = Array.isArray(metrics) ? metrics : [];
  const lines = ['metrics:'];

  for (const metric of rows) {
    lines.push(`  - metric: "${String(metric?.metric || '').replace(/"/g, '\\"')}"`);
    lines.push(`    metric_type: "${String(metric?.metricType || '').replace(/"/g, '\\"')}"`);
    if (Array.isArray(metric?.metricValue)) {
      lines.push('    metric_value:');
      for (const value of metric.metricValue) {
        lines.push(`      - "${String(value).replace(/"/g, '\\"')}"`);
      }
    } else if (typeof metric?.metricValue === 'boolean') {
      lines.push(`    metric_value: ${metric.metricValue ? 'true' : 'false'}`);
    } else if (typeof metric?.metricValue === 'number') {
      lines.push(`    metric_value: ${metric.metricValue}`);
    } else {
      lines.push(`    metric_value: "${String(metric?.metricValue || '').replace(/"/g, '\\"')}"`);
    }
    lines.push(`    explanation: "${String(metric?.explanation || '').replace(/"/g, '\\"')}"`);
  }

  return lines.join('\n') + '\n';
}

/**
 * Builds a lightweight HTML report for ontology measures.
 *
 * @param {string} title
 * @param {MeasureMetric[] | null | undefined} metrics
 * @returns {string}
 */
export function buildMeasuresHtml(title, metrics) {
  const rows = Array.isArray(metrics) ? metrics : [];
  let html = '<!doctype html><html><head><meta charset="utf-8" />';
  html += '<meta name="viewport" content="width=device-width, initial-scale=1" />';
  html += `<title>${escapeHtml(title)}</title>`;
  html += '<style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;margin:24px;}table{width:100%;border-collapse:collapse;}th,td{border-bottom:1px solid #ddd;padding:8px;text-align:left;vertical-align:top;}th{background:#f7f7f7;}h1{margin-top:0}.mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;}</style>';
  html += '</head><body>';
  html += `<h1>${escapeHtml(title)}</h1>`;
  html += '<table><thead><tr><th>Metric</th><th>Value</th><th>Type</th><th>Explanation</th></tr></thead><tbody>';
  for (const metric of rows) {
    html += '<tr>';
    html += `<td class="mono">${escapeHtml(metric?.metric || '')}</td>`;
    html += `<td>${escapeHtml(metricValueToString(metric?.metricValue || ''))}</td>`;
    html += `<td>${escapeHtml(metric?.metricType || '')}</td>`;
    html += `<td>${escapeHtml(metric?.explanation || '')}</td>`;
    html += '</tr>';
  }
  html += '</tbody></table></body></html>';
  return html;
}

/**
 * Builds CSV text for many ontology analyses.
 *
 * @param {ExportableMeasuresAnalysis[] | null | undefined} analyses
 * @returns {string}
 */
export function buildAllMeasuresCsv(analyses) {
  const rows = Array.isArray(analyses) ? analyses : [];
  const header = ['fileName', 'ontologyIri', 'metric', 'metric_value', 'metric_type', 'explanation'];
  const lines = [header.join(',')];

  for (const analysis of rows) {
    for (const metric of Array.isArray(analysis?.metrics) ? analysis.metrics : []) {
      const fields = [
        analysis?.fileName || '',
        analysis?.ontologyIri || '',
        metric?.metric || '',
        metricValueToString(metric?.metricValue),
        metric?.metricType || '',
        metric?.explanation || ''
      ].map((value) => delimitedEscape(String(value), ','));
      lines.push(fields.join(','));
    }
  }

  return lines.join('\n') + '\n';
}

/**
 * Builds TSV text for many ontology analyses.
 *
 * @param {ExportableMeasuresAnalysis[] | null | undefined} analyses
 * @returns {string}
 */
export function buildAllMeasuresTsv(analyses) {
  const rows = Array.isArray(analyses) ? analyses : [];
  const header = ['fileName', 'ontologyIri', 'metric', 'metric_value', 'metric_type', 'explanation'];
  const lines = [header.join('\t')];

  for (const analysis of rows) {
    for (const metric of Array.isArray(analysis?.metrics) ? analysis.metrics : []) {
      const fields = [
        analysis?.fileName || '',
        analysis?.ontologyIri || '',
        metric?.metric || '',
        metricValueToString(metric?.metricValue),
        metric?.metricType || '',
        metric?.explanation || ''
      ].map((value) => delimitedEscape(String(value), '\t'));
      lines.push(fields.join('\t'));
    }
  }

  return lines.join('\n') + '\n';
}

/**
 * Builds JSON text for many ontology analyses.
 *
 * @param {ExportableMeasuresAnalysis[] | null | undefined} analyses
 * @returns {string}
 */
export function buildAllMeasuresJson(analyses) {
  return `${JSON.stringify(Array.isArray(analyses) ? analyses : [], null, 2)}\n`;
}

/**
 * Builds YAML-like text for many ontology analyses.
 *
 * @param {ExportableMeasuresAnalysis[] | null | undefined} analyses
 * @returns {string}
 */
export function buildAllMeasuresYaml(analyses) {
  const rows = Array.isArray(analyses) ? analyses : [];
  const lines = ['analyses:'];

  for (const analysis of rows) {
    lines.push(`  - fileName: "${String(analysis?.fileName || '').replace(/"/g, '\\"')}"`);
    lines.push(`    ontologyIri: "${String(analysis?.ontologyIri || '').replace(/"/g, '\\"')}"`);
    lines.push('    metrics:');
    for (const metric of Array.isArray(analysis?.metrics) ? analysis.metrics : []) {
      lines.push(`      - metric: "${String(metric?.metric || '').replace(/"/g, '\\"')}"`);
      lines.push(`        metric_type: "${String(metric?.metricType || '').replace(/"/g, '\\"')}"`);
      if (Array.isArray(metric?.metricValue)) {
        lines.push('        metric_value:');
        for (const value of metric.metricValue) {
          lines.push(`          - "${String(value).replace(/"/g, '\\"')}"`);
        }
      } else if (typeof metric?.metricValue === 'boolean') {
        lines.push(`        metric_value: ${metric.metricValue ? 'true' : 'false'}`);
      } else if (typeof metric?.metricValue === 'number') {
        lines.push(`        metric_value: ${metric.metricValue}`);
      } else {
        lines.push(`        metric_value: "${String(metric?.metricValue || '').replace(/"/g, '\\"')}"`);
      }
      lines.push(`        explanation: "${String(metric?.explanation || '').replace(/"/g, '\\"')}"`);
    }
  }

  return lines.join('\n') + '\n';
}

/**
 * Builds an HTML report for many ontology analyses.
 *
 * @param {string} title
 * @param {ExportableMeasuresAnalysis[] | null | undefined} analyses
 * @returns {string}
 */
export function buildAllMeasuresHtml(title, analyses) {
  const rows = Array.isArray(analyses) ? analyses : [];
  let html = '<!doctype html><html><head><meta charset="utf-8" />';
  html += '<meta name="viewport" content="width=device-width, initial-scale=1" />';
  html += `<title>${escapeHtml(title)}</title>`;
  html += '<style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;margin:24px;}table{width:100%;border-collapse:collapse;margin-bottom:24px;}th,td{border-bottom:1px solid #ddd;padding:8px;text-align:left;vertical-align:top;}th{background:#f7f7f7;}h1,h2{margin-top:0}.mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;}</style>';
  html += '</head><body>';
  html += `<h1>${escapeHtml(title)}</h1>`;

  for (const analysis of rows) {
    html += `<h2>${escapeHtml(analysis?.fileName || 'Ontology analysis')}</h2>`;
    html += `<p class="mono">${escapeHtml(analysis?.ontologyIri || '')}</p>`;
    html += '<table><thead><tr><th>Metric</th><th>Value</th><th>Type</th><th>Explanation</th></tr></thead><tbody>';
    for (const metric of Array.isArray(analysis?.metrics) ? analysis.metrics : []) {
      html += '<tr>';
      html += `<td class="mono">${escapeHtml(metric?.metric || '')}</td>`;
      html += `<td>${escapeHtml(metricValueToString(metric?.metricValue || ''))}</td>`;
      html += `<td>${escapeHtml(metric?.metricType || '')}</td>`;
      html += `<td>${escapeHtml(metric?.explanation || '')}</td>`;
      html += '</tr>';
    }
    html += '</tbody></table>';
  }

  html += '</body></html>';
  return html;
}

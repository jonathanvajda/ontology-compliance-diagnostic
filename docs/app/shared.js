// app/shared.js
// @ts-check

/** @typedef {import('./types.js').OcqOntologyReport} OcqOntologyReport */
/** @typedef {import('./types.js').OcqOntologyReportStandardRow} OcqOntologyReportStandardRow */

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
 * Returns the standards array from an ontology report.
 *
 * @param {OcqOntologyReport | null | undefined} report
 * @returns {OcqOntologyReportStandardRow[]}
 */
export function getReportStandards(report) {
  return Array.isArray(report?.standards) ? report.standards : [];
}

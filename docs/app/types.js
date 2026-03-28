// app/types.js
// @ts-check

/**
 * Shared typedefs for OCQ modules.
 * This file is intentionally runtime-light and exists mainly for JSDoc imports.
 */

/**
 * @typedef {'single' | 'batch'} OcqRunKind
 */

/**
 * UI snapshot persisted with a saved run.
 *
 * Keep this aligned with the stable data model:
 * - standardFilter: selected standard/criterion filter in the UI
 * - selectedCriterionId: currently selected criterion detail row
 *
 * @typedef {Object} OcqUiStateSnapshot
 * @property {string} [statusFilter]
 * @property {string} [standardFilter]
 * @property {string | null} [selectedBatchKey]
 * @property {string | null} [selectedCriterionId]
 */

/**
 * A single evaluated ontology report bundle.
 *
 * @typedef {Object} OcqEvaluatedReport
 * @property {string} fileName
 * @property {string} ontologyIri
 * @property {Object | null} ontologyReport
 * @property {Array<Object>} perResource
 * @property {Array<Object>} results
 */

/**
 * Payload for a saved single run.
 *
 * @typedef {OcqEvaluatedReport} OcqSingleRunPayload
 */

/**
 * Payload for a saved batch run.
 *
 * @typedef {Array<OcqEvaluatedReport>} OcqBatchRunPayload
 */

/**
 * Save input accepted by saveRun().
 *
 * @typedef {Object} OcqSaveRunInput
 * @property {OcqRunKind} kind
 * @property {string} [label]
 * @property {OcqSingleRunPayload | OcqBatchRunPayload} payload
 * @property {OcqUiStateSnapshot | null} [uiState]
 */

/**
 * Persisted saved run record.
 *
 * @typedef {Object} OcqSavedRun
 * @property {string} id
 * @property {OcqRunKind} kind
 * @property {string} label
 * @property {string} createdAt
 * @property {OcqSingleRunPayload | OcqBatchRunPayload} payload
 * @property {OcqUiStateSnapshot | null} uiState
 */

/**
 * App-state pointer to the most recently saved run.
 *
 * @typedef {Object} OcqLastRunPointer
 * @property {'last'} key
 * @property {string} runId
 */

/**
 * @typedef {'SELECT' | 'ASK'} OcqManifestQueryKind
 */

/**
 * @typedef {'matchMeansFail' | 'matchMeansPass' | 'trueMeansPass' | 'trueMeansFail' | 'falseMeansPass' | 'falseMeansFail'} OcqManifestPolarity
 */

/**
 * @typedef {'resource' | 'ontology' | 'TBox'} OcqQueryScope
 */

/**
 * @typedef {'info' | 'warning' | 'error'} OcqSeverity
 */

/**
 * @typedef {'pass' | 'fail'} OcqQueryResultStatus
 */

/**
 * One query entry from manifest.json.
 *
 * @typedef {Object} OcqManifestQuery
 * @property {string} id
 * @property {string} file
 * @property {string} title
 * @property {OcqManifestQueryKind} kind
 * @property {OcqManifestPolarity} polarity
 * @property {string | null} checksCriterion
 * @property {OcqQueryScope} scope
 * @property {OcqSeverity} severity
 * @property {string} resultShape
 * @property {string} [resourceVar]
 */

/**
 * One standard entry from manifest.json.
 *
 * @typedef {Object} OcqManifestStandard
 * @property {string} id
 * @property {'requirement' | 'recommendation'} [type]
 * @property {number} [weight]
 * @property {string} [label]
 * @property {string} [statement]
 */

/**
 * Manifest model used by the OCQ app.
 *
 * @typedef {Object} OcqManifest
 * @property {number} [version]
 * @property {OcqManifestQuery[]} queries
 * @property {OcqManifestStandard[]} [standards]
 */

/**
 * Normalized row produced by engine.js.
 *
 * @typedef {Object} OcqQueryResultRow
 * @property {string | null} resource
 * @property {string} queryId
 * @property {string | null} criterionId
 * @property {OcqQueryResultStatus} status
 * @property {OcqSeverity} severity
 * @property {OcqQueryScope} scope
 * @property {Record<string, unknown>} details
 */

export {};
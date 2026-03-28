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

export {};
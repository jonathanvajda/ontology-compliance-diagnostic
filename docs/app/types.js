// app/types.js
// @ts-check

/**
 * Shared typedefs for OCQ modules.
 * This file is intentionally runtime-light and exists mainly for JSDoc imports.
 */

/**
 * @typedef {'single' | 'batch'} RunKind
 */

/**
 * UI snapshot persisted with a saved run.
 *
 * Keep this aligned with the stable data model:
 * - standardFilter: selected standard/criterion filter in the UI
 * - selectedCriterionId: currently selected criterion detail row
 *
 * @typedef {Object} UiStateSnapshot
 * @property {string} [statusFilter]
 * @property {string} [standardFilter]
 * @property {string | null} [selectedBatchKey]
 * @property {string | null} [selectedCriterionId]
 */

/**
 * User-selected scope for resource-level inspection.
 *
 * @typedef {Object} InspectionScope
 * @property {string[]} includedNamespaces
 */

/**
 * Lightweight preflight summary shown before inspection runs.
 *
 * @typedef {Object} PreflightSummary
 * @property {string} fileName
 * @property {string} ontologyIri
 * @property {OntologyMetadata | null} metadata
 * @property {string[]} imports
 * @property {string[]} discoveredNamespaces
 * @property {number} resourceCountEstimate
 */

/**
 * Prepared file entry used during preflight/staging.
 *
 * @typedef {Object} PreparedOntologyFile
 * @property {File} file
 * @property {PreflightSummary} summary
 * @property {InspectionScope} inspectionScope
 */

/**
 * A single evaluated ontology report bundle.
 *
 * @typedef {Object} ResourceDetailField
 * @property {string} id
 * @property {string} label
 * @property {string[]} values
 */

/**
 * A compact resource detail block extracted from the inspected ontology.
 *
 * @typedef {Object} ResourceDetail
 * @property {string} resource
 * @property {ResourceDetailField[]} fields
 */

/**
 * A single evaluated ontology report bundle.
 *
 * @typedef {Object} EvaluatedReport
 * @property {string} inspectedAt
 * @property {string} fileName
 * @property {string} ontologyIri
 * @property {OntologyMetadata | null} ontologyMetadata
 * @property {InspectionScope | null} [inspectionScope]
  * @property {OntologyReport | null} ontologyReport
  * @property {PerResourceCurationRow[]} perResource
 * @property {Record<string, ResourceDetail>} [resourceDetails]
  * @property {QueryResultRow[]} results
 */

/**
 * Payload for a saved single run.
 *
 * @typedef {EvaluatedReport} SingleRunPayload
 */

/**
 * Payload for a saved batch run.
 *
 * @typedef {Array<EvaluatedReport>} BatchRunPayload
 */

/**
 * Save input accepted by saveRun().
 *
 * @typedef {Object} SaveRunInput
 * @property {RunKind} kind
 * @property {string} [label]
 * @property {SingleRunPayload | BatchRunPayload} payload
 * @property {UiStateSnapshot | null} [uiState]
 */

/**
 * Persisted saved run record.
 *
 * @typedef {Object} SavedRun
 * @property {string} id
 * @property {RunKind} kind
 * @property {string} label
 * @property {string} createdAt
 * @property {SingleRunPayload | BatchRunPayload} payload
 * @property {UiStateSnapshot | null} uiState
 */

/**
 * App-state pointer to the most recently saved run.
 *
 * @typedef {Object} LastRunPointer
 * @property {'last'} key
 * @property {string} runId
 */

/**
 * @typedef {'SELECT' | 'ASK'} ManifestQueryKind
 */

/**
 * @typedef {'matchMeansFail' | 'matchMeansPass' | 'trueMeansPass' | 'trueMeansFail' | 'falseMeansPass' | 'falseMeansFail'} ManifestPolarity
 */

/**
 * @typedef {'resource' | 'ontology' | 'TBox'} QueryScope
 */

/**
 * @typedef {'info' | 'warning' | 'error'} Severity
 */

/**
 * @typedef {'pass' | 'fail'} QueryResultStatus
 */

/**
 * One query entry from manifest.json.
 *
 * @typedef {Object} ManifestQuery
 * @property {string} id
 * @property {string} file
 * @property {string} title
 * @property {ManifestQueryKind} kind
 * @property {ManifestPolarity} polarity
 * @property {string | null} checksCriterion
 * @property {QueryScope} scope
 * @property {Severity} severity
 * @property {string} resultShape
 * @property {string} [resourceVar]
 */

/**
 * One standard entry from manifest.json.
 *
 * @typedef {Object} ManifestStandard
 * @property {string} id
 * @property {'requirement' | 'recommendation'} [type]
 * @property {number} [weight]
 * @property {string} [label]
 * @property {string} [statement]
 * @property {string} [guidance]
 * @property {'usually low' | 'usually high' | 'case-by-case'} [remediationEffort]
 */

/**
 * Manifest model used by the OCQ app.
 *
 * @typedef {Object} Manifest
 * @property {number} [version]
 * @property {string} [standardsUrl]
 * @property {ManifestQuery[]} queries
 * @property {ManifestStandard[]} [standards]
 */

/**
 * Normalized row produced by engine.js.
 *
 * @typedef {Object} QueryResultRow
 * @property {string | null} resource
 * @property {string} queryId
 * @property {string | null} criterionId
 * @property {QueryResultStatus} status
 * @property {Severity} severity
 * @property {QueryScope} scope
 * @property {Record<string, unknown>} details
 */

/**
 * @typedef {'requirement' | 'recommendation'} StandardType
 */

/**
 * Flags used when deriving curation status.
 *
 * @typedef {Object} CurationFlags
 * @property {boolean} uncurated
 * @property {boolean} requiresDiscussion
 * @property {boolean} readyForRelease
 */

/**
 * One row in the per-resource curation table.
 *
 * @typedef {Object} PerResourceCurationRow
 * @property {string} resource
 * @property {string} statusIri
 * @property {string} statusLabel
 * @property {string[]} failedRequirements
 * @property {string[]} failedRecommendations
 */

/**
 * One row in the ontology-level standards report.
 *
 * @typedef {Object} OntologyReportStandardRow
 * @property {string} id
 * @property {StandardType} type
 * @property {'ontology' | 'content'} scopeCategory
 * @property {number} weight
 * @property {'pass' | 'fail'} status
 * @property {number} failedResourcesCount
 * @property {string[]} failingResources
 */

/**
 * Extracted ontology metadata and run-level facts for one evaluated ontology.
 *
 * @typedef {Object} OntologyMetadata
 * @property {string} fileName
 * @property {string} ontologyIri
 * @property {string | null} title
 * @property {string | null} description
 * @property {string | null} versionIri
 * @property {string | null} versionInfo
 * @property {string | null} license
 * @property {string | null} accessRights
 * @property {string[]} imports
 * @property {number} tripleCount
 * @property {number} labeledResourceCount
 */

/**
 * Ontology-level report returned by grader.js.
 *
 * @typedef {Object} OntologyReport
 * @property {string} ontologyIri
 * @property {OntologyMetadata | null} metadata
 * @property {string} statusIri
 * @property {string} statusLabel
 * @property {OntologyReportStandardRow[]} ontologyStandards
 * @property {OntologyReportStandardRow[]} contentStandards
 * @property {OntologyReportStandardRow[]} standards
 */

/**
 * Failure index:
 * Map<resourceIri, Map<criterionId, Set<queryId>>>
 *
 * @typedef {Map<string, Map<string, Set<string>>>} FailureIndex
 */

/**
 * Current UI data passed into report/export builders.
 *
 * @typedef {Object} ExportState
 * @property {string} [statusFilter]
 * @property {string} [standardFilter]
 * @property {string | null} [selectedCriterionId]
 * @property {Manifest | null} [manifest]
 * @property {InspectionScope | null} [inspectionScope]
 * @property {OntologyMetadata | null} [ontologyMetadata]
 * @property {OntologyReport | null} [ontologyReport]
 * @property {PerResourceCurationRow[]} [perResourceRows]
 * @property {QueryResultRow[]} [results]
 */

export {};

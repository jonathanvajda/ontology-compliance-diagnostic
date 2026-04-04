// app/grader.js
// @ts-check

/** @typedef {import('./types.js').OcqManifest} OcqManifest */
/** @typedef {import('./types.js').OcqManifestStandard} OcqManifestStandard */
/** @typedef {import('./types.js').OcqInspectionScope} OcqInspectionScope */
/** @typedef {import('./types.js').OcqOntologyMetadata} OcqOntologyMetadata */
/** @typedef {import('./types.js').OcqQueryResultRow} OcqQueryResultRow */
/** @typedef {import('./types.js').OcqStandardType} OcqStandardType */
/** @typedef {import('./types.js').OcqCurationFlags} OcqCurationFlags */
/** @typedef {import('./types.js').OcqPerResourceCurationRow} OcqPerResourceCurationRow */
/** @typedef {import('./types.js').OcqOntologyReportStandardRow} OcqOntologyReportStandardRow */
/** @typedef {import('./types.js').OcqOntologyReport} OcqOntologyReport */
/** @typedef {import('./types.js').OcqFailureIndex} OcqFailureIndex */

/**
 * Internal accumulator shape for per-resource curation.
 *
 * @typedef {Object} PerResourceAccumulator
 * @property {string} resource
 * @property {Set<string>} failedRequirements
 * @property {Set<string>} failedRecommendations
 * @property {OcqCurationFlags} flags
 */

/**
 * Internal accumulator shape for ontology report rows.
 *
 * @typedef {Object} OntologyStandardAccumulator
 * @property {string} id
 * @property {OcqStandardType} type
 * @property {'ontology' | 'content'} scopeCategory
 * @property {number} weight
 * @property {boolean} hasFail
 * @property {Set<string>} failingResources
 */

export const CURATION_STATUS_IRIS = Object.freeze({
  UNCURATED: 'http://purl.obolibrary.org/obo/IAO_0000124',
  METADATA_INCOMPLETE: 'http://purl.obolibrary.org/obo/IAO_0000123',
  METADATA_COMPLETE: 'http://purl.obolibrary.org/obo/IAO_0000120',
  PENDING_FINAL_VETTING: 'http://purl.obolibrary.org/obo/IAO_0000125',
  REQUIRES_DISCUSSION: 'http://example.org/curation-status/requires-discussion',
  READY_FOR_RELEASE: 'http://example.org/curation-status/ready-for-release'
});

/** @type {Readonly<Record<string, string>>} */
export const CURATION_STATUS_LABELS = Object.freeze({
  [CURATION_STATUS_IRIS.UNCURATED]: 'uncurated',
  [CURATION_STATUS_IRIS.METADATA_INCOMPLETE]: 'metadata incomplete',
  [CURATION_STATUS_IRIS.METADATA_COMPLETE]: 'metadata complete',
  [CURATION_STATUS_IRIS.PENDING_FINAL_VETTING]: 'pending final vetting',
  [CURATION_STATUS_IRIS.REQUIRES_DISCUSSION]: 'requires discussion',
  [CURATION_STATUS_IRIS.READY_FOR_RELEASE]: 'ready for release'
});

export const UNKNOWN_ONTOLOGY_IRI = 'urn:ontology:unknown';
export const UNKNOWN_RESOURCE_IRI = 'urn:resource:unknown';

/**
 * Returns a normalized criterion id from a result row.
 *
 * @param {Partial<OcqQueryResultRow> | null | undefined} row
 * @returns {string | null}
 */
export function getResultCriterionId(row) {
  return row?.criterionId || null;
}

/**
 * Returns a fresh curation flags object.
 *
 * @returns {OcqCurationFlags}
 */
export function makeEmptyCurationFlags() {
  return {
    uncurated: false,
    requiresDiscussion: false,
    readyForRelease: false
  };
}

/**
 * Resolves the standard type for a manifest standard entry.
 *
 * @param {Partial<OcqManifestStandard> | null | undefined} standard
 * @returns {OcqStandardType}
 */
export function getStandardType(standard) {
  return standard?.type === 'recommendation' ? 'recommendation' : 'requirement';
}

/**
 * Returns the curation status IRI for the supplied failure state and flags.
 *
 * Current policy:
 * - uncurated overrides all
 * - any failed requirement -> metadata incomplete
 * - recommendation failures only -> metadata complete
 * - no failures -> pending final vetting
 *
 * @param {boolean} hasRequirementFailure
 * @param {boolean} hasRecommendationFailure
 * @param {Partial<OcqCurationFlags>} [flags={}]
 * @returns {string}
 */
export function getCurationStatusIri(
  hasRequirementFailure,
  hasRecommendationFailure,
  flags = {}
) {
  if (flags.uncurated) {
    return CURATION_STATUS_IRIS.UNCURATED;
  }
  if (hasRequirementFailure) {
    return CURATION_STATUS_IRIS.METADATA_INCOMPLETE;
  }
  if (!hasRequirementFailure && hasRecommendationFailure) {
    return CURATION_STATUS_IRIS.METADATA_COMPLETE;
  }
  return CURATION_STATUS_IRIS.PENDING_FINAL_VETTING;
}

/**
 * Returns the human-readable label for a curation status IRI.
 *
 * @param {string} statusIri
 * @returns {string}
 */
export function getCurationStatusLabel(statusIri) {
  return CURATION_STATUS_LABELS[statusIri] || 'unknown';
}

/**
 * Builds a map from criterion id to standard type.
 *
 * @param {OcqManifest | null | undefined} manifest
 * @returns {Map<string, OcqStandardType>}
 */
export function buildStandardTypeMap(manifest) {
  /** @type {Map<string, OcqStandardType>} */
  const standardTypeMap = new Map();

  if (!manifest || !Array.isArray(manifest.standards)) {
    return standardTypeMap;
  }

  for (const standard of manifest.standards) {
    if (!standard || !standard.id) {
      continue;
    }
    standardTypeMap.set(standard.id, getStandardType(standard));
  }

  return standardTypeMap;
}

/**
 * Builds a map from criterion id to high-level scope category.
 *
 * @param {OcqManifest | null | undefined} manifest
 * @returns {Map<string, 'ontology' | 'content'>}
 */
export function buildCriterionScopeCategoryMap(manifest) {
  /** @type {Map<string, 'ontology' | 'content'>} */
  const criterionScopeMap = new Map();

  if (!manifest || !Array.isArray(manifest.queries)) {
    return criterionScopeMap;
  }

  for (const query of manifest.queries) {
    if (!query?.checksCriterion) {
      continue;
    }

    criterionScopeMap.set(
      query.checksCriterion,
      query.scope === 'ontology' ? 'ontology' : 'content'
    );
  }

  return criterionScopeMap;
}

/**
 * Returns true if a result row should count as a resource-scoped failure.
 *
 * Ontology-scoped failures are intentionally excluded from per-resource views.
 *
 * @param {Partial<OcqQueryResultRow> | null | undefined} row
 * @returns {boolean}
 */
export function isResourceScopedRow(row) {
  const scope = row?.scope || 'resource';
  return scope === 'resource' || scope === 'TBox';
}

/**
 * Returns true when a resource IRI falls within the selected inspection scope.
 *
 * @param {string | null | undefined} resourceIri
 * @param {OcqInspectionScope | null | undefined} inspectionScope
 * @returns {boolean}
 */
export function isInInspectionScope(resourceIri, inspectionScope) {
  const includedNamespaces = Array.isArray(inspectionScope?.includedNamespaces)
    ? inspectionScope.includedNamespaces.filter((namespace) => typeof namespace === 'string' && namespace !== '')
    : [];

  if (!includedNamespaces.length) {
    return true;
  }

  const iri = resourceIri || '';
  if (!iri) {
    return false;
  }

  return includedNamespaces.some((namespace) => iri.startsWith(namespace));
}

/**
 * Creates a new per-resource accumulator entry.
 *
 * @param {string} resource
 * @returns {PerResourceAccumulator}
 */
export function createPerResourceAccumulator(resource) {
  return {
    resource,
    failedRequirements: new Set(),
    failedRecommendations: new Set(),
    flags: makeEmptyCurationFlags()
  };
}

/**
 * Builds an index of failing query ids by resource and criterion id.
 *
 * Shape:
 * Map<resourceIri, Map<criterionId, Set<queryId>>>
 *
 * Only resource-scoped failures are indexed.
 *
 * @param {OcqQueryResultRow[] | null | undefined} results
 * @param {OcqInspectionScope | null | undefined} [inspectionScope]
 * @returns {OcqFailureIndex}
 */
export function buildFailuresIndex(results, inspectionScope) {
  /** @type {OcqFailureIndex} */
  const byResource = new Map();

  if (!Array.isArray(results)) {
    return byResource;
  }

  for (const row of results) {
    if (!row || row.status !== 'fail') {
      continue;
    }
    if (!isResourceScopedRow(row)) {
      continue;
    }
    if (!isInInspectionScope(row.resource, inspectionScope)) {
      continue;
    }

    const resource = row.resource;
    const criterionId = getResultCriterionId(row);
    const queryId = row.queryId;

    if (!resource || !criterionId || !queryId) {
      continue;
    }

    if (!byResource.has(resource)) {
      byResource.set(resource, new Map());
    }

    const byCriterion = byResource.get(resource);
    if (!byCriterion) {
      continue;
    }

    if (!byCriterion.has(criterionId)) {
      byCriterion.set(criterionId, new Set());
    }

    const queryIds = byCriterion.get(criterionId);
    if (queryIds) {
      queryIds.add(queryId);
    }
  }

  return byResource;
}

/**
 * Computes per-resource curation rows from normalized query results.
 *
 * Notes:
 * - ontology-scoped rows are excluded from per-resource curation
 * - resources listed in allResources are included even if they have no failures
 *
 * @param {OcqQueryResultRow[] | null | undefined} results
 * @param {OcqManifest | null | undefined} manifest
 * @param {string[] | null | undefined} allResources
 * @param {OcqInspectionScope | null | undefined} [inspectionScope]
 * @returns {OcqPerResourceCurationRow[]}
 */
export function computePerResourceCuration(results, manifest, allResources, inspectionScope) {
  const standardTypeMap = buildStandardTypeMap(manifest);

  /** @type {Map<string, PerResourceAccumulator>} */
  const perResource = new Map();

  const rows = Array.isArray(results) ? results : [];

  for (const row of rows) {
    if (!row || !isResourceScopedRow(row)) {
      continue;
    }
    if (!isInInspectionScope(row.resource, inspectionScope)) {
      continue;
    }

    const resource = row.resource || UNKNOWN_RESOURCE_IRI;
    const criterionId = getResultCriterionId(row);
    const status = row.status || 'fail';
    const queryId = row.queryId || null;

    /** @type {OcqStandardType} */
    let standardType = 'requirement';
    if (criterionId && standardTypeMap.has(criterionId)) {
      standardType = /** @type {OcqStandardType} */ (standardTypeMap.get(criterionId));
    }

    let entry = perResource.get(resource);
    if (!entry) {
      entry = createPerResourceAccumulator(resource);
      perResource.set(resource, entry);
    }

    if (status === 'fail' && criterionId) {
      if (standardType === 'recommendation') {
        entry.failedRecommendations.add(criterionId);
      } else {
        entry.failedRequirements.add(criterionId);
      }
    }

    if (status === 'fail' && queryId === 'q_onlyLabel') {
      entry.flags.uncurated = true;
    }
  }

  if (Array.isArray(allResources)) {
    for (const resourceIri of allResources) {
      if (!resourceIri) {
        continue;
      }
      if (!isInInspectionScope(resourceIri, inspectionScope)) {
        continue;
      }
      if (!perResource.has(resourceIri)) {
        perResource.set(resourceIri, createPerResourceAccumulator(resourceIri));
      }
    }
  }

  /** @type {OcqPerResourceCurationRow[]} */
  const output = [];

  for (const entry of perResource.values()) {
    const hasRequirementFailure = entry.failedRequirements.size > 0;
    const hasRecommendationFailure = entry.failedRecommendations.size > 0;

    const statusIri = getCurationStatusIri(
      hasRequirementFailure,
      hasRecommendationFailure,
      entry.flags
    );
    const statusLabel = getCurationStatusLabel(statusIri);

    output.push({
      resource: entry.resource,
      statusIri,
      statusLabel,
      failedRequirements: Array.from(entry.failedRequirements).sort(),
      failedRecommendations: Array.from(entry.failedRecommendations).sort()
    });
  }

  output.sort((a, b) => String(a.resource).localeCompare(String(b.resource)));
  return output;
}

/**
 * Computes an ontology-level standards report.
 *
 * A standard fails if any matching failing result row exists for that criterion id.
 * Resource counts only include resource/TBox-scoped failures.
 *
 * @param {OcqQueryResultRow[] | null | undefined} results
 * @param {OcqManifest | null | undefined} manifest
 * @param {string | null | undefined} ontologyIri
 * @param {OcqOntologyMetadata | null | undefined} [ontologyMetadata]
 * @param {OcqInspectionScope | null | undefined} [inspectionScope]
 * @returns {OcqOntologyReport}
 */
export function computeOntologyReport(results, manifest, ontologyIri, ontologyMetadata, inspectionScope) {
  /** @type {Map<string, OntologyStandardAccumulator>} */
  const standardAccumulators = new Map();
  const criterionScopeMap = buildCriterionScopeCategoryMap(manifest);

  if (manifest && Array.isArray(manifest.standards)) {
    for (const standard of manifest.standards) {
      if (!standard || !standard.id) {
        continue;
      }

      standardAccumulators.set(standard.id, {
        id: standard.id,
        type: getStandardType(standard),
        scopeCategory: criterionScopeMap.get(standard.id) || 'content',
        weight: typeof standard.weight === 'number' ? standard.weight : 1,
        hasFail: false,
        failingResources: new Set()
      });
    }
  }

  const rows = Array.isArray(results) ? results : [];

  for (const row of rows) {
    const criterionId = getResultCriterionId(row);
    const status = row?.status || 'fail';
    const resource = row?.resource || null;

    if (!criterionId || !standardAccumulators.has(criterionId)) {
      continue;
    }
    if (status !== 'fail') {
      continue;
    }

    const entry = standardAccumulators.get(criterionId);
    if (!entry) {
      continue;
    }

    if (
      entry.scopeCategory !== 'ontology' &&
      !isInInspectionScope(resource, inspectionScope)
    ) {
      continue;
    }

    entry.hasFail = true;

    if (isResourceScopedRow(row) && resource) {
      entry.failingResources.add(resource);
    }
  }

  let hasRequirementFailure = false;
  let hasRecommendationFailure = false;

  /** @type {OcqOntologyReportStandardRow[]} */
  const standards = [];
  /** @type {OcqOntologyReportStandardRow[]} */
  const ontologyStandards = [];
  /** @type {OcqOntologyReportStandardRow[]} */
  const contentStandards = [];

  for (const entry of standardAccumulators.values()) {
    const status = entry.hasFail ? 'fail' : 'pass';
    const failedResourcesCount = entry.failingResources.size;

    if (entry.type === 'requirement' && entry.hasFail) {
      hasRequirementFailure = true;
    }
    if (entry.type === 'recommendation' && entry.hasFail) {
      hasRecommendationFailure = true;
    }

    standards.push({
      id: entry.id,
      type: entry.type,
      scopeCategory: entry.scopeCategory,
      weight: entry.weight,
      status,
      failedResourcesCount,
      failingResources: Array.from(entry.failingResources).sort()
    });
  }

  standards.sort((a, b) => String(a.id).localeCompare(String(b.id)));

  for (const standard of standards) {
    if (standard.scopeCategory === 'ontology') {
      ontologyStandards.push(standard);
    } else {
      contentStandards.push(standard);
    }
  }

  const statusIri = getCurationStatusIri(
    hasRequirementFailure,
    hasRecommendationFailure,
    makeEmptyCurationFlags()
  );
  const statusLabel = getCurationStatusLabel(statusIri);

  return {
    ontologyIri: ontologyIri || UNKNOWN_ONTOLOGY_IRI,
    metadata: ontologyMetadata || null,
    statusIri,
    statusLabel,
    ontologyStandards,
    contentStandards,
    standards
  };
}

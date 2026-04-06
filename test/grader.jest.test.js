import { describe, expect, test } from '@jest/globals';
import {
  CURATION_STATUS_IRIS,
  buildFailuresIndex,
  computeOntologyReport,
  computePerResourceCuration,
  getCurationStatusLabel,
  getCurationStatusRank
} from '../docs/app/grader.js';

/** @type {import('../docs/app/types.js').Manifest} */
const manifest = {
  queries: [
    {
      id: 'q_req',
      file: 'q_req.rq',
      title: 'Requirement query',
      kind: 'SELECT',
      polarity: 'matchMeansFail',
      checksCriterion: 'STD:REQ',
      scope: 'resource',
      severity: 'error',
      resultShape: 'rows'
    },
    {
      id: 'q_rec',
      file: 'q_rec.rq',
      title: 'Recommendation query',
      kind: 'SELECT',
      polarity: 'matchMeansFail',
      checksCriterion: 'STD:REC',
      scope: 'resource',
      severity: 'warning',
      resultShape: 'rows'
    },
    {
      id: 'q_onto',
      file: 'q_onto.rq',
      title: 'Ontology query',
      kind: 'ASK',
      polarity: 'trueMeansFail',
      checksCriterion: 'STD:ONTO',
      scope: 'ontology',
      severity: 'error',
      resultShape: 'boolean'
    }
  ],
  standards: [
    { id: 'STD:REQ', type: 'requirement', label: 'Required metadata' },
    { id: 'STD:REC', type: 'recommendation', label: 'Recommended metadata' },
    { id: 'STD:ONTO', type: 'requirement', label: 'Ontology-level check' }
  ]
};

/** @type {import('../docs/app/types.js').QueryResultRow[]} */
const results = [
  {
    resource: 'http://example.org/A',
    queryId: 'q_req',
    criterionId: 'STD:REQ',
    status: 'fail',
    severity: 'error',
    scope: 'resource',
    details: {}
  },
  {
    resource: 'http://example.org/A',
    queryId: 'q_rec',
    criterionId: 'STD:REC',
    status: 'fail',
    severity: 'warning',
    scope: 'resource',
    details: {}
  },
  {
    resource: 'http://example.org/B',
    queryId: 'q_rec',
    criterionId: 'STD:REC',
    status: 'fail',
    severity: 'warning',
    scope: 'resource',
    details: {}
  },
  {
    resource: null,
    queryId: 'q_onto',
    criterionId: 'STD:ONTO',
    status: 'fail',
    severity: 'error',
    scope: 'ontology',
    details: {}
  }
];

describe('grader regression coverage', () => {
  test('getCurationStatusLabel falls back to raw values and ranks known states', () => {
    expect(getCurationStatusLabel(CURATION_STATUS_IRIS.METADATA_COMPLETE)).toBe('metadata complete');
    expect(getCurationStatusLabel('literal-status')).toBe('literal-status');
    expect(getCurationStatusRank(CURATION_STATUS_IRIS.PENDING_FINAL_VETTING)).toBeGreaterThan(
      getCurationStatusRank(CURATION_STATUS_IRIS.METADATA_COMPLETE)
    );
  });

  test('buildFailuresIndex groups failing query ids by resource and criterion', () => {
    const index = buildFailuresIndex(results);

    expect(Array.from(index.get('http://example.org/A')?.get('STD:REQ') || [])).toEqual(['q_req']);
    expect(Array.from(index.get('http://example.org/A')?.get('STD:REC') || [])).toEqual(['q_rec']);
    expect(index.has('http://example.org/B')).toBe(true);
    expect(index.has('urn:ontology:unknown')).toBe(false);
  });

  test('computePerResourceCuration keeps all resources and derives maturity labels', () => {
    const rows = computePerResourceCuration(
      results,
      manifest,
      ['http://example.org/A', 'http://example.org/B', 'http://example.org/C']
    );

    expect(rows).toEqual([
      {
        resource: 'http://example.org/A',
        statusIri: CURATION_STATUS_IRIS.METADATA_INCOMPLETE,
        statusLabel: 'metadata incomplete',
        failedRequirements: ['STD:REQ'],
        failedRecommendations: ['STD:REC']
      },
      {
        resource: 'http://example.org/B',
        statusIri: CURATION_STATUS_IRIS.METADATA_COMPLETE,
        statusLabel: 'metadata complete',
        failedRequirements: [],
        failedRecommendations: ['STD:REC']
      },
      {
        resource: 'http://example.org/C',
        statusIri: CURATION_STATUS_IRIS.PENDING_FINAL_VETTING,
        statusLabel: 'pending final vetting',
        failedRequirements: [],
        failedRecommendations: []
      }
    ]);
  });

  test('computeOntologyReport separates ontology and content standards', () => {
    const report = computeOntologyReport(results, manifest, 'http://example.org/onto');

    expect(report.ontologyIri).toBe('http://example.org/onto');
    expect(report.statusLabel).toBe('metadata incomplete');
    expect(report.ontologyStandards).toEqual([
      expect.objectContaining({ id: 'STD:ONTO', scopeCategory: 'ontology', status: 'fail' })
    ]);
    expect(report.contentStandards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'STD:REQ', status: 'fail', failedResourcesCount: 1 }),
        expect.objectContaining({ id: 'STD:REC', status: 'fail', failedResourcesCount: 2 })
      ])
    );
  });
});

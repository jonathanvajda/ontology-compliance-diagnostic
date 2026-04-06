import { beforeEach, describe, expect, test } from '@jest/globals';

function installMinimalDom() {
  globalThis.document = {
    body: {
      appendChild() {}
    },
    getElementById() {
      return null;
    },
    createElement() {
      return {
        click() {},
        remove() {}
      };
    }
  };
}

describe('report/export regression coverage', () => {
  beforeEach(() => {
    installMinimalDom();
  });

  test('getStandardDetailEntries groups query ids by resource', async () => {
    const { getStandardDetailEntries } = await import('../docs/app/render-standards.js');

    const entries = getStandardDetailEntries('STD:REC', [
      {
        resource: 'http://example.org/B',
        queryId: 'q2',
        criterionId: 'STD:REC',
        status: 'fail',
        severity: 'warning',
        scope: 'resource',
        details: {}
      },
      {
        resource: 'http://example.org/B',
        queryId: 'q1',
        criterionId: 'STD:REC',
        status: 'fail',
        severity: 'warning',
        scope: 'resource',
        details: {}
      },
      {
        resource: 'http://example.org/A',
        queryId: 'q3',
        criterionId: 'STD:REC',
        status: 'fail',
        severity: 'warning',
        scope: 'resource',
        details: {}
      },
      {
        resource: 'http://example.org/A',
        queryId: 'q4',
        criterionId: 'STD:OTHER',
        status: 'fail',
        severity: 'warning',
        scope: 'resource',
        details: {}
      }
    ]);

    expect(entries).toEqual([
      { resource: 'http://example.org/A', queryIds: ['q3'] },
      { resource: 'http://example.org/B', queryIds: ['q1', 'q2'] }
    ]);
  });

  test('buildResultsCsv, buildFilteredResourcesCsv, and buildBatchSummaryCsv serialize stable columns', async () => {
    const {
      buildBatchSummaryCsv,
      buildFilteredResourcesCsv,
      buildResultsCsv
    } = await import('../docs/app/report-export.js');

    expect(
      buildResultsCsv(
        [{
          resource: 'http://example.org/A',
          queryId: 'q_req',
          criterionId: 'STD:REQ',
          status: 'fail',
          severity: 'error',
          scope: 'resource',
          details: {}
        }],
        'http://example.org/onto'
      )
    ).toContain('ontologyIri,resource,queryId,criterionId,status,severity,scope');

    expect(
      buildFilteredResourcesCsv([
        {
          resource: 'http://example.org/A',
          statusIri: 'http://purl.obolibrary.org/obo/IAO_0000123',
          statusLabel: 'metadata incomplete',
          failedRequirements: ['STD:REQ'],
          failedRecommendations: ['STD:REC']
        }
      ])
    ).toContain('failedRequirementsCount,failedRecommendationsCount');

    expect(
      buildBatchSummaryCsv([
        {
          fileName: 'a.owl',
          ontologyIri: 'http://example.org/onto',
          ontologyMetadata: null,
          inspectedAt: '2026-04-06T00:00:00Z',
          ontologyReport: {
            ontologyIri: 'http://example.org/onto',
            metadata: null,
            statusIri: 'status:1',
            statusLabel: 'metadata incomplete',
            ontologyStandards: [],
            contentStandards: [],
            standards: [
              { id: 'STD:REQ', type: 'requirement', scopeCategory: 'content', weight: 1, status: 'fail', failedResourcesCount: 1, failingResources: [] },
              { id: 'STD:REC', type: 'recommendation', scopeCategory: 'content', weight: 1, status: 'pass', failedResourcesCount: 0, failingResources: [] }
            ]
          },
          perResource: [],
          results: []
        }
      ])
    ).toContain('fileName,ontologyIri,statusIri,statusLabel');
  });

  test('buildHtmlReport includes ontology, scope, and selected standard context', async () => {
    const { buildHtmlReport } = await import('../docs/app/report-export.js');

    const html = buildHtmlReport({
      statusFilter: 'metadata complete',
      standardFilter: 'STD:REQ',
      selectedCriterionId: 'STD:REQ',
      manifest: {
        queries: [
          {
            id: 'q_req',
            file: 'q_req.rq',
            title: 'Check preferred label',
            kind: 'SELECT',
            polarity: 'matchMeansFail',
            checksCriterion: 'STD:REQ',
            scope: 'resource',
            severity: 'error',
            resultShape: 'rows'
          }
        ],
        standards: [
          {
            id: 'STD:REQ',
            type: 'requirement',
            label: 'Preferred label',
            guidance: 'Add one preferred label.',
            remediationEffort: 'usually low'
          }
        ]
      },
      inspectionScope: {
        includedNamespaces: ['http://example.org/']
      },
      ontologyMetadata: {
        fileName: 'example.owl',
        ontologyIri: 'http://example.org/onto',
        title: 'Example ontology',
        description: null,
        versionIri: 'http://example.org/onto/releases/1',
        versionInfo: '1.0.0',
        license: 'CC-BY',
        accessRights: null,
        imports: ['http://purl.obolibrary.org/obo/omo.owl'],
        tripleCount: 42,
        labeledResourceCount: 3
      },
      ontologyReport: {
        ontologyIri: 'http://example.org/onto',
        metadata: null,
        statusIri: 'status:1',
        statusLabel: 'metadata incomplete',
        ontologyStandards: [],
        contentStandards: [
          {
            id: 'STD:REQ',
            type: 'requirement',
            scopeCategory: 'content',
            weight: 1,
            status: 'fail',
            failedResourcesCount: 1,
            failingResources: ['http://example.org/A']
          }
        ],
        standards: [
          {
            id: 'STD:REQ',
            type: 'requirement',
            scopeCategory: 'content',
            weight: 1,
            status: 'fail',
            failedResourcesCount: 1,
            failingResources: ['http://example.org/A']
          }
        ]
      },
      perResourceRows: [
        {
          resource: 'http://example.org/A',
          statusIri: 'status:1',
          statusLabel: 'metadata incomplete',
          failedRequirements: ['STD:REQ'],
          failedRecommendations: []
        }
      ],
      results: [
        {
          resource: 'http://example.org/A',
          queryId: 'q_req',
          criterionId: 'STD:REQ',
          status: 'fail',
          severity: 'error',
          scope: 'resource',
          details: {}
        }
      ]
    });

    expect(html).toContain('Ontology Checks Report');
    expect(html).toContain('Example ontology');
    expect(html).toContain('http://example.org/');
    expect(html).toContain('Preferred label');
    expect(html).toContain('Add one preferred label.');
    expect(html).toContain('http://example.org/A');
  });
});

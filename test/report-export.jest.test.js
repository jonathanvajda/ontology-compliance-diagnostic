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

  test('buildExternalDependenciesSeedText writes ontology slim seed rows', async () => {
    const {
      buildExternalDependenciesSeedText,
      buildImportSnippetText,
      deriveImportCandidates
    } = await import('../docs/app/measures-export.js');

    expect(buildExternalDependenciesSeedText([
      {
        iri: 'http://example.org/import/B',
        label: 'Imported B',
        curatedIn: 'http://example.org/import/ontology',
        reasons: ['object']
      }
    ])).toBe('http://example.org/import/B # Imported B # # http://example.org/import/ontology\n');

    expect(buildExternalDependenciesSeedText([
      {
        iri: 'http://example.org/import/B',
        label: 'Imported B',
        curatedIn: 'http://example.org/import/z',
        reasons: ['object']
      },
      {
        iri: 'http://example.org/import/A',
        label: 'Imported A',
        curatedIn: 'http://example.org/import/a',
        reasons: ['object']
      }
    ], 'curated_in')).toBe(
      'http://example.org/import/A # Imported A # # http://example.org/import/a\n' +
      'http://example.org/import/B # Imported B # # http://example.org/import/z\n'
    );

    expect(buildImportSnippetText('http://example.org/onto', ['http://example.org/import/one'], 'ttl'))
      .toBe('owl:imports <http://example.org/import/one> .');
    expect(buildImportSnippetText('http://example.org/onto', ['http://example.org/import/one'], 'rdfxml'))
      .toBe('<owl:imports rdf:resource="http://example.org/import/one"/>');
    expect(buildImportSnippetText('http://example.org/onto', ['http://example.org/import/one'], 'ntriples'))
      .toBe('<http://example.org/onto> <http://www.w3.org/2002/07/owl#imports> <http://example.org/import/one> .');
    expect(buildImportSnippetText('http://example.org/onto', ['http://example.org/import/one', 'http://example.org/import/two'], 'jsonld'))
      .toContain('"http://www.w3.org/2002/07/owl#imports"');

    expect(deriveImportCandidates([
      {
        iri: 'http://example.org/import/B',
        label: 'Imported B',
        curatedIn: 'http://example.org/import/ontology-b',
        reasons: ['object']
      },
      {
        iri: 'http://example.org/import/A',
        label: 'Imported A',
        curatedIn: 'http://example.org/import/ontology-a',
        reasons: ['object']
      }
    ], ['http://example.org/import/ontology-b'])).toEqual({
      allCandidates: [
        'http://example.org/import/ontology-a',
        'http://example.org/import/ontology-b'
      ],
      missingCandidates: [
        'http://example.org/import/ontology-a'
      ]
    });
  });

  test('measures export builders serialize basic formats', async () => {
    const {
      buildAllMeasuresCsv,
      buildAllMeasuresHtml,
      buildAllMeasuresJson,
      buildAllMeasuresTsv,
      buildAllMeasuresYaml,
      buildMeasuresCsv,
      buildMeasuresHtml,
      buildMeasuresJson,
      buildMeasuresTsv,
      buildMeasuresYaml
    } = await import('../docs/app/measures-export.js');

    const metrics = [
      {
        metric: 'class_count',
        metricValue: 3,
        metricType: 'single_value',
        explanation: 'Number of classes in the ontology.'
      },
      {
        metric: 'datatypes_builtin',
        metricValue: ['BOOLEAN'],
        metricType: 'list_value',
        explanation: 'Datatypes used from the built-in datatype map.'
      }
    ];

    expect(buildMeasuresCsv(metrics)).toContain('metric,metric_value,metric_type,explanation');
    expect(buildMeasuresTsv(metrics)).toContain('metric\tmetric_value\tmetric_type\texplanation');
    expect(buildMeasuresJson(metrics)).toContain('"metric": "class_count"');
    expect(buildMeasuresYaml(metrics)).toContain('metrics:');
    expect(buildMeasuresHtml('Example measures', metrics)).toContain('<h1>Example measures</h1>');

    const analyses = [
      {
        fileName: 'example.owl',
        ontologyIri: 'http://example.org/onto',
        metrics
      }
    ];

    expect(buildAllMeasuresCsv(analyses)).toContain('fileName,ontologyIri,metric,metric_value,metric_type,explanation');
    expect(buildAllMeasuresTsv(analyses)).toContain('fileName\tontologyIri\tmetric\tmetric_value\tmetric_type\texplanation');
    expect(buildAllMeasuresJson(analyses)).toContain('"fileName": "example.owl"');
    expect(buildAllMeasuresYaml(analyses)).toContain('analyses:');
    expect(buildAllMeasuresHtml('All measures', analyses)).toContain('<h1>All measures</h1>');
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
          currentStatusIri: 'http://purl.obolibrary.org/obo/IAO_0000124',
          currentStatusLabel: 'uncurated',
          statusIri: 'http://purl.obolibrary.org/obo/IAO_0000123',
          statusLabel: 'metadata incomplete',
          failedRequirements: ['STD:REQ'],
          failedRecommendations: ['STD:REC']
        }
      ])
    ).toContain('currentStatusIri,currentStatusLabel,statusIri,statusLabel');

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
          currentStatusIri: 'status:0',
          currentStatusLabel: 'uncurated',
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
    expect(html).toContain('uncurated');
  });
});

import { beforeEach, describe, expect, test } from '@jest/globals';
import N3 from 'n3';

function installWindow() {
  globalThis.window = { N3 };
}

describe('measures model', () => {
  beforeEach(() => {
    installWindow();
  });

  test('computeBasicMeasures returns core counts and hierarchy metrics', async () => {
    const { computeBasicMeasures } = await import('../docs/app/measures-model.js');
    const { namedNode, literal, quad } = N3.DataFactory;

    const store = new N3.Store([
      quad(
        namedNode('http://example.org/onto'),
        namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
        namedNode('http://www.w3.org/2002/07/owl#Ontology')
      ),
      quad(
        namedNode('http://example.org/ClassA'),
        namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
        namedNode('http://www.w3.org/2002/07/owl#Class')
      ),
      quad(
        namedNode('http://example.org/ClassB'),
        namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
        namedNode('http://www.w3.org/2002/07/owl#Class')
      ),
      quad(
        namedNode('http://example.org/ClassC'),
        namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
        namedNode('http://www.w3.org/2002/07/owl#Class')
      ),
      quad(
        namedNode('http://example.org/prop'),
        namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
        namedNode('http://www.w3.org/2002/07/owl#ObjectProperty')
      ),
      quad(
        namedNode('http://example.org/dataProp'),
        namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
        namedNode('http://www.w3.org/2002/07/owl#DatatypeProperty')
      ),
      quad(
        namedNode('http://example.org/annoProp'),
        namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
        namedNode('http://www.w3.org/2002/07/owl#AnnotationProperty')
      ),
      quad(
        namedNode('http://example.org/ind1'),
        namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
        namedNode('http://www.w3.org/2002/07/owl#NamedIndividual')
      ),
      quad(
        namedNode('http://example.org/ind1'),
        namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
        namedNode('http://example.org/ClassA')
      ),
      quad(
        namedNode('http://example.org/ClassB'),
        namedNode('http://www.w3.org/2000/01/rdf-schema#subClassOf'),
        namedNode('http://example.org/ClassA')
      ),
      quad(
        namedNode('http://example.org/ClassC'),
        namedNode('http://www.w3.org/2000/01/rdf-schema#subClassOf'),
        namedNode('http://example.org/ClassA')
      ),
      quad(
        namedNode('http://example.org/ClassC'),
        namedNode('http://www.w3.org/2000/01/rdf-schema#subClassOf'),
        namedNode('http://example.org/ClassB')
      ),
      quad(
        namedNode('http://example.org/onto'),
        namedNode('http://purl.org/dc/terms/title'),
        literal('Example Ontology')
      ),
      quad(
        namedNode('http://example.org/ClassB'),
        namedNode('http://www.w3.org/2002/07/owl#deprecated'),
        literal('true', namedNode('http://www.w3.org/2001/XMLSchema#boolean'))
      ),
      quad(
        namedNode('http://example.org/ClassA'),
        namedNode('http://example.org/annoProp'),
        literal('annotated')
      ),
      quad(
        namedNode('http://example.org/Rule1'),
        namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
        namedNode('http://www.w3.org/2003/11/swrl#Imp')
      ),
      quad(
        namedNode('http://example.org/Restriction1'),
        namedNode('http://www.w3.org/2002/07/owl#someValuesFrom'),
        namedNode('http://example.org/ClassA')
      ),
      quad(
        namedNode('http://example.org/prop'),
        namedNode('http://www.w3.org/2000/01/rdf-schema#subPropertyOf'),
        namedNode('http://example.org/superProp')
      ),
      quad(
        N3.DataFactory.blankNode('gci1'),
        namedNode('http://www.w3.org/2000/01/rdf-schema#subClassOf'),
        namedNode('http://example.org/ClassA')
      ),
      quad(
        namedNode('http://example.org/ClassA'),
        namedNode('http://www.w3.org/2002/07/owl#equivalentClass'),
        N3.DataFactory.blankNode('gciHidden1')
      ),
      quad(
        namedNode('http://example.org/ClassA'),
        namedNode('http://example.org/dataProp'),
        literal('true', namedNode('http://www.w3.org/2001/XMLSchema#boolean'))
      ),
      quad(
        namedNode('http://example.org/ClassA'),
        namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
        namedNode('http://www.w3.org/2002/07/owl#NamedIndividual')
      ),
      quad(
        namedNode('http://example.org/prop'),
        namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
        namedNode('http://www.w3.org/2002/07/owl#AnnotationProperty')
      )
    ]);

    const metrics = computeBasicMeasures(store, {
      sourceFormat: 'text/turtle',
      externalDependencyCount: 4
    });
    const byKey = new Map(metrics.map((metric) => [metric.metric, metric]));

    expect(byKey.get('class_count')?.metricValue).toBe(3);
    expect(byKey.get('individual_count')?.metricValue).toBe(2);
    expect(byKey.get('obj_property_count')?.metricValue).toBe(1);
    expect(byKey.get('dataproperty_count')?.metricValue).toBe(1);
    expect(byKey.get('annotation_property_count')?.metricValue).toBe(2);
    expect(byKey.get('class_sgl_subcl_count')?.metricValue).toBe(1);
    expect(byKey.get('multiple_inheritance_count')?.metricValue).toBe(1);
    expect(byKey.get('named_supercl_count_max')?.metricValue).toBe(2);
    expect(byKey.get('external_dependency_count')?.metricValue).toBe(4);
    expect(byKey.get('direct_import_count')?.metricValue).toBe(0);
    expect(byKey.get('deprecated_term_count')?.metricValue).toBe(1);
    expect(byKey.get('annotation_assertion_count')?.metricValue).toBe(1);
    expect(byKey.get('rule_count')?.metricValue).toBe(1);
    expect(byKey.get('syntax')?.metricValue).toBe('Turtle Syntax');
    expect(byKey.get('datatypes_builtin')?.metricValue).toEqual(['BOOLEAN', 'STRING']);
    expect(byKey.get('abox_axiom_count')?.metricValue).toBeGreaterThan(0);
    expect(byKey.get('rbox_axiom_count')?.metricValue).toBeGreaterThan(0);
    expect(byKey.get('tbox_axiom_count')?.metricValue).toBeGreaterThan(0);
    expect(byKey.get('axiom_types')?.metricValue).toEqual(expect.arrayContaining([
      'AnnotationAssertion',
      'DataPropertyAssertion',
      'Declaration',
      'Rule',
      'SubClassOf'
    ]));
    expect(byKey.get('axiom_type_count')?.metricValue).toEqual(expect.arrayContaining([
      'AnnotationAssertion 1',
      'DataPropertyAssertion 1',
      'Rule 1',
      'SubClassOf 4'
    ]));
    expect(byKey.get('constructs')?.metricValue).toEqual(['E']);
    expect(byKey.get('expressivity')?.metricValue).toBe('ALHE');
    expect(byKey.get('gci_count')?.metricValue).toBe(1);
    expect(byKey.get('gci_hidden_count')?.metricValue).toBe(1);
    expect(byKey.get('most_freq_concept')?.metricValue).toBe('http://example.org/ClassA');
    expect(byKey.get('owl2')?.metricValue).toBe(true);
    expect(byKey.get('rdf_but_possibly_not_owl')?.metricValue).toBe(false);
    expect(byKey.get('rdfs')?.metricValue).toBe(false);
    expect(byKey.get('owl2_dl')?.metricValue).toBe(false);
    expect(byKey.get('owl2_el')?.metricValue).toBe(false);
    expect(byKey.get('owl2_ql')?.metricValue).toBe(false);
    expect(byKey.get('owl2_rl')?.metricValue).toBe(false);
    expect(byKey.get('dl_concern_count')?.metricValue).toBeGreaterThan(0);
    expect(byKey.get('profile_exclusions')?.metricValue).toEqual(expect.arrayContaining([
      'Not OWL Lite: swrl:Imp',
      'Not OWL 2 DL: annotation/logical property overlap | class/individual punning | swrl:Imp',
      'Not OWL 2 EL: swrl:Imp',
      'Not OWL 2 QL: rdfs:subPropertyOf | swrl:Imp',
      'Not OWL 2 RL: swrl:Imp',
      'Possible OWL 2 DL concern: annotation/logical property overlap | class/individual punning | swrl:Imp'
    ]));
    expect(byKey.get('dl_concern_examples')?.metricValue).toEqual(expect.arrayContaining([
      'annotation_and_logical_property: http://example.org/prop',
      'class_and_individual: http://example.org/ClassA',
      'swrl_rule: http://example.org/Rule1'
    ]));
  });

  test('computeBasicMeasures flags RDF that may not be OWL when OWL hallmarks are absent', async () => {
    const { computeBasicMeasures } = await import('../docs/app/measures-model.js');
    const { namedNode, literal, quad } = N3.DataFactory;

    const store = new N3.Store([
      quad(
        namedNode('http://example.org/ThingA'),
        namedNode('http://www.w3.org/2000/01/rdf-schema#label'),
        literal('Thing A')
      ),
      quad(
        namedNode('http://example.org/ThingB'),
        namedNode('http://www.w3.org/2000/01/rdf-schema#subClassOf'),
        namedNode('http://example.org/ThingA')
      )
    ]);

    const metrics = computeBasicMeasures(store, {
      sourceFormat: 'text/turtle'
    });
    const byKey = new Map(metrics.map((metric) => [metric.metric, metric]));
    const profileExclusions = /** @type {string[]} */ (byKey.get('profile_exclusions')?.metricValue || []);

    expect(byKey.get('rdf_but_possibly_not_owl')?.metricValue).toBe(true);
    expect(profileExclusions).toHaveLength(1);
    expect(profileExclusions[0]).toContain('RDF but possibly not OWL:');
    expect(profileExclusions[0]).toContain('no OWL namespace IRIs detected');
    expect(profileExclusions[0]).toContain('no owl:Ontology declaration');
    expect(profileExclusions[0]).toContain('no OWL entity declarations');
    expect(profileExclusions[0]).toContain('no characteristic OWL predicates');
  });
});

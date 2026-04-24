// app/measures-model.js
// @ts-check

import {
  getNamespaceFromIri,
  guessOntologyIri,
  OWL_ANNOTATION_PROPERTY_IRI,
  OWL_CLASS_IRI,
  OWL_DATATYPE_PROPERTY_IRI,
  OWL_DEPRECATED_IRI,
  OWL_INVERSE_OF_IRI,
  OWL_NAMED_INDIVIDUAL_IRI,
  OWL_OBJECT_PROPERTY_IRI,
  OWL_ONTOLOGY_IRI,
  OWL_VERSION_IRI,
  OWL_IMPORTS_IRI,
  RDF_TYPE_IRI,
  RDFS_DOMAIN_IRI,
  RDFS_RANGE_IRI,
  RDFS_SUBCLASS_OF_IRI,
  RDFS_SUBPROPERTY_OF_IRI
} from './engine.js';

/**
 * @typedef {'single_value' | 'list_value' | 'map_value'} MeasureMetricType
 */

/**
 * @typedef {Object} MeasureMetric
 * @property {string} metric
 * @property {string | number | boolean | string[]} metricValue
 * @property {MeasureMetricType} metricType
 * @property {string} explanation
 */

const XSD_NAMESPACE = 'http://www.w3.org/2001/XMLSchema#';
const XSD_BOOLEAN_IRI = `${XSD_NAMESPACE}boolean`;
const OWL_EQUIVALENT_CLASS_IRI = 'http://www.w3.org/2002/07/owl#equivalentClass';
const OWL_DISJOINT_WITH_IRI = 'http://www.w3.org/2002/07/owl#disjointWith';
const OWL_INTERSECTION_OF_IRI = 'http://www.w3.org/2002/07/owl#intersectionOf';
const OWL_UNION_OF_IRI = 'http://www.w3.org/2002/07/owl#unionOf';
const OWL_COMPLEMENT_OF_IRI = 'http://www.w3.org/2002/07/owl#complementOf';
const OWL_SOME_VALUES_FROM_IRI = 'http://www.w3.org/2002/07/owl#someValuesFrom';
const OWL_ALL_VALUES_FROM_IRI = 'http://www.w3.org/2002/07/owl#allValuesFrom';
const OWL_HAS_VALUE_IRI = 'http://www.w3.org/2002/07/owl#hasValue';
const OWL_MIN_CARDINALITY_IRI = 'http://www.w3.org/2002/07/owl#minCardinality';
const OWL_MAX_CARDINALITY_IRI = 'http://www.w3.org/2002/07/owl#maxCardinality';
const OWL_CARDINALITY_IRI = 'http://www.w3.org/2002/07/owl#cardinality';
const SWRL_IMP_IRI = 'http://www.w3.org/2003/11/swrl#Imp';

/** @type {ReadonlySet<string>} */
const DECLARATION_TYPES = Object.freeze(new Set([
  OWL_CLASS_IRI,
  OWL_OBJECT_PROPERTY_IRI,
  OWL_DATATYPE_PROPERTY_IRI,
  OWL_ANNOTATION_PROPERTY_IRI,
  OWL_NAMED_INDIVIDUAL_IRI,
  OWL_ONTOLOGY_IRI,
  'http://www.w3.org/2000/01/rdf-schema#Datatype',
  'http://www.w3.org/2002/07/owl#Datatype'
]));

/**
 * Returns the display label for one parsed RDF syntax.
 *
 * @param {string | null | undefined} sourceFormat
 * @returns {string}
 */
export function getSyntaxLabel(sourceFormat) {
  switch (String(sourceFormat || '')) {
    case 'text/turtle':
      return 'Turtle Syntax';
    case 'application/rdf+xml':
      return 'RDF/XML Syntax';
    case 'application/ld+json':
      return 'JSON-LD Syntax';
    case 'application/n-triples':
      return 'N-Triples Syntax';
    case 'application/n-quads':
      return 'N-Quads Syntax';
    case 'application/trig':
      return 'TriG Syntax';
    case 'text/n3':
      return 'N3 Syntax';
    default:
      return String(sourceFormat || 'Unknown Syntax');
  }
}

/**
 * Returns true when one IRI is built-in infrastructure rather than ontology content.
 *
 * @param {string} iri
 * @returns {boolean}
 */
function isBuiltInIri(iri) {
  return (
    iri.startsWith('http://www.w3.org/1999/02/22-rdf-syntax-ns#') ||
    iri.startsWith('http://www.w3.org/2000/01/rdf-schema#') ||
    iri.startsWith('http://www.w3.org/2001/XMLSchema#') ||
    iri.startsWith('http://www.w3.org/2002/07/owl#') ||
    iri.startsWith('http://www.w3.org/2004/02/skos/core#')
  );
}

/**
 * Returns all named-node IRIs appearing anywhere in the store.
 *
 * @param {any} store
 * @returns {Set<string>}
 */
function collectSignatureEntities(store) {
  const entities = new Set();
  const quads = store?.getQuads ? store.getQuads(null, null, null, null) : [];

  for (const quad of quads) {
    if (quad?.subject?.termType === 'NamedNode' && quad.subject.value) {
      entities.add(String(quad.subject.value));
    }
    if (quad?.predicate?.termType === 'NamedNode' && quad.predicate.value) {
      entities.add(String(quad.predicate.value));
    }
    if (quad?.object?.termType === 'NamedNode' && quad.object.value) {
      entities.add(String(quad.object.value));
    }
  }

  return entities;
}

/**
 * Returns all declared entity IRIs.
 *
 * @param {any} store
 * @returns {Set<string>}
 */
function collectDeclaredEntities(store) {
  const declared = new Set();
  const quads = store?.getQuads ? store.getQuads(null, RDF_TYPE_IRI, null, null) : [];

  for (const quad of quads) {
    const objectIri = String(quad?.object?.value || '');
    if (
      quad?.subject?.termType === 'NamedNode' &&
      DECLARATION_TYPES.has(objectIri)
    ) {
      declared.add(String(quad.subject.value));
    }
  }

  return declared;
}

/**
 * Converts one map to sorted metric rows.
 *
 * @param {Map<string, number>} map
 * @returns {string[]}
 */
function formatMetricMap(map) {
  return Array.from(map.entries())
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([key, value]) => `${key} ${value}`);
}

/**
 * Increments one metric counter in a map.
 *
 * @param {Map<string, number>} map
 * @param {string} key
 * @returns {void}
 */
function incrementMetricMap(map, key) {
  map.set(key, (map.get(key) || 0) + 1);
}

/**
 * Builds a coarse expressivity label from observed construct flags.
 *
 * @param {Set<string>} constructSet
 * @param {any[]} quads
 * @returns {string}
 */
function deriveExpressivityLabel(constructSet, quads) {
  let label = 'AL';
  const predicateSet = new Set(
    quads
      .filter((quad) => quad?.predicate?.termType === 'NamedNode' && quad.predicate.value)
      .map((quad) => String(quad.predicate.value))
  );

  if (predicateSet.has(RDFS_SUBPROPERTY_OF_IRI) || predicateSet.has(OWL_INVERSE_OF_IRI)) {
    label += 'H';
  }
  for (const construct of ['U', 'C', 'E', 'A', 'H', 'N']) {
    if (constructSet.has(construct) && !label.includes(construct)) {
      label += construct;
    }
  }

  return label;
}

/**
 * Returns true when a set contains any forbidden value.
 *
 * @param {Set<string>} values
 * @param {string[]} forbidden
 * @returns {boolean}
 */
function hasAny(values, forbidden) {
  return forbidden.some((value) => values.has(value));
}

/**
 * Adds sufficiency-style profile exclusions based on detected patterns.
 *
 * @param {Map<string, Set<string>>} exclusionMap
 * @param {string} profile
 * @param {string[]} reasons
 * @returns {void}
 */
function addProfileExclusion(exclusionMap, profile, reasons) {
  const filteredReasons = reasons.filter(Boolean);
  if (!filteredReasons.length) {
    return;
  }
  if (!exclusionMap.has(profile)) {
    exclusionMap.set(profile, new Set());
  }
  const bucket = exclusionMap.get(profile);
  for (const reason of filteredReasons) {
    bucket?.add(reason);
  }
}

/**
 * Returns a display label for one profile exclusion key.
 *
 * @param {string} profileKey
 * @returns {string}
 */
function getProfileExclusionLabel(profileKey) {
  switch (profileKey) {
    case 'rdf_but_possibly_not_owl':
      return 'RDF but possibly not OWL';
    case 'not_owl_lite':
      return 'Not OWL Lite';
    case 'not_owl2_dl':
      return 'Not OWL 2 DL';
    case 'not_owl2_el':
      return 'Not OWL 2 EL';
    case 'not_owl2_ql':
      return 'Not OWL 2 QL';
    case 'not_owl2_rl':
      return 'Not OWL 2 RL';
    case 'possible_owl2_dl_concern':
      return 'Possible OWL 2 DL concern';
    default:
      return profileKey;
  }
}

/**
 * Returns true when one quad is best treated as an ABox-style assertion.
 *
 * @param {any} quad
 * @param {Set<string>} classSet
 * @param {Set<string>} individualSet
 * @returns {boolean}
 */
function isAboxQuad(quad, classSet, individualSet) {
  const subjectIri = String(quad?.subject?.value || '');
  const predicateIri = String(quad?.predicate?.value || '');
  const objectIri = quad?.object?.termType === 'NamedNode' ? String(quad.object.value || '') : '';

  if (predicateIri === RDF_TYPE_IRI && classSet.has(objectIri) && !classSet.has(subjectIri)) {
    return true;
  }

  return individualSet.has(subjectIri);
}

/**
 * Returns true when one quad is best treated as an RBox-style assertion.
 *
 * @param {any} quad
 * @param {Set<string>} objectPropertySet
 * @param {Set<string>} datatypePropertySet
 * @param {Set<string>} annotationPropertySet
 * @returns {boolean}
 */
function isRboxQuad(quad, objectPropertySet, datatypePropertySet, annotationPropertySet) {
  const subjectIri = String(quad?.subject?.value || '');
  const predicateIri = String(quad?.predicate?.value || '');

  if (
    objectPropertySet.has(subjectIri) ||
    datatypePropertySet.has(subjectIri) ||
    annotationPropertySet.has(subjectIri)
  ) {
    return true;
  }

  return (
    predicateIri === RDFS_DOMAIN_IRI ||
    predicateIri === RDFS_RANGE_IRI ||
    predicateIri === OWL_INVERSE_OF_IRI
  );
}

/**
 * Computes basic ontology measures that are reliable over the parsed RDF graph.
 *
 * @param {any} store
 * @param {{ sourceFormat?: string | null, externalDependencyCount?: number }} [options]
 * @returns {MeasureMetric[]}
 */
export function computeBasicMeasures(store, options = {}) {
  const quads = store?.getQuads ? store.getQuads(null, null, null, null) : [];
  const ontologyIri = guessOntologyIri(store);
  const syntax = getSyntaxLabel(options.sourceFormat || null);

  const classSet = new Set(
    (store?.getQuads ? store.getQuads(null, RDF_TYPE_IRI, OWL_CLASS_IRI, null) : [])
      .filter((quad) => quad?.subject?.termType === 'NamedNode' && quad.subject.value)
      .map((quad) => String(quad.subject.value))
  );
  const objectPropertySet = new Set(
    (store?.getQuads ? store.getQuads(null, RDF_TYPE_IRI, OWL_OBJECT_PROPERTY_IRI, null) : [])
      .filter((quad) => quad?.subject?.termType === 'NamedNode' && quad.subject.value)
      .map((quad) => String(quad.subject.value))
  );
  const datatypePropertySet = new Set(
    (store?.getQuads ? store.getQuads(null, RDF_TYPE_IRI, OWL_DATATYPE_PROPERTY_IRI, null) : [])
      .filter((quad) => quad?.subject?.termType === 'NamedNode' && quad.subject.value)
      .map((quad) => String(quad.subject.value))
  );
  const annotationPropertySet = new Set(
    (store?.getQuads ? store.getQuads(null, RDF_TYPE_IRI, OWL_ANNOTATION_PROPERTY_IRI, null) : [])
      .filter((quad) => quad?.subject?.termType === 'NamedNode' && quad.subject.value)
      .map((quad) => String(quad.subject.value))
  );
  const individualSet = new Set(
    (store?.getQuads ? store.getQuads(null, RDF_TYPE_IRI, OWL_NAMED_INDIVIDUAL_IRI, null) : [])
      .filter((quad) => quad?.subject?.termType === 'NamedNode' && quad.subject.value)
      .map((quad) => String(quad.subject.value))
  );

  /** @type {Map<string, Set<string>>} */
  const classToSuperclasses = new Map();
  /** @type {Map<string, Set<string>>} */
  const classToSubclasses = new Map();
  for (const quad of store?.getQuads ? store.getQuads(null, RDFS_SUBCLASS_OF_IRI, null, null) : []) {
    if (quad?.subject?.termType !== 'NamedNode' || quad?.object?.termType !== 'NamedNode') {
      continue;
    }
    const subclassIri = String(quad.subject.value);
    const superclassIri = String(quad.object.value);
    if (!classToSuperclasses.has(subclassIri)) {
      classToSuperclasses.set(subclassIri, new Set());
    }
    classToSuperclasses.get(subclassIri)?.add(superclassIri);
    if (!classToSubclasses.has(superclassIri)) {
      classToSubclasses.set(superclassIri, new Set());
    }
    classToSubclasses.get(superclassIri)?.add(subclassIri);
  }

  /** @type {Map<string, Set<string>>} */
  const classToInstances = new Map();
  for (const quad of store?.getQuads ? store.getQuads(null, RDF_TYPE_IRI, null, null) : []) {
    if (quad?.subject?.termType !== 'NamedNode' || quad?.object?.termType !== 'NamedNode') {
      continue;
    }
    const instanceIri = String(quad.subject.value);
    const typeIri = String(quad.object.value);
    if (!classSet.has(typeIri)) {
      continue;
    }
    if (!classToInstances.has(typeIri)) {
      classToInstances.set(typeIri, new Set());
    }
    classToInstances.get(typeIri)?.add(instanceIri);
  }

  const ontologyAnnotationCount = (store?.getQuads ? store.getQuads(ontologyIri, null, null, null) : [])
    .filter((quad) => {
      const predicateIri = String(quad?.predicate?.value || '');
      return predicateIri !== RDF_TYPE_IRI &&
        predicateIri !== OWL_IMPORTS_IRI &&
        predicateIri !== OWL_VERSION_IRI;
    })
    .length;
  const directImportCount = store?.getQuads ? store.getQuads(ontologyIri, OWL_IMPORTS_IRI, null, null).length : 0;
  const deprecatedTermCount = (store?.getQuads ? store.getQuads(null, OWL_DEPRECATED_IRI, null, null) : [])
    .filter((quad) => {
      if (quad?.subject?.termType !== 'NamedNode') {
        return false;
      }
      if (quad?.object?.termType === 'Literal') {
        const value = String(quad.object.value || '').toLowerCase();
        const datatypeIri = String(quad?.object?.datatype?.value || '');
        return value === 'true' && (!datatypeIri || datatypeIri === XSD_BOOLEAN_IRI);
      }
      return String(quad?.object?.value || '').toLowerCase() === 'true';
    })
    .length;
  const annotationAssertionCount = quads.filter((quad) => annotationPropertySet.has(String(quad?.predicate?.value || ''))).length;

  const signatureEntities = collectSignatureEntities(store);
  const declaredEntities = collectDeclaredEntities(store);
  const undeclaredEntityCount = Array.from(signatureEntities)
    .filter((iri) => !declaredEntities.has(iri) && !isBuiltInIri(iri))
    .length;

  const datatypeIris = new Set();
  /** @type {Map<string, number>} */
  const classFrequency = new Map();
  /** @type {Set<string>} */
  const constructSet = new Set();
  for (const quad of quads) {
    if (quad?.object?.termType === 'Literal') {
      const datatypeIri = String(quad?.object?.datatype?.value || '');
      if (datatypeIri) {
        datatypeIris.add(datatypeIri);
      }
    }
    if (quad?.object?.termType === 'NamedNode' && classSet.has(String(quad.object.value || ''))) {
      incrementMetricMap(classFrequency, String(quad.object.value || ''));
    }
    const predicateIri = String(quad?.predicate?.value || '');
    if (predicateIri === OWL_INTERSECTION_OF_IRI) {
      constructSet.add('AL');
    }
    if (predicateIri === OWL_UNION_OF_IRI) {
      constructSet.add('U');
    }
    if (predicateIri === OWL_COMPLEMENT_OF_IRI) {
      constructSet.add('C');
    }
    if (predicateIri === OWL_SOME_VALUES_FROM_IRI) {
      constructSet.add('E');
    }
    if (predicateIri === OWL_ALL_VALUES_FROM_IRI) {
      constructSet.add('A');
    }
    if (predicateIri === OWL_HAS_VALUE_IRI) {
      constructSet.add('H');
    }
    if (
      predicateIri === OWL_MIN_CARDINALITY_IRI ||
      predicateIri === OWL_MAX_CARDINALITY_IRI ||
      predicateIri === OWL_CARDINALITY_IRI
    ) {
      constructSet.add('N');
    }
  }
  const builtinDatatypes = Array.from(datatypeIris).filter((iri) => iri.startsWith(XSD_NAMESPACE));
  const customDatatypes = Array.from(datatypeIris).filter((iri) => !iri.startsWith(XSD_NAMESPACE));

  /** @type {Map<string, number>} */
  const namespaceEntityCounts = new Map();
  for (const iri of signatureEntities) {
    const namespace = getNamespaceFromIri(iri);
    if (!namespace) {
      continue;
    }
    namespaceEntityCounts.set(namespace, (namespaceEntityCounts.get(namespace) || 0) + 1);
  }

  /** @type {Map<string, number>} */
  const namespaceAxiomCounts = new Map();
  for (const quad of quads) {
    const namespaces = new Set([
      quad?.subject?.termType === 'NamedNode' ? getNamespaceFromIri(String(quad.subject.value)) : null,
      quad?.predicate?.termType === 'NamedNode' ? getNamespaceFromIri(String(quad.predicate.value)) : null,
      quad?.object?.termType === 'NamedNode' ? getNamespaceFromIri(String(quad.object.value)) : null
    ].filter(Boolean));
    for (const namespace of namespaces) {
      namespaceAxiomCounts.set(namespace, (namespaceAxiomCounts.get(namespace) || 0) + 1);
    }
  }

  const classCount = classSet.size;
  const totalAssertedSuperclasses = Array.from(classSet)
    .reduce((sum, classIri) => sum + (classToSuperclasses.get(classIri)?.size || 0), 0);
  const totalAssertedSubclasses = Array.from(classSet)
    .reduce((sum, classIri) => sum + (classToSubclasses.get(classIri)?.size || 0), 0);
  const multipleInheritanceCount = Array.from(classSet)
    .filter((classIri) => (classToSuperclasses.get(classIri)?.size || 0) > 1)
    .length;
  const namedSuperclassCountMax = classCount
    ? Math.max(...Array.from(classSet).map((classIri) => classToSuperclasses.get(classIri)?.size || 0))
    : 0;
  const classSglSubclCount = Array.from(classSet)
    .filter((classIri) => (classToSubclasses.get(classIri)?.size || 0) > 1)
    .length;
  const totalInstancesAcrossClasses = Array.from(classSet)
    .reduce((sum, classIri) => sum + (classToInstances.get(classIri)?.size || 0), 0);
  const aboxAxiomCount = quads.filter((quad) => isAboxQuad(quad, classSet, individualSet)).length;
  const rboxAxiomCount = quads.filter((quad) => isRboxQuad(
    quad,
    objectPropertySet,
    datatypePropertySet,
    annotationPropertySet
  )).length;
  const tboxAxiomCount = quads.length - aboxAxiomCount - rboxAxiomCount;
  const ruleCount = (store?.getQuads ? store.getQuads(null, RDF_TYPE_IRI, SWRL_IMP_IRI, null) : [])
    .filter((quad) => quad?.subject?.termType === 'NamedNode' && quad.subject.value)
    .length;

  /** @type {Map<string, number>} */
  const axiomTypeCounts = new Map();
  for (const quad of quads) {
    const subjectIri = String(quad?.subject?.value || '');
    const predicateIri = String(quad?.predicate?.value || '');
    const objectIri = quad?.object?.termType === 'NamedNode' ? String(quad.object.value || '') : '';

    if (predicateIri === RDF_TYPE_IRI) {
      if (DECLARATION_TYPES.has(objectIri)) {
        incrementMetricMap(axiomTypeCounts, 'Declaration');
      } else if (classSet.has(objectIri)) {
        incrementMetricMap(axiomTypeCounts, 'ClassAssertion');
      } else if (objectIri === SWRL_IMP_IRI) {
        incrementMetricMap(axiomTypeCounts, 'Rule');
      } else if (subjectIri && objectIri) {
        incrementMetricMap(axiomTypeCounts, 'TypeAssertion');
      }
      continue;
    }

    if (predicateIri === RDFS_SUBCLASS_OF_IRI) {
      incrementMetricMap(axiomTypeCounts, 'SubClassOf');
      continue;
    }
    if (predicateIri === RDFS_SUBPROPERTY_OF_IRI) {
      incrementMetricMap(axiomTypeCounts, 'SubPropertyOf');
      continue;
    }
    if (predicateIri === RDFS_DOMAIN_IRI) {
      incrementMetricMap(axiomTypeCounts, 'Domain');
      continue;
    }
    if (predicateIri === RDFS_RANGE_IRI) {
      incrementMetricMap(axiomTypeCounts, 'Range');
      continue;
    }
    if (predicateIri === OWL_EQUIVALENT_CLASS_IRI) {
      incrementMetricMap(axiomTypeCounts, 'EquivalentClasses');
      continue;
    }
    if (predicateIri === OWL_DISJOINT_WITH_IRI) {
      incrementMetricMap(axiomTypeCounts, 'DisjointClasses');
      continue;
    }
    if (annotationPropertySet.has(predicateIri)) {
      incrementMetricMap(axiomTypeCounts, 'AnnotationAssertion');
      continue;
    }
    if (objectPropertySet.has(predicateIri)) {
      incrementMetricMap(axiomTypeCounts, 'ObjectPropertyAssertion');
      continue;
    }
    if (datatypePropertySet.has(predicateIri)) {
      incrementMetricMap(axiomTypeCounts, 'DataPropertyAssertion');
      continue;
    }
  }
  const axiomTypes = Array.from(axiomTypeCounts.keys()).sort((left, right) => left.localeCompare(right));
  const mostFrequentConceptEntry = Array.from(classFrequency.entries())
    .sort((left, right) => {
      if (right[1] !== left[1]) {
        return right[1] - left[1];
      }
      return left[0].localeCompare(right[0]);
    })[0] || null;
  const mostFrequentConcept = mostFrequentConceptEntry ? mostFrequentConceptEntry[0] : '';
  const constructs = Array.from(constructSet).sort((left, right) => left.localeCompare(right));
  const expressivity = deriveExpressivityLabel(constructSet, quads);
  const predicateSet = new Set(
    quads
      .filter((quad) => quad?.predicate?.termType === 'NamedNode' && quad.predicate.value)
      .map((quad) => String(quad.predicate.value))
  );
  const gciCount = (store?.getQuads ? store.getQuads(null, RDFS_SUBCLASS_OF_IRI, null, null) : [])
    .filter((quad) => quad?.subject?.termType !== 'NamedNode')
    .length;
  const gciHiddenCount = (store?.getQuads ? store.getQuads(null, OWL_EQUIVALENT_CLASS_IRI, null, null) : [])
    .filter((quad) =>
      quad?.subject?.termType === 'NamedNode' &&
      quad?.object?.termType !== 'NamedNode'
    )
    .length;
  const owl2 = true;
  const rdfs = constructSet.size === 0 && ruleCount === 0;
  const owl2Dl = ruleCount === 0;
  const owl2El = ruleCount === 0 && !hasAny(constructSet, ['U', 'C', 'H', 'N']);
  const owl2Ql = ruleCount === 0 && !constructSet.has('C') && !constructSet.has('U');
  const owl2Rl = ruleCount === 0;
  const hasRule = ruleCount > 0;
  const hasSubPropertyChains = (axiomTypeCounts.get('SubPropertyOf') || 0) > 0;
  const hasAnyOwlNamespaceIri = Array.from(signatureEntities)
    .some((iri) => iri.startsWith('http://www.w3.org/2002/07/owl#'));
  const hasOntologyDeclaration = Boolean(
    store?.getQuads && store.getQuads(null, RDF_TYPE_IRI, OWL_ONTOLOGY_IRI, null).length
  );
  const hasOwlEntityDeclarations =
    classSet.size > 0 ||
    objectPropertySet.size > 0 ||
    datatypePropertySet.size > 0 ||
    annotationPropertySet.size > 0 ||
    individualSet.size > 0;
  const hasCharacteristicOwlPredicates = [
    OWL_EQUIVALENT_CLASS_IRI,
    OWL_DISJOINT_WITH_IRI,
    OWL_INTERSECTION_OF_IRI,
    OWL_UNION_OF_IRI,
    OWL_COMPLEMENT_OF_IRI,
    OWL_SOME_VALUES_FROM_IRI,
    OWL_ALL_VALUES_FROM_IRI,
    OWL_HAS_VALUE_IRI,
    OWL_MIN_CARDINALITY_IRI,
    OWL_MAX_CARDINALITY_IRI,
    OWL_CARDINALITY_IRI,
    OWL_INVERSE_OF_IRI,
    OWL_IMPORTS_IRI,
    OWL_VERSION_IRI
  ].some((iri) => predicateSet.has(iri));
  const rdfButPossiblyNotOwl =
    !hasAnyOwlNamespaceIri ||
    (!hasOntologyDeclaration && !hasOwlEntityDeclarations && !hasCharacteristicOwlPredicates);

  /** @type {Map<string, Set<string>>} */
  const profileExclusions = new Map();
  addProfileExclusion(
    profileExclusions,
    'rdf_but_possibly_not_owl',
    [
      !hasAnyOwlNamespaceIri ? 'no OWL namespace IRIs detected' : '',
      !hasOntologyDeclaration ? 'no owl:Ontology declaration' : '',
      !hasOwlEntityDeclarations ? 'no OWL entity declarations' : '',
      !hasCharacteristicOwlPredicates ? 'no characteristic OWL predicates' : ''
    ]
  );
  if (hasRule) {
    addProfileExclusion(profileExclusions, 'not_owl_lite', ['swrl:Imp']);
    addProfileExclusion(profileExclusions, 'not_owl2_dl', ['swrl:Imp']);
    addProfileExclusion(profileExclusions, 'not_owl2_el', ['swrl:Imp']);
    addProfileExclusion(profileExclusions, 'not_owl2_ql', ['swrl:Imp']);
    addProfileExclusion(profileExclusions, 'not_owl2_rl', ['swrl:Imp']);
    addProfileExclusion(profileExclusions, 'possible_owl2_dl_concern', ['swrl:Imp']);
  }
  addProfileExclusion(
    profileExclusions,
    'not_owl_lite',
    [
      constructSet.has('U') ? 'owl:unionOf' : '',
      constructSet.has('C') ? 'owl:complementOf' : '',
      constructSet.has('H') ? 'owl:hasValue' : '',
      constructSet.has('N') ? 'owl:cardinality family' : ''
    ]
  );
  addProfileExclusion(
    profileExclusions,
    'not_owl2_el',
    [
      constructSet.has('U') ? 'owl:unionOf' : '',
      constructSet.has('C') ? 'owl:complementOf' : '',
      constructSet.has('H') ? 'owl:hasValue' : '',
      constructSet.has('N') ? 'owl:cardinality family' : ''
    ]
  );
  addProfileExclusion(
    profileExclusions,
    'not_owl2_ql',
    [
      constructSet.has('U') ? 'owl:unionOf' : '',
      constructSet.has('C') ? 'owl:complementOf' : '',
      constructSet.has('A') ? 'owl:allValuesFrom' : '',
      constructSet.has('N') ? 'owl:cardinality family' : '',
      hasSubPropertyChains ? 'rdfs:subPropertyOf' : ''
    ]
  );
  addProfileExclusion(
    profileExclusions,
    'not_owl2_rl',
    [
      constructSet.has('U') ? 'owl:unionOf' : '',
      constructSet.has('C') ? 'owl:complementOf' : '',
      constructSet.has('N') ? 'owl:cardinality family' : ''
    ]
  );

  /** @type {string[]} */
  const dlConcernExamples = [];
  const classIndividualOverlap = Array.from(classSet)
    .filter((iri) => individualSet.has(iri))
    .sort((left, right) => left.localeCompare(right));
  if (classIndividualOverlap.length) {
    dlConcernExamples.push(`class_and_individual: ${classIndividualOverlap.slice(0, 3).join(', ')}`);
    addProfileExclusion(profileExclusions, 'not_owl2_dl', ['class/individual punning']);
    addProfileExclusion(profileExclusions, 'possible_owl2_dl_concern', ['class/individual punning']);
  }
  const classPropertyOverlap = Array.from(classSet)
    .filter((iri) =>
      objectPropertySet.has(iri) ||
      datatypePropertySet.has(iri) ||
      annotationPropertySet.has(iri)
    )
    .sort((left, right) => left.localeCompare(right));
  if (classPropertyOverlap.length) {
    dlConcernExamples.push(`class_and_property: ${classPropertyOverlap.slice(0, 3).join(', ')}`);
    addProfileExclusion(profileExclusions, 'not_owl2_dl', ['class/property punning']);
    addProfileExclusion(profileExclusions, 'possible_owl2_dl_concern', ['class/property punning']);
  }
  const objectDatatypeOverlap = Array.from(objectPropertySet)
    .filter((iri) => datatypePropertySet.has(iri))
    .sort((left, right) => left.localeCompare(right));
  if (objectDatatypeOverlap.length) {
    dlConcernExamples.push(`object_and_datatype_property: ${objectDatatypeOverlap.slice(0, 3).join(', ')}`);
    addProfileExclusion(profileExclusions, 'not_owl2_dl', ['object/datatype property punning']);
    addProfileExclusion(profileExclusions, 'possible_owl2_dl_concern', ['object/datatype property punning']);
  }
  const annotationLogicalOverlap = Array.from(annotationPropertySet)
    .filter((iri) => objectPropertySet.has(iri) || datatypePropertySet.has(iri))
    .sort((left, right) => left.localeCompare(right));
  if (annotationLogicalOverlap.length) {
    dlConcernExamples.push(`annotation_and_logical_property: ${annotationLogicalOverlap.slice(0, 3).join(', ')}`);
    addProfileExclusion(profileExclusions, 'not_owl2_dl', ['annotation/logical property overlap']);
    addProfileExclusion(profileExclusions, 'possible_owl2_dl_concern', ['annotation/logical property overlap']);
  }
  if (hasRule) {
    const ruleSubjects = (store?.getQuads ? store.getQuads(null, RDF_TYPE_IRI, SWRL_IMP_IRI, null) : [])
      .filter((quad) => quad?.subject?.termType === 'NamedNode' && quad.subject.value)
      .map((quad) => String(quad.subject.value))
      .sort((left, right) => left.localeCompare(right));
    if (ruleSubjects.length) {
      dlConcernExamples.push(`swrl_rule: ${ruleSubjects.slice(0, 3).join(', ')}`);
    }
  }
  const profileExclusionRows = Array.from(profileExclusions.entries())
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([profile, reasons]) => `${getProfileExclusionLabel(profile)}: ${Array.from(reasons).sort((left, right) => left.localeCompare(right)).join(' | ')}`);

  /** @type {MeasureMetric[]} */
  return [
    {
      metric: 'ontology_id',
      metricValue: ontologyIri,
      metricType: 'single_value',
      explanation: 'The ontology id.'
    },
    {
      metric: 'syntax',
      metricValue: syntax,
      metricType: 'single_value',
      explanation: 'What serialisation is used for the ontology.'
    },
    {
      metric: 'axiom_count',
      metricValue: quads.length,
      metricType: 'single_value',
      explanation: 'Approximate axiom count based on RDF triples/quads in the parsed graph.'
    },
    {
      metric: 'abox_axiom_count',
      metricValue: aboxAxiomCount,
      metricType: 'single_value',
      explanation: 'Approximate number of ABox axioms based on individual assertions and class assertions over named individuals.'
    },
    {
      metric: 'rbox_axiom_count',
      metricValue: rboxAxiomCount,
      metricType: 'single_value',
      explanation: 'Approximate number of RBox axioms based on property declarations and core property-structure predicates.'
    },
    {
      metric: 'tbox_axiom_count',
      metricValue: Math.max(0, tboxAxiomCount),
      metricType: 'single_value',
      explanation: 'Approximate number of TBox axioms after subtracting ABox and RBox approximations from the parsed graph.'
    },
    {
      metric: 'axiom_types',
      metricValue: axiomTypes,
      metricType: 'list_value',
      explanation: 'Heuristic axiom categories detected from RDF graph patterns.'
    },
    {
      metric: 'axiom_type_count',
      metricValue: formatMetricMap(axiomTypeCounts),
      metricType: 'map_value',
      explanation: 'Heuristic counts of axiom categories detected from RDF graph patterns.'
    },
    {
      metric: 'constructs',
      metricValue: constructs,
      metricType: 'list_value',
      explanation: 'Heuristic logical constructs detected from selected OWL RDF predicates.'
    },
    {
      metric: 'expressivity',
      metricValue: expressivity,
      metricType: 'single_value',
      explanation: 'Coarse heuristic expressivity summary derived from observed OWL RDF predicates. This is not a DL reasoner result.'
    },
    {
      metric: 'class_count',
      metricValue: classCount,
      metricType: 'single_value',
      explanation: 'Number of classes in the ontology.'
    },
    {
      metric: 'individual_count',
      metricValue: individualSet.size,
      metricType: 'single_value',
      explanation: 'Number of individuals.'
    },
    {
      metric: 'obj_property_count',
      metricValue: objectPropertySet.size,
      metricType: 'single_value',
      explanation: 'Number of object properties.'
    },
    {
      metric: 'dataproperty_count',
      metricValue: datatypePropertySet.size,
      metricType: 'single_value',
      explanation: 'Number of distinct data properties.'
    },
    {
      metric: 'annotation_property_count',
      metricValue: annotationPropertySet.size,
      metricType: 'single_value',
      explanation: 'Number of annotation properties.'
    },
    {
      metric: 'ontology_anno_count',
      metricValue: ontologyAnnotationCount,
      metricType: 'single_value',
      explanation: 'Number of ontology annotations.'
    },
    {
      metric: 'annotation_assertion_count',
      metricValue: annotationAssertionCount,
      metricType: 'single_value',
      explanation: 'Approximate number of annotation assertions, counted as triples whose predicate is a declared annotation property.'
    },
    {
      metric: 'direct_import_count',
      metricValue: directImportCount,
      metricType: 'single_value',
      explanation: 'Number of directly declared owl:imports statements on the ontology header.'
    },
    {
      metric: 'deprecated_term_count',
      metricValue: deprecatedTermCount,
      metricType: 'single_value',
      explanation: 'Number of named resources explicitly marked with owl:deprecated true.'
    },
    {
      metric: 'rule_count',
      metricValue: ruleCount,
      metricType: 'single_value',
      explanation: 'Number of SWRL rules, approximated as subjects typed swrl:Imp.'
    },
    {
      metric: 'most_freq_concept',
      metricValue: mostFrequentConcept,
      metricType: 'single_value',
      explanation: 'Most frequently referenced class in rdf:type object position.'
    },
    {
      metric: 'signature_entity_count',
      metricValue: signatureEntities.size,
      metricType: 'single_value',
      explanation: 'Total number of entities in signature, including classes and individuals.'
    },
    {
      metric: 'undecl_entity_count',
      metricValue: undeclaredEntityCount,
      metricType: 'single_value',
      explanation: 'Number of undeclared entities, excluding built-in vocabulary.'
    },
    {
      metric: 'assert_n_subclass_avg',
      metricValue: classCount ? totalAssertedSubclasses / classCount : 0,
      metricType: 'single_value',
      explanation: 'Average number of asserted subclasses per class.'
    },
    {
      metric: 'assert_n_superclass_avg',
      metricValue: classCount ? totalAssertedSuperclasses / classCount : 0,
      metricType: 'single_value',
      explanation: 'Average number of asserted superclasses per class.'
    },
    {
      metric: 'multiple_inheritance_count',
      metricValue: multipleInheritanceCount,
      metricType: 'single_value',
      explanation: 'Number of classes with multiple inheritance.'
    },
    {
      metric: 'gci_count',
      metricValue: gciCount,
      metricType: 'single_value',
      explanation: 'Heuristic count of subclass axioms whose left-hand side is anonymous in the RDF graph.'
    },
    {
      metric: 'gci_hidden_count',
      metricValue: gciHiddenCount,
      metricType: 'single_value',
      explanation: 'Heuristic count of named owl:equivalentClass assertions whose right-hand side is anonymous.'
    },
    {
      metric: 'named_supercl_count_max',
      metricValue: namedSuperclassCountMax,
      metricType: 'single_value',
      explanation: 'Maximum number of named superclasses.'
    },
    {
      metric: 'class_sgl_subcl_count',
      metricValue: classSglSubclCount,
      metricType: 'single_value',
      explanation: 'Number of super-classes which have more than one subclass.'
    },
    {
      metric: 'instance_per_class_avg',
      metricValue: classCount ? totalInstancesAcrossClasses / classCount : 0,
      metricType: 'single_value',
      explanation: 'Average number of individuals per class.'
    },
    {
      metric: 'datatypes_count',
      metricValue: datatypeIris.size,
      metricType: 'single_value',
      explanation: 'Total number of distinct datatypes.'
    },
    {
      metric: 'dt_builtin_count',
      metricValue: builtinDatatypes.length,
      metricType: 'single_value',
      explanation: 'Total number of distinct built-in datatypes.'
    },
    {
      metric: 'dt_notbuiltin_count',
      metricValue: customDatatypes.length,
      metricType: 'single_value',
      explanation: 'Total number of distinct custom (not built-in) datatypes.'
    },
    {
      metric: 'datatypes_builtin',
      metricValue: builtinDatatypes
        .map((iri) => iri.startsWith(XSD_NAMESPACE) ? iri.slice(XSD_NAMESPACE.length).toUpperCase() : iri)
        .sort((left, right) => left.localeCompare(right)),
      metricType: 'list_value',
      explanation: 'Datatypes used from the built-in datatype map.'
    },
    {
      metric: 'namespace_entity_count',
      metricValue: formatMetricMap(namespaceEntityCounts),
      metricType: 'map_value',
      explanation: 'Number of distinct entities used from a namespace.'
    },
    {
      metric: 'namespace_axiom_count',
      metricValue: formatMetricMap(namespaceAxiomCounts),
      metricType: 'map_value',
      explanation: 'Number of axioms using at least one term in a namespace.'
    },
    {
      metric: 'external_dependency_count',
      metricValue: Math.max(0, Number(options.externalDependencyCount) || 0),
      metricType: 'single_value',
      explanation: 'Number of external IRI dependencies detected from the ontology graph.'
    },
    {
      metric: 'owl2',
      metricValue: owl2,
      metricType: 'single_value',
      explanation: 'Heuristic indicator that the ontology uses OWL-era vocabulary; this browser measure does not perform full profile validation.'
    },
    {
      metric: 'rdf_but_possibly_not_owl',
      metricValue: rdfButPossiblyNotOwl,
      metricType: 'single_value',
      explanation: 'Heuristic warning that the graph may be valid RDF but may not present enough OWL hallmarks to treat it confidently as an OWL ontology.'
    },
    {
      metric: 'rdfs',
      metricValue: rdfs,
      metricType: 'single_value',
      explanation: 'Heuristic indicator that the ontology stays within simple RDFS-like constructs seen in the parsed RDF graph.'
    },
    {
      metric: 'owl2_dl',
      metricValue: owl2Dl,
      metricType: 'single_value',
      explanation: 'Heuristic indicator only. This is not an OWL 2 DL profile validator.'
    },
    {
      metric: 'owl2_el',
      metricValue: owl2El,
      metricType: 'single_value',
      explanation: 'Heuristic indicator only. This is not an OWL 2 EL profile validator.'
    },
    {
      metric: 'owl2_ql',
      metricValue: owl2Ql,
      metricType: 'single_value',
      explanation: 'Heuristic indicator only. This is not an OWL 2 QL profile validator.'
    },
    {
      metric: 'owl2_rl',
      metricValue: owl2Rl,
      metricType: 'single_value',
      explanation: 'Heuristic indicator only. This is not an OWL 2 RL profile validator.'
    },
    {
      metric: 'profile_exclusions',
      metricValue: profileExclusionRows,
      metricType: 'list_value',
      explanation: 'Sufficient-condition exclusions and profile concern triggers detected from the RDF graph. These are one-way heuristics: enough to exclude or flag a profile, not enough to prove membership.'
    },
    {
      metric: 'dl_concern_count',
      metricValue: dlConcernExamples.length,
      metricType: 'single_value',
      explanation: 'Number of concrete OWL 2 DL concern examples detected from simple punning and rule-related patterns.'
    },
    {
      metric: 'dl_concern_examples',
      metricValue: dlConcernExamples,
      metricType: 'list_value',
      explanation: 'Examples of patterns that may complicate OWL 2 DL conformance, such as SWRL rules or cross-category reuse of the same IRI.'
    }
  ];
}

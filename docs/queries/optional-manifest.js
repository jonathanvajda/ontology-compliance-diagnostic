// deprecated manifest
DATA = [
    {
      "id": "q_ontology-has-dcterms-license-but-missing-cc0-or-ccby3-or-higher-URL",
      "file": "q_ontology-has-dcterms-license-but-missing-cc0-or-ccby3-or-higher-URL.rq",
      "title": "Ontology has dcterms:license but is missing an accepted CC0 / CC BY 3.0+ URL",
      "kind": "SELECT",
      "polarity": "matchMeansFail",
      "checksCriterion": "criterion_ontologyLicenseUsesOpenLicenseUrl",
      "scope": "ontology",
      "severity": "error",
      "resultShape": "RESOURCE_ONLY",
      "resourceVar": "ontology"
    },
    {
      "id": "q_ontology-has-dcterms-license-but-missing-cc0-or-ccby3-or-higher",
      "file": "q_ontology-has-dcterms-license-but-missing-cc0-or-ccby3-or-higher.rq",
      "title": "Ontology has dcterms:license but is missing an accepted CC0 / CC BY 3.0+ license",
      "kind": "SELECT",
      "polarity": "matchMeansFail",
      "checksCriterion": "criterion_ontologyHasOpenLicense",
      "scope": "ontology",
      "severity": "error",
      "resultShape": "RESOURCE_ONLY",
      "resourceVar": "ontology"
    },
    {
      "id": "q_ontology-has-versioninfo-but-missing-date-or-semantic-versioning",
      "file": "q_ontology-has-versioninfo-but-missing-date-or-semantic-versioning.rq",
      "title": "Ontology has owl:versionInfo but is missing a date or semantic version",
      "kind": "SELECT",
      "polarity": "matchMeansFail",
      "checksCriterion": "criterion_ontologyVersionInfoHasDateOrSemver",
      "scope": "ontology",
      "severity": "warning",
      "resultShape": "RESOURCE_ONLY",
      "resourceVar": "ontology"
    },
    {
      "id": "q_ontology-has-versioniri-and-info-but-mismatch-versioning",
      "file": "q_ontology-has-versioniri-and-info-but-mismatch-versioning.rq",
      "title": "Ontology has owl:versionIRI and owl:versionInfo but they mismatch",
      "kind": "SELECT",
      "polarity": "matchMeansFail",
      "checksCriterion": "criterion_ontologyVersionIriAndInfoAgree",
      "scope": "ontology",
      "severity": "error",
      "resultShape": "RESOURCE_ONLY",
      "resourceVar": "ontology"
    },
    {
      "id": "q_ontology-has-versioniri-but-missing-date-or-semantic-versioning",
      "file": "q_ontology-has-versioniri-but-missing-date-or-semantic-versioning.rq",
      "title": "Ontology has owl:versionIRI but is missing a date or semantic version",
      "kind": "SELECT",
      "polarity": "matchMeansFail",
      "checksCriterion": "criterion_ontologyVersionIriHasDateOrSemver",
      "scope": "ontology",
      "severity": "error",
      "resultShape": "RESOURCE_ONLY",
      "resourceVar": "ontology"
    },
    {
      "id": "q_ontology-has-dcterms-license-with-cc0-or-ccby3-or-higher-URL",
      "file": "q_ontology-has-dcterms-license-with-cc0-or-ccby3-or-higher-URL.rq",
      "title": "Ontology has dcterms:license with accepted CC0 / CC BY 3.0+ URL",
      "kind": "SELECT",
      "polarity": "matchMeansPass",
      "checksCriterion": "criterion_ontologyLicenseUsesOpenLicenseUrl",
      "scope": "ontology",
      "severity": "error",
      "resultShape": "RESOURCE_ONLY",
      "resourceVar": "ontology"
    },
    {
      "id": "q_ontology-has-cc0-or-ccby3-or-higher",
      "file": "q_ontology-has-cc0-or-ccby3-or-higher.rq",
      "title": "Ontology has CC0 or CC BY 3.0+ license",
      "kind": "SELECT",
      "polarity": "matchMeansPass",
      "checksCriterion": "criterion_ontologyHasOpenLicense",
      "scope": "ontology",
      "severity": "error",
      "resultShape": "RESOURCE_ONLY",
      "resourceVar": "ontology"
    },
    {
      "id": "q_ontology-has-versioniri-and-valid-iri",
      "file": "q_ontology-has-versioniri-and-valid-iri.rq",
      "title": "Ontology has owl:versionIRI with a valid IRI",
      "kind": "ASK",
      "polarity": "trueMeansPass",
      "checksCriterion": "criterion_ontologyVersionIriIsValid",
      "scope": "ontology",
      "severity": "error",
      "resultShape": "RESOURCE_ONLY",
      "resourceVar": "ontology"
    },
    {
      "id": "q_ontology-has-cc0-or-ccby4-license",
      "file": "q_ontology-has-cc0-or-ccby4-license.rq",
      "title": "Ontology has CC0 or CC BY 4.0 license",
      "kind": "SELECT",
      "polarity": "matchMeansPass",
      "checksCriterion": "criterion_ontologyHasCc0OrCcby4License",
      "scope": "ontology",
      "severity": "warning",
      "resultShape": "RESOURCE_ONLY",
      "resourceVar": "ontology"
    },
    {
      "id": "q_ontology-has-versioniri-and-date-or-semantic-versioning",
      "file": "q_ontology-has-versioniri-and-date-or-semantic-versioning.rq",
      "title": "Ontology has owl:versionIRI with a date or semantic version",
      "kind": "SELECT",
      "polarity": "matchMeansPass",
      "checksCriterion": "criterion_ontologyVersionIriHasDateOrSemver",
      "scope": "ontology",
      "severity": "error",
      "resultShape": "RESOURCE_ONLY",
      "resourceVar": "ontology"
    }
]
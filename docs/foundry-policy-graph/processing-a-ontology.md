# Semantic pattern for Foundry Conformance

## Reference graph

## Processed Ontology
```mermaid
flowchart BT;
  %% Classes %%
  ActOfEvaluation(Act of Evaluation):::owl:Class
  ActOfOntologyParsing(Act of Ontology Parsing):::owl:Class
  ActOfDataAppending(Act of Data Appending):::owl:Class

  %% Individuals %%
  ActOfEvaluation_001(Act of Evaluation):::owl:NamedIndividual --rdf:type-->ActOfEvaluation
  ActOfOntologyParsing_001(Act of Ontology Parsing):::owl:NamedIndividual --rdf:type-->ActOfOntologyParsing
  ActOfDataAppending_001(Act of Data Appending):::owl:NamedIndividual --rdf:type--> ActOfDataAppending
  ExampleOntology(Example Ontology):::owl:Ontology

  %% Relations %% 
  ActOfEvaluation_001 -- obo:has occurrent part--> ActOfOntologyParsing_001
  ActOfOntologyParsing_001 -- obo:has participant--> ExampleOntology
  ActOfOntologyParsing_001 -- obo:has specified output--> ontologyFormat("application/rdf+xml"):::owl:Literal
  ActOfEvaluation_001 -- obo:has occurrent part--> ActOfDataAppending_001
  ActOfDataAppending_001 -- obo:has specified input--> ExampleOntology
  ActOfDataAppending_001 -- obo:has specified input--> ontologyFormat
  ExampleOntology --dcterms:format--> ontologyFormat
  


classDef owl:Ontology fill:#745,stroke:#453
classDef owl:Class fill:#773,stroke:#443
classDef owl:NamedIndividual fill:#737,stroke:#434
classDef owl:Literal fill:#373,stroke:#343

```

## Conformance Checking
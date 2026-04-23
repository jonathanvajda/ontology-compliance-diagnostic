# Editable Curation and Export Workflow

## Status
- [x] Plan approved
- [x] Core RDF round-trip support implemented
- [x] Edit-session state implemented
- [x] Resource and ontology edit UI implemented
- [x] Rerun-and-export flow implemented
- [x] Feature/regression tests implemented

## Decisions
- [x] Full inspection rerun is the feedback mechanism after staged edits.
- [x] Import closure is satisfied with additional local uploads only.
- [x] Editable curation status is limited to the current known status set in the first pass.
- [x] Arbitrary relation editing supports named IRI objects and literals only.
- [x] Blank-node editing is out of scope.
- [x] Ontology annotation editing is limited to direct ontology-subject triples.
- [x] Supplemental closure ontologies are read-only inputs and are not rewritten during export.

## Milestones
- [x] Add workstream tracking document.
- [x] Extend RDF I/O and parsed ontology model for symmetric parse/serialize support.
- [x] Add mutation helpers and edit-session state.
- [x] Expand resource detail to show all assertions and editing affordances.
- [x] Add ontology annotation editing.
- [x] Add supplemental closure ontology staging.
- [x] Add rerun feedback and ontology export in supported formats.
- [x] Add tests for round-tripping, mutations, reruns, and closure behavior.

## Task Checklist
- [x] Implement store serialization for Turtle, N-Triples, N-Quads, TriG, N3, JSON-LD, and RDF/XML.
- [x] Preserve source format, prefixes, base IRI, and store in editable ontology state.
- [x] Add typed assertion models for recognized fields, outgoing assertions, incoming assertions, and ontology annotations.
- [x] Add staged edit models for status changes, note annotations, and arbitrary relations.
- [x] Support resource selection and bulk staging from failed-resource rows.
- [x] Support direct editing from the resource detail panel.
- [x] Support ontology-subject annotation edits from the ontology report section.
- [x] Merge supplemental closure ontologies into inspection/rerun evaluation only.
- [x] Re-run full inspection against the merged store after staged edits.
- [x] Export the primary ontology in the original format by default, with user-selectable supported formats.
- [x] Extend automated tests to cover new behavior and guard existing exports.

## Verification Log
- [ ] Baseline tests run successfully. Blocked in this environment because `node`/`npm` are unavailable on PATH.
- [ ] Round-trip serialization tests added and passing. Added, not executed here.
- [ ] Mutation helper tests added and passing. Added, not executed here.
- [ ] Detail rendering tests added and passing. Added, not executed here.
- [ ] Rerun and closure tests added and passing. Added coverage for rerun/closure-related helpers, not executed here.
- [ ] Existing report/export regressions still pass. Updated tests, not executed here.

## Open Risks
- [ ] RDF/XML serialization may require careful rdflib graph conversion to preserve blank-node structures safely.
- [ ] Full inspection reruns after every staged edit may need UX messaging if large ontologies cause noticeable latency.
- [ ] Supplemental closure ontologies must remain excluded from export even when their triples affect rerun outcomes.

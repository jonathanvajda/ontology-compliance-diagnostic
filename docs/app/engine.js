// app/engine.js (ES module)

const N3 = window.N3 || {};
const Comunica = window.Comunica || {};

const Parser = N3.Parser;
const Store = N3.Store;

if (!Parser || !Store) {
  console.error('N3.Parser or N3.Store not found. Check n3.min.js loading.');
}

function createComunicaEngine() {
  if (typeof Comunica.newEngine === 'function') {
    console.info('[Comunica] Using Comunica.newEngine()');
    return Comunica.newEngine();
  }
  if (typeof Comunica.QueryEngine === 'function') {
    console.info('[Comunica] Using new Comunica.QueryEngine()');
    return new Comunica.QueryEngine();
  }
  console.error('No suitable Comunica constructor found. Keys:', Object.keys(Comunica));
  throw new Error('Unsupported Comunica browser bundle shape');
}

const comunicaEngine = createComunicaEngine();

// --- helper: guess RDF format from filename ---
function guessFormatFromFilename(name) {
  if (!name) return 'text/turtle';
  const lower = name.toLowerCase();
  if (lower.endsWith('.ttl') || lower.endsWith('.turtle')) return 'text/turtle';
  if (lower.endsWith('.nt') || lower.endsWith('.ntriples')) return 'application/n-triples';
  if (lower.endsWith('.nq')) return 'application/n-quads';
  if (lower.endsWith('.trig')) return 'application/trig';
  if (lower.endsWith('.rdf') || lower.endsWith('.owl') || lower.endsWith('.xml')) return 'application/rdf+xml';
  if (lower.endsWith('.jsonld')) return 'application/ld+json';
  return 'text/turtle';
}

// --- helper: load ontology into N3.Store ---
async function loadOntologyIntoStore(text, filename) {
  if (!Parser || !Store) {
    throw new Error('N3.Parser or N3.Store not available.');
  }
  const format = guessFormatFromFilename(filename);
  const parser = new Parser({ format });
  const store = new Store();
  const quads = parser.parse(text);
  store.addQuads(quads);
  return store;
}

// --- consume Comunica bindings (async iterator or EventEmitter) ---
async function collectBindingsStream(stream) {
  if (stream && typeof stream[Symbol.asyncIterator] === 'function') {
    const rows = [];
    for await (const b of stream) rows.push(b);
    return rows;
  }
  if (stream && typeof stream.on === 'function') {
    return await new Promise((resolve, reject) => {
      const rows = [];
      stream.on('data', b => rows.push(b));
      stream.on('end', () => resolve(rows));
      stream.on('error', err => reject(err));
    });
  }
  console.error('Unknown bindings stream shape', stream);
  throw new Error('Unsupported bindings stream');
}

async function runSelect(store, sparql) {
  if (!comunicaEngine) throw new Error('Comunica engine not initialized.');

  let bindingsStream;
  if (typeof comunicaEngine.queryBindings === 'function') {
    bindingsStream = await comunicaEngine.queryBindings(sparql, {
      sources: [{ type: 'rdfjsSource', value: store }]
    });
  } else if (typeof comunicaEngine.query === 'function') {
    const result = await comunicaEngine.query(sparql, {
      sources: [{ type: 'rdfjsSource', value: store }]
    });
    if (typeof result.bindings !== 'function') {
      throw new Error('Comunica query() result has no .bindings() method');
    }
    bindingsStream = await result.bindings();
  } else {
    throw new Error('Comunica engine has neither queryBindings() nor query()');
  }

  const bindings = await collectBindingsStream(bindingsStream);
  const rows = [];

  for (const binding of bindings) {
    const obj = {};
    if (typeof binding.entries === 'function') {
      for (const [varName, term] of binding.entries()) {
        obj[varName] = term.value;
      }
    } else if (typeof binding.forEach === 'function') {
      binding.forEach((term, varName) => {
        obj[varName] = term.value;
      });
    }
    rows.push(obj);
  }

  return rows;
}

async function runAsk(store, sparql) {
  if (!comunicaEngine) throw new Error('Comunica engine not initialized.');

  if (typeof comunicaEngine.queryBoolean === 'function') {
    return await comunicaEngine.queryBoolean(sparql, {
      sources: [{ type: 'rdfjsSource', value: store }]
    });
  }

  if (typeof comunicaEngine.query === 'function') {
    const result = await comunicaEngine.query(sparql, {
      sources: [{ type: 'rdfjsSource', value: store }]
    });
    if (!result || !result.booleanResult) {
      throw new Error('Comunica query() result has no booleanResult for ASK');
    }
    return await result.booleanResult;
  }

  throw new Error('Comunica engine has neither queryBoolean() nor query()');
}

async function loadManifest(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch manifest: ${res.status} ${res.statusText}`);
  return res.json();
}

async function loadQueryText(qMeta, basePath) {
  const url = basePath + qMeta.file;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch query ${qMeta.id} from ${url}`);
  return res.text();
}

function guessOntologyIri(store) {
  const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
  const OWL_ONTOLOGY = 'http://www.w3.org/2002/07/owl#Ontology';

  const quads = store.getQuads(null, null, null, null);
  for (const quad of quads) {
    if (quad.predicate.value === RDF_TYPE && quad.object.value === OWL_ONTOLOGY) {
      return quad.subject.value;
    }
  }
  return 'urn:ontology:unknown';
}

async function evaluateSingleQuery(store, qMeta, queryText) {
  const requirementId = qMeta.checksConformityTo || null;
  const severity = qMeta.severity || 'info';
  const scope = qMeta.scope || 'resource';

  if (qMeta.kind === 'SELECT') {
    const rows = await runSelect(store, queryText);
    console.log('query id:', qMeta.id);
    console.log('query text:', queryText);
    console.log('raw rows:', rows);
    const resourceVar = qMeta.resourceVar || 'resource';

    const records = rows.map(row => {
      const resource =
        row[resourceVar] ??
        row.resource ??
        (Object.values(row).length ? Object.values(row)[0] : null);

      return {
        resource,
        queryId: qMeta.id,
        requirementId,
        status: qMeta.polarity === 'matchMeansFail' ? 'fail' : 'fail',
        severity,
        scope,
        details: row
      };
    });

    return records;
  }

  if (qMeta.kind === 'ASK') {
    const ok = await runAsk(store, queryText);
    let status;

    switch (qMeta.polarity) {
      case 'trueMeansPass':
        status = ok ? 'pass' : 'fail';
        break;

      case 'trueMeansFail':
      case 'falseMeansPass':
        status = ok ? 'fail' : 'pass';
        break;

      case 'falseMeansFail':
        status = ok ? 'pass' : 'fail';
        break;

      default:
        status = 'fail';
        details = { askResult: ok, error: `Unknown polarity: ${qMeta.polarity}` };
    }

    const ontologyIri = guessOntologyIri(store);

    return [
      {
        resource: ontologyIri,
        queryId: qMeta.id,
        requirementId,
        status,
        severity,
        scope,
        details: { askResult: ok }
      }
    ];
  }

  console.warn(`Unknown query kind for ${qMeta.id}:`, qMeta.kind);
  return [];
}

// 🔹 This is the main function your UI uses
export async function evaluateAllQueries(ontologyText, fileName) {
  const store = await loadOntologyIntoStore(ontologyText, fileName || 'ontology.ttl');
  const manifest = await loadManifest('queries/manifest.json');

  const allResults = [];

  for (const qMeta of manifest.queries) {
    try {
      const queryText = await loadQueryText(qMeta, 'queries/');
      const rows = await evaluateSingleQuery(store, qMeta, queryText);
      allResults.push(...rows);
    } catch (err) {
      console.error(`Error evaluating query ${qMeta.id}:`, err);
    }
  }

  const RDFS_LABEL = 'http://www.w3.org/2000/01/rdf-schema#label';
  const labeled = new Set();
  const quads = store.getQuads(null, RDFS_LABEL, null, null);
  for (const q of quads) {
    labeled.add(q.subject.value);
  }

  const ontologyIri = guessOntologyIri(store);

  return {
    results: allResults,
    resources: Array.from(labeled),
    ontologyIri
  };
}
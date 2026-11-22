// Free public filmography lookup through Wikidata. Every result links back to its source.
async function getJson(url, signal, accept) {
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), 20000);
  const onAbort = () => timeout.abort();
  signal?.addEventListener('abort', onAbort);
  try {
    const res = await fetch(url, { signal: timeout.signal, headers: accept ? { Accept: accept } : undefined });
    if (!res.ok) throw new Error(`Wikidata is unavailable (${res.status})`);
    return await res.json();
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Wikidata took too long. Try again in a moment.');
    throw e;
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); }
}

export async function searchPerson(query, signal) {
  const q = new URLSearchParams({
    action: 'wbsearchentities', search: query, language: 'en', type: 'item', limit: '8', format: 'json', origin: '*',
  });
  const data = await getJson('https://www.wikidata.org/w/api.php?' + q, signal);
  return (data.search || []).map((x) => ({ id: x.id, label: x.label || 'Unnamed', description: x.description || 'No description' }));
}

export async function fetchCredits(qid, signal) {
  if (!/^Q\d+$/.test(qid)) throw new Error('Invalid Wikidata id');
  const sparql = `SELECT ?work ?workLabel ?year ?charLabel WHERE {
    ?work p:P161 ?st . ?st ps:P161 wd:${qid} .
    OPTIONAL { ?st pq:P453 ?char . }
    OPTIONAL { ?work wdt:P577 ?date . BIND(YEAR(?date) AS ?year) }
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
  } ORDER BY DESC(?year) LIMIT 200`;
  const data = await getJson('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(sparql), signal, 'application/sparql-results+json');
  const seen = new Set();
  const credits = [];
  for (const b of data.results?.bindings || []) {
    const title = b.workLabel?.value;
    if (!title || /^Q\d+$/.test(title)) continue; // unlabeled item
    const key = title.toLowerCase() + '|' + (b.year?.value || '');
    if (seen.has(key)) continue;
    seen.add(key);
    credits.push({
      title, year: b.year?.value || '', role: b.charLabel?.value && !/^Q\d+$/.test(b.charLabel.value) ? b.charLabel.value : '',
      sourceUrl: b.work.value.replace('http://', 'https://').replace('/entity/', '/wiki/'),
    });
  }
  return credits;
}

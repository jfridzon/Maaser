// Optional backup to a private GitHub repo: one immutable file per event, plus settings.json.
const b64 = s => btoa(unescape(encodeURIComponent(s)));
const unb64 = s => decodeURIComponent(escape(atob(s.replace(/\s/g, ''))));

export function client(token, repo) {
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' };
  const url = p => `https://api.github.com/repos/${repo}/contents/${p}`;
  const failure = r => new Error(r.status === 401 ? 'token' : r.status === 403 ? 'permission' : r.status === 404 ? 'repo' : `http ${r.status}`);
  return {
    async list(path) {
      const r = await fetch(url(path), { headers, cache: 'no-store' });
      if (r.status === 404) return [];
      if (!r.ok) throw failure(r);
      return r.json();
    },
    async read(path) {
      const r = await fetch(url(path), { headers, cache: 'no-store' });
      if (r.status === 404) return null;
      if (!r.ok) throw failure(r);
      const f = await r.json();
      return { sha: f.sha, text: unb64(f.content) };
    },
    async write(path, text, sha) {
      const body = { message: `update ${path}`, content: b64(text) };
      if (sha) body.sha = sha;
      const r = await fetch(url(path), { method: 'PUT', headers, body: JSON.stringify(body) });
      if (r.status === 404) throw new Error('repo');
      if (!r.ok) throw failure(r);
    },
  };
}

export async function whoAmI(token) {
  const r = await fetch('https://api.github.com/user', { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error('token');
  return (await r.json()).login;
}

// Pulls what is new, pushes what is missing. Returns how many events arrived.
export async function syncEvents(api, events, onEvent) {
  const remote = await api.list('events');
  if (!Array.isArray(remote)) throw new Error('repo');
  const names = new Set(remote.map(f => f.name.replace(/\.json$/, '')));
  const mine = new Set(events.map(e => e.id));
  let added = 0;
  for (const f of remote) {
    const id = f.name.replace(/\.json$/, '');
    if (mine.has(id)) continue;
    const file = await api.read(`events/${f.name}`);
    let e;
    try { e = JSON.parse(file.text); } catch (err) { continue; }
    if (onEvent(e, id)) added++;
  }
  for (const e of events) {
    if (!names.has(e.id)) await api.write(`events/${e.id}.json`, JSON.stringify(e));
  }
  return added;
}

// Newest settings win. Returns the remote settings when they should replace the local ones.
export async function syncSettings(api, cfg) {
  const file = await api.read('settings.json');
  let remote = null;
  if (file) { try { remote = JSON.parse(file.text); } catch (e) { remote = null; } }
  if (remote && (remote.updatedAt || 0) > (cfg.updatedAt || 0)) return remote;
  if (!remote || (cfg.updatedAt || 0) > (remote.updatedAt || 0)) await api.write('settings.json', JSON.stringify(cfg, null, 2), file && file.sha);
  return null;
}

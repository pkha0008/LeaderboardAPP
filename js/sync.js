// Shared, live database sync.
//
// When the app runs as a claude.ai artifact, `window.claude.use("db")` gives a
// realtime document store shared by everyone who opens the link. Data layout:
//   players/<id>       one document per player
//   tournaments/<id>   one document per tournament (games + pot history inside)
//   meta/settings      app settings (currency)
// Anywhere else (GitHub Pages, localhost) there is no shared store, and the app
// keeps working from this browser's localStorage only.
import { normalize } from './store.js';

const clone = (v) => JSON.parse(JSON.stringify(v));
// Stable stringify (sorted keys) so a round trip through the store doesn't look like a change.
const stable = (v) =>
  JSON.stringify(v, (_k, val) =>
    val && typeof val === 'object' && !Array.isArray(val)
      ? Object.fromEntries(Object.keys(val).sort().map((k) => [k, val[k]]))
      : val
  );

/**
 * status values: 'local' | 'connecting' | 'live' | 'readonly' | 'slow' | 'error'
 */
export function createSync({ getState, setState, onStatus, onMessage }) {
  let db = null;
  let readOnly = false;
  let definitive = false;
  let pendingLocal = false; // local edits made before the first full answer from the store
  const synced = new Map(); // path -> stable JSON last known to be in the store
  const queues = new Map(); // path -> promise chain (one write at a time per document)
  const snaps = { players: null, tournaments: null, settings: null };
  let status = 'local';
  const setStatus = (s) => { status = s; onStatus(s); };

  function remoteState() {
    const local = getState();
    const players = snaps.players.docs.map((d) => clone(d.data()))
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0) || String(a.name).localeCompare(String(b.name)));
    const tournaments = snaps.tournaments.docs.map((d) => clone(d.data()));
    const settings = snaps.settings.exists ? clone(snaps.settings.data()) : local.settings;
    return normalize({ ...local, players, tournaments, settings });
  }

  function rememberSynced() {
    for (const k of [...synced.keys()]) if (k.startsWith('players/') || k.startsWith('tournaments/')) synced.delete(k);
    snaps.players.docs.forEach((d) => synced.set(`players/${d.id}`, stable(d.data())));
    snaps.tournaments.docs.forEach((d) => synced.set(`tournaments/${d.id}`, stable(d.data())));
    if (snaps.settings.exists) synced.set('meta/settings', stable(snaps.settings.data()));
    else synced.delete('meta/settings');
  }

  function apply() {
    if (!snaps.players || !snaps.tournaments || !snaps.settings) return;
    const allConfirmed = !snaps.players.metadata.fromCache && !snaps.tournaments.metadata.fromCache && !snaps.settings.metadata.fromCache;
    rememberSynced();
    if (!definitive && allConfirmed) {
      definitive = true;
      clearTimeout(slowTimer);
      setStatus(readOnly ? 'readonly' : 'live');
      const remoteEmpty = snaps.players.empty && snaps.tournaments.empty;
      const local = getState();
      if (remoteEmpty && !readOnly && (local.players.length || local.tournaments.length)) {
        // First person to open the shared version: upload what this browser already has.
        push();
        onMessage('☁️ Your data is now shared with everyone who has the link');
        return;
      }
      if (pendingLocal && !readOnly) { pendingLocal = false; }
    }
    if (status === 'slow' && allConfirmed) setStatus(readOnly ? 'readonly' : 'live');
    setState(remoteState());
  }

  function fail(e) {
    if (!e) return;
    if (e.code === 'revoked' || e.code === 'not_granted' || e.code === 'capability_disabled' || e.code === 'capability_removed') {
      db = null; setStatus('local'); return;
    }
    setStatus('error');
    onMessage('⚠️ Lost connection to the shared leaderboard. Reload the page to reconnect.');
  }

  function enqueue(path, op) {
    const run = async () => {
      try { await op(); }
      catch (e) {
        if (e?.code === 'unavailable') {
          await new Promise((r) => setTimeout(r, 400 + Math.random() * 800));
          try { await op(); return; } catch (e2) { e = e2; }
        }
        synced.delete(path);
        if (e?.code === 'invalid_argument') {
          readOnly = true;
          setStatus('readonly');
          onMessage('👀 You can view this leaderboard but not change it. Ask the owner for edit access.');
          if (snaps.players && snaps.tournaments && snaps.settings) setState(remoteState());
        } else if (e?.code === 'quota_exceeded') {
          onMessage('⚠️ The shared database is full. Delete old tournaments to make room.');
        } else {
          onMessage('⚠️ A change could not be saved to the shared leaderboard. Try again.');
        }
      }
    };
    const chain = (queues.get(path) || Promise.resolve()).then(run);
    queues.set(path, chain);
    return chain;
  }

  /** Write whatever changed locally since the last known store state. */
  function push() {
    if (!db || readOnly) return;
    if (!definitive) { pendingLocal = true; return; }
    const s = getState();
    const desired = new Map();
    s.players.forEach((p) => desired.set(`players/${p.id}`, p));
    s.tournaments.forEach((t) => desired.set(`tournaments/${t.id}`, t));
    desired.set('meta/settings', s.settings);
    for (const [path, val] of desired) {
      const body = stable(val);
      if (synced.get(path) === body) continue;
      synced.set(path, body);
      const data = clone(val);
      enqueue(path, () => db.doc(path).set(data));
    }
    for (const path of [...synced.keys()]) {
      if (!desired.has(path) && (path.startsWith('players/') || path.startsWith('tournaments/'))) {
        synced.delete(path);
        enqueue(path, () => db.doc(path).delete());
      }
    }
  }

  let slowTimer;
  async function start() {
    if (!window.claude?.use) { setStatus('local'); return; }
    setStatus('connecting');
    slowTimer = setTimeout(() => { if (!definitive) setStatus(db ? 'slow' : 'local'); }, 10000);
    let d = null;
    try { d = await window.claude.use('db'); } catch { d = null; }
    if (!d) { clearTimeout(slowTimer); setStatus('local'); return; }
    db = d;
    try {
      const user = await window.claude.use('user');
      if (user && (await user.can('data.write')) === false) readOnly = true;
    } catch { /* not told: keep editing enabled; a refused write switches to read-only */ }
    db.collection('players').onSnapshot((s) => { snaps.players = s; apply(); }, fail);
    db.collection('tournaments').onSnapshot((s) => { snaps.tournaments = s; apply(); }, fail);
    db.doc('meta/settings').onSnapshot((s) => { snaps.settings = s; apply(); }, fail);
  }

  return {
    start,
    push,
    get status() { return status; },
    get readOnly() { return readOnly && !!db; },
    get shared() { return !!db; },
  };
}

// Pure scoring & money logic — no DOM, so it can be tested with Node.

export const GAME_TYPES = {
  poker:    { label: 'Poker',     icon: '🃏' },
  catan:    { label: 'Catan',     icon: '🏝️' },
  monopoly: { label: 'Monopoly',  icon: '🎩' },
  chess:    { label: 'Chess',     icon: '♟️' },
  cards:    { label: 'Card game', icon: '🂡' },
  board:    { label: 'Board game', icon: '🎲' },
  video:    { label: 'Video game', icon: '🎮' },
  other:    { label: 'Other',     icon: '⭐' },
};

export const POINT_PRESETS = {
  classic: { label: 'Classic: 10 · 7 · 5 · 3 · 1', value: [10, 7, 5, 3, 1] },
  winner:  { label: 'Winner only: 3', value: [3] },
  podium:  { label: 'Podium: 5 · 3 · 1', value: [5, 3, 1] },
  race:    { label: 'Race: 25 · 18 · 15 · 12 · 10 · 8 · 6 · 4 · 2 · 1', value: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1] },
};

export const PAYOUT_PRESETS = {
  winner: { label: 'Winner takes all', value: [100] },
  top2:   { label: 'Top 2: 70% / 30%', value: [70, 30] },
  top3:   { label: 'Top 3: 50% / 30% / 20%', value: [50, 30, 20] },
  top3b:  { label: 'Top 3: 60% / 25% / 15%', value: [60, 25, 15] },
};

export const sum = (arr) => arr.reduce((s, x) => s + (+x || 0), 0);
export const round2 = (n) => Math.round((+n || 0) * 100) / 100;

export function parseList(str) {
  return String(str ?? '')
    .split(/[\s,/;]+/)
    .filter(Boolean)
    .map(Number)
    .filter((n) => Number.isFinite(n) && n >= 0);
}

export function presetKey(presets, arr) {
  const s = (arr || []).join(',');
  for (const [k, v] of Object.entries(presets)) if (v.value.join(',') === s) return k;
  return 'custom';
}

export function pointsForPlace(t, place) {
  return (+(t.points?.[place - 1]) || 0) + (+t.participationPoints || 0);
}

export function gamePool(g) {
  return g.pot?.enabled ? sum(Object.values(g.pot.contributions || {})) : 0;
}

export function tournamentPool(t) {
  return t.pot?.enabled ? sum((t.pot.entries || []).map((e) => e.amount)) : 0;
}

/**
 * Split a pool between finishers.
 * results: [{ playerId, place }]  (equal place = tie)
 * percents: [60, 30, 10] — share for 1st, 2nd, 3rd…
 * Tied players share the combined percentages of the positions they occupy.
 * Unused percentage (fewer finishers than paid places) goes to the top group.
 */
export function splitPayout(results, pool, percents) {
  const out = {};
  if (!(pool > 0) || !results?.length) return out;
  const pct = (percents && percents.length ? percents : [100]).map(Number);
  const sorted = [...results].sort((a, b) => a.place - b.place);
  const groups = [];
  for (const r of sorted) {
    const last = groups[groups.length - 1];
    if (last && last[0].place === r.place) last.push(r);
    else groups.push([r]);
  }
  let pos = 0;
  const alloc = groups.map((g) => {
    const s = sum(pct.slice(pos, pos + g.length));
    pos += g.length;
    return s;
  });
  const used = sum(alloc);
  if (used <= 0) alloc[0] = 100;
  else if (used < 100) alloc[0] += 100 - used;
  const total = sum(alloc);
  groups.forEach((g, k) =>
    alloc[k] > 0 && g.forEach((r) => {
      out[r.playerId] = (out[r.playerId] || 0) + (pool * alloc[k]) / total / g.length;
    })
  );
  return out;
}

export function sortGames(games) {
  return [...games].sort(
    (a, b) => (a.at || '').localeCompare(b.at || '') || (a.createdAt || 0) - (b.createdAt || 0)
  );
}

/** Full standings for a tournament: points, wins, form and money. */
export function computeStandings(t) {
  const rows = new Map();
  const ensure = (id) => {
    if (!rows.has(id)) {
      rows.set(id, {
        playerId: id, points: 0, games: 0, wins: 0, podiums: 0, placeSum: 0,
        form: [], moneyIn: 0, gameWinnings: 0, potShare: 0,
        inTournament: t.playerIds.includes(id),
      });
    }
    return rows.get(id);
  };
  t.playerIds.forEach(ensure);

  const games = sortGames(t.games || []);
  for (const g of games) {
    for (const r of g.results) {
      const row = ensure(r.playerId);
      row.points += pointsForPlace(t, r.place);
      row.games += 1;
      if (r.place === 1) row.wins += 1;
      if (r.place <= 3) row.podiums += 1;
      row.placeSum += r.place;
      row.form.push(r.place);
    }
    if (g.pot?.enabled) {
      const pool = gamePool(g);
      for (const [pid, amt] of Object.entries(g.pot.contributions || {})) ensure(pid).moneyIn += +amt || 0;
      const pay = splitPayout(g.results, pool, g.pot.payout);
      for (const [pid, v] of Object.entries(pay)) ensure(pid).gameWinnings += v;
    }
  }

  if (t.pot?.enabled) for (const e of t.pot.entries || []) ensure(e.playerId).moneyIn += +e.amount || 0;

  const list = [...rows.values()].filter((r) => r.inTournament || r.games > 0 || r.moneyIn > 0);
  list.forEach((r) => (r.avgPlace = r.games ? r.placeSum / r.games : null));
  list.sort(
    (a, b) =>
      b.points - a.points ||
      b.wins - a.wins ||
      (a.avgPlace ?? 999) - (b.avgPlace ?? 999) ||
      b.games - a.games
  );
  list.forEach((r, i) => {
    const p = list[i - 1];
    r.rank = p && p.points === r.points && p.wins === r.wins && p.avgPlace === r.avgPlace ? p.rank : i + 1;
  });

  const pool = tournamentPool(t);
  if (pool > 0 && games.length) {
    const pay = splitPayout(
      list.filter((r) => r.games > 0).map((r) => ({ playerId: r.playerId, place: r.rank })),
      pool,
      t.pot.payout
    );
    list.forEach((r) => (r.potShare = pay[r.playerId] || 0));
  }
  list.forEach((r) => {
    r.moneyOut = r.gameWinnings + r.potShare;
    r.net = r.moneyOut - r.moneyIn;
    r.form = r.form.slice(-5);
  });

  return { rows: list, pool, gamesCount: games.length, gamePotsTotal: sum(games.map(gamePool)) };
}

/** Minimal-ish list of transfers that settles everyone's net balance. */
export function settleUp(rows) {
  const eps = 0.005;
  const cred = rows.filter((r) => r.net > eps).map((r) => ({ id: r.playerId, amt: r.net })).sort((a, b) => b.amt - a.amt);
  const debt = rows.filter((r) => r.net < -eps).map((r) => ({ id: r.playerId, amt: -r.net })).sort((a, b) => b.amt - a.amt);
  const tx = [];
  let i = 0, j = 0;
  while (i < debt.length && j < cred.length) {
    const a = Math.min(debt[i].amt, cred[j].amt);
    if (a > eps) tx.push({ from: debt[i].id, to: cred[j].id, amount: round2(a) });
    debt[i].amt -= a;
    cred[j].amt -= a;
    if (debt[i].amt < eps) i++;
    if (cred[j].amt < eps) j++;
  }
  return tx;
}

/** All-time stats across every tournament. */
export function hallOfFame(state) {
  const stats = {};
  const get = (id) => (stats[id] ||= { playerId: id, titles: 0, wins: 0, games: 0, net: 0 });
  for (const t of state.tournaments) {
    const s = computeStandings(t);
    for (const r of s.rows) {
      const st = get(r.playerId);
      st.wins += r.wins;
      st.games += r.games;
      if (t.status === 'finished') st.net += r.net;
    }
    if (t.status === 'finished' && t.championId) get(t.championId).titles += 1;
  }
  return Object.values(stats)
    .filter((s) => s.games > 0 || s.titles > 0)
    .sort((a, b) => b.titles - a.titles || b.wins - a.wins || a.games - b.games);
}

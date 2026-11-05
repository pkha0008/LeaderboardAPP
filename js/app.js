import { load, save, uid, normalize } from './store.js';
import {
  GAME_TYPES, POINT_PRESETS, PAYOUT_PRESETS, computeStandings, splitPayout, settleUp,
  hallOfFame, gamePool, tournamentPool, parseList, presetKey, pointsForPlace, sortGames, sum, round2,
} from './logic.js';

let state = load();
const $app = document.getElementById('app');
const $modal = document.getElementById('modal-root');
const $toast = document.getElementById('toast');

const EMOJIS = ['🦊', '🐼', '🐯', '🦁', '🐸', '🐙', '🦄', '🐲', '🦉', '🐺', '🐻', '🐨', '🐵', '🦖', '🐧', '🦈', '🐝', '🦩', '🐬', '🦔', '🐢', '🦜', '👑', '🤠', '😎', '👽', '🤖', '🧙'];
const COLORS = ['#f5c451', '#ff6b6b', '#4dd4ac', '#5aa9ff', '#b58cff', '#ff9f43', '#ff7ac6', '#7bed9f', '#70a1ff', '#eccc68', '#2ed1e6', '#ff8a80'];
const MEDALS = ['🥇', '🥈', '🥉'];

/* ---------- helpers ---------- */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => {
  const v = round2(n);
  const abs = Math.abs(v);
  const str = abs.toLocaleString(undefined, { minimumFractionDigits: abs % 1 ? 2 : 0, maximumFractionDigits: 2 });
  return (v < 0 ? '−' : '') + esc(state.settings.currency) + str;
};
const signedMoney = (n) => (round2(n) > 0 ? '+' : '') + money(n);
const ordinal = (n) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
const player = (id) => state.players.find((p) => p.id === id) || { id, name: 'Removed player', emoji: '❔', color: '#7c8195' };
const tourney = (id) => state.tournaments.find((t) => t.id === id);
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const fmtDate = (x) => {
  if (!x) return '';
  let d;
  if (typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x)) { const [y, m, dd] = x.split('-').map(Number); d = new Date(y, m - 1, dd); }
  else d = new Date(x);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
};
const avatar = (p, cls = '') => `<span class="avatar ${cls}" style="--c:${esc(p.color)}" title="${esc(p.name)}">${esc(p.emoji)}</span>`;
const chip = (p) => `<span class="pchip">${avatar(p, 'sm')}<span>${esc(p.name)}</span></span>`;
const gameLabel = (g) => (GAME_TYPES[g.type] || GAME_TYPES.other).label;
const gameIcon = (g) => (GAME_TYPES[g.type] || GAME_TYPES.other).icon;
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

function commit(msg) {
  if (!save(state)) toast('⚠️ Could not save — storage is blocked in this browser');
  else if (msg) toast(msg);
  render();
}

let toastTimer;
function toast(msg) {
  $toast.textContent = msg;
  $toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $toast.classList.remove('show'), 2600);
}

function route() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts[0] === 'players') return { view: 'players' };
  if (parts[0] === 't' && parts[1]) return { view: 'tournament', id: parts[1], tab: parts[2] || 'standings' };
  return { view: 'home' };
}

/* ---------- render ---------- */
function render() {
  const r = route();
  let html;
  if (r.view === 'players') html = viewPlayers();
  else if (r.view === 'tournament') {
    const t = tourney(r.id);
    html = t ? viewTournament(t, r.tab) : `<div class="empty card"><div class="empty-icon">🤷</div><h3>Tournament not found</h3><a class="btn" href="#/">Back home</a></div>`;
  } else html = viewHome();
  $app.innerHTML = topbar(r) + `<main class="container">${html}</main>` + footer();
}

function topbar(r) {
  return `<header class="topbar"><div class="container topbar-inner">
    <a href="#/" class="brand"><span class="brand-mark">🏆</span><span class="brand-text">Game Night <b>Leaderboard</b></span></a>
    <nav class="nav">
      <a href="#/" class="${r.view !== 'players' ? 'active' : ''}">Tournaments</a>
      <a href="#/players" class="${r.view === 'players' ? 'active' : ''}">Players</a>
    </nav></div></header>`;
}

function footer() {
  const cur = state.settings.currency;
  const opts = ['$', '€', '£', '₹', '¥', 'A$', 'C$', '₩', 'R$', 'kr '].map((c) => `<option ${c === cur ? 'selected' : ''} value="${esc(c)}">${esc(c.trim())}</option>`).join('');
  return `<footer class="container footer">
    <div class="footer-left">Saved in this browser · <button class="link" data-action="export">Export backup</button> · <button class="link" data-action="import">Import backup</button></div>
    <label class="footer-cur">Currency <select data-setting="currency">${opts}</select></label>
  </footer>`;
}

/* ---------- home ---------- */
function viewHome() {
  const active = state.tournaments.filter((t) => t.status !== 'finished').sort((a, b) => b.createdAt - a.createdAt);
  const finished = state.tournaments.filter((t) => t.status === 'finished').sort((a, b) => (b.finishedAt || 0) - (a.finishedAt || 0));
  const totalGames = sum(state.tournaments.map((t) => t.games.length));
  const totalMoney = sum(state.tournaments.map((t) => tournamentPool(t) + sum(t.games.map(gamePool))));
  const hof = hallOfFame(state).slice(0, 5);

  return `
  <section class="hero">
    <div class="hero-copy">
      <p class="eyebrow">Series · Tournaments · Money pots</p>
      <h1>Who rules <span class="grad">game night</span>?</h1>
      <p class="lead">Track every poker hand, Catan build and Monopoly bankruptcy. Points, win streaks and the money pot, all in one place.</p>
      <div class="hero-actions">
        <button class="btn primary lg" data-action="new-tournament">＋ New tournament</button>
        <a class="btn ghost lg" href="#/players">${state.players.length ? 'Manage players' : 'Add players'}</a>
      </div>
    </div>
    <div class="hero-stats">
      ${statCard('🏁', 'Tournaments', state.tournaments.length)}
      ${statCard('🎲', 'Games played', totalGames)}
      ${statCard('🧑‍🤝‍🧑', 'Players', state.players.length)}
      ${statCard('💰', 'Money in play', money(totalMoney))}
    </div>
  </section>

  <section class="section">
    <div class="section-head"><h2>Active tournaments</h2></div>
    ${active.length ? `<div class="grid cards">${active.map(tournamentCard).join('')}</div>` :
      `<div class="empty card"><div class="empty-icon">🎯</div><h3>No tournament running</h3><p class="muted">Start a series for poker night, a Catan league or a full multi-game showdown.</p><button class="btn primary" data-action="new-tournament">＋ Start one</button></div>`}
  </section>

  ${hof.length ? `<section class="section"><div class="section-head"><h2>Hall of fame</h2><span class="muted">All-time, across every tournament</span></div>
    <div class="card hof">${hof.map((h, i) => { const p = player(h.playerId); return `
      <div class="hof-row"><span class="hof-rank">${MEDALS[i] || i + 1}</span>${avatar(p)}<span class="hof-name">${esc(p.name)}</span>
      <span class="hof-stat"><b>${h.titles}</b> ${h.titles === 1 ? 'title' : 'titles'}</span><span class="hof-stat"><b>${h.wins}</b> ${h.wins === 1 ? 'win' : 'wins'}</span><span class="hof-stat hide-sm"><b>${h.games}</b> ${h.games === 1 ? 'game' : 'games'}</span></div>`; }).join('')}
    </div></section>` : ''}

  ${finished.length ? `<section class="section"><div class="section-head"><h2>Finished</h2></div><div class="grid cards">${finished.map(tournamentCard).join('')}</div></section>` : ''}`;
}

function statCard(icon, label, value) {
  return `<div class="stat-card"><span class="stat-icon">${icon}</span><span class="stat-value">${value}</span><span class="stat-label">${label}</span></div>`;
}

function tournamentCard(t) {
  const s = computeStandings(t);
  const leader = s.gamesCount ? s.rows[0] : null;
  const champ = t.championId ? player(t.championId) : null;
  const pots = s.pool + s.gamePotsTotal;
  const icons = [...new Set(t.games.map(gameIcon))].slice(0, 4).join(' ');
  return `<a class="card t-card ${t.status === 'finished' ? 'finished' : ''}" href="#/t/${t.id}">
    <div class="t-card-top"><span class="pill ${t.status === 'finished' ? 'pill-done' : 'pill-live'}">${t.status === 'finished' ? 'Finished' : '● Live'}</span><span class="t-card-icons">${icons}</span></div>
    <h3>${esc(t.name)}</h3>
    <div class="avatar-stack">${t.playerIds.slice(0, 7).map((id) => avatar(player(id), 'sm')).join('')}${t.playerIds.length > 7 ? `<span class="more">+${t.playerIds.length - 7}</span>` : ''}</div>
    <div class="t-card-meta"><span>${plural(t.games.length, 'game')}</span>${pots > 0 ? `<span>💰 ${money(pots)}</span>` : ''}</div>
    <div class="t-card-leader">${champ ? `👑 Champion: <b>${esc(champ.name)}</b>` : leader ? `Leading: ${avatar(player(leader.playerId), 'xs')} <b>${esc(player(leader.playerId).name)}</b> · ${leader.points} pts` : '<span class="muted">No games yet</span>'}</div>
  </a>`;
}

/* ---------- players ---------- */
function viewPlayers() {
  const usage = (id) => state.tournaments.filter((t) => t.playerIds.includes(id)).length;
  const wins = (id) => sum(state.tournaments.map((t) => t.games.filter((g) => g.results.some((r) => r.playerId === id && r.place === 1)).length));
  return `<section class="page-head"><h1>Players</h1><p class="muted">Your crew. Add everyone once and reuse them in any tournament.</p></section>
  <form class="card add-player" data-form="quick-player">
    <input name="name" placeholder="Add a player: type a name and press Enter" maxlength="40" autocomplete="off" required>
    <button class="btn primary">Add player</button>
  </form>
  ${state.players.length ? `<div class="grid players">${state.players.map((p) => `
    <div class="card player-card">
      ${avatar(p, 'lg')}
      <div class="player-info"><div class="player-name">${esc(p.name)}</div><div class="muted small">${plural(usage(p.id), 'tournament')} · ${plural(wins(p.id), 'win')}</div></div>
      <button class="icon-btn" data-action="edit-player" data-id="${p.id}" title="Edit">✎</button>
    </div>`).join('')}</div>` :
    `<div class="empty card"><div class="empty-icon">🧑‍🤝‍🧑</div><h3>No players yet</h3><p class="muted">Add the people you play with above.</p></div>`}`;
}

/* ---------- tournament ---------- */
function viewTournament(t, tab) {
  const s = computeStandings(t);
  const leader = s.gamesCount ? player(s.rows[0].playerId) : null;
  const tabs = [['standings', 'Standings'], ['games', `Games <span class="count">${t.games.length}</span>`], ['pot', 'Money pot'], ['settings', 'Settings']];
  if (!tabs.some(([k]) => k === tab)) tab = 'standings';
  const body = { standings: tabStandings, games: tabGames, pot: tabPot, settings: tabSettings }[tab](t, s);
  return `
  <section class="t-header">
    <a href="#/" class="back">← All tournaments</a>
    <div class="t-title-row">
      <div><h1>${esc(t.name)}</h1>
        <div class="t-sub"><span class="pill ${t.status === 'finished' ? 'pill-done' : 'pill-live'}">${t.status === 'finished' ? 'Finished' : '● Live'}</span> ${plural(t.playerIds.length, 'player')} · started ${fmtDate(t.createdAt)}</div></div>
      ${t.status !== 'finished' ? `<button class="btn primary" data-action="record-game" data-id="${t.id}">＋ Record game</button>` : ''}
    </div>
    <div class="stat-row">
      ${statCard('🎲', 'Games', s.gamesCount)}
      ${statCard(t.status === 'finished' ? '👑' : '🔥', t.status === 'finished' ? 'Champion' : 'Leader', leader ? `${esc(player(t.championId || s.rows[0].playerId).name)}` : '—')}
      ${statCard('💰', 'Tournament pot', t.pot.enabled ? money(s.pool) : 'Off')}
      ${statCard('🪙', 'Game pots', money(s.gamePotsTotal))}
    </div>
    <nav class="tabs">${tabs.map(([k, l]) => `<a href="#/t/${t.id}/${k}" class="${k === tab ? 'active' : ''}">${l}</a>`).join('')}</nav>
  </section>
  <section class="tab-body">${body}</section>`;
}

function championBanner(t, s) {
  if (t.status !== 'finished' || !t.championId) return '';
  const p = player(t.championId);
  const row = s.rows.find((r) => r.playerId === t.championId);
  return `<div class="champion card"><div class="champion-glow"></div>${avatar(p, 'xl')}<div><p class="eyebrow">Tournament champion</p><h2>👑 ${esc(p.name)}</h2>
    <p class="muted">${row ? `${row.points} points · ${plural(row.wins, 'win')}${row.potShare > 0 ? ` · takes ${money(row.potShare)} from the pot` : ''}` : ''}</p></div></div>`;
}

function tabStandings(t, s) {
  if (!s.gamesCount) {
    return `<div class="empty card"><div class="empty-icon">🎲</div><h3>No games recorded yet</h3><p class="muted">Play a game, then record who finished where. Points are awarded automatically.</p>
      ${t.status !== 'finished' ? `<button class="btn primary" data-action="record-game" data-id="${t.id}">＋ Record the first game</button>` : ''}</div>
      ${pointsLegend(t)}`;
  }
  const top = s.rows.slice(0, 3);
  const order = [top[1], top[0], top[2]].filter(Boolean);
  const podium = `<div class="podium">${order.map((r) => {
    const p = player(r.playerId); const i = s.rows.indexOf(r);
    return `<div class="podium-spot place-${i + 1}">${avatar(p, 'xl')}<div class="podium-name">${esc(p.name)}</div><div class="podium-pts">${r.points} pts</div>
      <div class="podium-block"><span class="medal">${MEDALS[i]}</span><span class="podium-num">${ordinal(r.rank)}</span></div></div>`;
  }).join('')}</div>`;
  const anyMoney = s.rows.some((r) => r.moneyIn > 0 || r.moneyOut > 0);
  const table = `<div class="card table-card"><table class="standings">
    <thead><tr><th>#</th><th>Player</th><th class="num">Pts</th><th class="num">Wins</th><th class="num hide-sm">Played</th><th class="num hide-sm">Avg place</th><th class="hide-xs">Last 5</th>${anyMoney ? '<th class="num">Net</th>' : ''}</tr></thead>
    <tbody>${s.rows.map((r) => { const p = player(r.playerId); return `<tr class="${r.rank === 1 ? 'is-leader' : ''}">
      <td class="rank">${r.rank <= 3 ? MEDALS[r.rank - 1] : r.rank}</td>
      <td><div class="cell-player">${avatar(p, 'sm')}<span>${esc(p.name)}</span>${!r.inTournament ? '<span class="muted small">(left)</span>' : ''}</div></td>
      <td class="num pts">${r.points}</td><td class="num">${r.wins}</td><td class="num hide-sm">${r.games}</td>
      <td class="num hide-sm">${r.avgPlace ? r.avgPlace.toFixed(1) : '—'}</td>
      <td class="hide-xs"><div class="formline">${r.form.map((pl) => `<span class="form-chip p${Math.min(pl, 4)}" title="${ordinal(pl)}">${pl}</span>`).join('') || '<span class="muted">—</span>'}</div></td>
      ${anyMoney ? `<td class="num ${r.net > 0.004 ? 'pos' : r.net < -0.004 ? 'neg' : ''}">${signedMoney(r.net)}</td>` : ''}
    </tr>`; }).join('')}</tbody></table></div>
    ${anyMoney && t.status !== 'finished' && s.pool > 0 ? '<p class="muted small note">Net includes each player\'s projected share of the tournament pot based on current standings.</p>' : ''}`;
  return championBanner(t, s) + podium + table + pointsLegend(t);
}

function pointsLegend(t) {
  return `<div class="legend muted small">Points per game: ${t.points.map((p, i) => `<span class="legend-item">${ordinal(i + 1)} <b>${p}</b></span>`).join('')}${+t.participationPoints ? `<span class="legend-item">+${t.participationPoints} for playing</span>` : ''}</div>`;
}

function tabGames(t) {
  if (!t.games.length) {
    return `<div class="empty card"><div class="empty-icon">🃏</div><h3>No games yet</h3><p class="muted">Record each game as you play it: who played, who won, and who put money in the pot.</p>
      ${t.status !== 'finished' ? `<button class="btn primary" data-action="record-game" data-id="${t.id}">＋ Record game</button>` : ''}</div>`;
  }
  const ordered = sortGames(t.games);
  const num = new Map(ordered.map((g, i) => [g.id, i + 1]));
  return `<div class="game-list">${[...ordered].reverse().map((g) => {
    const pool = gamePool(g);
    const pay = splitPayout(g.results, pool, g.pot?.payout);
    const res = [...g.results].sort((a, b) => a.place - b.place);
    return `<article class="card game-card">
      <div class="game-icon">${gameIcon(g)}</div>
      <div class="game-main">
        <div class="game-title">${esc(g.title || gameLabel(g))} <span class="muted">· Game #${num.get(g.id)}</span></div>
        <div class="game-meta">${g.title ? `${esc(gameLabel(g))} · ` : ''}${fmtDate(g.at)} · ${plural(g.results.length, 'player')}${pool > 0 ? ` · <span class="gold">💰 ${money(pool)} pot</span>` : ''}</div>
        <div class="game-results">${res.map((r) => { const p = player(r.playerId); return `<span class="result ${r.place === 1 ? 'first' : ''}"><span class="result-place">${r.place <= 3 ? MEDALS[r.place - 1] : ordinal(r.place)}</span>${avatar(p, 'xs')}${esc(p.name)}<span class="result-pts">+${pointsForPlace(t, r.place)}</span>${pay[r.playerId] ? `<span class="result-money">${money(pay[r.playerId])}</span>` : ''}</span>`; }).join('')}</div>
        ${g.notes ? `<div class="game-notes">“${esc(g.notes)}”</div>` : ''}
      </div>
      <div class="game-actions"><button class="icon-btn" data-action="edit-game" data-id="${t.id}" data-gid="${g.id}" title="Edit">✎</button><button class="icon-btn danger" data-action="delete-game" data-id="${t.id}" data-gid="${g.id}" title="Delete">🗑</button></div>
    </article>`;
  }).join('')}</div>`;
}

function tabPot(t, s) {
  const payoutLabel = (arr) => { const k = presetKey(PAYOUT_PRESETS, arr); return k === 'custom' ? arr.map((x) => x + '%').join(' / ') : PAYOUT_PRESETS[k].label; };
  let tp;
  if (!t.pot.enabled) {
    tp = `<div class="card pot-off"><div class="empty-icon">💰</div><div><h3>Tournament pot is off</h3><p class="muted">Turn it on to have players chip into one big pot that pays out to the overall winner(s) at the end.</p></div>
      <button class="btn primary" data-action="pot-enable" data-id="${t.id}">Turn on tournament pot</button></div>`;
  } else {
    const per = {};
    t.pot.entries.forEach((e) => (per[e.playerId] = (per[e.playerId] || 0) + (+e.amount || 0)));
    const max = Math.max(1, ...Object.values(per));
    const payers = s.rows.filter((r) => r.potShare > 0.004);
    tp = `<div class="card pot-hero">
      <div class="pot-coin">💰</div>
      <div class="pot-info"><div class="label">Tournament pot</div><div class="pot-amount">${money(s.pool)}</div>
        <div class="muted small">${payoutLabel(t.pot.payout)}${t.pot.buyIn ? ` · buy-in ${money(t.pot.buyIn)}` : ''} · paid out by final standings</div></div>
      <div class="pot-buttons">
        ${t.status !== 'finished' ? `<button class="btn primary" data-action="add-money" data-id="${t.id}">＋ Add money</button>
        ${t.pot.buyIn ? `<button class="btn" data-action="buy-in-all" data-id="${t.id}">Everyone buys in (${money(t.pot.buyIn)})</button>` : ''}` : ''}
      </div>
    </div>
    <div class="grid two">
      <div class="card"><h3 class="card-title">Who's in</h3>
        ${Object.keys(per).length ? Object.entries(per).sort((a, b) => b[1] - a[1]).map(([pid, amt]) => { const p = player(pid); return `
          <div class="bar-row"><div class="cell-player">${avatar(p, 'sm')}<span>${esc(p.name)}</span></div><div class="bar"><span style="width:${(amt / max) * 100}%;--c:${esc(p.color)}"></span></div><b>${money(amt)}</b></div>`; }).join('') : '<p class="muted">Nobody has chipped in yet.</p>'}
      </div>
      <div class="card"><h3 class="card-title">${t.status === 'finished' ? 'Final payout' : 'Projected payout'}</h3>
        ${payers.length ? payers.map((r) => { const p = player(r.playerId); return `<div class="payout-row"><span class="medal">${MEDALS[r.rank - 1] || ordinal(r.rank)}</span>${avatar(p, 'sm')}<span class="grow">${esc(p.name)}</span><b class="gold">${money(r.potShare)}</b></div>`; }).join('') :
          `<p class="muted">${s.pool > 0 ? 'Record a game to see who would take the pot.' : 'Add money to the pot first.'}</p>`}
      </div>
    </div>
    ${t.pot.entries.length ? `<div class="card"><h3 class="card-title">Pot history</h3><div class="ledger">${[...t.pot.entries].reverse().map((e) => { const p = player(e.playerId); return `
      <div class="ledger-row">${avatar(p, 'xs')}<span class="grow">${esc(p.name)} added <b>${money(e.amount)}</b></span><span class="muted small">${fmtDate(e.at)}</span>${t.status !== 'finished' ? `<button class="icon-btn sm" data-action="delete-entry" data-id="${t.id}" data-eid="${e.id}" title="Remove">✕</button>` : ''}</div>`; }).join('')}</div></div>` : ''}`;
  }

  const rows = s.rows.filter((r) => r.moneyIn > 0 || r.moneyOut > 0);
  const tx = settleUp(rows);
  const summary = rows.length ? `<div class="card table-card"><h3 class="card-title pad">Money summary <span class="muted small">(tournament pot + all game pots)</span></h3>
    <table class="standings"><thead><tr><th>Player</th><th class="num">Put in</th><th class="num hide-xs">Game winnings</th><th class="num hide-xs">Pot share</th><th class="num">Net</th></tr></thead><tbody>
    ${rows.sort((a, b) => b.net - a.net).map((r) => { const p = player(r.playerId); return `<tr><td><div class="cell-player">${avatar(p, 'sm')}<span>${esc(p.name)}</span></div></td>
      <td class="num">${money(r.moneyIn)}</td><td class="num hide-xs">${money(r.gameWinnings)}</td><td class="num hide-xs">${money(r.potShare)}</td>
      <td class="num ${r.net > 0.004 ? 'pos' : r.net < -0.004 ? 'neg' : ''}"><b>${signedMoney(r.net)}</b></td></tr>`; }).join('')}
    </tbody></table></div>
    ${tx.length ? `<div class="card"><h3 class="card-title">Settle up</h3><p class="muted small">If the pot was kept on paper instead of in cash, these payments square everyone up${t.status !== 'finished' && s.pool > 0 ? ' (based on current standings)' : ''}.</p>
      ${tx.map((x) => `<div class="settle-row">${chip(player(x.from))}<span class="arrow">pays →</span>${chip(player(x.to))}<b class="gold">${money(x.amount)}</b></div>`).join('')}</div>` : ''}` : '';
  return tp + summary;
}

function presetField(name, presets, current, label) {
  const k = presetKey(presets, current);
  return `<label class="field"><span>${label}</span>
    <select name="${name}Preset" data-custom-target="${name}-custom">${Object.entries(presets).map(([key, v]) => `<option value="${key}" ${key === k ? 'selected' : ''}>${v.label}</option>`).join('')}<option value="custom" ${k === 'custom' ? 'selected' : ''}>Custom…</option></select>
    <input id="${name}-custom" name="${name}Custom" placeholder="e.g. ${name === 'points' ? '12, 8, 5, 2' : '60, 30, 10'}" value="${k === 'custom' ? esc(current.join(', ')) : ''}" ${k === 'custom' ? '' : 'hidden'}>
  </label>`;
}
function readPreset(fd, name, presets) {
  const k = fd.get(name + 'Preset');
  if (k === 'custom') { const v = parseList(fd.get(name + 'Custom')); return v.length ? v : null; }
  return presets[k] ? [...presets[k].value] : null;
}

function playerPicker(selected, name = 'players') {
  if (!state.players.length) return '<p class="muted small">No saved players yet. Add some below.</p>';
  return `<div class="picker">${state.players.map((p) => `<label class="pick"><input type="checkbox" name="${name}" value="${p.id}" ${selected.includes(p.id) ? 'checked' : ''}><span>${avatar(p, 'xs')}${esc(p.name)}</span></label>`).join('')}</div>`;
}

function tournamentFields(t) {
  return `
  <label class="field"><span>Tournament name</span><input name="name" required maxlength="60" value="${esc(t.name || '')}" placeholder="e.g. Winter Series 2026"></label>
  <fieldset class="fs"><legend>Players</legend>${playerPicker(t.playerIds)}
    <label class="field"><span>New players <em class="muted">(optional, comma-separated)</em></span><input name="newPlayers" placeholder="Alex, Sam, Jordan"></label></fieldset>
  <fieldset class="fs"><legend>Points</legend>
    <div class="grid2">${presetField('points', POINT_PRESETS, t.points, 'Points by finishing place')}
    <label class="field"><span>Bonus points just for playing</span><input type="number" name="participationPoints" min="0" step="1" value="${+t.participationPoints || 0}"></label></div></fieldset>
  <fieldset class="fs"><legend>Money</legend>
    <label class="switch"><input type="checkbox" name="potEnabled" ${t.pot.enabled ? 'checked' : ''}><span class="slider"></span><span>Tournament pot: one big pot paid out at the end</span></label>
    <div class="grid2">
      <label class="field"><span>Tournament buy-in per player</span><input type="number" name="potBuyIn" min="0" step="0.01" value="${+t.pot.buyIn || 0}"></label>
      ${presetField('payout', PAYOUT_PRESETS, t.pot.payout, 'Tournament pot payout')}
    </div>
    <label class="field"><span>Default per-game buy-in <em class="muted">(0 = no game pots; can be changed on each game)</em></span><input type="number" name="gameBuyIn" min="0" step="0.01" value="${+t.gameBuyIn || 0}"></label>
  </fieldset>`;
}

function tabSettings(t) {
  return `<form class="card form" data-form="settings" data-id="${t.id}">
    ${tournamentFields(t)}
    <div class="form-actions"><button class="btn primary">Save changes</button></div>
  </form>
  <div class="card danger-zone">
    <h3 class="card-title">${t.status === 'finished' ? 'Tournament finished' : 'Finish tournament'}</h3>
    <p class="muted">${t.status === 'finished' ? 'Reopen it if you want to record more games.' : 'Crown the champion and lock the final standings and pot payout.'}</p>
    <div class="row-gap">
      ${t.status === 'finished' ? `<button class="btn" data-action="reopen" data-id="${t.id}">Reopen tournament</button>` : `<button class="btn gold-btn" data-action="finish" data-id="${t.id}">🏆 Finish & crown champion</button>`}
      <button class="btn danger" data-action="delete-tournament" data-id="${t.id}">Delete tournament</button>
    </div>
  </div>`;
}

/* ---------- modals ---------- */
function openModal(title, body, wide = false) {
  $modal.innerHTML = `<div class="modal-backdrop"><div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="modal-head"><h2>${title}</h2><button class="icon-btn" data-action="close-modal" aria-label="Close">✕</button></div>
    <div class="modal-body">${body}</div></div></div>`;
  document.body.classList.add('modal-open');
  const first = $modal.querySelector('input:not([type=checkbox]):not([type=radio]), select, textarea');
  if (first && !draft) first.focus();
}
function closeModal() { $modal.innerHTML = ''; draft = null; document.body.classList.remove('modal-open'); }

function openNewTournament() {
  const n = state.tournaments.length + 1;
  const blank = { name: '', playerIds: state.players.map((p) => p.id), points: [10, 7, 5, 3, 1], participationPoints: 0, gameBuyIn: 0, pot: { enabled: false, buyIn: 0, payout: [100] } };
  openModal('New tournament', `<form class="form" data-form="new-tournament">${tournamentFields(blank)}
    <div class="form-actions"><button type="button" class="btn ghost" data-action="close-modal">Cancel</button><button class="btn primary">Create tournament</button></div></form>`, true);
  $modal.querySelector('[name=name]').placeholder = `e.g. Game Night Series #${n}`;
}

function addNewPlayers(str) {
  return String(str || '').split(',').map((s) => s.trim()).filter(Boolean).map((name) => {
    const existing = state.players.find((p) => p.name.toLowerCase() === name.toLowerCase());
    if (existing) return existing.id;
    const p = newPlayer(name);
    state.players.push(p);
    return p.id;
  });
}
function newPlayer(name) {
  const i = state.players.length;
  return { id: uid(), name: name.slice(0, 40), emoji: EMOJIS[(i * 7 + 3) % EMOJIS.length], color: COLORS[i % COLORS.length] };
}

function applyTournamentForm(t, fd) {
  t.name = String(fd.get('name') || '').trim() || 'Untitled tournament';
  const ids = [...fd.getAll('players'), ...addNewPlayers(fd.get('newPlayers'))];
  t.playerIds = [...new Set(ids)];
  t.points = readPreset(fd, 'points', POINT_PRESETS) || t.points;
  t.participationPoints = Math.max(0, +fd.get('participationPoints') || 0);
  t.gameBuyIn = Math.max(0, +fd.get('gameBuyIn') || 0);
  t.pot.enabled = fd.get('potEnabled') === 'on';
  t.pot.buyIn = Math.max(0, +fd.get('potBuyIn') || 0);
  t.pot.payout = readPreset(fd, 'payout', PAYOUT_PRESETS) || t.pot.payout;
}

function openPlayerModal(p) {
  openModal('Edit player', `<form class="form" data-form="player" data-id="${p.id}">
    <div class="player-preview">${avatar(p, 'xl')}</div>
    <label class="field"><span>Name</span><input name="name" required maxlength="40" value="${esc(p.name)}"></label>
    <div class="field"><span>Avatar</span><div class="emoji-grid">${EMOJIS.map((e) => `<label><input type="radio" name="emoji" value="${e}" ${e === p.emoji ? 'checked' : ''}><span>${e}</span></label>`).join('')}</div></div>
    <div class="field"><span>Colour</span><div class="color-grid">${COLORS.map((c) => `<label><input type="radio" name="color" value="${c}" ${c === p.color ? 'checked' : ''}><span style="--c:${c}"></span></label>`).join('')}</div></div>
    <div class="form-actions spread"><button type="button" class="btn danger" data-action="delete-player" data-id="${p.id}">Delete</button>
      <span class="row-gap"><button type="button" class="btn ghost" data-action="close-modal">Cancel</button><button class="btn primary">Save</button></span></div>
  </form>`);
}

function openAddMoney(t) {
  openModal('Add money to the pot', `<form class="form" data-form="add-money" data-id="${t.id}">
    <label class="field"><span>Who's putting money in?</span><select name="playerId">${t.playerIds.map((id) => `<option value="${id}">${esc(player(id).name)}</option>`).join('')}</select></label>
    <label class="field"><span>Amount (${esc(state.settings.currency.trim())})</span><input type="number" name="amount" min="0.01" step="0.01" required value="${+t.pot.buyIn || ''}"></label>
    <div class="form-actions"><button type="button" class="btn ghost" data-action="close-modal">Cancel</button><button class="btn primary">Add to pot</button></div></form>`);
}

/* ---------- game modal (stateful draft) ---------- */
let draft = null;

function openGameModal(t, g) {
  if (!t.playerIds.length && !g) { toast('Add players to this tournament first (Settings tab)'); location.hash = `#/t/${t.id}/settings`; return; }
  if (g) {
    const payout = g.pot?.payout || [100];
    draft = {
      tid: t.id, id: g.id, type: g.type, title: g.title || '', at: g.at || today(), notes: g.notes || '',
      participants: g.results.map((r) => r.playerId),
      places: Object.fromEntries(g.results.map((r) => [r.playerId, r.place])),
      potEnabled: !!g.pot?.enabled, buyIn: +g.pot?.buyIn || 0, contributions: { ...(g.pot?.contributions || {}) },
      payoutKey: presetKey(PAYOUT_PRESETS, payout), payoutCustom: payout.join(', '),
    };
  } else {
    draft = {
      tid: t.id, id: null, type: t.lastGameType || 'poker', title: '', at: today(), notes: '',
      participants: [...t.playerIds], places: {},
      potEnabled: (+t.gameBuyIn || 0) > 0, buyIn: +t.gameBuyIn || 0, contributions: {},
      payoutKey: 'winner', payoutCustom: '',
    };
    draft.participants.forEach((id, i) => (draft.places[id] = i + 1));
  }
  renderGameModal(true);
}

function draftPayout() {
  if (draft.payoutKey === 'custom') { const v = parseList(draft.payoutCustom); return v.length ? v : [100]; }
  return PAYOUT_PRESETS[draft.payoutKey]?.value || [100];
}
const contribOf = (pid) => (draft.contributions[pid] ?? draft.buyIn);

function renderGameModal(first = false) {
  const t = tourney(draft.tid);
  const scroll = $modal.querySelector('.modal-body')?.scrollTop || 0;
  const pool = [...new Set([...t.playerIds, ...draft.participants])];
  const parts = [...draft.participants].sort((a, b) => draft.places[a] - draft.places[b]);
  const n = parts.length;
  const body = `<form class="form" data-form="game">
    <div class="field"><span>What did you play?</span><div class="type-grid">${Object.entries(GAME_TYPES).map(([k, v]) => `
      <label class="type-tile"><input type="radio" name="gtype" value="${k}" data-g="type" ${draft.type === k ? 'checked' : ''}><span><i>${v.icon}</i>${v.label}</span></label>`).join('')}</div></div>
    <div class="grid2">
      <label class="field"><span>Name <em class="muted">(optional)</em></span><input data-g="title" maxlength="60" value="${esc(draft.title)}" placeholder="e.g. Friday high-stakes"></label>
      <label class="field"><span>Date</span><input type="date" data-g="at" value="${esc(draft.at)}"></label>
    </div>
    <fieldset class="fs"><legend>Who played?</legend><div class="picker">${pool.map((id) => { const p = player(id); return `<label class="pick"><input type="checkbox" data-g-part="${id}" ${draft.participants.includes(id) ? 'checked' : ''}><span>${avatar(p, 'xs')}${esc(p.name)}</span></label>`; }).join('')}</div></fieldset>
    <fieldset class="fs"><legend>Finishing order</legend>
      ${n ? `<p class="muted small">Pick each player's place. Give two players the same place for a tie.</p><div class="placings">${parts.map((id) => { const p = player(id); const pl = draft.places[id]; return `
        <div class="placing ${pl === 1 ? 'first' : ''}"><span class="placing-medal">${MEDALS[pl - 1] || ''}</span>${avatar(p, 'sm')}<span class="grow">${esc(p.name)}</span>
          <span class="placing-pts">+${pointsForPlace(t, pl)} pts</span>
          <select data-g-place="${id}">${Array.from({ length: n }, (_, i) => `<option value="${i + 1}" ${pl === i + 1 ? 'selected' : ''}>${ordinal(i + 1)}</option>`).join('')}</select></div>`; }).join('')}</div>` : '<p class="muted">Select who played above.</p>'}
    </fieldset>
    <fieldset class="fs"><legend>Game pot</legend>
      <label class="switch"><input type="checkbox" data-g="potEnabled" ${draft.potEnabled ? 'checked' : ''}><span class="slider"></span><span>Play for money this game</span></label>
      ${draft.potEnabled ? `<div class="grid2">
        <label class="field"><span>Buy-in per player</span><input type="number" min="0" step="0.01" data-g="buyIn" value="${draft.buyIn || ''}" placeholder="0"></label>
        <label class="field"><span>Payout</span><select data-g="payoutKey">${Object.entries(PAYOUT_PRESETS).map(([k, v]) => `<option value="${k}" ${draft.payoutKey === k ? 'selected' : ''}>${v.label}</option>`).join('')}<option value="custom" ${draft.payoutKey === 'custom' ? 'selected' : ''}>Custom…</option></select>
          ${draft.payoutKey === 'custom' ? `<input data-g="payoutCustom" value="${esc(draft.payoutCustom)}" placeholder="% for 1st, 2nd, …  e.g. 60, 30, 10">` : ''}</label>
      </div>
      <details class="contribs" ${parts.some((id) => draft.contributions[id] != null && +draft.contributions[id] !== +draft.buyIn) ? 'open' : ''}><summary>Different amounts per player?</summary>
        <div class="contrib-grid">${parts.map((id) => `<label class="contrib">${avatar(player(id), 'xs')}<span class="grow">${esc(player(id).name)}</span><input type="number" min="0" step="0.01" data-g-contrib="${id}" value="${contribOf(id) || ''}" placeholder="0"></label>`).join('')}</div></details>
      <div id="g-pot-preview" class="pot-preview">${potPreview()}</div>` : ''}
    </fieldset>
    <label class="field"><span>Notes <em class="muted">(optional)</em></span><textarea data-g="notes" rows="2" maxlength="300" placeholder="Epic comeback, trash talk, house rules…">${esc(draft.notes)}</textarea></label>
    <div class="form-actions"><button type="button" class="btn ghost" data-action="close-modal">Cancel</button><button class="btn primary">${draft.id ? 'Save game' : 'Record game'}</button></div>
  </form>`;
  if (first) openModal(draft.id ? 'Edit game' : 'Record a game', body, true);
  else { $modal.querySelector('.modal-body').innerHTML = body; $modal.querySelector('.modal-body').scrollTop = scroll; }
}

function potPreview() {
  const results = draft.participants.map((id) => ({ playerId: id, place: draft.places[id] }));
  const pool = sum(draft.participants.map(contribOf));
  if (!(pool > 0)) return '<span class="muted">Enter a buy-in to build the pot.</span>';
  const pay = splitPayout(results, pool, draftPayout());
  return `<span class="pot-total">💰 Pot: <b>${money(pool)}</b></span>` + Object.entries(pay).sort((a, b) => b[1] - a[1]).map(([id, v]) => `<span class="pchip">${avatar(player(id), 'xs')}${esc(player(id).name)} <b class="gold">${money(v)}</b></span>`).join('');
}

function compactPlaces() {
  const sorted = [...draft.participants].sort((a, b) => (draft.places[a] ?? 999) - (draft.places[b] ?? 999));
  let last = null, place = 0;
  sorted.forEach((id, i) => {
    const cur = draft.places[id] ?? 999;
    if (cur !== last) place = i + 1;
    last = cur;
    draft.places[id] = place;
  });
}

function onGameInput(e, isChange) {
  const el = e.target;
  if (el.dataset.g) {
    const k = el.dataset.g;
    if (k === 'potEnabled') { draft.potEnabled = el.checked; return renderGameModal(); }
    if (k === 'type') { draft.type = el.value; return; }
    if (k === 'payoutKey') { draft.payoutKey = el.value; return renderGameModal(); }
    if (k === 'buyIn') {
      draft.buyIn = Math.max(0, +el.value || 0);
      draft.participants.forEach((id) => { draft.contributions[id] = draft.buyIn; const inp = $modal.querySelector(`[data-g-contrib="${id}"]`); if (inp) inp.value = draft.buyIn || ''; });
    } else draft[k] = el.value;
  } else if (el.dataset.gPart) {
    const id = el.dataset.gPart;
    if (el.checked) { draft.participants.push(id); draft.places[id] = draft.participants.length; }
    else { draft.participants = draft.participants.filter((x) => x !== id); delete draft.places[id]; }
    compactPlaces();
    return renderGameModal();
  } else if (el.dataset.gPlace) {
    if (!isChange) return;
    draft.places[el.dataset.gPlace] = +el.value;
    return renderGameModal();
  } else if (el.dataset.gContrib) {
    draft.contributions[el.dataset.gContrib] = Math.max(0, +el.value || 0);
  }
  const prev = $modal.querySelector('#g-pot-preview');
  if (prev) prev.innerHTML = potPreview();
}

function saveGame() {
  const t = tourney(draft.tid);
  if (!draft.participants.length) return toast('Pick at least one player');
  const results = draft.participants.map((id) => ({ playerId: id, place: draft.places[id] || 1 }));
  const contributions = {};
  if (draft.potEnabled) draft.participants.forEach((id) => { const v = +contribOf(id) || 0; if (v > 0) contributions[id] = v; });
  const game = {
    id: draft.id || uid(), type: draft.type, title: draft.title.trim(), at: draft.at || today(), notes: draft.notes.trim(), results,
    pot: draft.potEnabled && sum(Object.values(contributions)) > 0 ? { enabled: true, buyIn: draft.buyIn, contributions, payout: draftPayout() } : { enabled: false },
    createdAt: draft.id ? (t.games.find((g) => g.id === draft.id)?.createdAt || Date.now()) : Date.now(),
  };
  const i = t.games.findIndex((g) => g.id === game.id);
  if (i >= 0) t.games[i] = game; else t.games.push(game);
  t.lastGameType = game.type;
  const winners = results.filter((r) => r.place === 1).map((r) => player(r.playerId).name).join(' & ');
  const editing = !!draft.id;
  closeModal();
  if (!editing && !location.hash.endsWith('/games')) location.hash = `#/t/${t.id}`;
  commit(editing ? 'Game updated' : `🎉 ${winners} wins the ${gameLabel(game)} game!`);
}

/* ---------- confetti ---------- */
function confetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const c = document.createElement('canvas');
  c.className = 'confetti';
  document.body.appendChild(c);
  const ctx = c.getContext('2d');
  const W = (c.width = innerWidth), H = (c.height = innerHeight);
  const parts = Array.from({ length: 160 }, () => ({
    x: Math.random() * W, y: -20 - Math.random() * H * 0.5, r: 4 + Math.random() * 6,
    vx: -2 + Math.random() * 4, vy: 2 + Math.random() * 4, a: Math.random() * 6, va: -0.2 + Math.random() * 0.4,
    c: COLORS[Math.floor(Math.random() * COLORS.length)],
  }));
  const start = performance.now();
  (function tick(now) {
    ctx.clearRect(0, 0, W, H);
    parts.forEach((p) => {
      p.x += p.vx; p.y += p.vy; p.vy += 0.05; p.a += p.va;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.c; ctx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2); ctx.restore();
    });
    if (now - start < 4000) requestAnimationFrame(tick); else c.remove();
  })(start);
}

/* ---------- events ---------- */
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const a = el.dataset.action;
  const t = el.dataset.id ? tourney(el.dataset.id) : null;
  switch (a) {
    case 'close-modal': closeModal(); break;
    case 'new-tournament': openNewTournament(); break;
    case 'record-game': openGameModal(t); break;
    case 'edit-game': openGameModal(t, t.games.find((g) => g.id === el.dataset.gid)); break;
    case 'delete-game':
      if (confirm('Delete this game? Points and pot results from it will be removed.')) { t.games = t.games.filter((g) => g.id !== el.dataset.gid); commit('Game deleted'); }
      break;
    case 'edit-player': openPlayerModal(player(el.dataset.id)); break;
    case 'delete-player': {
      const id = el.dataset.id;
      const used = state.tournaments.some((x) => x.games.some((g) => g.results.some((r) => r.playerId === id)) || x.pot.entries.some((en) => en.playerId === id));
      if (used) { toast('This player has game history, so they can\'t be deleted. Rename them instead.'); break; }
      if (!confirm(`Delete ${player(id).name}?`)) break;
      state.players = state.players.filter((p) => p.id !== id);
      state.tournaments.forEach((x) => (x.playerIds = x.playerIds.filter((pid) => pid !== id)));
      closeModal(); commit('Player deleted');
      break;
    }
    case 'pot-enable': t.pot.enabled = true; commit('Tournament pot turned on'); break;
    case 'add-money': openAddMoney(t); break;
    case 'buy-in-all':
      if (!confirm(`Add a ${money(t.pot.buyIn).replace(/&amp;/g, '&')} buy-in for all ${t.playerIds.length} players?`)) break;
      t.playerIds.forEach((pid) => t.pot.entries.push({ id: uid(), playerId: pid, amount: +t.pot.buyIn, at: Date.now() }));
      commit(`💰 Everyone bought in: pot is now ${money(tournamentPool(t)).replace(/&amp;/g, '&')}`);
      break;
    case 'delete-entry': t.pot.entries = t.pot.entries.filter((x) => x.id !== el.dataset.eid); commit('Removed from pot'); break;
    case 'finish': {
      const s = computeStandings(t);
      if (!s.gamesCount) { toast('Record at least one game first'); break; }
      const champ = player(s.rows[0].playerId);
      if (!confirm(`Finish "${t.name}" and crown ${champ.name} champion?`)) break;
      t.status = 'finished'; t.championId = champ.id; t.finishedAt = Date.now();
      location.hash = `#/t/${t.id}`;
      commit(`👑 ${champ.name} is the champion!`);
      confetti();
      break;
    }
    case 'reopen': t.status = 'active'; t.championId = null; commit('Tournament reopened'); break;
    case 'delete-tournament':
      if (!confirm(`Permanently delete "${t.name}" and all its games?`)) break;
      state.tournaments = state.tournaments.filter((x) => x.id !== t.id);
      location.hash = '#/';
      commit('Tournament deleted');
      break;
    case 'export': exportData(); break;
    case 'import': document.getElementById('import-file').click(); break;
  }
});

document.addEventListener('submit', (e) => {
  const f = e.target;
  if (!f.dataset.form) return;
  e.preventDefault();
  const fd = new FormData(f);
  switch (f.dataset.form) {
    case 'new-tournament': {
      const t = { id: uid(), status: 'active', createdAt: Date.now(), games: [], playerIds: [], points: [], pot: { enabled: false, buyIn: 0, payout: [100], entries: [] } };
      applyTournamentForm(t, fd);
      if (t.pot.enabled && t.pot.buyIn > 0) t.playerIds.forEach((pid) => t.pot.entries.push({ id: uid(), playerId: pid, amount: t.pot.buyIn, at: Date.now() }));
      state.tournaments.push(t);
      closeModal();
      location.hash = `#/t/${t.id}`;
      commit(`🏁 ${t.name} created`);
      break;
    }
    case 'settings': applyTournamentForm(tourney(f.dataset.id), fd); commit('Settings saved'); break;
    case 'quick-player': {
      const name = String(fd.get('name') || '').trim();
      if (!name) break;
      if (state.players.some((p) => p.name.toLowerCase() === name.toLowerCase())) { toast(`${name} already exists`); break; }
      state.players.push(newPlayer(name));
      commit(`Added ${name}`);
      document.querySelector('[data-form=quick-player] input')?.focus();
      break;
    }
    case 'player': {
      const p = player(f.dataset.id);
      p.name = String(fd.get('name') || '').trim() || p.name;
      p.emoji = fd.get('emoji') || p.emoji;
      p.color = fd.get('color') || p.color;
      closeModal(); commit('Player saved');
      break;
    }
    case 'add-money': {
      const t = tourney(f.dataset.id);
      const amount = round2(+fd.get('amount'));
      if (!(amount > 0)) break;
      t.pot.entries.push({ id: uid(), playerId: fd.get('playerId'), amount, at: Date.now() });
      closeModal(); commit(`💰 Added ${money(amount).replace(/&amp;/g, '&')} to the pot`);
      break;
    }
    case 'game': saveGame(); break;
  }
});

// Checkboxes & selects fire both `input` and `change`; handle them only on `change`.
$modal.addEventListener('input', (e) => { if (draft && e.target.type !== 'checkbox' && e.target.tagName !== 'SELECT') onGameInput(e, false); });
$modal.addEventListener('change', (e) => { if (draft && (e.target.type === 'checkbox' || e.target.tagName === 'SELECT')) onGameInput(e, true); });
$modal.addEventListener('mousedown', (e) => { if (e.target.classList.contains('modal-backdrop')) closeModal(); });

document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.dataset.customTarget) {
    const inp = document.getElementById(el.dataset.customTarget);
    if (inp) { inp.hidden = el.value !== 'custom'; if (!inp.hidden) inp.focus(); }
  }
  if (el.dataset.setting === 'currency') { state.settings.currency = el.value; commit(); }
  if (el.matches('.emoji-grid input, .color-grid input')) {
    const f = el.form; const prev = f.querySelector('.player-preview .avatar');
    prev.textContent = f.querySelector('[name=emoji]:checked').value;
    prev.style.setProperty('--c', f.querySelector('[name=color]:checked').value);
  }
});

document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $modal.innerHTML) closeModal(); });

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `game-night-leaderboard-${today()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast('Backup downloaded');
}

document.getElementById('import-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = normalize(JSON.parse(await file.text()));
    if (!confirm(`Replace current data with this backup (${data.tournaments.length} tournaments, ${data.players.length} players)?`)) return;
    state = data;
    commit('Backup restored');
  } catch {
    toast('That file is not a valid backup');
  }
});

window.addEventListener('hashchange', () => { closeModal(); render(); window.scrollTo(0, 0); });
render();

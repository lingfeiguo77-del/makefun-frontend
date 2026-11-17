// make.fun frontend, first load: router, cached API reads, board + bounty.
// 1 request per view. Leaderboard and profile live in views.js and load
// on demand through import(), so they never count toward the first load.
const API = 'https://make.fun/api';
const view = document.getElementById('view');

// Minute-bucket ETag cache: a response is reused without a request while
// its minute lasts; across a minute boundary we revalidate with
// If-None-Match and keep the body on a 304. In-flight duplicates merge.
const cache = new Map();
const flying = new Map();
const minute = () => Math.floor(Date.now() / 60000);

async function fetchApi(path) {
  const url = API + path;
  const hit = cache.get(url);
  if (hit && hit.minute === minute()) return hit.body;
  if (flying.has(url)) return flying.get(url);
  const job = (async () => {
    const headers = {};
    if (hit && hit.etag) headers['If-None-Match'] = hit.etag;
    const res = await fetch(url, { headers });
    if (res.status === 304 && hit) {
      hit.minute = minute();
      return hit.body;
    }
    if (!res.ok) throw new Error(`${res.status} ${path}`);
    const body = await res.json();
    cache.set(url, { etag: res.headers.get('etag'), body, minute: minute() });
    return body;
  })();
  flying.set(url, job);
  try {
    return await job;
  } finally {
    flying.delete(url);
  }
}

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
const money = (n) =>
  '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const left = (ms) => {
  if (ms <= 0) return 'closed';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
};
const when = (iso) => new Date(iso).toUTCString().replace(' GMT', ' UTC');
const openBy = (c) => new Date(c.deadline).getTime() > Date.now();
const potOf = (c) => Number(c.potUsd ?? c.rewardAmount ?? 0);
const imgUrl = (u) => (u ? (u.startsWith('/') ? 'https://make.fun' + u : u) : '');
const avatar = (u, handle, big) =>
  u
    ? `<img class="avatar${big ? ' big' : ''}" crossorigin="anonymous" src="${esc(imgUrl(u))}" alt="@${esc(handle)}">`
    : `<span class="avatar fallback${big ? ' big' : ''}">${esc((handle || '?')[0].toUpperCase())}</span>`;

// Avatars that fail to load (dead upstream link) become an initial letter.
function fixAvatars(root) {
  root.querySelectorAll('img.avatar').forEach((img) => {
    img.addEventListener('error', () => {
      const span = document.createElement('span');
      span.className = img.className + ' fallback';
      span.textContent = (img.alt.replace('@', '') || '?')[0].toUpperCase();
      img.replaceWith(span);
    });
  });
}

function ready() {
  window.__shotReady = true;
}
function fail(err) {
  view.innerHTML = `<p class="error">Could not load this page: ${esc(err.message)}</p>`;
  ready();
}

// --- Board: #/ -------------------------------------------------------------
const boardState = { sort: 'pot', filter: 'open', q: '', page: 0 };
let boardItems = [];

function boardRows() {
  const now = Date.now();
  let list = boardItems.filter((c) => {
    if (boardState.filter === 'open' && new Date(c.deadline).getTime() <= now) return false;
    if (boardState.filter === 'closed' && new Date(c.deadline).getTime() > now) return false;
    if (boardState.q) {
      const q = boardState.q.toLowerCase();
      if (!`${c.title} ${c.slug} ${c.category || ''}`.toLowerCase().includes(q)) return false;
    }
    return true;
  });
  const key = boardState.sort;
  list = [...list].sort((a, b) =>
    key === 'deadline'
      ? new Date(a.deadline) - new Date(b.deadline)
      : key === 'entries'
        ? (b.submissionCount || 0) - (a.submissionCount || 0)
        : potOf(b) - potOf(a));
  return list;
}

function renderBoardList() {
  const list = boardRows();
  const per = 20;
  const pages = Math.max(1, Math.ceil(list.length / per));
  boardState.page = Math.min(boardState.page, pages - 1);
  const rows = list.slice(boardState.page * per, boardState.page * per + per);
  const host = document.getElementById('board-list');
  if (!host) return;
  host.innerHTML =
    `<table><thead><tr><th>Bounty</th><th class="num">Pot</th><th class="num">Fee</th><th>Time left</th><th class="num">Entries</th></tr></thead><tbody>` +
    rows.map((c) => {
      const open = openBy(c);
      return `<tr><td><a href="#/bounty/${esc(c.slug)}">${esc(c.title)}</a><br><span class="muted">${esc(c.category || '')} · ${esc(c.slug)}</span></td>` +
        `<td class="num">${money(potOf(c))}</td>` +
        `<td class="num">${c.entryFeeUsd ? money(c.entryFeeUsd) : 'No fee'}</td>` +
        `<td>${open ? left(new Date(c.deadline) - Date.now()) : '<span class="pill closed">closed</span>'}</td>` +
        `<td class="num">${(c.submissionCount || 0).toLocaleString('en-US')}</td></tr>`;
    }).join('') +
    `</tbody></table>` +
    `<div class="pager"><button id="prev" ${boardState.page === 0 ? 'disabled' : ''}>← Prev</button>` +
    `<span>Page ${boardState.page + 1} of ${pages} · ${list.length} bounties</span>` +
    `<button id="next" ${boardState.page >= pages - 1 ? 'disabled' : ''}>Next →</button></div>`;
  document.getElementById('prev').onclick = () => { boardState.page--; renderBoardList(); };
  document.getElementById('next').onclick = () => { boardState.page++; renderBoardList(); };
}

async function showBoard() {
  view.innerHTML = '<p class="loading">Loading bounties…</p>';
  try {
    const data = await fetchApi('/competitions?status=open&activity=times');
    boardItems = data.items || [];
    const now = Date.now();
    const open = boardItems.filter((c) => new Date(c.deadline).getTime() > now);
    const pot = boardItems.reduce((s, c) => s + potOf(c), 0);
    view.innerHTML =
      `<h1>Bounty board</h1><p class="muted">Live bounties on make.fun. A bounty still takes entries while its deadline is ahead — never trust the status alone.</p>` +
      `<div class="stats"><div class="stat"><b>${open.length}</b><span>open now</span></div>` +
      `<div class="stat"><b>${money(pot)}</b><span>total live pots</span></div>` +
      `<div class="stat"><b>${boardItems.reduce((s, c) => s + (c.submissionCount || 0), 0).toLocaleString('en-US')}</b><span>entries</span></div></div>` +
      `<div class="controls"><input id="bq" type="search" placeholder="Filter by title, slug or category" value="${esc(boardState.q)}" aria-label="Filter bounties">` +
      `<select id="bsort" aria-label="Sort"><option value="pot">Sort: pot</option><option value="deadline">Sort: deadline</option><option value="entries">Sort: entries</option></select>` +
      `<select id="bfilter" aria-label="Filter by state"><option value="open">Open only</option><option value="all">All</option><option value="closed">Closed</option></select></div>` +
      `<div id="board-list"></div>`;
    document.getElementById('bsort').value = boardState.sort;
    document.getElementById('bfilter').value = boardState.filter;
    document.getElementById('bq').oninput = (e) => { boardState.q = e.target.value; boardState.page = 0; renderBoardList(); };
    document.getElementById('bsort').onchange = (e) => { boardState.sort = e.target.value; renderBoardList(); };
    document.getElementById('bfilter').onchange = (e) => { boardState.filter = e.target.value; boardState.page = 0; renderBoardList(); };
    renderBoardList();
    ready();
  } catch (err) {
    fail(err);
  }
}

// --- Extra views, loaded on demand -----------------------------------------
async function showExtra(kind, arg) {
  view.innerHTML = '<p class="loading">Loading…</p>';
  try {
    const mod = await import('./views.js');
    const helpers = { fetchApi, esc, money, left, when, openBy, potOf, imgUrl, avatar, fixAvatars };
    if (kind === 'bounty') await mod.showBounty(view, arg, helpers);
    else if (kind === 'leaderboard') await mod.showLeaderboard(view, arg, helpers);
    else await mod.showProfile(view, arg, helpers);
    ready();
  } catch (err) {
    fail(err);
  }
}

// --- Router ------------------------------------------------------------------
function route() {
  window.__shotReady = false;
  const parts = (location.hash.slice(1) || '/').split('/').filter(Boolean);
  if (parts.length === 0) return showBoard();
  if (parts[0] === 'bounty' && parts[1] && parts.length === 2) return showExtra('bounty', parts[1]);
  if (parts[0] === 'bounty' && parts[1] && parts[2] === 'leaderboard') return showExtra('leaderboard', parts[1]);
  if ((parts[0] === 'agent' || parts[0] === 'profile' || parts[0] === 'u') && parts[1]) return showExtra('profile', parts[1]);
  view.innerHTML = `<p class="error">Unknown route: ${esc(location.hash)}</p>`;
  ready();
}

document.getElementById('jump').addEventListener('submit', (e) => {
  e.preventDefault();
  const q = document.getElementById('jump-q').value.trim();
  if (!q) return;
  location.hash = q.startsWith('@') ? `#/agent/${q.slice(1)}` : `#/bounty/${q}`;
});
window.addEventListener('hashchange', route);
route();

// make.fun frontend, first load: router, cached API reads, navigation.
// Board, bounty, leaderboard and profile live in views.js and load on
// demand through import(), so they never count toward the first load.
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

function ready() {
  window.__shotReady = true;
}
function fail(err) {
  view.innerHTML = `<p class="error">Could not load this page: ${esc(err.message)}</p>`;
  ready();
}

// --- Views, loaded on demand -----------------------------------------------
async function showExtra(kind, arg) {
  view.innerHTML = '<p class="loading">Loading…</p>';
  try {
    const mod = await import('./views.js');
    const helpers = { fetchApi, esc };
    if (kind === 'board') await mod.showBoard(view, helpers);
    else if (kind === 'bounty') await mod.showBounty(view, arg, helpers);
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
  if (parts.length === 0) return showExtra('board');
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

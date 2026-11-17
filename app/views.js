// Extra views, loaded on demand through import() so the first load stays
// small: the bounty page, the leaderboard and the agent profile.
// One GET per view.
const PER = 25;

// Tiny markdown for a bounty's description: headings, bold, code, lists,
// links (only make.fun links stay links), everything else plain escaped text.
function md(src, esc) {
  const lines = String(src || '').split('\n');
  let out = '';
  let list = false;
  const inline = (t) => esc(t)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\((https:\/\/make\.fun[^)\s]*|\/[^)\s]*)\)/g, '<a href="$2">$1</a>');
  for (const line of lines) {
    if (/^##\s+/.test(line)) {
      if (list) { out += '</ul>'; list = false; }
      out += `<h2>${inline(line.replace(/^##\s+/, ''))}</h2>`;
    } else if (/^-\s+/.test(line)) {
      if (!list) { out += '<ul>'; list = true; }
      out += `<li>${inline(line.replace(/^-\s+/, ''))}</li>`;
    } else if (line.trim()) {
      if (list) { out += '</ul>'; list = false; }
      out += `<p>${inline(line)}</p>`;
    }
  }
  if (list) out += '</ul>';
  return out;
}

export async function showBounty(host, slug, h) {
  const c = await h.fetchApi(`/competitions/${encodeURIComponent(slug)}`);
  const open = h.openBy(c);
  const rewards = c.rewardsNow || [];
  host.innerHTML =
    `<p><a href="#/">← All bounties</a> · <a href="#/bounty/${h.esc(c.slug)}/leaderboard">Leaderboard →</a></p>` +
    `<h1>${h.esc(c.title)}</h1>` +
    `<p><span class="pill${open ? '' : ' closed'}">${open ? 'open' : 'closed'}</span> <span class="muted">${h.esc(c.category || '')} · ${h.esc(c.slug)}</span></p>` +
    `<div class="stats"><div class="stat"><b>${h.money(h.potOf(c))}</b><span>live pot</span></div>` +
    `<div class="stat"><b>${c.entryFeeUsd ? h.money(c.entryFeeUsd) : 'No fee'}</b><span>entry fee${c.entryFeePayers ? ` · ${c.entryFeePayers} paid` : ''}</span></div>` +
    `<div class="stat"><b>${(c.submissionCount || 0).toLocaleString('en-US')}</b><span>entries</span></div>` +
    `<div class="stat"><b>${open ? h.left(new Date(c.deadline) - Date.now()) : 'ended'}</b><span>time left</span></div></div>` +
    `<p class="muted">Opens ${h.when(c.publishedAt || c.opensAt)} · closes ${h.when(c.deadline)}</p>` +
    `<h2>Rewards</h2><table><thead><tr><th>Place</th><th class="num">Base</th><th class="num">Fee share</th><th class="num">Total now</th></tr></thead><tbody>` +
    rewards.map((r) => `<tr><td>#${r.place}</td><td class="num">${h.money(r.baseUsd)}</td><td class="num">${h.money(r.feeShareUsd)}</td><td class="num"><strong>${h.money(r.amountUsd)}</strong></td></tr>`).join('') +
    `</tbody></table>` +
    `<div class="prose"><h2>About</h2>${md(c.description, h.esc)}${c.rules ? `<h2>Rules</h2>${md(c.rules, h.esc)}` : ''}</div>`;
}

function pager(host, page, pages, total, label, onPage) {
  host.querySelector('#prev').onclick = () => onPage(page - 1);
  host.querySelector('#next').onclick = () => onPage(page + 1);
  const prev = host.querySelector('#prev');
  const next = host.querySelector('#next');
  if (prev) prev.disabled = page === 0;
  if (next) next.disabled = page >= pages - 1;
  const note = host.querySelector('#page-note');
  if (note) note.textContent = `Page ${page + 1} of ${pages} · ${total} ${label}`;
}

function rate(entry) {
  // Win rate is stored in millionths on the entry's values.
  const v = entry.values || {};
  if (v.judge == null) return null;
  const pct = (v.judge / 10000).toFixed(2) + '%';
  const lo = v.judge_low == null ? '' : (v.judge_low / 10000).toFixed(2) + '%';
  const hi = v.judge_high == null ? '' : (v.judge_high / 10000).toFixed(2) + '%';
  return lo && hi ? `${pct} (${lo}–${hi})` : pct;
}

export async function showLeaderboard(host, slug, h) {
  const data = await h.fetchApi(`/competitions/${encodeURIComponent(slug)}/leaderboard`);
  const comp = data.competition || {};
  const all = (data.entries || []).filter((e) => e.ranked !== false);
  let q = '';
  let page = 0;
  host.innerHTML =
    `<p><a href="#/">← All bounties</a> · <a href="#/bounty/${h.esc(slug)}">${h.esc(comp.title || slug)}</a></p>` +
    `<h1>Leaderboard</h1><p class="muted">${h.esc(comp.title || slug)} · ${h.esc((data.phase && data.phase.title) || '')} · ${all.length} ranked entries · win rate with its 90% interval</p>` +
    `<div class="controls"><input id="lq" type="search" placeholder="Filter by agent or entry title" aria-label="Filter leaderboard"></div>` +
    `<div id="lb-list"></div>`;
  const draw = () => {
    const list = q
      ? all.filter((e) => `${e.handle || ''} ${e.title || ''}`.toLowerCase().includes(q.toLowerCase()))
      : all;
    const pages = Math.max(1, Math.ceil(list.length / PER));
    page = Math.min(page, pages - 1);
    const rows = list.slice(page * PER, page * PER + PER);
    document.getElementById('lb-list').innerHTML =
      `<table><thead><tr><th>#</th><th>Agent</th><th>Entry</th><th class="num">Win rate</th><th class="num">Dossier</th><th>Prize</th></tr></thead><tbody>` +
      rows.map((e) => {
        const r = rate(e);
        const kb = e.values && e.values.bytes != null ? (e.values.bytes / 1024).toFixed(1) + ' KiB' : '—';
        return `<tr><td><strong>${e.rank}</strong></td>` +
          `<td>${h.avatar(e.image, e.handle)}<a href="#/agent/${h.esc(e.handle)}">@${h.esc(e.handle)}</a></td>` +
          `<td>${h.esc(e.title || '')}${e.house ? ' <span class="muted">(house)</span>' : ''}</td>` +
          `<td class="num">${r || '—'}</td><td class="num">${kb}</td>` +
          `<td>${e.prize_rank ? '#' + e.prize_rank : '—'}</td></tr>`;
      }).join('') +
      `</tbody></table>` +
      `<div class="pager"><button id="prev">← Prev</button><span id="page-note"></span><button id="next">Next →</button></div>`;
    h.fixAvatars(host);
    pager(host, page, pages, list.length, 'entries', (p) => { page = p; draw(); });
  };
  host.querySelector('#lq').addEventListener('input', (e) => { q = e.target.value; page = 0; draw(); });
  draw();
}

export async function showProfile(host, handle, h) {
  const p = await h.fetchApi(`/profiles/${encodeURIComponent(handle)}`);
  const rec = p.record || {};
  const sols = p.solutions || [];
  const pays = p.payouts || [];
  const wallet = p.wallet && p.wallet.address ? p.wallet.address : '';
  host.innerHTML =
    `<p><a href="#/">← All bounties</a></p>` +
    `<h1>${h.avatar(p.image || p.avatar, p.handle, true)} @${h.esc(p.handle)}</h1>` +
    (p.display_name ? `<p><strong>${h.esc(p.display_name)}</strong></p>` : '') +
    (p.bio ? `<p>${h.esc(p.bio)}</p>` : '') +
    `<p class="muted">${p.github_login ? `GitHub: <a href="https://github.com/${h.esc(p.github_login)}">${h.esc(p.github_login)}</a> · ` : ''}` +
    `${p.x ? `X: <a href="https://x.com/${h.esc(p.x)}">@${h.esc(p.x)}</a> · ` : ''}` +
    `${wallet ? `Wallet: ${h.esc(wallet.slice(0, 6))}…${h.esc(wallet.slice(-4))} · ` : ''}` +
    `Joined ${p.joined_at ? h.when(p.joined_at) : '—'}</p>` +
    `<div class="stats">` +
    `<div class="stat"><b>${rec.competitions_entered ?? 0}</b><span>entered</span></div>` +
    `<div class="stat"><b>${rec.competitions_won ?? 0}</b><span>won</span></div>` +
    `<div class="stat"><b>${rec.competitions_placed ?? 0}</b><span>placed</span></div>` +
    `<div class="stat"><b>${rec.best_placement ? '#' + rec.best_placement : '—'}</b><span>best place</span></div>` +
    `<div class="stat"><b>${h.money(rec.prize_usd)}</b><span>prize money</span></div></div>` +
    `<h2>Entries (${sols.length})</h2>` +
    (sols.length
      ? `<table><thead><tr><th>Entry</th><th>Bounty</th><th class="num">Place</th><th class="num">Prize</th><th>Entered</th></tr></thead><tbody>` +
        sols.map((s) => {
          const c = s.competition || {};
          return `<tr><td>${h.esc(s.title || '')}</td>` +
            `<td><a href="#/bounty/${h.esc(c.slug)}">${h.esc(c.title || c.slug || '')}</a> · <a href="#/bounty/${h.esc(c.slug)}/leaderboard">board</a></td>` +
            `<td class="num">${s.placement ? '#' + s.placement : '—'}</td>` +
            `<td class="num">${s.prize_usd != null ? h.money(s.prize_usd) : '—'}</td>` +
            `<td>${s.entered_at ? h.when(s.entered_at) : '—'}</td></tr>`;
        }).join('') + `</tbody></table>`
      : '<p class="muted">No public entries yet.</p>') +
    `<h2>Prize payouts (${pays.length})</h2>` +
    (pays.length
      ? `<table><thead><tr><th>Amount</th><th>Bounty</th><th>Paid</th></tr></thead><tbody>` +
        pays.map((x) => `<tr><td class="num">${h.money(x.amount_usd ?? x.amount)}</td><td>${h.esc((x.competition && x.competition.title) || x.competition_slug || '')}</td><td>${x.paid_at ? h.when(x.paid_at) : '—'}</td></tr>`).join('') +
        `</tbody></table>`
      : '<p class="muted">No payouts on record.</p>');
  h.fixAvatars(host);
}

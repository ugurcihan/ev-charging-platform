// Tab switching
document.querySelectorAll('.tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((b) => { b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); });
    btn.classList.add('active');
    btn.setAttribute('aria-selected', 'true');
    document.getElementById('panel-ocpp').hidden = btn.dataset.tab !== 'ocpp';
    document.getElementById('panel-ocpi').hidden = btn.dataset.tab !== 'ocpi';
  });
});

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// --- OCPP panel --------------------------------------------------------

function renderChargePoints(cps) {
  const grid = document.getElementById('cpGrid');
  if (!cps.length) { grid.innerHTML = '<p class="empty">No charge points connected yet. Run <code>npm run simulate:charger</code>.</p>'; return; }
  grid.innerHTML = cps.map((cp) => `
    <div class="card">
      <div class="title">${escapeHtml(cp.id)}</div>
      <div class="row"><span>Connector</span><span class="badge ${cp.connectorStatus}">${cp.connectorStatus}</span></div>
      <div class="row"><span>Link</span><span class="badge ${cp.status}">${cp.status}</span></div>
      <div class="row"><span>Model</span><span>${escapeHtml(cp.model || '—')}</span></div>
    </div>
  `).join('');
}

function renderTransactions(txs) {
  const tbody = document.querySelector('#txTable tbody');
  if (!txs.length) { tbody.innerHTML = '<tr><td colspan="5" class="empty">No transactions yet.</td></tr>'; return; }
  tbody.innerHTML = txs.slice().reverse().map((tx) => `
    <tr>
      <td>#${tx.txId}</td>
      <td>${escapeHtml(tx.cpId)}</td>
      <td><span class="badge ${tx.status === 'Completed' ? 'Available' : 'Charging'}">${tx.status}</span></td>
      <td>${tx.energyKwh ? tx.energyKwh + ' kWh' : '—'}</td>
      <td>${new Date(tx.startedAt).toLocaleTimeString()}</td>
    </tr>
  `).join('');
}

function renderOcppLog(events) {
  const log = document.getElementById('ocppLog');
  if (!events.length) { log.innerHTML = '<p class="empty">Waiting for OCPP messages…</p>'; return; }
  log.innerHTML = events.slice().reverse().map((e) => `
    <div class="line">${new Date(e.ts).toLocaleTimeString()} · <span class="actor">${escapeHtml(e.cpId)}</span> · <span class="action">${escapeHtml(e.action)}</span></div>
  `).join('');
}

// --- OCPI panel --------------------------------------------------------

function renderPartners(partners) {
  const grid = document.getElementById('partnerGrid');
  if (!partners.length) { grid.innerHTML = '<p class="empty">No eMSP has registered yet. Run <code>npm run simulate:roaming</code>.</p>'; return; }
  grid.innerHTML = partners.map((p) => `
    <div class="card">
      <div class="title">${escapeHtml(p.name)}</div>
      <div class="row"><span>Party ID</span><span>${escapeHtml(p.partyId)}</span></div>
      <div class="row"><span>Status</span><span class="badge registered">Registered</span></div>
      <div class="row"><span>Since</span><span>${new Date(p.registeredAt).toLocaleTimeString()}</span></div>
    </div>
  `).join('');
}

function renderLocations(locs) {
  const grid = document.getElementById('locGrid');
  grid.innerHTML = locs.map((l) => `
    <div class="card">
      <div class="title">${escapeHtml(l.name)}</div>
      <div class="row"><span>City</span><span>${escapeHtml(l.city)}</span></div>
      <div class="row"><span>EVSE</span><span>${escapeHtml(l.evses[0].evse_id)}</span></div>
      <div class="row"><span>Status</span><span class="badge ${l.evses[0].status}">${l.evses[0].status}</span></div>
    </div>
  `).join('');
}

function renderCdrs(cdrs) {
  const tbody = document.querySelector('#cdrTable tbody');
  if (!cdrs.length) { tbody.innerHTML = '<tr><td colspan="5" class="empty">No CDRs yet — run a demo session.</td></tr>'; return; }
  tbody.innerHTML = cdrs.map((c) => `
    <tr>
      <td>${escapeHtml(c.id)}</td>
      <td>${escapeHtml(c.location_id)}</td>
      <td>${c.total_energy} kWh</td>
      <td>${c.total_cost.incl_vat} ${c.currency}</td>
      <td>${new Date(c.last_updated).toLocaleTimeString()}</td>
    </tr>
  `).join('');
}

function renderOcpiLog(events) {
  const log = document.getElementById('ocpiLog');
  if (!events.length) { log.innerHTML = '<p class="empty">Waiting for OCPI calls…</p>'; return; }
  log.innerHTML = events.slice().reverse().map((e) => `
    <div class="line">${new Date(e.ts).toLocaleTimeString()} · <span class="actor">${escapeHtml(e.actor)}</span> · <span class="action">${escapeHtml(e.action)}</span></div>
  `).join('');
}

async function refresh() {
  try {
    const res = await fetch('/api/state');
    const state = await res.json();
    renderChargePoints(state.ocpp.chargePoints);
    renderTransactions(state.ocpp.transactions);
    renderOcppLog(state.ocpp.events);
    renderPartners(state.ocpi.partners);
    renderLocations(state.ocpi.locations);
    renderCdrs(state.ocpi.cdrs);
    renderOcpiLog(state.ocpi.events);
  } catch (e) {
    console.error('poll failed', e);
  }
}

refresh();
setInterval(refresh, 1200);

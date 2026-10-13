import { repo } from './repository.js';
import { renderDashboard } from './views/dashboard.js';
import { renderUnits } from './views/units.js';
import { renderPatients } from './views/patients.js';
import { renderHistory, renderHistoryEntry } from './views/history.js';
import { renderPatient } from './views/patient.js';
import { confirmDialog, toast } from './ui.js';

// NOTE: no authentication in this prototype. Future auth/authorization must be
// enforced server-side (see README) — hiding routes here would not be security.

const NAV = [
  { href: '#/', label: 'Dashboard', icon: '▦', match: (r) => r === '' || r === 'dashboard' },
  { href: '#/units', label: 'Units & Beds', icon: '▤', match: (r) => r.startsWith('units') },
  { href: '#/patients', label: 'Patients', icon: '☰', match: (r) => r.startsWith('patients') || r.startsWith('patient/') },
  { href: '#/history', label: 'Handover History', icon: '⟲', match: (r) => r.startsWith('history') },
];

const app = document.getElementById('app');
let renderToken = 0;

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, qs] = raw.split('?');
  return { route: path.replace(/\/$/, ''), query: Object.fromEntries(new URLSearchParams(qs || '')) };
}

function drawNav(route) {
  const html = NAV.map((n) => `<a href="${n.href}" class="${n.match(route) ? 'on' : ''}" ${n.match(route) ? 'aria-current="page"' : ''}><span class="ni" aria-hidden="true">${n.icon}</span><span>${n.label}</span></a>`).join('');
  document.getElementById('navTop').innerHTML = html;
  document.getElementById('navBottom').innerHTML = html;
}

async function router() {
  const token = ++renderToken;
  window.__cocDirty = false;
  const { route, query } = parseHash();
  drawNav(route);
  document.body.dataset.route = route.split('/')[0] || 'dashboard';
  const view = document.createElement('div'); // fresh node => no stale listeners
  view.className = 'view';
  try {
    let m;
    if (route === '' || route === 'dashboard') await renderDashboard(view);
    else if (route === 'units') await renderUnits(view);
    else if (route === 'patients') await renderPatients(view);
    else if (route === 'history') await renderHistory(view);
    else if ((m = route.match(/^history\/(.+)$/))) await renderHistoryEntry(view, m[1]);
    else if ((m = route.match(/^patient\/(.+)$/))) await renderPatient(view, m[1], query);
    else view.innerHTML = '<p class="empty">Page not found. <a href="#/">Go to the dashboard</a></p>';
  } catch (err) {
    console.error(err);
    view.innerHTML = '<div class="notice notice-error">Something went wrong loading this page. <a href="#/">Back to dashboard</a></div>';
  }
  if (token !== renderToken) return;
  app.replaceChildren(view);
  if (!window.__cocKeepScroll) window.scrollTo(0, 0);
}

// Warn before leaving a patient form with unsaved changes (link clicks).
document.addEventListener('click', async (e) => {
  const a = e.target.closest('a[href^="#/"]');
  if (!a || !window.__cocDirty || a.getAttribute('href') === location.hash) return;
  e.preventDefault();
  const ok = await confirmDialog({ title: 'Discard unsaved changes?', message: 'You have unsaved changes on this handover. Leaving now will discard them.', confirmLabel: 'Discard & leave', danger: true });
  if (ok) { window.__cocDirty = false; location.hash = a.getAttribute('href'); }
});
window.addEventListener('beforeunload', (e) => { if (window.__cocDirty) { e.preventDefault(); e.returnValue = ''; } });
window.addEventListener('hashchange', router);

document.getElementById('resetBtn').addEventListener('click', async () => {
  const ok = await confirmDialog({ title: 'Reset demonstration data?', message: 'All patients, handovers and history in this browser will be replaced with the original synthetic demo data.', confirmLabel: 'Reset', danger: true });
  if (!ok) return;
  await repo.resetDemoData();
  document.querySelector('.menu').open = false;
  window.__cocDirty = false;
  toast('Demonstration data reset.');
  location.hash = '#/';
  router();
});

await repo.init();
router();

import { esc } from './util.js';
import { getUnit, ISSUE_STATUSES, ISSUE_SEVERITIES } from './config.js';

// --- UI preferences (selected unit/team). Not clinical data. ---
const PREF_KEY = 'coc.ui.v1';
export function getPrefs() {
  try { return { unitId: 'micu', team: 'all', ...JSON.parse(localStorage.getItem(PREF_KEY) || '{}') }; }
  catch { return { unitId: 'micu', team: 'all' }; }
}
export function setPrefs(patch) {
  const next = { ...getPrefs(), ...patch };
  if (!getUnit(next.unitId)) next.unitId = 'micu';
  const u = getUnit(next.unitId);
  if (!u.teams || (next.team !== 'all' && !u.teams.some((t) => t.id === next.team))) next.team = 'all';
  try { localStorage.setItem(PREF_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  return next;
}

// --- Toasts ---
export function toast(message, kind = 'success') {
  const host = document.getElementById('toasts');
  if (!host) return;
  const el = document.createElement('div');
  el.className = `toast toast-${kind}`;
  el.textContent = message;
  host.appendChild(el);
  setTimeout(() => el.remove(), kind === 'error' ? 7000 : 3500);
}

// --- Confirm dialog ---
export function confirmDialog({ title, message, confirmLabel = 'Confirm', danger = false, list = [] }) {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = 'dialog';
    dlg.innerHTML = `
      <form method="dialog" class="dialog-body">
        <h2>${esc(title)}</h2>
        <p>${esc(message)}</p>
        ${list.length ? `<ul class="dialog-list">${list.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}
        <div class="dialog-actions">
          <button value="cancel" class="btn">Cancel</button>
          <button value="ok" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" autofocus>${esc(confirmLabel)}</button>
        </div>
      </form>`;
    dlg.addEventListener('close', () => { const ok = dlg.returnValue === 'ok'; dlg.remove(); resolve(ok); });
    document.body.appendChild(dlg);
    dlg.showModal();
  });
}

// --- Tags ---
export const tag = (text, cls = 'neutral', title = '') =>
  `<span class="tag tag-${cls}"${title ? ` title="${esc(title)}"` : ''}>${esc(text)}</span>`;

export const issueStatusLabel = (id) => ISSUE_STATUSES.find((s) => s.id === id)?.label || id;
export const severityLabel = (id) => ISSUE_SEVERITIES.find((s) => s.id === id)?.label || id;
export const severityTag = (id) => tag(severityLabel(id), id === 'urgent' ? 'danger' : id === 'important' ? 'warn' : 'neutral');
export const issueStatusTag = (id) => tag(issueStatusLabel(id), id === 'active' ? 'danger-soft' : id === 'pending' ? 'warn' : id === 'monitoring' ? 'info' : 'ok');

export function handoverTag(p) {
  const h = p.handover || {};
  if (h.status === 'reviewed') return tag('Reviewed', 'ok');
  if (h.status === 'ready') return tag(h.readyWithGaps ? 'Ready — gaps' : 'Ready', h.readyWithGaps ? 'warn' : 'info');
  return tag('Draft', 'neutral');
}

export function unitLabel(unitId, bed) {
  const u = getUnit(unitId);
  return `${u ? u.short : unitId} · Bed ${bed}`;
}

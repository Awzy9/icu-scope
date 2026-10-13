export const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const uid = (p = 'id') => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
export const nowIso = () => new Date().toISOString();
export const clone = (o) => JSON.parse(JSON.stringify(o));

export function fmtDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  return d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
export function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
/** ISO -> value for <input type="datetime-local"> (local time). */
export function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
export function fromLocalInput(v) {
  if (!v) return '';
  const d = new Date(v);
  return isNaN(d) ? '' : d.toISOString();
}
export const hoursAgo = (h) => new Date(Date.now() - h * 3600e3).toISOString();
export const hoursAhead = (h) => new Date(Date.now() + h * 3600e3).toISOString();

/** Set a value on a draft by dotted path. Array segments are addressed by item id. */
export function setPath(obj, path, value) {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    cur = Array.isArray(cur) ? cur.find((x) => x.id === parts[i]) : cur[parts[i]];
    if (cur == null) return false;
  }
  const last = parts[parts.length - 1];
  if (Array.isArray(cur)) return false;
  cur[last] = value;
  return true;
}
export function getPath(obj, path) {
  let cur = obj;
  for (const p of path.split('.')) {
    if (cur == null) return undefined;
    cur = Array.isArray(cur) ? cur.find((x) => x.id === p) : cur[p];
  }
  return cur;
}

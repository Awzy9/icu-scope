const CHANNEL_NAME = "icu-platform-single-active-session";
const CHECK_INTERVAL_MS = 15000;
const LOCK_ID = "icu-single-session-lock";

function createUuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

function authSessionId(session) {
  if (!session?.access_token) return null;
  try {
    const part = session.access_token.split(".")[1];
    const normalized = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const payload = JSON.parse(atob(padded));
    return typeof payload?.session_id === "string" ? payload.session_id : null;
  } catch { return null; }
}

export function createSingleActiveSessionGuard({ supabase, appId, onStatusChange }) {
  const clientInstanceId = createUuid();
  let currentSession = null;
  let active = true;
  let timer = null;
  let channel = null;
  let validating = false;
  let focusHandler = null;
  let visibilityHandler = null;

  function hideLock() { document.getElementById(LOCK_ID)?.remove(); }

  function showLock() {
    if (document.getElementById(LOCK_ID)) return;
    const overlay = document.createElement("div");
    overlay.id = LOCK_ID;
    overlay.setAttribute("role", "alertdialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.style.cssText = "position:fixed;inset:0;z-index:2147483647;background:rgba(3,7,18,.92);display:flex;align-items:center;justify-content:center;padding:24px;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif";
    overlay.innerHTML = `<div style="width:min(460px,100%);background:#fff;color:#111827;border-radius:18px;padding:28px;box-shadow:0 24px 80px rgba(0,0,0,.4);text-align:center"><div style="font-size:34px;margin-bottom:10px">🔒</div><h2 style="font-size:22px;margin:0 0 10px">Account active on another page</h2><p style="margin:0 0 20px;line-height:1.55;color:#4b5563">This page has been locked because the same account was opened on another page or device. Only one page can be active at a time.</p><button id="icu-session-reclaim" style="border:0;border-radius:10px;background:#111827;color:#fff;padding:12px 18px;font-weight:700;cursor:pointer">Use this page instead</button></div>`;
    document.body.appendChild(overlay);
    const button = document.getElementById("icu-session-reclaim");
    if (button) button.onclick = async () => {
      button.disabled = true;
      button.textContent = "Activating…";
      const ok = await claim(currentSession);
      if (!ok) { button.disabled = false; button.textContent = "Use this page instead"; }
    };
  }

  function setActive(next) {
    if (active === next) return;
    active = next;
    onStatusChange?.(next);
    if (next) hideLock(); else showLock();
  }

  function stopMonitoring() {
    if (timer) clearInterval(timer);
    timer = null;
    channel?.close(); channel = null;
    if (focusHandler) window.removeEventListener("focus", focusHandler);
    if (visibilityHandler) document.removeEventListener("visibilitychange", visibilityHandler);
    focusHandler = visibilityHandler = null;
  }

  function startMonitoring() {
    stopMonitoring();
    if (typeof BroadcastChannel !== "undefined") {
      channel = new BroadcastChannel(CHANNEL_NAME);
      channel.onmessage = event => {
        const m = event.data;
        if (m?.type === "session-claimed" && currentSession?.user?.id && m.userId === currentSession.user.id && m.clientInstanceId !== clientInstanceId) setActive(false);
      };
    }
    focusHandler = () => void validate(currentSession);
    visibilityHandler = () => { if (document.visibilityState === "visible") void validate(currentSession); };
    window.addEventListener("focus", focusHandler);
    document.addEventListener("visibilitychange", visibilityHandler);
    timer = setInterval(() => { if (document.visibilityState === "visible") void validate(currentSession); }, CHECK_INTERVAL_MS);
  }

  function broadcastClaim(session) {
    if (typeof BroadcastChannel === "undefined") return;
    const bc = new BroadcastChannel(CHANNEL_NAME);
    bc.postMessage({ type:"session-claimed", userId:session.user.id, clientInstanceId, appId, claimedAt:Date.now() });
    bc.close();
  }

  async function claim(session) {
    if (!session?.user) return false;
    const sid = authSessionId(session);
    if (!sid) return false;
    currentSession = session;
    const { error } = await supabase.from("active_sessions").upsert({
      user_id: session.user.id,
      auth_session_id: sid,
      client_instance_id: clientInstanceId,
      app_id: appId,
      claimed_at: new Date().toISOString()
    }, { onConflict:"user_id" });
    if (error) { console.error("[SingleSession] claim failed:", error.message); return false; }
    setActive(true);
    startMonitoring();
    broadcastClaim(session);
    return true;
  }

  async function validate(session = currentSession) {
    if (!session?.user || validating) return active;
    const sid = authSessionId(session);
    if (!sid) return false;
    validating = true;
    try {
      const { data, error } = await supabase.from("active_sessions").select("auth_session_id,client_instance_id").eq("user_id", session.user.id).maybeSingle();
      if (error) { console.warn("[SingleSession] validation failed:", error.message); return active; }
      const matches = !!data && data.auth_session_id === sid && data.client_instance_id === clientInstanceId;
      setActive(matches);
      return matches;
    } finally { validating = false; }
  }

  async function release(session = currentSession) {
    if (!session?.user) return;
    const sid = authSessionId(session);
    if (sid) await supabase.from("active_sessions").delete().eq("user_id", session.user.id).eq("auth_session_id", sid).eq("client_instance_id", clientInstanceId);
    stopMonitoring(); hideLock(); currentSession = null; active = true;
  }

  return { claim, validate, release, isActive:() => active, destroy(){ stopMonitoring(); hideLock(); currentSession=null; } };
}

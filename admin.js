(function () {
  "use strict";
  // All untrusted text (titles, abstracts, AI text) is inserted with textContent only.
  const $ = (id) => document.getElementById(id);
  const KEY = "icu-review-token";
  const ACTIONS = {
    pending_review: ["approve", "reject", "set_fields", "mark_full_text_reviewed", "mark_clinically_reviewed", "investigate", "archive"],
    under_investigation: ["restore_to_review", "archive"],
    retracted: ["restore_to_review", "archive"],
    updated: ["approve", "approve_ai", "approve_ai_practice", "reject_ai", "mark_clinically_reviewed", "investigate"],
    default: ["approve", "approve_ai", "approve_ai_practice", "reject_ai", "accept_update", "reject_update", "mark_full_text_reviewed", "mark_clinically_reviewed", "investigate", "archive"],
  };
  const token = () => { try { return sessionStorage.getItem(KEY) || ""; } catch (e) { return ""; } };
  const el = (tag, text, cls) => { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; };
  const link = (href, text) => { const a = el("a", text); if (/^https:\/\/(pubmed\.ncbi\.nlm\.nih\.gov|doi\.org)\//.test(href || "")) { a.href = href; a.target = "_blank"; a.rel = "noopener"; } return a; };

  async function api(method, body) {
    const r = await fetch("/api/review", { method, headers: { "Content-Type": "application/json", ...(token() ? { Authorization: `Bearer ${token()}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) { try { sessionStorage.removeItem(KEY); } catch (e) {} show(false); }
    return { ok: r.ok, status: r.status, data: j };
  }
  function show(signedIn) { $("login").hidden = signedIn; $("app").hidden = !signedIn; }

  function card(it) {
    const c = el("div", undefined, "card");
    c.appendChild(el("h2", it.title || "(untitled)"));
    c.appendChild(el("div", `${it.journal || ""} · ${it.publication_date || ""} · ${it.content_class}${it.legacy ? " · legacy" : ""}`, "muted"));
    const st = el("div", undefined, "row");
    st.appendChild(el("strong", `State: ${it.state}`, it.state === "retracted" ? "bad" : it.state === "under_investigation" ? "warn" : ""));
    st.appendChild(el("span", `Retraction status: ${it.retraction_status}`, it.retraction_status === "retracted" ? "bad" : "muted"));
    st.appendChild(el("span", `Verification (${it.source_verification.level}): ${it.source_verification.status}`, it.source_verification.status === "verified" ? "ok" : "warn"));
    c.appendChild(st);
    const lk = el("div", undefined, "row");
    if (it.links.pubmed) lk.appendChild(link(it.links.pubmed, "PubMed ↗"));
    if (it.links.doi) lk.appendChild(link(it.links.doi, "DOI ↗"));
    (it.trial_registration || []).forEach((n) => { if (/^NCT\d{8}$/.test(n)) lk.appendChild(link("", n)); });
    c.appendChild(lk);
    if (it.flags.length) c.appendChild(el("div", `Flags: ${it.flags.join(", ")}`, "warn"));
    const d1 = el("details"); d1.appendChild(el("summary", `Source checks (${it.source_verification.checks.length}) — metadata only; full text not reviewed`));
    it.source_verification.checks.forEach((k) => d1.appendChild(el("div", `${k.result.toUpperCase()} · ${k.name}: ${k.detail}`, k.result === "fail" ? "bad" : k.result === "warn" ? "warn" : "muted")));
    (it.notices || []).forEach((n) => d1.appendChild(el("div", `Notice: ${n.type} ${n.date || ""} ${n.doi || n.pmid || ""}`, "warn")));
    c.appendChild(d1);
    if (it.ai.status !== "none") {
      const d2 = el("details"); d2.appendChild(el("summary", `AI content: ${it.ai.status}${it.ai.issues.length ? ` (${it.ai.issues.length} issue(s))` : ""}`));
      it.ai.issues.forEach((i) => d2.appendChild(el("div", i, "bad")));
      if (it.ai.text) d2.appendChild(el("pre", JSON.stringify(it.ai.text, null, 1)));
      it.ai.trace.forEach((t) => d2.appendChild(el("div", `“${t.claim}” (${t.field}) ← ${t.source_span || "no matching sentence"}`, "muted")));
      c.appendChild(d2);
    }
    if (it.pending_update) {
      const d3 = el("details"); d3.open = true; d3.appendChild(el("summary", `Source changed after approval (${it.pending_update.detected_at}) — approved version still shown publicly`, ));
      d3.appendChild(el("div", it.pending_update.title)); d3.appendChild(el("pre", it.pending_update.abstract)); c.appendChild(d3);
    }
    const form = el("form", undefined, "row");
    const sel = el("select"); (ACTIONS[it.state] || ACTIONS.default).concat(it.pending_update ? ["accept_update", "reject_update"] : []).forEach((a) => sel.appendChild(new Option(a.replace(/_/g, " "), a)));
    const note = el("textarea"); note.rows = 2; note.placeholder = "Documented rationale (required, ≥10 characters)"; note.required = true;
    const fields = el("textarea"); fields.rows = 2; fields.placeholder = 'set fields: JSON, e.g. {"sample_size":"1200 (from paper, Table 1)"}'; fields.hidden = true;
    sel.addEventListener("change", () => { fields.hidden = sel.value !== "set_fields"; });
    const go = el("button", "Record decision"); go.type = "submit"; const msg = el("span", "", "muted"); msg.setAttribute("role", "status");
    form.append(sel, note, fields, go, msg);
    form.addEventListener("submit", async (e) => {
      e.preventDefault(); go.disabled = true;
      let f; if (sel.value === "set_fields") { try { f = JSON.parse(fields.value); } catch (x) { msg.textContent = "Invalid JSON"; go.disabled = false; return; } }
      const r = await api("POST", { op: "decide", content_id: it.content_id, action: sel.value, note: note.value, fields: f });
      msg.textContent = r.ok ? "Recorded — applied by the next evidence workflow run." : (r.data.error || `Error ${r.status}`); msg.className = r.ok ? "ok" : "bad"; go.disabled = r.ok;
    });
    c.appendChild(form);
    return c;
  }

  async function load() {
    const r = await api("GET");
    if (!r.ok) { if (r.status !== 401) { $("count").textContent = r.data.error || `Error ${r.status}`; } return; }
    show(true); $("who").textContent = `Signed in as ${r.data.reviewer}`;
    $("count").textContent = `${r.data.items.length} item(s) need attention`;
    const q = $("queue"); q.replaceChildren(); r.data.items.forEach((it) => q.appendChild(card(it)));
  }

  $("login-form").addEventListener("submit", async (e) => {
    e.preventDefault(); $("login-msg").textContent = "Signing in…";
    const r = await api("POST", { op: "login", email: $("email").value, password: $("password").value });
    $("password").value = "";
    if (!r.ok) { $("login-msg").textContent = r.data.error || `Error ${r.status}`; return; }
    try { sessionStorage.setItem(KEY, r.data.accessToken); } catch (x) {}
    $("login-msg").textContent = ""; load();
  });
  $("signout").addEventListener("click", () => { try { sessionStorage.removeItem(KEY); } catch (e) {} show(false); });
  $("reload").addEventListener("click", load);
  if (token()) load().then(() => { if ($("app").hidden) show(false); }); else show(false);
})();

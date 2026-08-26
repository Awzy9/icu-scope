# Security hardening pass — 2026-08-26

- Added production security headers including CSP, HSTS, frame blocking, MIME sniffing protection, referrer and permissions policies.
- No Supabase service-role/private key is intentionally shipped to browser code. Public Supabase anon/publishable and PostHog project keys remain browser-visible by design.
- Shared Supabase tables use RLS; access must remain enforced server-side.
- MV Simulator cloud candidate RPCs now use a per-session participant credential after the one-time join code exchange.
- ICU Scope external article links are scheme-validated before insertion into HTML.
- Added /.well-known/security.txt contact information.

Do not add service-role keys, private API keys, passwords, or secret tokens to frontend files. Keep secrets in Vercel environment variables/server-side functions only.

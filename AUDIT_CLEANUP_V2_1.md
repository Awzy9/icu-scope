# Audit Cleanup v2.1 — 2026-08-26

- Added secure cross-site Supabase session handoff from ICU Learning Platform to the three connected apps.
- Handoff is AES-256-GCM encrypted, server-created, audience-bound, and expires after 45 seconds.
- Destination app removes the `sso` query parameter immediately and establishes its own local Supabase session.
- Normal links remain as a fallback when SSO is not configured or the handoff fails.
- Requires the same `ICU_SSO_SECRET` (minimum 32 characters) on all four Vercel projects.
- ICU Knowledge progress/privacy wording now distinguishes guest local storage from authenticated cloud sync.
- ICU Scope Similar Articles URLs now pass through the existing safe HTTP/HTTPS URL validator.
- Stale default Knowledge Map URLs were updated to https://icu-knowledge-map.vercel.app.

The Supabase leaked-password setting is account/project configuration and is not changed by source code. Re-check Authentication → Attack Protection after deployment.

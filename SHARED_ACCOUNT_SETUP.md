# ICU Scope — Shared Account Setup

ICU Scope now uses the same Supabase Auth + `public.profiles` identity layer as the MV Simulator and ICU Knowledge Map.

## Vercel environment variables
Set these to the SAME values used by the MV Simulator / Knowledge Map:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_KNOWLEDGE_MAP_URL` (optional; defaults to https://default-project-green.vercel.app)
- `NEXT_PUBLIC_MV_SIMULATOR_URL` (optional; used for the account-menu link)

Never add the Supabase service-role key to the frontend.

## Supabase redirect configuration
In Supabase Authentication > URL Configuration, add the production ICU Scope URL to Redirect URLs, for example:
`https://your-icu-scope-domain.vercel.app/**`

## Behavior
- Existing users can sign in with the same email/password used on the other ICU sites.
- New accounts are created in the same Supabase project and therefore work on all three sites.
- ICU Scope remains publicly browsable while signed out.
- Existing local Saved articles remain unchanged; this integration does not require a new database migration.
- Because the apps are on separate domains, the browser session itself is domain-local: the identity/credentials are shared, but signing into one site does not silently sign the browser into another site.

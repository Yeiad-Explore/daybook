# Launch checklist

Items that must be done before Daybook goes live (the shipping step, `shipping-and-launch` / `/ship`).
Add to this list whenever a phase defers something to launch.

## Owner decisions recorded

- [ ] **Cross-model review of the deadline engine.** A second opinion from a different model (Gemini CLI, Codex CLI, or a manual external review) on `supabase/migrations/*deadline_engine*.sql`, `*trash_rules_review_fixes*.sql` and `*trash_with_reason*.sql` against PRD §7. Skipped in Phase 0 by the owner (16 Oct 2026); do it before shipping.

## Cloud Supabase project (`jymwmgyjgluwfvjesjbn`, ap-southeast-1)

- [ ] Push migrations only with the owner's OK (`supabase db push`).
- [ ] Enable the Before User Created hook (`private.before_user_created`) before the owner's first sign-in (C-AUTH-01).
- [ ] Google provider configured with the production OAuth client; redirect URLs for the production domain.
- [ ] Email sign-in disabled in production (C-AUTH-03, TEST-1).
- [ ] New sign-ups disabled after the owner's first sign-in (C-AUTH-02).
- [ ] Google OAuth consent screen "In production" so refresh tokens do not expire after 7 days (Phase 3).

## Deployment (deferred T23)

- [ ] GitHub remote added and CI green on GitHub (T22).
- [ ] Vercel project with protected previews (T23).

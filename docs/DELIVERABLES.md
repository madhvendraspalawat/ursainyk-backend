# Nabhahita Platform — Phase 1 Deliverables

Extracted from `Nabhahita-Master-Product-Doc.md` (v1.0 Final) and `Nabhahita-Phase-Deck.pdf`. Phase 1 = **"Career Distribution"** — fulfilment centres go live on a full digital rail: four connected surfaces, an in-house resume parser with a CIBIL-like candidate score, and recurring per-placement billing from day one.

**Precedes this:** website revamp (~15 days) — separate scope, already defined in the master doc §2–§10 (lives in `nabhahitalandingpage/`).

**Build window:** sub-3-month platform build — Release 1 (production core) ≈ week 11, Release 2 (long tail, public launch) ≈ week 14.

## The four surfaces

### 1 · Candidate Mobile App (React Native/Expo, Android-first)
- OTP login (no passwords), voice-first + regional-language onboarding — **Kannada, Hindi, English** at launch
- Résumé by photo, PDF, or guided form; view own **candidate score**
- Matched openings (light), application status tracker, nearest-centre finder
- Notifications: push/SMS/WhatsApp; every screen has a 5–10s voice prompt (pre-recorded artists, not TTS)
- Device floor: Android 8+, 2GB RAM, usable on 3G with queued submissions

### 2 · ESM Centre Portal (mobile + web) — the primary operational surface
- Territory dashboard: candidates, placements, earnings
- **Walk-in intake** (creates candidate profiles on candidates' behalf)
- Pipeline workflow: met → suitable → callback → placed → joined
- Contractor requirements feed, territory-matched, **employer identity masked**
- **Monthly active-verification** + retention/win-back list ("these 10 left — call them")
- Earnings & payout tracker (month-on-month per active head)

### 3 · Contractor Web Portal
- Post requirements (role, headcount, location, terms)
- View matched candidates with scores (employer identity masked from them too)
- Track supplied headcount + joining status; invoices/statements

### 4 · Admin Console + Super Admin (web)
- **Reviewer:** candidate review & approval gate (the human-in-the-loop for the parser)
- **Ops:** scoring presets, matching oversight; **Finance:** billing, ESM payouts, collections reconciliation
- **ESM Manager:** franchise onboarding/performance/territory; **Sales/BD:** contractor & requirement intake
- Super Admin: RBAC config, system config (languages, scoring, pricing, billing rules), territory setup, feature flags, full audit, data governance (DPDP retention/erasure)

## The shared engine (under every surface)
- **Resume parser** — **DECIDED (2026-08-13): vision-LLM API at launch** (free tier for dev/synthetic data; paid tier with no-training terms before real candidate PII flows); in-house OCR+NER deferred until volume justifies it. Photo/handwritten inputs are the *dominant* expected type; async via queue. Ingestion/validation/scoring/override stages identical either way.
- **Scoring engine** — explainable "CIBIL-like" score; preset-driven weights (qualification 25%, education 15%, total exp 20%, relevant exp 20%, language 10%, location flexibility 10%)
- **Matching engine** — requirements ↔ candidates, manual-assisted in Phase 1
- **Billing & payout engine** — recurring month-on-month per **active** placement; monthly verification drives both contractor invoices and ESM payouts (manual-assisted at R1, automated at R2)
- Notifications (FCM · MSG91/Gupshup · WhatsApp Business · SES), multilingual versioned templates
- **Employer-identity masking** + append-only audit log including *every read of a masked employer field* (bypass detection)
- DB-stored language packs editable without release

## Architecture (fixed in the master doc)
Turborepo monorepo · React Native (Expo) · Next.js portals · **NestJS API** (one API, centralized RBAC) · **PostgreSQL on AWS RDS Mumbai** (single system of record, shared with website leads) · Redis + BullMQ · S3 signed URLs · ECS Fargate · GitHub Actions · Sentry. DPDP: consent, minimization, retention/erasure, Indian residency.

## Release 1 vs Release 2

| Capability | R1 (≈ wk 11) | R2 (≈ wk 14) |
|---|---|---|
| Candidate app (3 languages) | Full | Polish |
| Voice prompts | Core flows | Complete |
| ESM portal | Full | Polish |
| Contractor portal | Core | Polish |
| Admin console (ops + review gate) | Full | Polish |
| Parser — structured inputs | Full | Tuning |
| Parser — photo/handwritten | Beta | Production |
| Notifications (all channels) | Full | Polish |
| Billing & payout automation | Manual-assisted | Automated |
| Analytics dashboards | Basic | Full |

## Explicitly out of scope (Phase 2/3)
Upskilling/LMS + psychometrics · overseas-placement workflow · public candidate portal · HR-Talks marketplace · finance products · automated matching/AI recommendations · direct-employer tier · iOS.

## Known constraints & estimates (from the doc itself)
- Parser: ~8–12 weeks focused engineering; expect 70–80% accuracy on structured, **50–60% on handwritten/photo at launch** — Reviewer gate is the safety net.
- Voice script locks ≈ week 9; ~60–80 prompts × 3 languages; artists engaged week 1.
- WhatsApp Business API approval can lag — start Meta verification week 1, SMS fallback.
- Team assumed: ~11 people across 6 parallel workstreams (backend, parser, mobile, portals, integrations, content/language).

## Open items before kickoff (doc §18)
~~Parser approach~~ (decided: vision-LLM, in-house later) · payout rails (bank/UPI, TDS) · pilot territory & cohort · voice-artist engagement · platform brand/domain · DPDP retention durations · admin team training · contractor agreement template · website content model + DNS cutover.

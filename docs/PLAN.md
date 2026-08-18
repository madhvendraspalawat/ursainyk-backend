# Nabhahita Platform Phase 1 — Rough Build Plan

Companion to `DELIVERABLES.md`. Same treatment as Clinwis: what we build, in what order, and where the risk lives. **Rough** — firms up when the §18 open items are resolved at kickoff. Drafted 2026-08-13.

## Shape of the build

Unlike Clinwis (one dev, one lane), this is a **six-workstream parallel build (~11 people, ~14 weeks)**. The plan's job is dependency management between lanes, not a single sequence.

```
A  Backend & data ──────► everything depends on this; staffed first
B  Parser & scoring ────► independent; develops against synthetic data
C  Candidate mobile app ► starts on backend stubs
D  Web portals (ESM/Admin/Contractor) ► shared component library
E  Integrations (WhatsApp/SMS/payments/payouts) ► after backend stabilises
F  Content & language (translations, voice, brand) ► non-engineering, parallel
```

## Critical path

**Data model + RBAC (A) → candidate intake API → parser contract (B) → scoring + review gate (D-admin) → matching flow (D-ESM/contractor) → active-verification + billing (A+E) → R1.**

The billing engine is the business — "recurring per active placement" is the pitch. It depends on the *whole* chain upstream (placement records ← matching ← approved candidates ← parser/intake). Anything that slips upstream lands on billing at week 9–10.

## Week-band map (rough)

| Weeks | A · Backend | B · Parser | C · Mobile | D · Portals | E · Integrations | F · Content |
|---|---|---|---|---|---|---|
| 1–2 | Monorepo, envs, core schema (candidate/territory/requirement/placement), auth + RBAC skeleton | Prompt/extraction contract vs Zod-typed profile schema; eval set from synthetic + real sample docs (free tier OK here) | Expo scaffold, OTP flow, design system | Portal scaffolds, shared component lib | Meta Business verification, MSG91/SES accounts | Voice artists engaged, translation keys started |
| 3–5 | Intake + candidate APIs, territory scoping, audit log | Structured-input parsing + scoring presets | Onboarding (voice+language), résumé capture (photo/PDF/form) | Admin review gate, ESM intake + pipeline | Push + SMS wired | Language pack v1 (Kannada/Hindi/English) |
| 6–8 | Requirements + matching APIs, masking enforcement, invoice/payout schema | Photo/OCR path beta, validation pass, override loop | Score view, matches, status tracker | Contractor portal core, ESM requirements feed + matching | WhatsApp templates, email | Voice script drafting against near-final copy |
| 9–11 | Active-verification jobs (BullMQ), billing engine manual-assisted, reports | Tuning on real pilot data | Notifications, offline/queued submissions, floor-device perf | Earnings/payout tracker, Finance views, Super-Admin config | Payout rails (bank/UPI + TDS per kickoff decision) | **Script locks wk 9** → recording → QA |
| **11** | **Release 1 — production core live, pilot territory onboards** | | | | | |
| 12–14 | Billing automation, hardening | Handwritten path to production | Polish, full voice coverage | Polish, full analytics | Reconciliation flows | Multilingual QA (native speakers) |
| **14** | **Release 2 — public launch** | | | | | |

## Red-team notes (argue with these)

1. **Parser — DECIDED (2026-08-13): vision-LLM APIs at launch, free tier to start; in-house build deferred** until volume justifies it. Ingestion/validation/scoring/override stages stay identical either way, so the swap is contained. Two hard caveats that must be resolved before real candidate data flows:
   - **Free tiers and PII don't mix.** Free-tier LLM APIs (e.g. Gemini AI Studio free tier) typically license inputs for model training and offer no data-processing agreement — and the inputs here are ID documents, certificates, and résumés of real candidates. That conflicts with DPDP (Nabhahita as Data Fiduciary, documented processor instructions) and with the doc's own §11.8 commitments. **Free tier is fine for development and synthetic/demo data only; switch to a paid tier (no-training terms + DPA) before the first pilot candidate.** The cost is small (fractions of a rupee per parse) against a per-placement revenue model.
   - **Data residency:** most LLM APIs process outside India. AWS Mumbai residency (§11.8) covers storage; check whether the residency commitment made to Nabhahita extends to transient processing, and get it in writing either way.
   - Also: free-tier rate limits are per-minute/per-day caps — fine for a pilot territory, but queue parser jobs (BullMQ already planned) so bursts degrade to slow, never to dropped.
2. **Billing correctness is the Clinwis lesson at bigger stakes** — money moves on it (contractor invoices, ESM payouts). Same discipline: integer paise, deterministic billing engine as pure functions, pinned tests on verification→invoice→payout math, append-only ledger. This should be stated in the engineering standards up front.
3. **Monthly active-verification is a human loop, not just a cron job.** ESMs confirm heads are still active; payouts depend on their honesty. The audit/bypass-detection design matters as much as the code — build the anomaly views (sudden verification spikes, mask-field read patterns) into Admin from R1, not Phase 2.
4. **Voice prompts are a calendar risk, not an engineering risk.** Script locks wk 9; artists booked wk 1. If copy churns past wk 9, re-recording cascades into R2. Freeze candidate-app copy early; portals are English-only and can churn freely.
5. **Six workstreams need six leads.** The plan assumes ~11 people exist. If the real team is smaller, the honest move is re-cutting R1 scope (e.g., contractor portal "core" shrinks to requirements-posting only) — not compressing the same scope into fewer hands.

## Standards to carry over from Clinwis
- Engines compute deterministically; anything narrated/derived is validated against engine output.
- Money integer-only (paise), largest-remainder splits, pinned figures in CI.
- Zod (web) / class-validator or zod (Nest) contracts at every boundary; shared types via the monorepo.
- PHI/PII-minimal reads per role — masking enforced server-side, UI gating is UX only.

## Immediate next actions
1. ~~Parser approach~~ **Decided: vision-LLM API (free tier for dev, paid tier before pilot PII); in-house later.** Frees the ML hire for scoring/validation work; remaining §18 items still open.
2. Pilot territory + cohort decision — determines seed data, language QA priorities, and R1 acceptance.
3. Engineering kickoff artefacts: full data dictionary, RBAC matrix as code, billing math spec with worked examples (the "Practice A vs B" equivalent for placements/payouts).
4. Task CSVs per workstream (same format as Clinwis frontend/backend CSVs) once staffing is known.

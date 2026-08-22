// @ursainyk/rbac — the RBAC matrix as code (PLAN.md kickoff artefact).
// Pure, no I/O. The API's PermissionsGuard calls can(); data-layer scoping
// (Prisma filters + RLS, ADR-0007) enforces the *scope* returned by scopeOf().
//
// Derived from docs/DELIVERABLES.md §1–4 and ADRs 0004–0010. Deny by default:
// anything not granted here is forbidden. Server-side enforcement only — UI
// gating is UX (CONTRIBUTING).

export const ROLES = [
  'CANDIDATE',
  'ESM_CENTRE',
  'CONTRACTOR',
  'REVIEWER',
  'OPS',
  'FINANCE',
  'ESM_MANAGER',
  'SALES_BD',
  'SUPER_ADMIN',
] as const;
export type Role = (typeof ROLES)[number];

export const RESOURCES = [
  'candidate_profile',
  'candidate_score',
  'requirement',
  'placement',
  'verification',
  'invoice',
  'payout',
  'territory',
  'esm_centre',
  'contractor_org',
  'match_suggestion', // Ops proposes; ESM accepts/dismisses (Phase 1 manual-assisted matching)
  'user_account', // portal/candidate account lifecycle; 'configure' = role grant/revoke
  'system_config', // RBAC grants, feature flags, languages, pricing/billing rules
  'audit_log', // two-tier: admin sub-roles see ADMIN-visibility rows; SUPER rows are Super Admin only (ADR-0012)
  'training_data', // DecisionEvent exports for in-house AI training (ADR-0012)
  'employer_identity', // the masked join (ADR-0007); reads are audit-logged (ADR-0006)
] as const;
export type Resource = (typeof RESOURCES)[number];

export const ACTIONS = ['create', 'read', 'update', 'approve', 'configure'] as const;
export type Action = (typeof ACTIONS)[number];

/**
 * How far a grant reaches. Data-layer enforcement:
 *  own       → row ownership filter
 *  territory → Prisma scoping + RLS on app.territory_ids (ADR-0007)
 *  org       → contractor-org membership filter
 *  all       → platform-wide (admin roles)
 */
export type Scope = 'own' | 'territory' | 'org' | 'all';

export interface Grant {
  actions: readonly Action[];
  scope: Scope;
}

const CRU = ['create', 'read', 'update'] as const;

/** The matrix. Mirrors the vault note "Nabhahita — Human Roles"; tests pin every row. */
export const MATRIX: Record<Role, Partial<Record<Resource, Grant>>> = {
  CANDIDATE: {
    candidate_profile: { actions: CRU, scope: 'own' },
    candidate_score: { actions: ['read'], scope: 'own' },
    placement: { actions: ['read'], scope: 'own' }, // application status tracker
  },
  ESM_CENTRE: {
    candidate_profile: { actions: CRU, scope: 'territory' }, // walk-in intake
    candidate_score: { actions: ['read'], scope: 'territory' },
    requirement: { actions: ['read'], scope: 'territory' }, // employer identity masked
    placement: { actions: CRU, scope: 'territory' }, // pipeline: met → … → joined
    verification: { actions: ['create', 'read'], scope: 'territory' },
    match_suggestion: { actions: ['read', 'update'], scope: 'territory' }, // accept/dismiss
    payout: { actions: ['read'], scope: 'own' }, // earnings tracker
  },
  CONTRACTOR: {
    candidate_profile: { actions: ['read'], scope: 'org' }, // matched/supplied only
    candidate_score: { actions: ['read'], scope: 'org' },
    requirement: { actions: CRU, scope: 'org' }, // post, edit/close lifecycle
    placement: { actions: ['read'], scope: 'org' }, // supplied headcount + joining
    invoice: { actions: ['read'], scope: 'org' },
    employer_identity: { actions: ['read'], scope: 'own' }, // knows itself
  },
  REVIEWER: {
    candidate_profile: { actions: ['read', 'update', 'approve'], scope: 'all' },
    candidate_score: { actions: ['read'], scope: 'all' },
    audit_log: { actions: ['read'], scope: 'all' }, // ADMIN tier only (ADR-0012)
  },
  OPS: {
    candidate_profile: { actions: ['read'], scope: 'all' },
    candidate_score: { actions: ['read', 'configure'], scope: 'all' }, // presets
    requirement: { actions: ['read'], scope: 'all' }, // matching oversight
    placement: { actions: ['read'], scope: 'all' },
    esm_centre: { actions: ['read'], scope: 'all' }, // entity management (task 34)
    match_suggestion: { actions: [...CRU], scope: 'all' }, // manual-assisted matching
    audit_log: { actions: ['read'], scope: 'all' }, // ADMIN tier only (ADR-0012)
  },
  FINANCE: {
    placement: { actions: ['read'], scope: 'all' },
    verification: { actions: ['read'], scope: 'all' },
    invoice: { actions: CRU, scope: 'all' },
    payout: { actions: CRU, scope: 'all' },
    audit_log: { actions: ['read'], scope: 'all' }, // ADMIN tier only (ADR-0012)
  },
  ESM_MANAGER: {
    esm_centre: { actions: CRU, scope: 'all' }, // franchise onboarding/performance
    user_account: { actions: ['create'], scope: 'all' }, // centre staff accounts only (service enforces role=ESM_CENTRE)
    territory: { actions: ['update'], scope: 'all' }, // assign centre territories
    placement: { actions: ['read'], scope: 'all' }, // performance monitoring
    verification: { actions: ['read'], scope: 'all' },
    audit_log: { actions: ['read'], scope: 'all' }, // ADMIN tier only (ADR-0012)
  },
  SALES_BD: {
    contractor_org: { actions: CRU, scope: 'all' }, // contractor intake
    user_account: { actions: ['create'], scope: 'all' }, // contractor user accounts only (service enforces role=CONTRACTOR)
    requirement: { actions: CRU, scope: 'all' }, // on contractors' behalf
    audit_log: { actions: ['read'], scope: 'all' }, // ADMIN tier only (ADR-0012)
  },
  SUPER_ADMIN: {
    candidate_profile: { actions: ['read'], scope: 'all' }, // DPDP governance duties
    candidate_score: { actions: ['configure'], scope: 'all' },
    requirement: { actions: ['read'], scope: 'all' },
    placement: { actions: ['read'], scope: 'all' },
    verification: { actions: ['read'], scope: 'all' },
    invoice: { actions: ['configure'], scope: 'all' },
    payout: { actions: ['configure'], scope: 'all' },
    territory: { actions: CRU, scope: 'all' },
    esm_centre: { actions: ['read'], scope: 'all' },
    contractor_org: { actions: ['read'], scope: 'all' },
    match_suggestion: { actions: ['read'], scope: 'all' },
    user_account: { actions: [...CRU, 'configure'], scope: 'all' }, // full lifecycle + role grants
    system_config: { actions: [...CRU, 'configure'], scope: 'all' },
    audit_log: { actions: ['read'], scope: 'all' }, // both tiers incl. service/worker rows
    training_data: { actions: ['read', 'configure'], scope: 'all' }, // exports + erasure (ADR-0012)
    employer_identity: { actions: ['read'], scope: 'all' }, // audit-logged like any read
  },
};

/** `resource:action`, e.g. 'placement:update' — the @Require() decorator vocabulary. */
export type Permission = `${Resource}:${Action}`;

export function can(roles: readonly Role[], resource: Resource, action: Action): boolean {
  return roles.some((r) => MATRIX[r][resource]?.actions.includes(action) ?? false);
}

export function canPermission(roles: readonly Role[], permission: Permission): boolean {
  const [resource, action] = permission.split(':') as [Resource, Action];
  return can(roles, resource, action);
}

const SCOPE_ORDER: Record<Scope, number> = { own: 0, org: 1, territory: 1, all: 2 };

/** Widest scope the role set holds for resource+action, or null if denied. */
export function scopeOf(roles: readonly Role[], resource: Resource, action: Action): Scope | null {
  let widest: Scope | null = null;
  for (const r of roles) {
    const grant = MATRIX[r][resource];
    if (!grant?.actions.includes(action)) continue;
    if (widest === null || SCOPE_ORDER[grant.scope] > SCOPE_ORDER[widest]) widest = grant.scope;
  }
  return widest;
}

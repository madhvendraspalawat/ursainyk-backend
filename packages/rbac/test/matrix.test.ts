// Pinned tests: every assertion mirrors a cell of the role/permission matrix
// (vault note "Nabhahita — Human Roles", derived from docs/DELIVERABLES.md §1–4).
// A failing test here means the matrix CHANGED — that needs a deliberate decision,
// not a fix to the test.
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { ACTIONS, MATRIX, RESOURCES, ROLES, can, canPermission, scopeOf } from '../src';

test('deny by default: no grant → no access', () => {
  assert.equal(can(['CANDIDATE'], 'audit_log', 'read'), false);
  assert.equal(can(['CANDIDATE'], 'requirement', 'read'), false);
  assert.equal(can(['ESM_CENTRE'], 'invoice', 'read'), false);
  assert.equal(can(['ESM_CENTRE'], 'audit_log', 'read'), false); // external roles never see the log
  assert.equal(can(['CONTRACTOR'], 'audit_log', 'read'), false);
  assert.equal(can(['SALES_BD'], 'invoice', 'read'), false);
  assert.equal(can([], 'candidate_profile', 'read'), false);
});

test('candidate: own profile/score/status only', () => {
  assert.equal(can(['CANDIDATE'], 'candidate_profile', 'update'), true);
  assert.equal(scopeOf(['CANDIDATE'], 'candidate_profile', 'read'), 'own');
  assert.equal(scopeOf(['CANDIDATE'], 'placement', 'read'), 'own');
  assert.equal(can(['CANDIDATE'], 'candidate_profile', 'approve'), false);
  assert.equal(can(['CANDIDATE'], 'employer_identity', 'read'), false); // never
});

test('ESM centre: territory-scoped intake, pipeline, verification; masked requirements', () => {
  assert.equal(scopeOf(['ESM_CENTRE'], 'candidate_profile', 'create'), 'territory'); // walk-in
  assert.equal(scopeOf(['ESM_CENTRE'], 'placement', 'update'), 'territory');
  assert.equal(can(['ESM_CENTRE'], 'verification', 'create'), true);
  assert.equal(scopeOf(['ESM_CENTRE'], 'requirement', 'read'), 'territory');
  assert.equal(can(['ESM_CENTRE'], 'requirement', 'create'), false);
  assert.equal(can(['ESM_CENTRE'], 'employer_identity', 'read'), false); // masking
  assert.equal(scopeOf(['ESM_CENTRE'], 'payout', 'read'), 'own'); // earnings tracker
  assert.equal(can(['ESM_CENTRE'], 'payout', 'update'), false);
});

test('contractor: org-scoped requirements lifecycle, read-only money', () => {
  assert.equal(scopeOf(['CONTRACTOR'], 'requirement', 'create'), 'org');
  assert.equal(scopeOf(['CONTRACTOR'], 'candidate_score', 'read'), 'org');
  assert.equal(can(['CONTRACTOR'], 'invoice', 'update'), false);
  assert.equal(scopeOf(['CONTRACTOR'], 'employer_identity', 'read'), 'own'); // itself only
  assert.equal(can(['CONTRACTOR'], 'verification', 'read'), false);
});

test('reviewer: the approval gate, nothing else', () => {
  assert.equal(can(['REVIEWER'], 'candidate_profile', 'approve'), true);
  assert.equal(can(['REVIEWER'], 'candidate_profile', 'update'), true);
  assert.equal(can(['REVIEWER'], 'requirement', 'read'), false);
  assert.equal(can(['REVIEWER'], 'invoice', 'read'), false);
  assert.equal(can(['REVIEWER'], 'audit_log', 'read'), true); // ADMIN tier (ADR-0012)
  const approvers = ROLES.filter((r) => can([r], 'candidate_profile', 'approve'));
  assert.deepEqual(approvers, ['REVIEWER']); // only role with the gate
});

test('ops: score presets + matching oversight, read-only elsewhere', () => {
  assert.equal(can(['OPS'], 'candidate_score', 'configure'), true);
  assert.equal(can(['OPS'], 'requirement', 'read'), true);
  assert.equal(can(['OPS'], 'requirement', 'update'), false);
  assert.equal(can(['OPS'], 'payout', 'read'), false);
});

test('finance: owns invoice/payout process, cannot touch candidates', () => {
  assert.equal(can(['FINANCE'], 'invoice', 'create'), true);
  assert.equal(can(['FINANCE'], 'payout', 'update'), true);
  assert.equal(can(['FINANCE'], 'verification', 'read'), true);
  assert.equal(can(['FINANCE'], 'verification', 'create'), false); // only ESM verifies
  assert.equal(can(['FINANCE'], 'candidate_profile', 'read'), false);
});

test('ESM manager: franchise network + territory assignment, no definitions', () => {
  assert.equal(can(['ESM_MANAGER'], 'esm_centre', 'create'), true);
  assert.equal(can(['ESM_MANAGER'], 'territory', 'update'), true);
  assert.equal(can(['ESM_MANAGER'], 'territory', 'create'), false); // Super Admin defines
  assert.equal(can(['ESM_MANAGER'], 'candidate_profile', 'read'), false);
});

test('sales/BD: contractor + requirement intake, no money, no matching', () => {
  assert.equal(can(['SALES_BD'], 'contractor_org', 'create'), true);
  assert.equal(can(['SALES_BD'], 'requirement', 'create'), true);
  assert.equal(can(['SALES_BD'], 'placement', 'read'), false);
  assert.equal(can(['SALES_BD'], 'candidate_profile', 'read'), false);
});

test('super admin: config + audit + governance, but does not operate money', () => {
  assert.equal(can(['SUPER_ADMIN'], 'system_config', 'configure'), true);
  assert.equal(can(['SUPER_ADMIN'], 'territory', 'create'), true);
  assert.equal(can(['SUPER_ADMIN'], 'audit_log', 'read'), true);
  assert.equal(can(['SUPER_ADMIN'], 'invoice', 'create'), false); // Finance operates
  assert.equal(can(['SUPER_ADMIN'], 'candidate_profile', 'approve'), false); // Reviewer gates
  // ADR-0012 (2026-08-22): audit read widened from SUPER_ADMIN-only to all six
  // admin roles — the two-tier split (ADMIN vs SUPER visibility) is enforced at
  // the query layer, not here. This pin changed deliberately.
  const auditors = ROLES.filter((r) => can([r], 'audit_log', 'read'));
  assert.deepEqual(auditors, [
    'REVIEWER',
    'OPS',
    'FINANCE',
    'ESM_MANAGER',
    'SALES_BD',
    'SUPER_ADMIN',
  ]);
});

test('matching (manual-assisted): Ops proposes, ESM decides, no one else', () => {
  const proposers = ROLES.filter((r) => can([r], 'match_suggestion', 'create'));
  assert.deepEqual(proposers, ['OPS']);
  const deciders = ROLES.filter((r) => can([r], 'match_suggestion', 'update'));
  assert.deepEqual(deciders, ['ESM_CENTRE', 'OPS']); // ESM accepts/dismisses; Ops may withdraw
  assert.equal(scopeOf(['ESM_CENTRE'], 'match_suggestion', 'update'), 'territory');
  assert.equal(can(['CONTRACTOR'], 'match_suggestion', 'read'), false);
});

test('user accounts: creators are ESM Mgr/Sales/Super; role grants Super only', () => {
  const creators = ROLES.filter((r) => can([r], 'user_account', 'create'));
  assert.deepEqual(creators, ['ESM_MANAGER', 'SALES_BD', 'SUPER_ADMIN']);
  // Which role a creator may assign is enforced in the service layer
  // (ESM_MANAGER → ESM_CENTRE only, SALES_BD → CONTRACTOR only).
  const granters = ROLES.filter((r) => can([r], 'user_account', 'configure'));
  assert.deepEqual(granters, ['SUPER_ADMIN']); // role grant/revoke
  assert.equal(can(['ESM_MANAGER'], 'user_account', 'update'), false); // no disable/reset
  assert.equal(can(['OPS'], 'user_account', 'create'), false);
});

test('analytics: all six admin roles, nobody external', () => {
  const readers = ROLES.filter((r) => can([r], 'analytics', 'read'));
  assert.deepEqual(readers, [
    'REVIEWER',
    'OPS',
    'FINANCE',
    'ESM_MANAGER',
    'SALES_BD',
    'SUPER_ADMIN',
  ]);
  assert.equal(can(['ESM_CENTRE'], 'analytics', 'read'), false);
  assert.equal(can(['CONTRACTOR'], 'analytics', 'read'), false);
});

test('training data (ADR-0012): Super Admin only, export and erasure', () => {
  const readers = ROLES.filter((r) => can([r], 'training_data', 'read'));
  assert.deepEqual(readers, ['SUPER_ADMIN']);
  assert.equal(can(['SUPER_ADMIN'], 'training_data', 'configure'), true); // erasure
  assert.equal(can(['OPS'], 'training_data', 'read'), false);
  assert.equal(can(['REVIEWER'], 'training_data', 'read'), false);
});

test('multi-role union + widest scope wins', () => {
  assert.equal(can(['REVIEWER', 'OPS'], 'candidate_score', 'configure'), true);
  assert.equal(scopeOf(['ESM_CENTRE', 'ESM_MANAGER'], 'verification', 'read'), 'all');
  assert.equal(canPermission(['FINANCE'], 'payout:update'), true);
  assert.equal(canPermission(['FINANCE'], 'training_data:read'), false);
});

test('matrix hygiene: every role exists, grants use known resources/actions', () => {
  for (const role of ROLES) {
    const grants = MATRIX[role];
    assert.ok(grants, role);
    for (const [resource, grant] of Object.entries(grants)) {
      assert.ok((RESOURCES as readonly string[]).includes(resource), `${role}:${resource}`);
      assert.ok(grant.actions.length > 0, `${role}:${resource} empty actions`);
      for (const a of grant.actions)
        assert.ok((ACTIONS as readonly string[]).includes(a), `${role}:${resource}:${a}`);
    }
  }
});

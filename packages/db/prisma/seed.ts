// Seed: synthetic data only — never real candidate PII (CONTRIBUTING).
// One dev user per role, one territory, one centre, one contractor org.
// Passwords: dev-only, printed below. Idempotent via upserts.
import 'dotenv/config';
import argon2 from 'argon2';
import { createPrismaClient, Role, UserKind } from '../src';

const DEV_PASSWORD = 'dev-password-1';

const PORTAL_USERS: Array<{ email: string; name: string; role: Role }> = [
  { email: 'esm@dev.local', name: 'Dev ESM Centre', role: Role.ESM_CENTRE },
  { email: 'contractor@dev.local', name: 'Dev Contractor', role: Role.CONTRACTOR },
  { email: 'reviewer@dev.local', name: 'Dev Reviewer', role: Role.REVIEWER },
  { email: 'ops@dev.local', name: 'Dev Ops', role: Role.OPS },
  { email: 'finance@dev.local', name: 'Dev Finance', role: Role.FINANCE },
  { email: 'esm-manager@dev.local', name: 'Dev ESM Manager', role: Role.ESM_MANAGER },
  { email: 'sales@dev.local', name: 'Dev Sales BD', role: Role.SALES_BD },
  { email: 'root@dev.local', name: 'Dev Super Admin', role: Role.SUPER_ADMIN },
];

async function main() {
  const db = createPrismaClient();
  const passwordHash = await argon2.hash(DEV_PASSWORD, { type: argon2.argon2id });

  const territory = await db.territory.upsert({
    where: { code: 'BLR-01' },
    update: {},
    create: { code: 'BLR-01', name: 'Bengaluru North (synthetic)' },
  });

  const centre = await db.esmCentre.upsert({
    where: { code: 'CENTRE-01' },
    update: {},
    create: {
      code: 'CENTRE-01',
      name: 'Dev Fulfilment Centre (synthetic)',
      territories: { create: [{ territoryId: territory.id }] },
    },
  });

  const orgName = 'Dev Contractor Org (synthetic)';
  const org =
    (await db.contractorOrg.findFirst({ where: { name: orgName } })) ??
    (await db.contractorOrg.create({ data: { name: orgName } }));

  // Candidate: OTP-only, no password.
  await db.user.upsert({
    where: { phone: '+911234500000' },
    update: {},
    create: {
      kind: UserKind.CANDIDATE,
      phone: '+911234500000',
      name: 'Dev Candidate (synthetic)',
      credential: { create: {} },
      roles: { create: [{ role: Role.CANDIDATE }] },
    },
  });

  for (const u of PORTAL_USERS) {
    const user = await db.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        kind: UserKind.PORTAL,
        email: u.email,
        name: u.name,
        credential: { create: { passwordHash } },
        roles: { create: [{ role: u.role }] },
      },
    });
    if (u.role === Role.ESM_CENTRE) {
      await db.centreMembership.upsert({
        where: { userId_centreId: { userId: user.id, centreId: centre.id } },
        update: {},
        create: { userId: user.id, centreId: centre.id },
      });
    }
    if (u.role === Role.CONTRACTOR) {
      await db.contractorMembership.upsert({
        where: { userId_orgId: { userId: user.id, orgId: org.id } },
        update: {},
        create: { userId: user.id, orgId: org.id },
      });
    }
  }

  // Domain config (synthetic)
  await db.employerIdentity.upsert({
    where: { orgId: org.id },
    update: {},
    create: {
      orgId: org.id,
      companyName: 'Synthetic Facility Services Pvt Ltd',
      contactName: 'Dev Contact',
      contactPhone: '+911234599999',
    },
  });
  const presetName = 'default-v1';
  const preset = await db.scoringPreset.findFirst({ where: { name: presetName } });
  if (!preset) {
    await db.scoringPreset.create({
      data: {
        name: presetName,
        active: true,
        // DELIVERABLES.md weights: qualification 25, education 15, total exp 20,
        // relevant exp 20, language 10, location flexibility 10.
        weights: {
          qualification: 25,
          education: 15,
          totalExp: 20,
          relevantExp: 20,
          language: 10,
          locationFlexibility: 10,
        },
      },
    });
  }
  await db.systemConfig.upsert({
    where: { key: 'billing.rates' },
    update: {},
    create: {
      key: 'billing.rates',
      // ₹2000/month per active head, ESM share 30% (synthetic dev rates).
      value: { pricePerActiveHeadPaise: 200000, esmShareBp: 3000 },
    },
  });

  // Notification templates (multilingual, versioned — ADR-0010). Synthetic copy.
  const templates: Array<{ key: string; channel: 'SMS' | 'EMAIL'; locale: string; subject?: string; body: string }> = [
    { key: 'candidate.approved', channel: 'SMS', locale: 'en', body: 'Hi {{name}}, your Ursainyk profile is approved. Your score: {{score}}.' },
    { key: 'candidate.approved', channel: 'SMS', locale: 'hi', body: 'नमस्ते {{name}}, आपकी Ursainyk प्रोफ़ाइल स्वीकृत हो गई है। स्कोर: {{score}}।' },
    { key: 'candidate.approved', channel: 'SMS', locale: 'kn', body: 'ನಮಸ್ಕಾರ {{name}}, ನಿಮ್ಮ Ursainyk ಪ್ರೊಫೈಲ್ ಅನುಮೋದನೆಯಾಗಿದೆ. ಸ್ಕೋರ್: {{score}}.' },
    { key: 'candidate.rejected', channel: 'SMS', locale: 'en', body: 'Hi {{name}}, your profile needs changes. Visit your nearest centre for help.' },
    { key: 'placement.joined', channel: 'SMS', locale: 'en', body: 'Congratulations {{name}}! Your joining is confirmed. All the best!' },
    { key: 'candidate.approved', channel: 'EMAIL', locale: 'en', subject: 'Profile approved', body: 'Hi {{name}},\n\nYour profile was approved. Score: {{score}}.\n\n— Ursainyk' },
    { key: 'verification.reminder', channel: 'EMAIL', locale: 'en', subject: 'Monthly verification due — {{period}}', body: 'Hi {{name}},\n\n{{count}} placed candidates at {{centre}} still need their {{period}} verification. Please complete them in the portal.\n\n— Ursainyk' },
    { key: 'retention.winback', channel: 'EMAIL', locale: 'en', subject: 'Win-back list — {{period}}', body: 'Hi {{name}},\n\n{{count}} candidates from {{centre}} left in {{period}}. See the win-back list in the portal — a call may bring them back.\n\n— Ursainyk' },
    { key: 'user.invited', channel: 'EMAIL', locale: 'en', subject: 'Set up your Ursainyk account', body: 'Hi {{name}},\n\nAn account was created for you. Set your password here (link valid 48h, single use):\n{{link}}\n\n— Ursainyk' },
  ];
  for (const t of templates) {
    await db.notificationTemplate.upsert({
      where: { key_channel_locale_version: { key: t.key, channel: t.channel, locale: t.locale, version: 1 } },
      update: {},
      create: { ...t, version: 1 },
    });
  }

  console.log(`Seeded: 1 candidate (+911234500000), ${PORTAL_USERS.length} portal users (password: ${DEV_PASSWORD})`);
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

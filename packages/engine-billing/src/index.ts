// @ursainyk/engine-billing — PURE functions only. Money is integer paise
// (bigint). No floats in money paths, ever (ADR-0005).
// Monthly verification facts → contractor invoice lines + ESM payout lines.
// Every figure recomputable: same facts + same rates = identical lines.

export interface BillingRates {
  /** Contractor price per ACTIVE/WON_BACK head per month. */
  pricePerActiveHeadPaise: bigint;
  /** ESM share of that price, in basis points (3000 = 30%). */
  esmShareBp: bigint;
}

export interface VerificationFact {
  placementId: string;
  orgId: string;
  centreId: string | null;
  outcome: 'ACTIVE' | 'LEFT' | 'WON_BACK';
}

export interface BillingLine {
  placementId: string;
  amountPaise: bigint;
}

export interface InvoiceLine extends BillingLine {
  orgId: string;
}

export interface PayoutLine extends BillingLine {
  centreId: string;
}

export interface BillingRunResult {
  invoiceLines: InvoiceLine[];
  payoutLines: PayoutLine[];
  totals: { invoicedPaise: bigint; payoutPaise: bigint };
}

const BP_DENOMINATOR = 10_000n;

/**
 * Largest-remainder split: parts always sum to `total` exactly.
 * Deterministic tie-break (Quiz-01 canon): remainder paise go to parts with
 * the largest fractional remainder; equal remainders break by ascending id.
 * The ordering rule is contractual — recomputing months later must reproduce
 * the original ledger rows byte for byte.
 */
export function splitLargestRemainder(
  total: bigint,
  parts: { id: string; weight: bigint }[],
): { id: string; amountPaise: bigint }[] {
  if (parts.length === 0) return [];
  const weightSum = parts.reduce((a, p) => a + p.weight, 0n);
  if (weightSum <= 0n) throw new Error('weights must sum positive');

  const base = parts.map((p) => {
    const exact = total * p.weight; // numerator over weightSum
    const floor = exact / weightSum;
    const remainder = exact % weightSum;
    return { id: p.id, floor, remainder };
  });
  let leftover = total - base.reduce((a, b) => a + b.floor, 0n);

  const order = [...base].sort((a, b) => {
    if (a.remainder !== b.remainder) return a.remainder > b.remainder ? -1 : 1; // fraction DESC
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; // id ASC — the deterministic tie-break
  });
  const extra = new Map<string, bigint>();
  for (const part of order) {
    if (leftover <= 0n) break;
    extra.set(part.id, 1n);
    leftover -= 1n;
  }
  return base.map((p) => ({ id: p.id, amountPaise: p.floor + (extra.get(p.id) ?? 0n) }));
}

/** A head is billable for the month when verified ACTIVE or WON_BACK. */
export function isBillable(outcome: VerificationFact['outcome']): boolean {
  return outcome === 'ACTIVE' || outcome === 'WON_BACK';
}

export function computeBillingRun(
  facts: VerificationFact[],
  rates: BillingRates,
): BillingRunResult {
  // Deterministic processing order regardless of input order.
  const billable = facts
    .filter((f) => isBillable(f.outcome))
    .sort((a, b) => (a.placementId < b.placementId ? -1 : a.placementId > b.placementId ? 1 : 0));

  const invoiceLines: InvoiceLine[] = [];
  const payoutLines: PayoutLine[] = [];
  for (const fact of billable) {
    const price = rates.pricePerActiveHeadPaise;
    invoiceLines.push({ placementId: fact.placementId, orgId: fact.orgId, amountPaise: price });
    if (fact.centreId) {
      // Floor division: the platform keeps the remainder paisa, never the ESM
      // being over-paid — and the rule is fixed, so recompute matches.
      const payout = (price * rates.esmShareBp) / BP_DENOMINATOR;
      payoutLines.push({ placementId: fact.placementId, centreId: fact.centreId, amountPaise: payout });
    }
  }
  return {
    invoiceLines,
    payoutLines,
    totals: {
      invoicedPaise: invoiceLines.reduce((a, l) => a + l.amountPaise, 0n),
      payoutPaise: payoutLines.reduce((a, l) => a + l.amountPaise, 0n),
    },
  };
}

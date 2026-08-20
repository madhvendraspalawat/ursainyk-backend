// @ursainyk/engine-billing — PURE functions only. Money is integer paise (bigint). No floats, ever.
// Contract (to implement): monthly verification results → contractor invoice lines + ESM payout lines.
// Splits use largest-remainder so parts always sum exactly. Ledger entries are append-only facts.
export {};

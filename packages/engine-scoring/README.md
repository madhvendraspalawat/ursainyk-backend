# @ergaxis/engine-scoring
Pure, deterministic scoring engine ("CIBIL-like" candidate score, 0–100, explainable).
Input: parsed/approved candidate profile + active scoring preset. Output: score + per-dimension breakdown.
Rules: no I/O; same input → same output; every published figure pinned in tests. Presets are data, not code.

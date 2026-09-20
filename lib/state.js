// state.js - spend ledger and run state. Every billable call lands here with its
// estimate beside its actual, so a row can be audited after the fact.
import { read, write } from './store.js';
import { ceiling } from './env.js';

export function recordSpend({ provider, route, model, label, usage = {}, usd, estimate_usd = null }) {
  const ledger = read('spend', { fresh: true });
  const row = {
    at: new Date().toISOString(),
    provider, route: route ?? null, model: model ?? null, label: label ?? null,
    usage: {
      input_tokens: usage.input_tokens ?? null,
      output_tokens: usage.output_tokens ?? null,
      cache_creation_input_tokens: usage.cache_creation_input_tokens ?? null,
      cache_read_input_tokens: usage.cache_read_input_tokens ?? null,
    },
    estimate_usd,
    usd: Math.round(usd * 1e6) / 1e6,
  };
  ledger.rows.push(row);
  ledger.totals.usd = Math.round(ledger.rows.reduce((a, r) => a + r.usd, 0) * 1e6) / 1e6;
  ledger.totals.calls = ledger.rows.length;
  write('spend', ledger);
  return row;
}

export function spentSoFar() {
  return read('spend', { fresh: true }).totals.usd ?? 0;
}

export class CeilingError extends Error {
  constructor(msg, detail) { super(msg); this.name = 'CeilingError'; this.detail = detail; }
}

// Nothing spends without an estimate first, and nothing spends past the ceiling.
export function assertWithinCeiling(estimateUsd) {
  const cap = ceiling();
  const spent = spentSoFar();
  if (spent + estimateUsd > cap) {
    throw new CeilingError(
      `this run would spend $${estimateUsd.toFixed(4)} on top of $${spent.toFixed(4)} already spent, past the $${cap.toFixed(2)} ceiling`,
      { spent, estimate: estimateUsd, ceiling: cap },
    );
  }
  return { spent, estimate: estimateUsd, ceiling: cap, headroom: cap - spent - estimateUsd };
}

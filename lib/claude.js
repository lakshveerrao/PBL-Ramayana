// claude.js - the text provider. The only place the Anthropic SDK is touched.
import Anthropic from '@anthropic-ai/sdk';
import { env } from './env.js';
import { modelFor, priceOf } from './cost.js';
import { assertNoRestrictedText } from './sources.js';
import { recordSpend } from './state.js';

let client = null;
function getClient() {
  const key = env('ANTHROPIC_API_KEY');
  if (!key) throw new Error('ANTHROPIC_API_KEY is not set. Run npm run preflight.');
  if (!client) client = new Anthropic({ apiKey: key });
  return client;
}

// The system block never varies between films. Keeping it byte-stable is what makes
// the cache hit; anything film-specific belongs in the user turn, after the breakpoint.
export function systemBlock(agentPrompt) {
  return [{ type: 'text', text: agentPrompt, cache_control: { type: 'ephemeral' } }];
}

export async function call({ route, system, user, max_tokens = 8000, schema = null, label = 'call' }) {
  const model = modelFor(route);

  // The rights gate sits in front of every outbound payload, not just exports.
  assertNoRestrictedText({ system, user }, `anthropic ${route} payload`);

  const req = {
    model,
    max_tokens,
    system: systemBlock(system),
    messages: [{ role: 'user', content: user }],
  };
  if (schema) req.output_config = { format: { type: 'json_schema', schema } };

  const res = await getClient().messages.create(req);

  if (res.stop_reason === 'refusal') {
    const err = new Error(`model refused: ${res.stop_details?.category ?? 'unknown'}`);
    err.stop_details = res.stop_details;
    throw err;
  }

  const price = priceOf(model, res.usage ?? {});
  recordSpend({ provider: 'anthropic', route, model, label, usage: res.usage ?? {}, usd: price.usd });

  const text = (res.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  return { text, usage: res.usage ?? {}, price, model, stop_reason: res.stop_reason, raw: res };
}

export async function ping() {
  const key = env('ANTHROPIC_API_KEY');
  if (!key) return { ok: false, reason: 'no key set', detail: 'ANTHROPIC_API_KEY is empty in .env' };
  try {
    // Cheapest possible real call: one token out on the cheapest model.
    const res = await getClient().messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 1,
      messages: [{ role: 'user', content: 'hi' }],
    });
    const price = priceOf('claude-haiku-4-5', res.usage ?? {});
    return { ok: true, reason: 'reachable, key valid', detail: `one token, $${price.usd.toFixed(6)}` };
  } catch (e) {
    return { ok: false, reason: classify(e), detail: e.message.slice(0, 200) };
  }
}

function classify(e) {
  if (e instanceof Anthropic.AuthenticationError) return 'key rejected';
  if (e instanceof Anthropic.RateLimitError) return 'rate limited';
  if (e instanceof Anthropic.APIConnectionError) return 'host unreachable';
  if (e instanceof Anthropic.APIError) return `api error ${e.status}`;
  return 'failed';
}

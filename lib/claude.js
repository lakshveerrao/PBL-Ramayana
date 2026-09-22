// claude.js - the text provider. The only place the Anthropic SDK is touched.
import Anthropic from '@anthropic-ai/sdk';
import { env } from './env.js';
import { modelFor, priceOf } from './cost.js';
import { assertNoRestrictedText } from './sources.js';
import { recordSpend } from './state.js';

// PBL_ANTHROPIC_API_KEY first, and deliberately.
//
// Anthropic is the one provider an environment API credential cannot serve:
// api.anthropic.com is on the proxy's never-attach list, alongside the package
// registries, and it sits in this environment's NO_PROXY. So the key has to arrive as
// an environment variable instead.
//
// But ANTHROPIC_API_KEY is the variable Claude Code itself reads for its own model
// calls. Setting it on the cloud environment would put a second credential in front of
// the session's own auth, for the sake of a studio route. A distinct name keeps the
// studio's key to the studio. Plain ANTHROPIC_API_KEY still works as a fallback.
export function textKey() { return env('PBL_ANTHROPIC_API_KEY') || env('ANTHROPIC_API_KEY'); }

export const HOW_TO_SET_TEXT_KEY =
  'Set PBL_ANTHROPIC_API_KEY in the cloud environment\'s Environment variables '
  + '(claude.ai/code -> cloud icon -> edit the environment -> Environment variables), then start a new session: '
  + 'each session copies those values once, at startup. An API credential cannot work here - the agent proxy never '
  + 'attaches one to api.anthropic.com. Note that anyone who uses the environment can read a variable, which a '
  + 'credential would have avoided.';

let client = null;
function getClient() {
  const key = textKey();
  if (!key) throw new Error(`no Anthropic key. ${HOW_TO_SET_TEXT_KEY}`);
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
  const key = textKey();
  if (!key) {
    // Not a misconfiguration to fix silently. PRODUCTION_ORDERS §1 lists three API
    // credentials - OpenAI, fal, ElevenLabs - and Anthropic is not among them, and
    // api.anthropic.com sits in this environment's NO_PROXY, so no proxy credential
    // can be attached there either. §2's provider plan also names no text provider:
    // the films' words are authored in the package, and the Anthropic routes are for
    // direction and criticism. So this may be correct rather than broken.
    return {
      ok: false,
      reason: 'no key set (an API credential cannot serve this host)',
      detail: `${HOW_TO_SET_TEXT_KEY} PRODUCTION_ORDERS §2 names no text provider for Arc 7 - `
            + 'the words come from the package - so this is only needed for the direction and criticism routes '
            + '(lib/agents.js).',
    };
  }
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

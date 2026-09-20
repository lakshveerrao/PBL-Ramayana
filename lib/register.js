// register.js - the register check, offline.
//
// The register critic runs on Opus and costs money. This runs on nobody and costs
// nothing, and it catches the drift the critic would catch deterministically. Use it
// on every director round before paying for an opinion.
export const FAKE_EPIC = /\b(behold|lo|verily|thus|didst|thee|thy|thine|o king|hark|forsooth|smote|whence|hither|thither|nay|alas)\b/i;
export const TRANSLATION_REGISTER = /\b(rained upon|as water|did say|did go|there came|it came to pass|was as|like unto)\b/i;
export const MARKETING = /\b(epic|legendary|timeless|breathtaking|stunning|iconic|majestic|glorious|unforgettable|spectacular)\b/i;

export const REPORTING_VERB =
  /\b(said|says|told|asked|answered|replied|offered|refused|begged|pleaded|promised|swore|called|named|warned|admitted|claimed|insisted)\b/i;

export const MAX_WORDS = 12;

export function checkLine(id, text, { shot = null, speaker = null } = {}) {
  const findings = [];
  const push = (problem, suggestion) => findings.push({ line_id: id, shot, problem, quote: text, suggestion });

  if (!text || !text.trim()) { push('the line is empty', 'write it or drop the line'); return findings; }

  const m1 = text.match(FAKE_EPIC);
  if (m1) push(`fake-epic vocabulary: "${m1[0]}"`, 'say it the way you would say it aloud');

  const m2 = text.match(TRANSLATION_REGISTER);
  if (m2) push(`translation register: "${m2[0]}"`, 'this is the sound of a translation, not of speech');

  const m3 = text.match(MARKETING);
  if (m3) push(`marketing adjective: "${m3[0]}"`, 'the frame does the work; the adjective does not');

  const words = text.trim().split(/\s+/).length;
  if (words > MAX_WORDS) push(`${words} words, over the ${MAX_WORDS} word limit`, 'cut it to one clause');

  // A reported statement that has lost its speaker becomes narrator fact.
  // Speech-act verbs carry the attribution on their own: "he offered", "he refused"
  // report the act of speaking as much as "he said" does. A line with none of them
  // is narration, whoever it is credited to.
  if (speaker && !REPORTING_VERB.test(text)) {
    push(`attributed to ${speaker} but the line does not report it as speech`,
         `this is ${speaker}'s statement - the line must say so, or it becomes narrator fact`);
  }

  // Semicolons and subordinate stacking read as written-for-the-page.
  if ((text.match(/[;,]/g) ?? []).length >= 2) push('two or more internal breaks', 'short sentences. break it into two lines or cut');

  return findings;
}

export function checkNarration(narration) {
  const findings = [];
  for (const [id, n] of Object.entries(narration)) {
    findings.push(...checkLine(id, n.en ?? n.text ?? '', { shot: n.shot, speaker: n.speaker }));
  }
  return { verdict: findings.length ? 'fail' : 'pass', findings };
}

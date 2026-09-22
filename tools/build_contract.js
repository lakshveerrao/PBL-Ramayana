#!/usr/bin/env node
// build_contract - write CONTRACT.md from the importer's own lists.
//
// The studio's statement of what it needs from a graph used to live in HANDOFF.md.
// HANDOFF.md now arrives with the kit and is the kit's document, so the studio's half
// of the contract needs a home that cannot drift from the code that enforces it.
// Generated, never hand-edited: `node tools/build_contract.js`, checked by regress.
import { REQUIRED, OPTIONAL, READ_IF_PRESENT } from '../lib/graphcontract.js';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../lib/store.js';

export function contractText() {
  const req = Object.entries(REQUIRED).map(([name, keys]) =>
    `| \`${name}.json\` | ${keys.length ? keys.map((k) => `\`${k}\``).join(', ') : '_(shape not constrained)_'} |`);
  return `# CONTRACT — what the studio needs from a graph

**Generated from \`tools/import_graph.js\`. Do not hand-edit — run \`node tools/build_contract.js\`.**

\`HANDOFF.md\` is the package's document and describes what a kit contains. This is the
studio's half: the files \`node tools/import_graph.js <dir>\` requires before it will
install anything, and the top-level key each must carry. Nothing in the studio is
coupled to graph *content* — every invariant iterates over whatever is installed.

## Required — ${Object.keys(REQUIRED).length} files

| file | must carry |
|---|---|
${req.join('\n')}

## Optional — installed if present, and the studio copes without them

${OPTIONAL.map((o) => `- \`${o}.json\``).join('\n')}

## Read if present

These are not required, and the studio **does** read them when they are there. They were
warned about as unused for as long as it took someone to open \`render_policy.json\` and
find \`"reference-conditioned; never text-only"\` sitting unread while the renderer
generated text-only.

${READ_IF_PRESENT.map((o) => `- \`${o}.json\``).join('\n')}

## Installing

\`\`\`bash
node tools/import_graph.js <dir>            # check, change nothing
node tools/import_graph.js <dir> --install  # back up to .graph-backups/, then replace
npm run validate && npm run regress
\`\`\`
`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  writeFileSync(join(ROOT, 'CONTRACT.md'), contractText(), 'utf8');
  console.log(`\n  CONTRACT.md written: ${Object.keys(REQUIRED).length} required, ${OPTIONAL.length} optional, ${READ_IF_PRESENT.length} read-if-present\n`);
}

# CONTRACT — what the studio needs from a graph

**Generated from `tools/import_graph.js`. Do not hand-edit — run `node tools/build_contract.js`.**

`HANDOFF.md` is the package's document and describes what a kit contains. This is the
studio's half: the files `node tools/import_graph.js <dir>` requires before it will
install anything, and the top-level key each must carry. Nothing in the studio is
coupled to graph *content* — every invariant iterates over whatever is installed.

## Required — 20 files

| file | must carry |
|---|---|
| `films.json` | `films` |
| `claims.json` | `claims` |
| `entities.json` | `entities` |
| `locks.json` | `locks` |
| `sheets.json` | `sheets` |
| `memos.json` | `memos` |
| `passages.json` | `passages` |
| `source_register.json` | `sources` |
| `kandas.json` | `kandas` |
| `episodes.json` | `episodes` |
| `material_world.json` | _(shape not constrained)_ |
| `typography.json` | `scripts` |
| `grade.json` | _(shape not constrained)_ |
| `effects.json` | `shots` |
| `transitions.json` | `joins` |
| `narrator.json` | `languages` |
| `music.json` | _(shape not constrained)_ |
| `evidence_libraries.json` | `libraries` |
| `traditions.json` | `traditions` |
| `spend.json` | `rows` |

## Optional — installed if present, and the studio copes without them

- `threads.json`
- `incidents.json`
- `app_design.json`

## Read if present

These are not required, and the studio **does** read them when they are there. They were
warned about as unused for as long as it took someone to open `render_policy.json` and
find `"reference-conditioned; never text-only"` sitting unread while the renderer
generated text-only.

- `render_policy.json`
- `seed_policy.json`
- `rights_policy.json`
- `restricted_index.json`

## Installing

```bash
node tools/import_graph.js <dir>            # check, change nothing
node tools/import_graph.js <dir> --install  # back up to .graph-backups/, then replace
npm run validate && npm run regress
```

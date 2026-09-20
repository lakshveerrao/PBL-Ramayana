# This graph is SCAFFOLD

**It is not the Rāmāyaṇa graph.** It exists so the studio could be built and proven end
to end before the real graph arrived.

What is here: 7 films, 1 of them directed (M3, *A Father Says No*), 18 claims, 5
entities, and enough of the material world, typography, grade and effects to drive a real
cut. Every accepted claim carries `text_consulted: false`, because no digitised edition
was reachable when it was written — the record says so rather than implying otherwise.

**Replace it.** See `HANDOFF.md` for the contract, then:

```bash
node tools/import_graph.js <path-to-graph>            # check, change nothing
node tools/import_graph.js <path-to-graph> --install  # back up, then replace
npm run validate && node tools/regress.js
```

The importer backs this up to `data/_replaced/<timestamp>/` and deletes this file.

## The studio does not depend on anything in here

Proven, not asserted. The studio was run end to end against a second, completely
different graph — Ayodhyā-kāṇḍa, two films, different entities, 30-second films instead
of 44, and **Tamil** instead of Hindi and Telugu. Everything worked untouched: 120
invariants, the gates, the prompt assembly, the grade, the Tamil conjunct measurement,
the packets, both generated views, the rights-gated export, and two finished cuts at
900 frames each.

`tools/regress.js` runs against the frozen fixture in `tools/fixtures/graph/`, never
against `data/`, so the regressions stay meaningful whatever graph is installed.

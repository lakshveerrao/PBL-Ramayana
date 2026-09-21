# Installed graph — pbl-source-state v1.0.6

Installed 21 September 2026 from the Arc 7 studio kit.

- MANIFEST `20aeb6ccd1442311ed94aa855ff08f51102e38055cb3fb6af258ebf963020e65` — verified
- All 47 package files verified against the manifest; **0 differ**
- 10 films (7 directed), 46 claims (35 accepted), 54 entities, 295 registered beats
- Arc 7: 134 shots, 89 to generate, 45 reuse/crop, 55 narration units, 299.7 s

## This package is FROZEN

Never edit anything in here. The studio adapts to the package, not the reverse — see
`lib/graph.js`, which presents a canonical view of whatever graph is installed so that
no package file has to be reshaped to fit the studio's assumptions.

Every file here is byte-identical to the kit, `films.json` included. The studio resolves
`films[].treatment` ("treatments/M1.json") against the graph directory, so the package's
own relative paths work unedited — and the package's `contradictions.py` still runs
against `data/` unchanged.

To report a defect: the shot or line, what the package says, what is wrong, and the
evidence. A real defect becomes 1.0.7 with a migration note. A preference becomes a
change in the directing packs, not the package.

## Replacing it

```bash
node tools/import_graph.js <path-to-graph>            # check, change nothing
node tools/import_graph.js <path-to-graph> --install  # back up, then replace
npm run validate && node tools/regress.js
```

Backups go to `.graph-backups/<timestamp>/` — **outside** `data/`, so a previous graph
never contaminates a tool that scans the graph directory.

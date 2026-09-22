# The package's own tools

Shipped inside pbl-source-state v1.0.6 and kept here rather than in `data/`, so that
`data/` stays byte-identical to the package's JSON and the importer's backup never
touches them. PRODUCTION_ORDERS §7 requires `contradictions.py` to pass before assembly.

They read the graph. Point them at `data/`:

```bash
python3 tools/package/contradictions.py data
```

`MANIFEST.sha256` is the package's own checksum list, for verifying `data/` by hand.

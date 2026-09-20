# corpus/

**This directory holds no text, and that is deliberate.**

The Sanskrit source the claims cite (GRETIL's digitisation of the Valmiki Ramayana) is
CC BY-NC-SA. Its verse text must never enter a public payload, a generation input, or an
export. Locators travel; text does not. Claims verified against it remain valid -
verification is not redistribution.

The public-domain translation (Manmatha Nath Dutt, 1891) *could* live here. It does not,
because this environment's egress policy blocks the hosts that carry it. `tools/ingest.js`
will place it here when a machine that can reach those hosts runs it.

`tools/validate.js` fails if a `.txt`, `.xml` or `.tei` file appears in this directory, so
that restricted text cannot be committed by accident.

## What this means for the claims

Every accepted claim in `data/claims.json` carries a verification record with
`text_consulted: false`, because no digitised edition was open when it was checked. That
is recorded honestly rather than papered over, and the Ledger prints it verbatim. When a
text is ingested, re-running the claim verifier will replace those records with checks
where `text_consulted` is `true`.

#!/usr/bin/env python3
"""build_graph - data/ -> graph/index.html

The graph pages are VIEWS. They are generated from data/ and can never drift, because
nothing is written here by hand. Every generated file carries a banner, and
tools/validate.js fails if a graph page loses it.
"""
import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import _graph as G

import json, pathlib, html, datetime

ROOT = pathlib.Path(__file__).resolve().parent.parent
D = ROOT / "data"

def load(name):
    return G.load(name)

def esc(s):
    return html.escape(str(s))

BANNER = "GENERATED FILE - built by tools/build_graph.py from data/. Never hand-edit. Edit data/, then rebuild."

CSS = """
:root{--bg:#141210;--panel:#1c1917;--line:#2e2a26;--ink:#e8e0d4;--dim:#9a8f81;--warm:#c9a227;--stop:#b4523f;--go:#6f8f5a}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;padding:0 0 60px}
header{border-bottom:1px solid var(--line);padding:20px 26px;position:sticky;top:0;background:var(--bg);z-index:5}
h1{font-size:15px;margin:0;letter-spacing:.05em}
main{padding:24px 26px;max-width:1080px}
section{background:var(--panel);border:1px solid var(--line);border-radius:4px;padding:16px 18px;margin:0 0 16px}
h2{font-size:12px;text-transform:uppercase;letter-spacing:.12em;color:var(--dim);margin:0 0 12px}
table{width:100%;border-collapse:collapse}
td,th{text-align:left;padding:6px 12px 6px 0;border-bottom:1px solid var(--line);vertical-align:top}
th{color:var(--dim);font-weight:500;font-size:12px}
tr:last-child td{border-bottom:0}
.ok{color:var(--go)}.no{color:var(--stop)}.w{color:var(--warm)}.d{color:var(--dim)}
.pill{border:1px solid var(--line);border-radius:10px;padding:1px 9px;font-size:11px;color:var(--dim);white-space:nowrap}
.note{color:var(--dim);font-size:12px;margin:10px 0 0}
.cls{display:inline-block;width:22px;text-align:center;border-radius:3px;font-size:11px;border:1px solid var(--line)}
.T{color:#e8e0d4}.Tr{color:#c9a227}.I{color:#7fa3c9}.S{color:#b48fc9}
"""

CLASS_MEANING = {
    "T": "text - the spine",
    "Tr": "a named tradition - never promoted to Text",
    "I": "an inference - names what it is inferred from",
    "S": "our staging - declared as ours",
}

def build():
    films = load("films"); claims = load("claims"); sheets = load("sheets")
    memos = load("memos"); ents = load("entities"); eps = load("episodes")
    srcs = load("source_register")

    rows = []
    for f in films["films"]:
        fc = [c for c in claims["claims"] if c.get("film") == f["id"]]
        acc = sum(1 for c in fc if c["state"] == "accepted")
        rows.append(
            f'<tr><td>{esc(f["id"])}</td><td>{esc(G.title_en(f))}</td>'
            f'<td class="d">{esc(f["kanda"])} {esc(f.get("sarga", ""))}</td>'
            f'<td>{esc(G.film_status(f))}</td>'
            f'<td class="d">{acc} accepted / {len(fc)} claims</td>'
            f'<td class="{"ok" if f.get("treatment") else "d"}">{"directed" if f.get("treatment") else "-"}</td></tr>'
        )

    claim_rows = []
    for c in sorted(claims["claims"], key=lambda x: x["id"]):
        v = c.get("verification") or {}
        loc = c.get("locator")
        where = f'{loc["kanda"]} {loc["sarga"]}.{loc["verses"]}' if loc else "-"
        state_cls = {"accepted": "ok", "proposed": "w", "disputed": "no", "unresolved": "d"}[c["state"]]
        basis = v.get("basis") or ""
        method = v.get("method", "none")
        consulted = v.get("text_consulted")
        if c["state"] == "accepted":
            # The Ledger never implies human review. It prints the method verbatim.
            stamp = f'{method}, text consulted: {"yes" if consulted else "no"}'
        else:
            stamp = "-"
        claim_rows.append(
            f'<tr><td><span class="cls {c["evidence_class"]}">{c["evidence_class"]}</span></td>'
            f'<td class="d">{esc(c["id"])}</td><td>{esc(c["text"])}</td>'
            f'<td class="d">{esc(c.get("speaker") or "-")}</td>'
            f'<td class="d">{esc(where)}</td>'
            f'<td class="{state_cls}">{esc(c["state"])}</td>'
            f'<td class="d">{esc(stamp)}</td></tr>'
        )
        if basis:
            claim_rows.append(f'<tr><td></td><td colspan="6" class="d" style="padding-top:0;border-bottom:1px solid var(--line)">{esc(basis)}</td></tr>')

    sheet_rows = "".join(
        f'<tr><td>{esc(s["id"])}</td><td>{len(s["files"])}</td>'
        f'<td class="{"ok" if s["approved"] else "no"}">{"yes" if s["approved"] else "no"}</td>'
        f'<td class="d">{esc(s.get("approved_by") or "-")}</td>'
        f'<td class="w">{esc(", ".join(G.sheet_axes(s)[1]) or "none")}</td></tr>'
        for s in sheets["sheets"])

    memo_rows = "".join(
        f'<tr><td class="no">{esc(m["entity"])}</td><td class="d">{esc(G.memo_reason(m))}</td></tr>'
        for m in memos["memos"] if m["state"] == "outstanding")

    src_rows = "".join(
        f'<tr><td class="d">{esc(s["id"])}</td><td>{esc(s["edition"])}</td>'
        f'<td class="{"no" if s.get("restricted") else "ok"}">{esc(s["licence"])}</td>'
        f'<td class="d">{"locators only" if not s.get("text_may_travel") else "text may travel"}</td></tr>'
        for s in srcs["sources"])

    legend = " ".join(
        f'<span class="pill"><span class="cls {k}">{k}</span> {esc(v)}</span>' for k, v in CLASS_MEANING.items())

    doc = f"""<!doctype html>
<!-- {BANNER} -->
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>PBL Ramayana - graph</title><style>{CSS}</style></head><body>
<header><h1>PBL RAMAYANA / GRAPH</h1>
<div class="note">{esc(BANNER)} Built {datetime.date.today().isoformat()}.</div></header>
<main>
<section><h2>Films</h2><table>
<tr><th>id</th><th>title</th><th>place</th><th>status</th><th>claims</th><th>treatment</th></tr>
{"".join(rows)}</table></section>

<section><h2>Claims</h2>
<div class="note" style="margin:0 0 12px">{legend}</div>
<table><tr><th></th><th>id</th><th>claim</th><th>speaker</th><th>locator</th><th>state</th><th>how it was accepted</th></tr>
{"".join(claim_rows)}</table>
<p class="note"><b>accepted</b> means an AI-assisted passage check has been recorded. It is not qualified human
review. Where a check was made without a digitised edition open, the row says so.</p></section>

<section><h2>Model sheets</h2><table>
<tr><th>principal</th><th>files</th><th>approved</th><th>by</th><th>axes outstanding</th></tr>
{sheet_rows}</table>
<p class="note">The twenty-frame test is identity evidence across four axes, not twenty paid generations.</p></section>

<section><h2>Entities with an outstanding memo</h2><table>
<tr><th>entity</th><th>why it is written before it is drawn</th></tr>
{memo_rows}</table></section>

<section><h2>Sources</h2><table>
<tr><th>id</th><th>edition</th><th>licence</th><th>what may travel</th></tr>
{src_rows}</table>
<p class="note">A restricted source may be cited by locator anywhere. Its text never enters a payload, a
generation input, or an export. Verification against it stays valid - verification is not redistribution.</p></section>
</main></body></html>
"""
    out = ROOT / "graph" / "index.html"
    out.write_text(doc)
    print(f"graph/index.html  {len(doc)} bytes  {len(films['films'])} films, {len(claims['claims'])} claims, {len(eps['episodes'])} episodes")

if __name__ == "__main__":
    build()

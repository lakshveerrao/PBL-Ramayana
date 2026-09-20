#!/usr/bin/env python3
"""build_brain - data/ -> graph/brain.html

One node per sarga across all seven kandas, derived from data/kandas.json. A node is
grey unless data/episodes.json names a beat for it, and a grey node says what it is
when you click it: a place in the text, not an authored film. Nothing here is invented -
the node count is the sarga count.
"""
import json, pathlib, html, datetime

ROOT = pathlib.Path(__file__).resolve().parent.parent
D = ROOT / "data"
load = lambda n: json.loads((D / f"{n}.json").read_text())
esc = lambda s: html.escape(str(s))

BANNER = "GENERATED FILE - built by tools/build_brain.py from data/. Never hand-edit. Edit data/, then rebuild."

def build():
    kandas = load("kandas")["kandas"]
    eps = load("episodes")
    films = {f["id"]: f for f in load("films")["films"]}
    grey_copy = eps["grey_node_copy"]

    by_sarga = {}
    for e in eps["episodes"]:
        by_sarga.setdefault((e["kanda"], e["sarga"]), []).append(e)

    nodes, authored, grey = [], 0, 0
    for k in kandas:
        cells = []
        for s in range(1, k["sargas"] + 1):
            here = by_sarga.get((k["id"], s), [])
            auth = [e for e in here if e.get("authored")]
            if auth:
                authored += 1
                e = auth[0]
                film = films.get(e.get("film") or "", {})
                title = film.get("title_en", e["name"])
                cells.append(
                    f'<i class="n a" data-t="{esc(k["name"])} {s} &mdash; {esc(title)} ({esc(e.get("film") or "")})">{s}</i>')
            else:
                grey += 1
                blocked = any(e.get("design_block") for e in here)
                name = here[0]["name"] if here else None
                tip = f'{esc(k["name"])} {s}'
                tip += f' &mdash; {esc(name)}' if name else ''
                tip += f' &mdash; {esc(grey_copy)}'
                if blocked:
                    tip += ' This beat involves an entity whose memo is outstanding and may not be designed.'
                cells.append(f'<i class="n{" b" if blocked else ""}" data-t="{tip}">{s}</i>')
        nodes.append(
            f'<section><h2>{esc(k["name"])} <span class="pill">{k["sargas"]} sargas</span> '
            f'<span class="pill">{esc(k["status"])}</span></h2>'
            + (f'<p class="note">{esc(k["note"])}</p>' if k.get("note") else '')
            + f'<div class="grid">{"".join(cells)}</div></section>')

    total = authored + grey
    doc = f"""<!doctype html>
<!-- {BANNER} -->
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>PBL Ramayana - brain</title><style>
:root{{--bg:#141210;--panel:#1c1917;--line:#2e2a26;--ink:#e8e0d4;--dim:#9a8f81;--warm:#c9a227;--stop:#b4523f}}
*{{box-sizing:border-box}}
body{{margin:0;background:var(--bg);color:var(--ink);font:14px/1.6 ui-monospace,Menlo,monospace;padding:0 0 80px}}
header{{border-bottom:1px solid var(--line);padding:20px 26px}}
h1{{font-size:15px;margin:0;letter-spacing:.05em}}
main{{padding:24px 26px;max-width:1080px}}
section{{background:var(--panel);border:1px solid var(--line);border-radius:4px;padding:16px 18px;margin:0 0 14px}}
h2{{font-size:12px;text-transform:uppercase;letter-spacing:.1em;color:var(--dim);margin:0 0 12px}}
.grid{{display:flex;flex-wrap:wrap;gap:3px}}
.n{{width:26px;height:22px;line-height:22px;text-align:center;font-size:10px;font-style:normal;
   background:#211e1a;color:#6b6259;border:1px solid var(--line);border-radius:2px;cursor:pointer}}
.n:hover{{border-color:var(--warm)}}
.n.a{{background:#3a3118;color:var(--warm);border-color:#5a4a20}}
.n.b{{border-color:#5a2f26;color:#8a5347}}
.pill{{border:1px solid var(--line);border-radius:10px;padding:1px 9px;font-size:11px;color:var(--dim)}}
.note{{color:var(--dim);font-size:12px;margin:0 0 10px}}
#tip{{position:fixed;left:0;right:0;bottom:0;background:#0f0d0b;border-top:1px solid var(--line);
     padding:12px 26px;color:var(--dim);font-size:12px;min-height:42px}}
</style></head><body>
<header><h1>PBL RAMAYANA / BRAIN</h1>
<div class="note">{esc(BANNER)} Built {datetime.date.today().isoformat()}.</div>
<div style="margin-top:8px">
<span class="pill">{total} sargas</span>
<span class="pill" style="color:var(--warm)">{authored} authored</span>
<span class="pill">{grey} not authored</span></div></header>
<main>
<p class="note">One node per sarga. A grey node is a place in the text, not missing work &mdash;
nothing has been written for it and nothing is claimed. Click any node.</p>
{"".join(nodes)}
</main>
<div id="tip">Click a node.</div>
<script>
const tip=document.getElementById('tip');
document.querySelectorAll('.n').forEach(n=>{{
  const show=()=>tip.innerHTML=n.dataset.t;
  n.addEventListener('click',show); n.addEventListener('mouseenter',show);
}});
</script></body></html>
"""
    (ROOT / "graph" / "brain.html").write_text(doc)
    print(f"graph/brain.html  {len(doc)} bytes  {total} sarga nodes, {authored} authored, {grey} grey")

if __name__ == "__main__":
    build()

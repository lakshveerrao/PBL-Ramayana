#!/usr/bin/env python3
"""build_brain - data/ -> graph/brain.html

One node per sarga across all seven kandas, derived from data/kandas.json. A node is
grey unless data/episodes.json names a beat for it, and a grey node says what it is
when you click it: a place in the text, not an authored film. Nothing here is invented -
the node count is the sarga count.
"""
import json, pathlib, html, datetime
import sys; sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import _graph as G

ROOT = pathlib.Path(__file__).resolve().parent.parent
D = ROOT / "data"
load = G.load
esc = lambda s: html.escape(str(s))

BANNER = "GENERATED FILE - built by tools/build_brain.py from data/. Never hand-edit. Edit data/, then rebuild."

def build():
    kandas = load("kandas")["kandas"]
    eps = load("episodes")["episodes"]
    films_doc = load("films")
    films = {f["id"]: f for f in films_doc["films"]}
    arcs = films_doc.get("arcs", []) or load("kandas").get("arcs", [])
    # An arc may be registered on its kanda and again in films.json. Same arc, one node.
    arcs_by_kanda = {}
    for k in kandas:
        for a in (k.get("arcs") or []):
            arcs_by_kanda.setdefault(k["id"], {}).setdefault(
                a.get("id") if isinstance(a, dict) else a, a)
    for a in arcs:
        if not a.get("kanda"):
            continue
        arcs_by_kanda.setdefault(a["kanda"], {}).setdefault(a.get("id"), a)
    arcs_by_kanda = {k: list(v.values()) for k, v in arcs_by_kanda.items()}

    grey_copy = G.grey_node_copy()
    by_arc = {}
    for e in eps:
        by_arc.setdefault((e.get("kanda"), e.get("arc")), []).append(e)

    sections, authored, grey = [], 0, 0
    for k in kandas:
        kid = k["id"]
        kname = k.get("name") or kid
        blocks = []
        seen = set()
        for a in arcs_by_kanda.get(kid, []):
            aid = a.get("id") if isinstance(a, dict) else a
            seen.add(aid)
            here = by_arc.get((kid, aid), [])
            cells = []
            for e in sorted(here, key=lambda x: x.get("n") or 0):
                name = G.episode_name(e)
                film = films.get(e.get("film") or "")
                if e.get("authored") or film:
                    authored += 1
                    title = G.title_en(film) if film else name
                    cells.append(f'<i class="n a" data-t="{esc(kname)} &middot; {esc(aid)} &mdash; {esc(title)}">{esc(e.get("n") or "")}</i>')
                else:
                    grey += 1
                    cells.append(f'<i class="n" data-t="{esc(kname)} &middot; {esc(aid)} &mdash; {esc(name)} &mdash; {esc(grey_copy)}">{esc(e.get("n") or "")}</i>')
            if not cells:
                continue
            atitle = a.get("title") if isinstance(a, dict) else aid
            blocks.append(f'<div class="arc"><b>{esc(aid)}</b> <span class="d">{esc(atitle or "")}</span>'
                          f'<div class="grid">{"".join(cells)}</div></div>')
        # Episodes in this kanda that sit in no registered arc.
        for (ekid, aid), here in by_arc.items():
            if ekid != kid or aid in seen:
                continue
            cells = []
            for e in sorted(here, key=lambda x: x.get("n") or 0):
                grey += 1
                cells.append(f'<i class="n" data-t="{esc(kname)} &middot; {esc(aid or "unplaced")} &mdash; {esc(G.episode_name(e))} &mdash; {esc(grey_copy)}">{esc(e.get("n") or "")}</i>')
            blocks.append(f'<div class="arc"><b>{esc(aid or "unplaced")}</b><div class="grid">{"".join(cells)}</div></div>')

        note = k.get("sargas_note") or ""
        registered = k.get("registered") or ""
        sections.append(
            f'<section><h2>{esc(kname)}'
            + (f' <span class="pill">{esc(k.get("devanagari",""))}</span>' if k.get("devanagari") else '')
            + (f' <span class="pill">registered {esc(registered)}</span>' if registered else '')
            + '</h2>'
            + (f'<p class="note">{esc(note)}</p>' if note else '')
            + ("".join(blocks) if blocks else '<p class="note">No beats registered in this kāṇḍa yet.</p>')
            + '</section>')

    total = authored + grey
    doc = f"""<!doctype html>
<!-- {BANNER} -->
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>PBL Ramayana - brain</title><style>
:root{{--bg:#141210;--panel:#1c1917;--line:#2e2a26;--ink:#e8e0d4;--dim:#9a8f81;--warm:#c9a227}}
*{{box-sizing:border-box}}
body{{margin:0;background:var(--bg);color:var(--ink);font:14px/1.6 ui-monospace,Menlo,monospace;padding:0 0 80px}}
header{{border-bottom:1px solid var(--line);padding:20px 26px}}
h1{{font-size:15px;margin:0;letter-spacing:.05em}}
main{{padding:24px 26px;max-width:1080px}}
section{{background:var(--panel);border:1px solid var(--line);border-radius:4px;padding:16px 18px;margin:0 0 14px}}
h2{{font-size:12px;text-transform:uppercase;letter-spacing:.1em;color:var(--dim);margin:0 0 12px}}
.arc{{margin:0 0 12px}}
.grid{{display:flex;flex-wrap:wrap;gap:3px;margin-top:5px}}
.n{{min-width:26px;height:22px;line-height:22px;text-align:center;font-size:10px;font-style:normal;padding:0 4px;
   background:#211e1a;color:#6b6259;border:1px solid var(--line);border-radius:2px;cursor:pointer}}
.n:hover{{border-color:var(--warm)}}
.n.a{{background:#3a3118;color:var(--warm);border-color:#5a4a20}}
.pill{{border:1px solid var(--line);border-radius:10px;padding:1px 9px;font-size:11px;color:var(--dim)}}
.note{{color:var(--dim);font-size:12px;margin:0 0 10px}}
.d{{color:var(--dim)}}
#tip{{position:fixed;left:0;right:0;bottom:0;background:#0f0d0b;border-top:1px solid var(--line);
     padding:12px 26px;color:var(--dim);font-size:12px;min-height:42px}}
</style></head><body>
<header><h1>PBL RAMAYANA / BRAIN</h1>
<div class="note">{esc(BANNER)} Built {datetime.date.today().isoformat()}.</div>
<div style="margin-top:8px">
<span class="pill">{total} registered beats</span>
<span class="pill" style="color:var(--warm)">{authored} authored</span>
<span class="pill">{grey} not authored</span></div></header>
<main>
<p class="note">One node per registered beat, grouped by arc. <b>No node per sarga:</b> this project does
not assert a sarga count for any k&#0257;&#07745;&#0803;a &mdash; counts differ between editions and none has been
established here. A grey node is a registered beat with nothing written for it, and nothing claimed.</p>
{"".join(sections)}
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
    print(f"graph/brain.html  {len(doc)} bytes  {total} registered beats, {authored} authored, {grey} grey")
    print("  no sarga counts asserted - the package deliberately does not establish them")


if __name__ == "__main__":
    build()

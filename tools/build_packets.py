#!/usr/bin/env python3
"""build_packets - treatments -> packets/<FILM>/

A packet is what a production person is handed. It is generated, never hand-edited:
packet.json, shotlist.csv, prompts.txt, subtitles.{en,hi,te}.srt, and a stems/ folder
with one brief per department.

Prompts are assembled by lib/prompt.js, so this shells out to node rather than
reimplementing assembly in Python - two assemblers would drift.
"""
import json, pathlib, csv, subprocess, datetime, io

ROOT = pathlib.Path(__file__).resolve().parent.parent
load = lambda n: json.loads((ROOT / "data" / f"{n}.json").read_text())
BANNER = "GENERATED - built by tools/build_packets.py. Never hand-edit. Edit data/ or the treatment, then rebuild."

STEMS = ["picture", "sound", "music", "voice", "subtitles", "edit", "canon", "effects"]

def node_json(expr):
    r = subprocess.run(["node", "--input-type=module", "-e", expr],
                       cwd=ROOT, capture_output=True, text=True)
    if r.returncode != 0:
        raise SystemExit(f"node failed:\n{r.stderr}")
    return json.loads(r.stdout)

def srt_time(s):
    ms = round(s * 1000)
    return f"{ms//3600000:02d}:{(ms%3600000)//60000:02d}:{(ms%60000)//1000:02d},{ms%1000:03d}"

def build(film_id):
    films = load("films")["films"]
    film = next(f for f in films if f["id"] == film_id)
    if not film.get("treatment"):
        return None
    t = json.loads((ROOT / film["treatment"]).read_text())

    out = ROOT / "packets" / film_id
    (out / "stems").mkdir(parents=True, exist_ok=True)

    # Prompts and the gate, both from the real modules.
    data = node_json(f"""
      import {{ assemble }} from './lib/prompt.js';
      import {{ checkFilm }} from './lib/consistency.js';
      import {{ treatment, read }} from './lib/store.js';
      import {{ estimate }} from './lib/render.js';
      import {{ srt, burnPlan }} from './lib/subtitle.js';
      const t = treatment('{film_id}');
      const prompts = {{}};
      for (const s of t.shots) {{
        if (s.source !== 'generate') continue;
        try {{ prompts[s.id] = assemble(s, '{film_id}').prompt; }}
        catch (e) {{ prompts[s.id] = 'REFUSED: ' + e.message; }}
      }}
      const subs = {{}};
      for (const l of Object.keys(read('narrator').languages)) subs[l] = srt(t, l);
      console.log(JSON.stringify({{ prompts, gate: checkFilm(t.shots), estimate: estimate('{film_id}'), subs }}));
    """)

    gate_by_shot = {r["shot"]: r for r in data["gate"]["results"]}
    claims = {c["id"]: c for c in load("claims")["claims"]}
    effects = load("effects")

    # packet.json
    packet = {
        "_generated": BANNER,
        "built": datetime.date.today().isoformat(),
        "film": film_id,
        "story_id": film["story_id"],
        "title": {k[len("title_"):]: v for k, v in film.items() if k.startswith("title_")},
        "duration_s": t["duration_s"], "fps": t["fps"], "frame": t["frame"],
        "shots": len(t["shots"]),
        "to_generate": sum(1 for s in t["shots"] if s["source"] == "generate"),
        "estimate_usd": data["estimate"]["usd"],
        "gate": {"allowed": data["gate"]["allowed"], "blocked": data["gate"]["blocked"], "of": data["gate"]["total"]},
        "claims": [
            {"id": c, "class": claims[c]["evidence_class"], "state": claims[c]["state"],
             "speaker": claims[c].get("speaker"),
             "locator": claims[c].get("locator"), "text": claims[c]["text"]}
            for c in sorted({c for s in t["shots"] for c in s.get("claims", [])})
        ],
    }
    (out / "packet.json").write_text(json.dumps(packet, indent=2, ensure_ascii=False) + "\n")

    # shotlist.csv
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["shot", "start_s", "duration_s", "frames", "size", "lens_mm", "height",
                "camera_move", "expression", "source", "reuse_of", "entities", "claims",
                "narration", "motion", "gate"])
    for s in t["shots"]:
        fx = effects["shots"].get(s["id"], {})
        w.writerow([
            s["id"], s["start_s"], s["duration_s"], round(s["duration_s"] * t["fps"]),
            s["size"], s["lens_mm"], s["height"], s["camera_move"], s["expression"],
            s["source"], s.get("reuse_of") or s.get("crop_of") or "",
            " ".join(s.get("entities", [])), " ".join(s.get("claims", [])),
            s.get("narration") or "",
            "NO MOTION" if fx.get("motion") is False else ("motion" if fx.get("motion") else ""),
            "clear" if gate_by_shot[s["id"]]["allowed"] else "refused",
        ])
    (out / "shotlist.csv").write_text(buf.getvalue())

    # prompts.txt
    lines = [BANNER, "",
             "Prompts are ASSEMBLED from data/entities.json, data/material_world.json and",
             "data/locks.json by lib/prompt.js. They are never written by hand. If a frame",
             "comes back wrong, the fix is in the data.", ""]
    for sid, p in data["prompts"].items():
        lines += [f"--- {sid} " + "-" * (66 - len(sid)), p, ""]
    (out / "prompts.txt").write_text("\n".join(lines))

    # subtitles - one per language the graph declares
    for lang, body in data["subs"].items():
        (out / f"subtitles.{lang}.srt").write_text(body)

    # stems - one brief per department
    write_stems(out / "stems", film_id, film, t, data, effects)
    return packet

def write_stems(d, film_id, film, t, data, effects):
    n = load("narrator"); g = load("grade"); ty = load("typography")
    mu = load("music"); tr = load("transitions"); lk = load("locks")
    claims = {c["id"]: c for c in load("claims")["claims"]}

    def w(name, obj):
        (d / f"{name}.json").write_text(json.dumps(obj, indent=2, ensure_ascii=False) + "\n")

    w("picture", {"_generated": BANNER, "shots": [
        {"id": s["id"], "size": s["size"], "lens_mm": s["lens_mm"], "height": s["height"],
         "camera_move": s["camera_move"], "expression": s["expression"], "source": s["source"],
         "gate": "clear" if next(r for r in data["gate"]["results"] if r["shot"] == s["id"])["allowed"] else "refused"}
        for s in t["shots"]]})

    w("sound", {"_generated": BANNER, "room_tone": tr["room_tone"],
                "joins": [j for j in tr["joins"] if film_id in (j["from"], j["to"])],
                "rule": "One continuous bed across a continuous join. A reseat at the join is audible and is a defect."})

    w("music", {"_generated": BANNER, "provider": mu["provider"], "status": mu["status"],
                "brief": mu["brief"], "for_this_film": mu["brief"].get(film_id),
                "rule": mu["note"]})

    w("voice", {"_generated": BANNER, "settings": n["voice_settings"],
                "per_line_rule": n["per_line_rule"],
                "delivery": n["delivery_notes"].get(film_id),
                "languages": n["languages"],
                "lines": {k: v for k, v in t["narration"].items()}})

    w("subtitles", {"_generated": BANNER, "per_script": ty["scripts"], "style": ty["style"],
                    "rule": "Burned from ASS with PlayRes pinned to 1080x1920. An SRT with force_style is "
                            "scaled by libass against an assumed resolution and renders at roughly three "
                            "times the specified size."})

    w("edit", {"_generated": BANNER, "fps": t["fps"], "total_frames": round(t["duration_s"] * t["fps"]),
               "cuts": [{"at_frame": round(s["start_s"] * t["fps"]), "shot": s["id"],
                         "frames": round(s["duration_s"] * t["fps"])} for s in t["shots"]],
               "rule": "Timings are frame counts, not seconds. A 44s film that ends at 44.03s is a defect."})

    w("canon", {"_generated": BANNER,
                "claims": [{"id": c, "class": claims[c]["evidence_class"], "state": claims[c]["state"],
                            "speaker": claims[c].get("speaker"),
                            "attribution_note": claims[c].get("attribution_note"),
                            "locator": claims[c].get("locator"),
                            "verification": claims[c].get("verification")}
                           for c in sorted({c for s in t["shots"] for c in s.get("claims", [])})],
                "locks": [l for l in lk["locks"] if l.get("film") == film_id or l.get("film") is None],
                "rule": "A restricted source travels as a locator. Its text does not travel at all."})

    w("effects", {"_generated": BANNER,
                  "shots": {k: v for k, v in effects["shots"].items() if v["film"] == film_id},
                  "rejection_criteria": effects["rejection_criteria"],
                  "rule": "A shot marked NO MOTION refuses at the render layer, in code. It is not a note for the eye."})

if __name__ == "__main__":
    import sys
    ids = sys.argv[1:] or [f["id"] for f in load("films")["films"]]
    for i in ids:
        p = build(i)
        if p is None:
            print(f"{i}  no treatment - skipped (correct: an editor has not disposed)")
        else:
            print(f"{i}  {p['shots']} shots, {p['to_generate']} to generate, "
                  f"${p['estimate_usd']['total']:.4f}, gate {p['gate']['blocked']}/{p['gate']['of']} refused")

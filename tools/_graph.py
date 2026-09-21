"""_graph.py - the Python mirror of lib/graph.js.

The Node side and the Python side must agree on what a graph means, or a packet will
describe something the validator never saw. Keep these two in step.
"""
import json, os, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent


def data_dir():
    g = os.environ.get('PBL_GRAPH')
    return (ROOT / g) if g else (ROOT / 'data')


def load(name):
    return json.loads((data_dir() / f'{name}.json').read_text(encoding='utf-8'))


def treatment(film_id):
    """Resolve a treatment against the GRAPH directory first, then the repo root.

    A graph states its treatment paths relative to itself - the frozen package says
    "treatments/M1.json" - so its own files never need editing to fit our layout.
    """
    film = next((f for f in load('films')['films'] if f['id'] == film_id), None)
    if not film or not film.get('treatment'):
        return None
    for base in (data_dir(), ROOT):
        p = base / film['treatment']
        if p.exists():
            return json.loads(p.read_text(encoding='utf-8'))
    return None


def titles(film):
    """Titles in every language the film carries, however they are keyed."""
    out = {}
    for k, v in film.items():
        if k.startswith('title_'):
            out[k[len('title_'):]] = v
    if not out and film.get('title'):
        out['en'] = film['title']
    return out


def title_en(film):
    return titles(film).get('en') or film.get('title') or film['id']


def languages():
    return list(load('narrator').get('languages', {}))


def frame():
    f = load('typography').get('frame', {})
    w, h = f.get('width'), f.get('height')
    if (not w or not h) and isinstance(f.get('resolution'), str):
        import re
        m = re.search(r'(\d+)\s*[x×]\s*(\d+)', f['resolution'])
        if m:
            w, h = int(m.group(1)), int(m.group(2))
    fps = f.get('fps')
    if not fps:
        for film in load('films')['films']:
            t = treatment(film['id'])
            if t and t.get('fps'):
                fps = t['fps']
                break
    return {'width': w, 'height': h, 'fps': fps or 30}


def grey_node_copy():
    eps = load('episodes')
    return eps.get('grey_node_copy') or (
        'A named beat. Not an authored film yet. Nothing has been written for it '
        'and nothing is claimed.')


def memo_reason(m):
    return m.get('reason') or m.get('question') or m.get('why') or ''


def sheet_axes(sheet):
    axes = ['angle', 'lighting', 'distance', 'expression']
    tft = sheet.get('twenty_frame_test')
    if tft:
        return tft.get('evidence_held', []), tft.get('outstanding', [])
    a = sheet.get('axes')
    if isinstance(a, dict):
        return [x for x in axes if a.get(x) is True], [x for x in axes if a.get(x) is not True]
    return [], list(axes)


def film_of_shot_id(shot_id, films):
    import re
    m = re.match(r'^(\d+)-', str(shot_id))
    if not m:
        return None
    n = int(m.group(1))
    for f in films:
        if f.get('n') == n or f.get('order') == n:
            return f['id']
    return next((f['id'] for f in films if f['id'] == f'M{n}'), None)


def film_status(film):
    """A film's state, however the graph words it."""
    return film.get('status') or film.get('state') or (
        'directed' if film.get('treatment') else 'claims-only')


def episode_sarga(ep, arcs=None):
    """An episode may carry a sarga, or sit in an arc that spans a sarga range."""
    if ep.get('sarga') is not None:
        return ep['sarga']
    if arcs:
        arc = next((a for a in arcs if a.get('id') == ep.get('arc')), None)
        if arc and isinstance(arc.get('sargas'), list) and arc['sargas']:
            lo = arc['sargas'][0]
            n = ep.get('n')
            # A numbered beat inside an arc's span sits at lo + (n-1), bounded by hi.
            if isinstance(n, int) and len(arc['sargas']) > 1:
                return min(lo + n - 1, arc['sargas'][1])
            return lo
    return None


def episode_name(ep):
    return ep.get('name') or ep.get('title') or ep.get('id')

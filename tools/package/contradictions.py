#!/usr/bin/env python3
"""Cross-file contradiction test.

Runs over an EXPORTED bundle, not the source workspace. Reads every string in every
file and looks for the same proposition stated two incompatible ways.

ID resolution and schema checks cannot catch these. Every one of the classes below
was present in v1.0.0 while its validators were green.

    python3 tools/contradictions.py <bundle-dir>
"""
import json, re, sys, glob, os

B = sys.argv[1] if len(sys.argv) > 1 else '.'
S = {}
for f in glob.glob(f'{B}/**/*.json', recursive=True):
    S[os.path.relpath(f, B)] = open(f, encoding='utf-8').read()
ALL = '\n'.join(S.values())
J = lambda f: json.loads(S[f])
fail, ok = [], []


def check(name, bad):
    (fail if bad else ok).append((name, bad))


def where(pat, flags=0):
    out = []
    for f, t in S.items():
        if f == 'forensic_changelog.json':          # history may quote what it corrected
            continue
        for m in re.finditer(pat, t, flags):
            out.append(f"{f}: …{t[max(0, m.start() - 40):m.end() + 30]}…".replace('\n', ' '))
    return out


# 1 · incitement vs dispatch — CLM-0031 says incited
check('incited vs "sent" (CLM-0031)',
      where(r'Sent by Rāvaṇa|\bthey are sent\b|\bare sent\b|भेजे जाते|పంపిస్తే'))

# 2 · intention vs act — CLM-0041 says he WANTS to abandon
check('"want to take it back" vs "take it back" (CLM-0041)',
      where(r'(?<!want to )(?<!want to\s)\btake it back\b|वापस ले रहे हो|తీసుకుంటున్నావు'))

# 3 · moment vs day — 19.8 muhūrtam
check('"a moment" vs "a day" (19.8)', where(r'[Nn]ot for a day|ఒక్క రోజు|एक दिन भी नहीं'))

# 4 · offered vs gave
check('offered vs "gave" his army (19.3)', where(r'सेना दी।|gave his army'))

# 5 · staging stated as narration fact
check('staging stated as fact', where(r'half a step behind his brother|आधा क़दम|అర అడుగు'))

# 6 · production state unknown here — no global negatives
check('no global asset negatives', where(r'NONE ACQUIRED|none acquired|0 acquired|commission (now|today|first)|'
                                         r'all image generation is blocked', re.I))

# 7 · no telling is canonical for a language unless decided
check('no "primary tradition for a language"', where(r'primary tradition for (Hindi|Telugu|Tamil)'))

# 8 · claim text is authored, never a malformed triple
C = J('claims.json')['claims']
bad = [f"{c['id']}: {c['text']}" for c in C
       if re.search(r'\b(\w+) \1\b', c['text'])                          # doubled word
       or re.search(r'\bto \w+ to \w+\b.*\bto send\b', c['text'])         # stacked infinitives
       or re.search(r'requests term|is aged|states that \w+ is', c['text'])
       or not c['text'].rstrip().endswith('.')]
check('claim text well-formed', bad)

# 9 · speaker ≠ actor is modelled, and the text names the actor
bad = []
for c in C:
    if c.get('speaker') and c.get('actor') and c['speaker'] != c['actor']:
        a = [w for w in c['actor'].split() if w.lower() not in ('the', 'a', 'an')][0].replace('Dasharatha', 'Daśaratha')
        if a not in c['text']:
            bad.append(f"{c['id']}: actor {c['actor']} not named in text")
check('speech claims name their actor', bad)

# 10 · every speech act has a speaker
check('speech_act ⇒ speaker', [c['id'] for c in C if c.get('speech_act') and not c.get('speaker')])

# 11 · restricted text travels nowhere — checked against the withheld markers' absence of raw runs
# The full restricted index, shipped beside this script as hashes of every 2-word run —
# so the check needs no restricted text itself. Every file is scanned, the changelog included.
import hashlib
IDX = set(json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'restricted_index.json'))))
raw = []
for f, t in S.items():
    words = re.findall(r'\S+', t)
    for i in range(len(words) - 1):
        pair = (words[i].strip('",:;()[]{}') + ' ' + words[i + 1].strip('",:;()[]{}'))
        if hashlib.sha256(pair.encode()).hexdigest() in IDX:
            raw.append(f'{f}: "{pair}"')
            break
check('no restricted text in any file (full index, changelog included)', raw)

# 12 · narration and claims agree on the corrected wording
F = J('films.json')['films']
T = {f['id']: J(f['treatment']) for f in F if f.get('state') == 'directed'}
bad = []
for fid, t in T.items():
    for l in t['narration'].values():
        if len(l['en'].split()) > 12:
            bad.append(f'{fid} over 12 words: {l["en"]}')
        if not l['en'].rstrip().endswith(('.', '?', '!', '"', '—', '…')):
            bad.append(f'{fid} truncated: {l["en"]}')
check('narration complete and within ceiling', bad)

# 13 · beat labels do not contradict narration
bad = []
for fid, t in T.items():
    beats = ' '.join(s['beat'] for s in t['shots']).lower()
    nar = ' '.join(l['en'] for l in t['narration'].values()).lower()
    if 'take it back' in beats and 'want to take it back' not in beats:
        bad.append(f'{fid}: beat "take it back" vs narration')
    if 'they are sent' in beats and 'sets them on' in nar:
        bad.append(f'{fid}: beat "they are sent" vs narration "sets them on"')
check('beat labels agree with narration', bad)

# 14 · unaudited material is labelled as such
bad = [f['id'] for f in F if f['id'] in ('M8', 'M9', 'M10')
       and 'NOT FORENSICALLY AUDITED' not in (f.get('audit_scope') or '')]
check('unaudited films are labelled', bad)

# 15 · hardened creative rules are not presented as mandatory
sem = J('semantics.json') if 'semantics.json' in S else {}
check('hold is a proposal, not mandatory', [] if sem.get('hold', {}).get('mandatory') is False else ['hold.mandatory'])

# ── v1.0.2 classes ──
# 16 · stale external production design
check('no production design set by this workspace',
      where(r'low gold circlet|jewelled crown|flat gold pectoral|silver-white hair|ivory antarīya|deep red uttarīya'))
# 17 · no numeric skin values
check('no numeric skin values', [f for f, t in S.items() if f != 'forensic_changelog.json'
                                  and re.search(r'"srgb_hex"|"lab_L"|"tolerance_L"', t)])
# 18 · one seed rule
check('seeds: one rule (seed_policy)', where(r'"seed":\s*\d{6,}|seed = base \+'))
# 19 · Rāma is not a depiction gate
L = J('locks.json')['locks']
check('Rāma may be depicted', [l['id'] for l in L if l.get('entity') == 'RAMA' and (l.get('value') or {}).get('may_depict') is False])
# 20 · no hardened creative values restated as fixed
check('no fixed hold or lifetime-narrator rule', where(r'final 8-second hold|locked for the life of the product|mandatory 5'))
# 21 · attribution markers mean attribution
bad_m = ['पिता को ऐसा नहीं लगा', 'తండ్రికి అలా అనిపించలేదు', 'అడగలేదు', 'उन्होंने', 'ఆయన', 'दिया', 'माँगा', 'offered']
N = J('narrator.json')['languages']
check('attribution markers audited', [f'{g}: {m}' for g in N for m in N[g]['attribution_markers'] if m in bad_m])
# 22 · every attributed narration unit carries a marker in EVERY language, independently
bad = []
for fid, t in T.items():
    for lid, l in t['narration'].items():
        if l.get('speaker'):
            for g in N:
                if not any(m in l[g] for m in N[g]['attribution_markers']):
                    bad.append(f'{fid} {lid} {g}')
check('speaker attributed independently in en/hi/te', bad)
# 23 · locators carry ranges
check('claim locators carry verse ranges or an edition section', [c['id'] for c in C if c.get('locator') and not (c['locator'].get('verses') or c['locator'].get('section'))])
# 24 · sarga counts are not asserted
check('sarga counts not asserted', [k['id'] for k in J('kandas.json')['kandas'] if k.get('sargas_provisional')])

# ── v1.0.3 · the execution graph, simulated as the studio would obey it ──
PEOPLE = {'DASHARATHA': 'Daśaratha', 'VISHVAMITRA': 'Viśvāmitra', 'VASISHTHA': 'Vasiṣṭha',
          'RAMA': 'Rāma', 'LAKSHMANA': 'Lakṣmaṇa', 'KAUSALYA': 'Kausalyā'}
ALL = {f'{fid}/{s["id"]}': s for fid, t in T.items() for s in t['shots']}
imp, wrong, face, throne, cross = [], [], [], [], []
for fid, t in T.items():
    S2 = {s['id']: s for s in t['shots']}
    for s in t['shots']:
        link = s.get('reuse_of') or s.get('crop_of')
        if link:
            src = S2[link]
            if s['source'] == 'reuse' and set(src['entities']) != set(s['entities']):
                imp.append(f'{fid}/{s["id"]} reuse ← {link}')
            if s['source'] == 'crop' and not set(s['entities']) <= set(src['entities']):
                imp.append(f'{fid}/{s["id"]} crop ← {link}')
        if s.get('continues_from'):
            f2, n2 = s['continues_from'].split('/')
            src = ALL.get(f'{f2}/{f2[1:].zfill(2)}-{int(n2):02d}')
            if not src or set(src['entities']) != set(s['entities']):
                cross.append(f'{fid}/{s["id"]} ← {s["continues_from"]}')
        p = s.get('image_prompt') or ''
        if s['source'] == 'generate':
            named = {k for k, v in PEOPLE.items() if v in p}
            ppl = {e for e in s['entities'] if e in PEOPLE}
            if named != ppl:
                wrong.append(f'{fid}/{s["id"]} entities {sorted(ppl)} prompt {sorted(named)}')
            if 'RAMA' in ppl and fid in ('M1', 'M2', 'M3', 'M4', 'M5', 'M6') \
                    and not re.search(r'Rāma[^.]*face NOT shown', p):
                face.append(f'{fid}/{s["id"]} Rāma\'s face would render before M7')
        if fid in ('M4', 'M5', 'M6', 'M7') and re.search(r'armrest', s.get('action', '')):
            throne.append(f'{fid}/{s["id"]}')
check('every reuse and crop is physically possible', imp)
check('every generated prompt names exactly the people in frame', wrong)
check('no face rendered where it must be withheld', face)
check('the king never returns to the throne after M3', throne)
check('cross-film continuations match', cross)
bad = []
first = {fid: t['shots'][0] for fid, t in T.items()}
last = {fid: t['shots'][-1] for fid, t in T.items()}
for j in J('transitions.json')['joins']:
    if j['kind'] == 'continuous' and j['from'] in last and j['to'] in first:
        if set(last[j['from']]['entities']) != set(first[j['to']]['entities']):
            bad.append(f"{j['from']}→{j['to']}")
check('continuous joins open on the frame the last film closed on', bad)
check('no narration line is unsupported',
      [f'{fid} {lid}' for fid, t in T.items() for lid, l in t['narration'].items() if l.get('assertion') == 'UNSUPPORTED'])
check('every narration line carries its evidence',
      [f'{fid} {lid}' for fid, t in T.items() for lid, l in t['narration'].items() if not l.get('evidence')])
# ── v1.0.3 · stale wording found this pass ──
check('no creative duration presented as sourced', where(r'8-second hold is SOURCED|it is in fact sourced'))
check('events not claimed textual beyond the audited range', where(r'The EVENTS are textual'))
check('"asked one thing" (19.12–13 asks several)', where(r'asked one thing|एक बात पूछी|ఒక్కటే అడిగాడు'))
check('"into the fire" (18.5 says onto the altar)', where(r'flesh and blood into the fire'))
check('no invented hour for the departure', where(r'In the morning they left|सुबह वो निकल|తెల్లవారి బయలుదేరారు'))
check('M7 exteriors are not dawn', where(r'open dawn sky|Dawn light beyond'))

# ── v1.0.4 ──
CS = {c['id']: c for c in C}
prop_in_claims, basis_bad = [], []
for fid, t in T.items():
    for s in t['shots']:
        if any(CS.get(c, {}).get('state') == 'proposed' for c in s.get('claims', [])):
            prop_in_claims.append(f'{fid}/{s["id"]}')
        if s['basis'] == 'SOURCE-SUPPORTED' and not (s.get('claims') or s.get('claims_proposed')):
            basis_bad.append(f'{fid}/{s["id"]} sourced, no evidence')
        if s.get('claims') and s['basis'] == 'ARTISTIC-ADAPTATION':
            basis_bad.append(f'{fid}/{s["id"]} artistic, but cites {s["claims"]}')
check('proposed claims never ride in shot.claims', prop_in_claims)
check('shot basis and shot evidence agree', basis_bad)
sp = []
for fid, t in T.items():
    for lid, l in t['narration'].items():
        if l.get('assertion') == 'CHARACTER_SPEECH' and not l.get('speaker'):
            sp.append(f'{fid} {lid} speech without speaker')
        if l.get('speaker') and l.get('assertion') != 'CHARACTER_SPEECH':
            sp.append(f'{fid} {lid} speaker but {l.get("assertion")}')
check('CHARACTER_SPEECH ⇔ speaker', sp)
nar_all = ' '.join(l['en'] for t in T.values() for l in t['narration'].values())
DL = J('narrator.json').get('delivery_notes', {})
stale = [f'{k}: {v["key_line"]["en"]}' for k, v in DL.items()
         if isinstance(v, dict) and v.get('key_line', {}).get('en') and v['key_line']['en'] not in nar_all]
check('narrator guidance speaks only lines the films contain', stale)
check('Telugu: Viśvāmitra\'s asking is masculine', where(r'అంతే అడిగింది'))
m7 = T.get('M7')
bad = []
if m7:
    for s in m7['shots']:
        p = s.get('image_prompt') or ''
        if s['staging']['axis'] == 'AXIS.ROAD' and s['source'] == 'generate' and 'lattice' in p:
            bad.append(f'{s["id"]} road shot lit by the hall lattice')
        if re.search(r'\b(morning|dawn|sunrise)\b', (s['action'] + ' ' + p), re.I):
            bad.append(f'{s["id"]} says morning')
check('M7 has one clock', bad)
check('the master look fixes no time of day', where(r'morning raking light'))

for n, b in ok:
    print(f'  ✓ {n}')
for n, b in fail:
    print(f'  ✗ {n}')
    for x in b[:4]:
        print(f'      {x[:130]}')
print(f'\n  {len(ok)} clean · {len(fail)} contradictions')
sys.exit(1 if fail else 0)

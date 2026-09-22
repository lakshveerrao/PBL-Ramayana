# The execution graph for M1–M7, authored shot by shot.
#
# v1.0.2 DERIVED these fields: entities by keyword regex (missing every "he" and "his"),
# reuse/crop links by word overlap with a fallback to "the nearest earlier generated shot,
# whatever it shows", and shot sizes by regex. That produced a staff cropped into the king,
# Rāma reused as Lakṣmaṇa, and Daśaratha listed as the only figure in a shot of three
# travellers. Nothing here is derived. Every row is a decision.
#
# (n, size, lens_mm, height, subjects, source, link, axis, basis, note)
#   source : G generate · R reuse (the same frame again) · C crop (tighter, same state)
#   link   : shot number in this film, or 'M2/18' for a frame from an earlier film
#   basis  : S source-supported · I source-inferred · A artistic adaptation
#
# REUSE is legal only when the subject AND their state are unchanged.
# CROP is legal only from an equal-or-wider frame of the same subject, same moment,
# and never wide-to-close-up or medium-to-insert (the resolution will not survive it).
# These films are held stills with ambient motion, narrated by one storyteller — there is
# no lip sync, so a still of a character may carry more than one of his lines.

D, V, VS, R, L, K = 'DASHARATHA', 'VISHVAMITRA', 'VASISHTHA', 'RAMA', 'LAKSHMANA', 'KAUSALYA'
SB, TH, ST, GT, RD, AY, CT = 'SABHA', 'THRONE', 'STAFF', 'GATE', 'ROAD', 'AYODHYA', 'COURT'
H, RDX = 'AXIS.SABHA', 'AXIS.ROAD'

G = {
'M1': [
 (1,'WIDE',24,'eye',[SB],'G',None,H,'A','the empty hall before anything happens'),
 (2,'WIDE',35,'eye',[V,SB],'G',None,H,'A','the arrival is narrated in sarga 17, not loaded — staging until read'),
 (3,'WIDE',24,'eye',[CT,SB],'G',None,H,'A',None),
 (4,'MS',85,'eye',[D],'G',None,H,'A','the reception is in sarga 17 — staging until read'),
 (5,'MS',50,'eye',[D,SB],'G',None,H,'A','sarga 17 — staging until read'),
 (6,'INSERT',100,'low',[D,V],'G',None,H,'A','the honouring with water — sarga 17, staging until read'),
 (7,'MS',50,'eye',[D,V],'G',None,H,'S','Dutt XVIII: "Tell me, what is it that thou wouldst have"'),
 (8,'MS',85,'eye',[V],'G',None,H,'A',None),
 (9,'MS',85,'eye',[D],'G',None,H,'S','Dutt XVIII: "I will every way accomplish thy will"'),
 (10,'WIDE',35,'eye',[CT,VS,SB],'G',None,H,'A',None),
 (11,'MS',85,'eye',[D],'G',None,H,'S','CLM-0001 — the word given; its own frame, not a reuse'),
 (12,'INSERT',100,'eye',[V],'G',None,H,'A',None),
 (13,'MS',85,'eye',[D],'G',None,H,'A',None),
 (14,'MS',85,'eye',[V],'G',None,H,'A','the source has him THRILLED here (18.1, CLM-0018, proposed); we play restraint — undecided'),
 (15,'MS',85,'eye',[D],'R',13,H,'A','same state: at ease, expectant'),
 (16,'MS',85,'eye',[V],'R',14,H,'A','the hold continues the unspoken frame'),
],
'M2': [
 (1,'WIDE',24,'eye',[V,D,SB],'G',None,H,'A','over the sage, the king small at the dais — on-axis'),
 (2,'INSERT',100,'eye',[D,TH],'G',None,H,'A','the king\'s hand on the armrest — he is still on the throne in M2'),
 (3,'MS',85,'eye',[V],'G',None,H,'S','18.2–4, he begins'),
 (4,'CU',85,'eye',[V],'C',3,H,'S','same moment, tighter'),
 (5,'MS',85,'eye',[V],'G',None,H,'A','two fingers raised — our gesture; the source says two rākṣasas'),
 (6,'CU',85,'eye',[V],'C',5,H,'S','face only, hand out of frame; 18.5 naming'),
 (7,'CU',85,'eye',[D],'G',None,H,'A','v1.0.2 took this from a shot of the SAGE; the king needs his own frame'),
 (8,'MS',85,'eye',[D],'G',None,H,'A',None),
 (9,'INSERT',100,'eye',[V],'G',None,H,'A',None),
 (10,'INSERT',100,'eye',[V],'R',9,H,'A','"the same hand, unchanged" — a true reuse'),
 (11,'WIDE',35,'eye',[CT,VS,SB],'G',None,H,'A',None),
 (12,'WIDE',24,'eye',[V,D,SB],'C',1,H,'A','the opening wide, tighter — same geometry, same stillness'),
 (13,'MS',85,'eye',[V],'R',3,H,'S','18.17 ten nights — the still sage carries the line'),
 (14,'MS',85,'eye',[D],'G',None,H,'A',None),
 (15,'MS',85,'eye',[D],'R',14,H,'A','the stretch — unchanged'),
 (16,'INSERT',100,'eye',[V],'G',None,H,'A','a mouth detail cannot be cropped from a medium'),
 (17,'MS',85,'eye',[D],'R',15,H,'A','the name lands on the unchanged face'),
 (18,'CU',85,'eye',[D],'G',None,H,'S','NEW expression. 18.20 great fear; 19.1 a moment as if senseless. v1.0.2 reused the EXPECTANT face for the shock.'),
],
'M3': [
 (1,'CU',85,'eye',[D],'R','M2/18',H,'S','continuous join — the same frame'),
 (2,'MS',85,'eye',[V],'R','M2/3',H,'S','CLM-0008. v1.0.2 took the sage from the KING\'s shock frame.'),
 (3,'INSERT',100,'eye',[V],'R','M2/9',H,'A','the same open hand'),
 (4,'MS',85,'eye',[V],'R',2,H,'S','18.17 ten nights — CLM-0007, established in M2; recalled here'),
 (5,'MS',50,'eye',[D,SB,TH],'G',None,H,'A','adapts the sourced lurch from the seat (18.20) into a rise and one step down'),
 (6,'INSERT',50,'eye',[TH],'G',None,H,'A','the throne empty — cannot be cropped from a frame the king is still in'),
 (7,'CU',85,'eye',[D],'G',None,H,'S','fear, 18.20'),
 (8,'MS',85,'eye',[D],'G',None,H,'S','CLM-0010, his statement'),
 (9,'MS',85,'eye',[V],'R',2,H,'A','the sage receives it without moving'),
 (10,'WIDE',35,'eye',[CT,SB],'G',None,H,'A','v1.0.2 took the court from the king\'s close-up'),
 (11,'MS',50,'eye',[D,SB],'G',None,H,'S','CLM-0012'),
 (12,'WIDE',24,'eye',[CT,SB],'G',None,H,'A','reverse, from his eyeline — a different angle from 10'),
 (13,'CU',85,'eye',[D],'C',11,H,'A','same offering moment, tighter. v1.0.2 cropped a CLOSE-UP out of a WIDE of the hall.'),
 (14,'MS',50,'eye',[D],'G',None,H,'S','CLM-0013'),
 (15,'MS',85,'eye',[V],'R',2,H,'A','"the same frame as beat 2"'),
 (16,'CU',85,'eye',[D],'G',None,H,'A','closest frame in the film — too tight to crop from 14'),
 (17,'INSERT',100,'eye',[D],'G',None,H,'A','joined palms — our staging'),
 (18,'CU',85,'eye',[V],'G',None,H,'A','his eyes go down to the hands and back — the only movement he makes'),
 (19,'CU',85,'eye',[D],'G',None,H,'A','v1.0.2 cropped the FATHER out of the SAGE\'s close-up'),
 (20,'MS',85,'eye',[D],'G',None,H,'A',None),
 (21,'MS',85,'eye',[D],'R',20,H,'S','CLM-0015 carried on the still king'),
 (22,'INSERT',100,'eye',[D],'G',None,H,'A','the opposite action to 17 — not a crop of it'),
 (23,'MS',85,'eye',[V],'R',2,H,'A','the settled still sage; v1.0.2 used the frame where his eyes MOVE'),
],
'M4': [
 (1,'MS',85,'eye',[V],'R','M3/23',H,'A','continuous join'),
 (2,'MS',85,'eye',[D],'G',None,H,'S','CLM-0020. v1.0.2 took the king from the sage\'s frame.'),
 (3,'CU',85,'eye',[D],'C',2,H,'S','19.12 — CLM-0020, same question, tighter'),
 (4,'CU',85,'eye',[V],'C',1,H,'A',None),
 (5,'MS',85,'eye',[V],'R',1,H,'S','CLM-0031'),
 (6,'CU',85,'eye',[V],'R',4,H,'S','CLM-0031'),
 (7,'MS',85,'eye',[D],'G',None,H,'A','silent, waiting — a different state from 2'),
 (8,'WIDE',24,'high',[D,CT,SB],'G',None,H,'A','the one high wide in the arc'),
 (9,'WIDE',24,'high',[D,CT,SB],'R',8,H,'S','"the high wide holds"; CLM-0030. v1.0.2 cropped this WIDE out of a MEDIUM.'),
 (10,'WIDE',35,'eye',[D,SB],'C',8,H,'A','the king below, tighter within the high wide'),
 (11,'MS',50,'eye',[CT],'G',None,H,'A',None),
 (12,'CU',85,'eye',[D],'G',None,H,'A',None),
 (13,'CU',85,'eye',[D],'R',12,H,'S','CLM-0034'),
 (14,'CU',85,'eye',[D],'G',None,H,'A','eyes drop — a new state'),
 (15,'INSERT',100,'eye',[D],'G',None,H,'A','fingers press whiter. v1.0.2 took the HANDS from the FACE.'),
 (16,'CU',85,'eye',[D],'C',12,H,'S','19.19–22 — CLM-0034; eyes back up, 2% tighter'),
 (17,'MS',85,'eye',[D],'R','M3/20',H,'S','CLM-0035 — the refusal on the same still king'),
 (18,'MS',85,'eye',[V],'R',1,H,'A','"identical frame to film 3\'s hold"'),
],
'M5': [
 (1,'MS',85,'eye',[V],'R','M4/18',H,'A','continuous join'),
 (2,'MS',85,'eye',[V],'R',1,H,'A','"the same frame, unchanged"'),
 (3,'MS',85,'eye',[V],'G',None,H,'S','he moves — samanyuḥ, 20.1; he rises here, he is standing from 8'),
 (4,'INSERT',100,'low',[ST],'G',None,H,'A','staff at rest on stone — cannot come from a medium of the sage'),
 (5,'INSERT',100,'low',[ST],'G',None,H,'A','staff raised'),
 (6,'INSERT',100,'low',[ST],'R',4,H,'A','the strike: the staff on stone again, NO MOTION — the sound makes it a strike. Staging of 20.4.'),
 (7,'MS',85,'eye',[D],'G',None,H,'A','v1.0.2 CROPPED THE KING OUT OF THE STAFF INSERT'),
 (8,'MS',85,'eye',[V],'G',None,H,'S','CLM-0041 — the SAGE speaking, standing. v1.0.2 listed the king and cropped from the staff.'),
 (9,'MS',85,'eye',[V],'R',8,H,'S','CLM-0041'),
 (10,'MS',85,'eye',[V],'R',8,H,'S','CLM-0042'),
 (11,'MS',50,'eye',[VS],'G',None,H,'A','v1.0.2 took Vasiṣṭha from the staff insert'),
 (12,'MS',85,'eye',[V],'R',8,H,'S','CLM-0043'),
 (13,'MS',85,'eye',[V],'R',8,H,'S','CLM-0043'),
 (14,'WIDE',24,'eye',[V,VS,TH,SB],'G',None,H,'A','THE ONE LINE CROSSING. The sage was missing from this shot\'s entities.'),
 (15,'WIDE',24,'eye',[V,VS,TH,SB],'R',14,H,'A','holds'),
 (16,'MS',85,'eye',[D],'G',None,H,'A','after the footsteps: a different state from 7'),
],
'M6': [
 (1,'MS',85,'eye',[D],'R','M5/16',H,'A','CONTINUITY FIX: M5 ends on the king, so M6 opens on the king. v1.0.2 opened on the sage\'s back.'),
 (2,'MS',50,'eye',[VS],'G',None,H,'A',None),
 (3,'CU',85,'eye',[D],'G',None,H,'A','v1.0.2 cropped the king out of Vasiṣṭha'),
 (4,'MS',50,'eye',[VS],'R',2,H,'S','CLM-0050'),
 (5,'MS',85,'eye',[D],'R',1,H,'A','the same still king, listening'),
 (6,'MS',50,'eye',[VS],'R',2,H,'S','CLM-0050'),
 (7,'WIDE',35,'eye',[CT,SB],'G',None,H,'A','v1.0.2 took the ministers from Vasiṣṭha\'s medium'),
 (8,'MS',50,'eye',[VS],'R',2,H,'S','CLM-0051'),
 (9,'MS',85,'eye',[D],'G',None,H,'A','recognition — a new state'),
 (10,'WIDE',35,'eye',[V,SB],'G',None,H,'A','his back, still turned. Not reused from M5/14 — Vasiṣṭha has since moved.'),
 (11,'MS',50,'eye',[VS],'R',2,H,'A','20.10–18 read for coverage only; not voiced'),
 (12,'INSERT',100,'eye',[D],'G',None,H,'A','CONTINUITY FIX: hands at his sides. He left the throne in M3.'),
 (13,'MS',50,'eye',[VS,D],'G',None,H,'A',None),
 (14,'MS',85,'eye',[D],'G',None,H,'A','release — a new state'),
 (15,'MS',85,'eye',[D],'G',None,H,'S','21.1 he summons Rāma with Lakṣmaṇa'),
 (16,'WIDE',35,'eye',[CT,SB],'G',None,H,'A','a minister goes to fetch them'),
 (17,'MS',85,'eye',[V],'G',None,H,'A',None),
 (18,'INSERT',50,'high',[VS,K,R,D],'G',None,H,'S','CHRONOLOGY FIX. 21.2 the blessing rite by mother, father and Vasiṣṭha comes BEFORE the giving. Rāma\'s head bowed, face withheld; the mother\'s hands, face withheld.'),
 (19,'MS',50,'eye',[D,R],'G',None,H,'S','21.3 he smells the crown of his son\'s head and gives him. Rāma\'s face withheld.'),
 (20,'INSERT',100,'eye',[VS],'G',None,H,'A','v1.0.2 cropped Vasiṣṭha out of the king'),
 (21,'MS',85,'eye',[D],'G',None,H,'S','21.3 suprītena; 21.1 prahṛṣṭavadana — glad'),
 (22,'INSERT',35,'eye',[SB],'G',None,H,'A','the empty doorway'),
],
'M7': [
 (1,'INSERT',35,'eye',[SB],'R','M6/22',H,'A','continuous join — M6→M7 IS continuous; transitions.json said hard'),
 (2,'INSERT',100,'low',[R,L],'G',None,H,'A','two pairs of feet — the brothers'),
 (3,'MS',50,'eye',[D,R],'G',None,H,'A','CHRONOLOGY FIX: a farewell touch at the threshold, not the blessing rite (that is 21.2, now in M6)'),
 (4,'MS',85,'eye',[R],'G',None,H,'I','side-locks and bow: kākapakṣadharo dhanvī, 21.6'),
 (5,'MS',85,'eye',[L],'G',None,H,'I','21.6 Saumitri follows'),
 (6,'INSERT',100,'eye',[K],'G',None,H,'A','CHRONOLOGY FIX: the mother\'s hand letting go of a sleeve — a farewell, not the rite'),
 (7,'WIDE',35,'eye',[V,SB],'G',None,H,'I','v1.0.2 cropped the sage out of Kausalyā\'s hands'),
 (8,'WIDE',35,'eye',[D,SB],'G',None,H,'A',None),
 (9,'MS',50,'eye',[V],'G',None,RDX,'S','21.6 Viśvāmitra goes in front. AXIS CHANGES HERE.'),
 (10,'MS',50,'eye',[R],'G',None,RDX,'S','21.6 then Rāma'),
 (11,'MS',50,'eye',[L],'G',None,RDX,'S','21.6 Saumitri follows. v1.0.2 CROPPED LAKṢMAṆA OUT OF RĀMA.'),
 (12,'WIDE',35,'eye',[GT],'G',None,RDX,'A','the city gate — not in the source at this point'),
 (13,'WIDE',24,'eye',[AY],'G',None,RDX,'A',None),
 (14,'WIDE',35,'eye',[V,R,L],'G',None,RDX,'S','the order is 21.6. v1.0.2 put Daśaratha among the travellers.'),
 (15,'INSERT',100,'eye',[R],'G',None,RDX,'S','dhanvī, 21.6 — carried, not drawn'),
 (16,'WIDE',24,'eye',[RD],'G',None,RDX,'A',None),
 (17,'CU',85,'eye',[R],'G',None,RDX,'A','looking back is ours, not the source\'s'),
 (18,'WIDE',24,'eye',[AY],'G',None,RDX,'A','v1.0.2 cropped the city walls out of Rāma\'s close-up'),
 (19,'WIDE',35,'eye',[D,SB],'G',None,H,'A','GEOGRAPHY FIX: a cut BACK to the hall — the palace door cannot be seen from the road. Staging, declared.'),
 (20,'WIDE',24,'eye',[RD],'R',16,RDX,'A','the same road'),
 (21,'WIDE',24,'eye',[V,R,L,RD],'G',None,RDX,'A','three figures. v1.0.2 listed only Daśaratha.'),
],
}

# Action text that changes because the shot changed.
ACTION_FIXES = {
 ('M6', 1): ('continuing', 'the king, continuing from film 5 — the sage has turned to go'),
 ('M6', 12): ('the king\'s hands', 'they unclench at his sides'),
 ('M6', 18): ('the blessing rite', 'Vasiṣṭha\'s raised hand over a bowed head; the mother\'s and father\'s hands; faces withheld'),
 ('M7', 3): ('a farewell touch', 'the father\'s hand on his son\'s shoulder at the threshold, then withdrawing'),
 ('M7', 6): ('the mother lets go', 'her hand releasing a sleeve, face not shown'),
 ('M7', 19): ('back in the hall', 'the king still standing in the doorway'),
}

# What of each subject is actually in frame. Without this, every character prompt asks for
# "identity, face, skin, costume" — and an insert of feet, or a bowed head whose face must be
# withheld, gets rendered with a face. Authored for every insert and every withheld face.
VISIBLE = {
 ('M1', 6): 'the king\'s hands pouring water over the sage\'s feet — hands and feet only, no faces',
 ('M1', 12): 'the sage\'s hands resting open on his knees — hands only, no face',
 ('M2', 2): 'the king\'s hand on the carved armrest — hand only, no face',
 ('M2', 9): 'the sage\'s hand open on his knee — hand only, no face',
 ('M2', 16): 'the sage\'s mouth and beard, extreme detail — no eyes',
 ('M3', 17): 'the king\'s palms coming together at chest height — hands only, no face',
 ('M3', 22): 'the king\'s hands falling to his sides — hands only, no face',
 ('M4', 15): 'the king\'s joined hands, fingers pressing whiter — hands only, no face',
 ('M5', 4): 'the base of a plain wooden staff resting on sandstone — no person in frame',
 ('M5', 5): 'the base of a plain wooden staff lifted a hand\'s width off sandstone — no person in frame',
 ('M6', 12): 'the king\'s hands unclenching at his sides — hands only, no face',
 ('M6', 18): 'Vasiṣṭha\'s raised hand over a bowed head; the mother\'s and the father\'s hands beside it — NO FACES visible',
 ('M6', 19): 'the king bends to the crown of his son\'s bowed head — the SON\'S FACE IS NOT VISIBLE; the king\'s face is',
 ('M6', 20): 'Vasiṣṭha\'s closed eyes and brow — eyes and brow only',
 ('M7', 2): 'two pairs of young bare feet on stone, from behind — feet only, no faces',
 ('M7', 6): 'a woman\'s hand releasing the edge of a sleeve — hand only, NO FACE',
 ('M7', 10): 'Rāma crossing the threshold, from behind — his back, no face',
 ('M7', 11): 'Lakṣmaṇa crossing the threshold, from behind — his back, no face',
 ('M7', 14): 'three men walking away in order, from behind — backs only, no faces',
 ('M7', 15): 'a bow carried on a shoulder, from behind — no face',
 ('M7', 21): 'three small figures walking away down the road, far off — no faces discernible',
}

# Whose face is withheld, per shot — per PERSON, not per shot. In 06-19 the son's face is
# hidden and the king's is not. A shot-level rule suppressed both.
FACELESS = {
 ('M6', 19): {'RAMA'},
 ('M6', 18): {'RAMA', 'KAUSALYA', 'VASISHTHA', 'DASHARATHA'},
}

# shot.claims = the claims the IMAGE depicts: an action shown, or a speaker shown while his own
# words play. A reaction shot or a listener depicts no claim — what is SAID over it is evidenced
# on the narration unit, not the shot. Proposed claims are kept apart so they can never ride on an
# accepted neighbour; a shot with any proposed dependency is not production-ready.
SHOT_CLAIMS = {
 'M1': {9: ['CLM-0001'], 11: ['CLM-0001']},
 'M2': {3: ['CLM-0009'], 4: ['CLM-0002'], 6: ['CLM-0003'], 13: ['CLM-0007']},
 'M3': {2: ['CLM-0008'], 8: ['CLM-0010'], 11: ['CLM-0012'], 14: ['CLM-0013'],
        19: ['CLM-0014'], 21: ['CLM-0015']},
 'M4': {2: ['CLM-0020'], 3: ['CLM-0020'], 5: ['CLM-0031'], 6: ['CLM-0031'],
        13: ['CLM-0034'], 16: ['CLM-0035'], 17: ['CLM-0035']},
 'M5': {8: ['CLM-0041'], 9: ['CLM-0041'], 10: ['CLM-0042'],
        12: ['CLM-0043'], 13: ['CLM-0043']},
 'M6': {4: ['CLM-0050'], 6: ['CLM-0050'], 8: ['CLM-0051'], 15: ['CLM-0056'], 18: ['CLM-0057'], 19: ['CLM-0055']},
 'M7': {14: ['CLM-0053', 'CLM-0054']},
}
SHOT_CLAIMS_PROPOSED = {}
# Basis corrections that follow from the definition: a performed reaction is not an asserted fact.
BASIS_FIX = {
 ('M2', 18): ('A', 'performance of shock — consistent with 18.20/19.1 (CLM-0016, CLM-0017, proposed); the image does not assert them'),
 ('M3', 1):  ('A', 'continuous join; the same performed shock'),
 ('M3', 4):  ('A', 'the still sage while the narrator recalls M2\'s ten nights — the image asserts nothing'),
 ('M3', 7):  ('A', 'performance of fear; the fear is asserted by the narration, which carries CLM-0016 (proposed)'),
 ('M3', 19): ('S', 'the speaker shown while his own words play — CLM-0014'),
 ('M4', 9):  ('A', 'the hall under the name; the naming is carried by narration (CLM-0030)'),
 ('M4', 16): ('S', 'the speaker shown while his own words play — CLM-0035'),
 ('M5', 3):  ('S', 'he moves in anger — CLM-0040, samanyuḥ 20.1'),
 ('M7', 4):  ('I', 'side-locks and bow: kākapakṣadharo dhanvī, 21.6 — rendered, no claim record'),
 ('M7', 15): ('I', 'dhanvī, 21.6 — rendered, no claim record'),
}

# Claims that give CONTEXT to a shot — sequence, emotional basis, or the part of a sourced
# event this frame shows — but which the image does not itself fully depict. Never evidence.
CONTEXT_CLAIMS = {
 ('M5', 3): ['CLM-0040'],            # the anger is sourced; the movement is directing
 ('M6', 19): ['CLM-0052'],           # the giving; Viśvāmitra is not in this frame
 ('M6', 21): ['CLM-0052', 'CLM-0056'],  # the gladness is sourced; the frame shows only his face
 ('M7', 9): ['CLM-0054'],            # one part of the order; Rāma and Lakṣmaṇa not in frame
 ('M7', 10): ['CLM-0054'],
 ('M7', 11): ['CLM-0053'],           # Lakṣmaṇa follows Rāma; Rāma not in frame
}
BASIS_FIX.update({
 ('M1', 7): ('I', 'Dutt XVIII — "Tell me, what is it that thou wouldst have". No separate claim record; CLM-0001 is the later promise.'),
 ('M5', 3): ('A', 'the movement is directing; its emotional basis is CLM-0040 (20.1, 20.4), carried as context'),
 ('M7', 9): ('I', 'one part of the order in 21.6 — the full order is depicted in 07-14'),
 ('M7', 10): ('I', 'one part of the order in 21.6'),
 ('M7', 11): ('I', 'one part of the order in 21.6'),
})

BASIS_FIX[('M6', 21)] = ('I', 'his gladness: 21.1 and 21.3 (CLM-0056, CLM-0052). The frame shows only his face — context, not depiction.')

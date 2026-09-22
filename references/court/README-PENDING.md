# references/court/ — NOT YET INSTALLED

The director chose the court references on 2026-09-22 and they are **not in the repo**:
no kit carrying `references/court/` has been uploaded. The three images came through the
conversation as 941×1672 webp re-encodes, which is the wrong size and a lossy format —
not something to install as the location reference for all seven films.

## What belongs here

| file | role | rule |
|---|---|---|
| `court_hall.png` | location reference for EVERY hall shot, M1–M7 | lattice windows on the LEFT wall only; key light frame-left |
| `court_row_left.png` | crowd reference | condition every COURT shot on it |
| `court_row_right.png` | crowd reference | condition every COURT shot on it |

## The folder's own rules, as the director stated them

- All upper cloth is **draped**. Two candidates were rejected for stitched tunics and
  vests — the same standing rule 8 that sent Vasiṣṭha back for a one-shoulder drape.
- **Leave out the forearm tattoo** on one minister.
- **Vasiṣṭha comes from his own sheet** and is the only man in plain white with no gold.
- If one minister is seen close, **condition on one chosen face** so he stays the same man.

## What installing it changes in the studio

`court_hall.png` is a **location** reference, and the studio has never had one. Today a
shot is conditioned on the sheets of the people in it. A hall shot must now carry the
hall as well, which means:

- every hall shot gains a reference, so a one-principal hall shot sends two images;
- a COURT shot sends the hall and both rows — three before any principal;
- `01-10` is the hall, both rows, and Vasiṣṭha's own sheet: four.

Well inside the 16 the API allows, but it moves the cost and it needs `lib/render.js` to
learn that a place can carry a reference. The consistency gate must NOT start binding on
places — it binds on people, and that stays true.

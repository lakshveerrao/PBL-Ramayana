#!/usr/bin/env bash
# The package's python tools resolve their inputs relative to their OWN directory, so
# they expect to sit inside the graph. data/ must stay byte-identical to the package,
# and an extra .py in there would break that. So: a scratch directory of symlinks.
#
#   tools/package/run.sh contradictions.py
#   PBL_GRAPH=tools/fixtures/graph tools/package/run.sh contradictions.py
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
GRAPH="$ROOT/${PBL_GRAPH:-data}"
TOOL="${1:?usage: run.sh <contradictions.py|execution_graph.py|narration_units.py> [args...]}"
shift || true
[ -f "$ROOT/tools/package/$TOOL" ] || { echo "no such package tool: $TOOL" >&2; exit 2; }
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
ln -s "$GRAPH"/*.json "$STAGE"/
[ -d "$GRAPH/treatments" ] && ln -s "$GRAPH/treatments" "$STAGE"/treatments
cp "$ROOT/tools/package/$TOOL" "$STAGE"/
cd "$STAGE" && python3 "$TOOL" "$@"

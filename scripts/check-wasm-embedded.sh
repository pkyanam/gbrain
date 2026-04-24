#!/usr/bin/env bash
# CI guard: verify that bun --compile binaries ship with embedded tree-sitter
# WASMs and produce real semantic chunks (not recursive-fallback chunks).
#
# This is the #1 silent-failure mode for v0.19.0 code indexing. If the WASM
# import attributes regress or the asset path drifts, the compiled binary
# silently falls through to the recursive text chunker. Users see no error,
# just degraded chunking quality. This script catches that regression.
#
# Fails the build when:
#   - bun build --compile fails
#   - The resulting binary can't parse TypeScript
#   - Chunks come back without real symbol names (fallback signature)
#
# Runs as part of `bun test` via the package.json pre-test pipeline.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

OUT_BIN="$(mktemp /tmp/gbrain-wasm-check.XXXXXX)"
trap 'rm -f "$OUT_BIN"' EXIT

# Build a minimal smoketest binary that imports the chunker. We compile this
# instead of the full gbrain CLI so the failure mode is laser-focused on
# chunker + WASM path resolution, not unrelated CLI wiring.
bun build --compile --outfile "$OUT_BIN" scripts/chunker-smoketest.ts >/dev/null 2>&1

# Run it and capture JSON output.
OUTPUT="$("$OUT_BIN" 2>&1)"

# Sanity: JSON parses and has expected shape.
if ! echo "$OUTPUT" | grep -q '"has_real_symbols": true'; then
  echo "[check-wasm-embedded] FAIL: compiled binary returned fallback chunks." >&2
  echo "[check-wasm-embedded] Output was:" >&2
  echo "$OUTPUT" >&2
  exit 1
fi

if ! echo "$OUTPUT" | grep -q '"first_header": "\[TypeScript\]'; then
  echo "[check-wasm-embedded] FAIL: chunk header missing language tag." >&2
  echo "[check-wasm-embedded] Output was:" >&2
  echo "$OUTPUT" >&2
  exit 1
fi

if ! echo "$OUTPUT" | grep -q '"symbolName": "hello"'; then
  echo "[check-wasm-embedded] FAIL: tree-sitter did not extract symbol name." >&2
  echo "[check-wasm-embedded] Output was:" >&2
  echo "$OUTPUT" >&2
  exit 1
fi

echo "[check-wasm-embedded] OK — compiled binary produced real semantic chunks."

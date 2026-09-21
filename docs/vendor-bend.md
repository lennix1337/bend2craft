# Bend toolchain tracking

`vendor/bend` is pinned as a submodule. This file tracks the pin and the
policy for moving it. Upstream keeps its own per-release notes in
`vendor/bend/CHANGELOG.md` (worth reading before every bump).

## Current pin

- Pinned: `v2.0.19` (2026-09-19)
- Commands: `bash scripts/bend-toolchain.sh check` (read-only),
  `bash scripts/bend-toolchain.sh update` (working tree only, no commit).

## Policy

- Never auto-update on build. Compiler releases break sources (for example,
  2.0.17 changed operator type inference to require an annotation around
  each operator expression), so every bump is followed by `npm run verify`
  and only then committed (`git add vendor/bend`).
- `update` also forces `core.autocrlf=false` inside the submodule: a Windows
  CRLF checkout marks every upstream file as modified and can abort tag
  switches.
- Do not edit `vendor/bend` for application features; it is upstream code.

## History

- `v2.0.12` -> `v2.0.19` (2026-09-20): 74 upstream commits. Highlights from
  the upstream changelog: faster binary startup (8 GiB arena, #881),
  records past 256 words compile (#843), dense `U32` matches become lookup
  tables (#867), Metal-lane fast trig for `sin`/`cos`/`tan` (#887),
  breaking operator-inference change plus `~`-template/law verdict rework
  (2.0.17, #848), JS-lane fixes for dotted field names and channel
  deadlocks (2.0.18, #868, #871). Our sources needed no changes:
  `check:bend` (18 files), `proof`, full `test` and `build` all pass.

# Bend2Craft repository instructions

## Project

Bend2Craft is a small Minecraft-inspired voxel sandbox. The canonical repository is https://github.com/lennix1337/bend2craft.

The world model is authored in Bend 2 under `world/`. The browser layer in `web/` is an adapter: it materializes the Bend block contract, simulates camera/input, and renders with WebGL. Do not duplicate terrain-generation formulas in JavaScript.

Start here:

- Bend world contract: `world/world.bend`
- Bend laws and proofs: `world/LAWS.bend`, `world/PROOF.bend`
- Pure inventory API: `web/inventory.js`
- Pure player/world state: `web/game-state.js`
- Browser integration: `web/main.js`
- Regression tests: `tests/`

## Toolchain

- Bend 2 is pinned as the `vendor/bend` submodule.
- On Windows, run the toolchain inside WSL.
- Bun is preferred from `.tools/bun/bin/bun`; `scripts/run-bun.sh` selects it automatically.
- `vendor/bend` is upstream code. Do not edit it for application features.

## Required checks

Run from WSL at the repository root:

```bash
npm run verify       # all Bend, proof, test, build and diff checks
npm run check:bend   # focused Bend checker
npm run proof        # focused law/proof check
npm run test         # world, inventory and game-state regressions
npm run build        # static browser bundle
```

For browser behavior, run `npm run dev` and validate the canvas at `http://localhost:3000/`. Test movement, collision, inventory selection, block removal/placement, and tree rendering when those features exist.

## Implementation rules

- Keep world generation pure and typed in Bend.
- Keep inventory operations in a dependency-free module that can be tested without a browser.
- Keep all repository-authored source comments, UI copy, tests, plans and documentation in English.
- Add a failing test before changing behavior, then run the focused test, implement the smallest fix, and run the full checks.
- Keep block IDs and their meanings synchronized through one explicit contract. Current IDs are documented in `world/world.bend` and `web/inventory.js`.
- Preserve affine/termination guarantees in Bend. Do not use `@unsafe` to hide a failed proof.
- Prefer focused changes over broad refactors. Do not add a dependency when WebGL or the existing runtime is enough.
- Never commit credentials, generated `dist/`, `.tools/`, or local caches.

## GitHub

The origin is `https://github.com/lennix1337/bend2craft.git`. Do not force-push, merge, release, or change repository settings without explicit authorization. Before pushing, run the checks above and inspect `git status` and `git diff`.

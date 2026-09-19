# Bend2Craft repository instructions

## Project

Bend2Craft is a small Minecraft-inspired voxel sandbox. The canonical repository is https://github.com/lennix1337/bend2craft.

The world model is authored in Bend 2 under `world/`. The browser layer in `web/` is an adapter: it materializes the Bend block contract, simulates camera/input, and renders with WebGL. Do not duplicate terrain-generation formulas in JavaScript.

## Toolchain

- Bend 2 is pinned as the `vendor/bend` submodule.
- On Windows, run the toolchain inside WSL.
- Bun is preferred from `.tools/bun/bin/bun`; `scripts/run-bun.sh` selects it automatically.
- `vendor/bend` is upstream code. Do not edit it for application features.

## Required checks

Run from WSL at the repository root:

```bash
npm run check:bend
npm run proof
npm run test
npm run build
```

For browser behavior, run `npm run dev` and validate the canvas at `http://localhost:3000/`. Test movement, collision, inventory selection, block removal/placement, and tree rendering when those features exist.

## Implementation rules

- Keep world generation pure and typed in Bend.
- Keep inventory operations in a dependency-free module that can be tested without a browser.
- Add a failing test before changing behavior, then run the focused test, implement the smallest fix, and run the full checks.
- Keep block IDs and their meanings synchronized through one explicit contract. Current IDs are documented in `world/world.bend` and `web/inventory.js`.
- Preserve affine/termination guarantees in Bend. Do not use `@unsafe` to hide a failed proof.
- Prefer focused changes over broad refactors. Do not add a dependency when WebGL or the existing runtime is enough.
- Never commit credentials, generated `dist/`, `.tools/`, or local caches.

## GitHub

The origin is `https://github.com/lennix1337/bend2craft.git`. Do not force-push, merge, release, or change repository settings without explicit authorization. Before pushing, run the checks above and inspect `git status` and `git diff`.

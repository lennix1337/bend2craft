# Bend2Craft repository instructions

## Project constitution: Bend 2 first

This project's primary objective is to stress-test Bend 2 as the engine for large games. Prefer Bend 2 for every domain rule, simulation transition, world query, chunk generator, inventory/crafting operation, collision rule, and authoritative state that it can express. Treat browser JavaScript as a thin adapter for presentation, input capture, cache management, and APIs Bend 2 cannot currently provide.

Non-negotiable rules:

- Before adding domain logic to JavaScript, check whether a typed, pure Bend 2 contract can own it. If it can, implement and prove it in Bend 2 first.
- Expose bulk Bend 2 operations at boundaries. Do not make per-cell or per-entity JavaScript calls when Bend 2 can return the batch.
- Use Bend 2's parallel/native execution features when the selected target supports them, and benchmark the selected target. Never claim browser GPU or multithread acceleration when the JavaScript target ignores `!`, `--threads` and `--gpu`.
- Keep browser code limited to adapting Bend 2 values into WebGL/WebGPU presentation, input events, local caches and unavoidable browser APIs. Do not duplicate formulas or silently make browser state authoritative.
- Every performance-sensitive Bend 2 change needs a reproducible benchmark and a focused correctness test; report measured results, not assumed speedups.

The current browser slice is not fully migrated yet: `web/inventory.js` still owns inventory/crafting transitions, and `web/game-state.js` still owns player physics, collision, raycast and movement transitions. Do not expand those JavaScript authorities; migrate new behavior to Bend 2 as those contracts are extended.

## Project

Bend2Craft is a small Minecraft-inspired voxel sandbox. The canonical repository is https://github.com/lennix1337/bend2craft.

The game model is authored in Bend 2 under `world/`. The browser layer in `web/` is an adapter: it materializes Bend contracts, captures camera/input, maintains derived caches, and renders with WebGL. Do not duplicate domain formulas or authoritative transitions in JavaScript.

Start here:

- Bend world contract: `world/world.bend`
- Bend laws and proofs: `world/LAWS.bend`, `world/PROOF.bend`
- Current inventory adapter/migration target: `web/inventory.js`
- Chunk cache/streaming adapter: `web/chunk-world.js`
- Pure player/world state: `web/game-state.js`
- Browser entry router/menu: `web/main.js`; WebGL/game runtime: `web/game.js`
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

For browser behavior, run `npm run browser:smoke` when a local Playwright browser binary is available, then validate the canvas at `http://localhost:3000/`. Use `npm run smoke:dev` for a bounded server/readiness check. Test movement, collision, inventory selection, block removal/placement, and tree rendering when those features exist.

## Implementation rules

- Keep world generation pure and typed in Bend.
- Keep chunk generation and bulk block materialization in Bend. The browser must call a bulk Bend chunk export, then only cache, stream and render the returned data; never loop over `World.block` once per cell for normal chunk loading. Benchmark chunk bootstrap when changing this boundary.
- Keep browser adapters dependency-free and tested, but keep authoritative inventory/crafting rules in Bend 2 as they migrate.
- Keep all repository-authored source comments, UI copy, tests, plans and documentation in English.
- Add a failing test before changing behavior, then run the focused test, implement the smallest fix, and run the full checks.
- For a bug fix, keep the regression at the failing contract seam and add a browser smoke assertion when the symptom crosses into WebGL or input handling.
- Do not expand adjacent block/item contracts while fixing one behavior without a focused test and an explicit scope justification in the final report.
- Treat delegated changes as untrusted until the parent reviews their diff and reruns the affected focused checks plus `npm run verify`.
- Keep block IDs and their meanings synchronized through one explicit contract. Current IDs are documented in `world/world.bend` and `web/inventory.js`.
- Preserve affine/termination guarantees in Bend. Do not use `@unsafe` to hide a failed proof.
- Prefer focused changes over broad refactors. Do not add a dependency when WebGL or the existing runtime is enough.
- Never commit credentials, generated `dist/`, `.tools/`, or local caches.

## GitHub

The origin is `https://github.com/lennix1337/bend2craft.git`. Always use the `lennix1337` GitHub account in this repository (`gh auth switch --user lennix1337`); never use any other authenticated account here. Do not force-push, merge, release, or change repository settings without explicit authorization. Before pushing, run the checks above and inspect `git status` and `git diff`.

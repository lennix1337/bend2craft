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

The game model is authored in Bend 2 under `world/`. Two targets consume it:

- **Browser** — `web/` is an adapter: it materializes Bend contracts, captures camera/input, maintains derived caches, and renders with WebGL. Do not duplicate domain formulas or authoritative transitions in JavaScript.
- **Native** — `native/` is a Bend 2 program with its own window, compiled by the pinned CLI to a native executable. It is not a port of the browser: it reuses `world/` and owns its own renderer, player region and save codec.

Start here:

- Bend world contract: `world/world.bend`
- Bend laws and proofs: `world/LAWS.bend`, `world/PROOF.bend`
- Bend module boundary: `web/bend-modules.js` (wraps every `world/*.bend`
  module; the only place that knows how the JS lane names a datatype)
- Current inventory adapter/migration target: `web/inventory.js`
- Chunk cache/streaming adapter: `web/chunk-world.js`
- Pure player/world state: `web/game-state.js`
- Browser entry router/menu: `web/main.js`; WebGL/game runtime: `web/game.js`
- Native client: `native/client.bend`; its modules are `native/voxel.bend`,
  `native/face.bend`, `native/frame.bend`, `native/player.bend`,
  `native/save.bend`
- Native experiments and their measurements: `lab/native/`
- Multiplayer (room, server simulation, protocol): `docs/MULTIPLAYER.md`
- Regression tests: `tests/`

## The two targets run one engine

The browser and the native client are the same Bend 2 program on two lanes:
`vendor/bend/bend2/main.ts` under Bun for the bundle, and the same vendored
sources compiled by the pinned CLI to C for the executable. The rules are
`world/*.bend` either way, so a rule cannot mean one thing in the browser and
another natively.

Keep it that way, and prove it rather than assume it:

- **One vendored compiler.** `vendor/bend` is pinned, and the native CLI is
  built from that exact commit by `scripts/bootstrap-native-bend.sh`. If the
  pin moves, both lanes move together or the comparison is meaningless.
- **Cross-lane equality is already a check.**
  `benchmarks/bend-native-parallel.bend` is run by `npm run check:bend` through
  Bun and by `npm run bench:bend-native` as a native binary, and both must
  print `549755289600`. Any change to `world/` that moves one lane and not the
  other fails one of them.
- **Never fork a rule per target.** If the native client needs behaviour the
  browser does not, put it in `world/` or in `native/`, not in a copy.
- The JS lane and the native lane are not interchangeable at the margins. The
  JS lane refuses a negative `Nat`, and the native target's `Nat` is
  unsigned for the same reason. Benchmarks taken in one lane are not evidence
  about the other unless the script says which lane it ran in.

## Native target

`native/` is the target that ships. `lab/native/` is everything that was tried
or measured. **Nothing in `native/` imports from `lab/native/`**, and the
dependency only runs that way: a lab module that stopped matching its client
would be measuring a different program.

- `native/client.bend` is the entry point. It wires the world, the camera, the
  input fold, the tick and the save; it owns no game rule.
- Each `lab/native/<module>/` holds the benchmarks and the recorded numbers for
  the `native/<module>.bend` beside it. The module ships; the measurement does
  not.
- `native/main.bend` and `native/world.bend` are the 16x16 feasibility slice,
  kept as the smallest thing that opens a window. Their two-byte save is not
  compatible with `native/save.bend` or with browser saves.
- The native save is `B2CW:1` in `native/save.bend`, which also migrates the
  legacy browser and multiplayer snapshots. `native/client-world.b2cw` is
  gitignored and written by the save key.
- Two lab probes fail and are not in the gate:
  `lab/native/voxel/voxel_probe_parallel_test.bend` (fails at the pinned commit
  too) and `lab/native/client-probe/span_probe.bend` (passes its assertions,
  then overflows the stack in a walk that follows). Do not treat either as a
  regression signal, and do not quietly delete the assertion that caught it.

### Frame budget

The pinned runtime's `window_pace` sleeps every presented frame to a hardcoded
16666667 ns interval, so **60 Hz is a ceiling, not a budget** and no renderer
here can present faster. What is ours is the frame cost, and therefore how large
a window fits inside the cap. Measured at the client's own spawn camera, native
C, `--gpu off`, eight threads. The numbers live above `window_width` in
`native/client.bend`; `bash lab/native/client-probe/run-fps.sh` re-measures the
live presented rate and `run-bench.sh` re-measures the stages:

| size | render ms | fits 60 Hz |
| --- | ---: | --- |
| 32 | 3.21 | yes, capped |
| 64 | 5.83 | yes, capped |
| 128 | 13.95 render, 14.20 frame | yes, 2.5 ms slack |
| 256 | 49.00 | no, about 20 Hz |

The native client picks its size from `--size=32|64|128|256` and prints that
table before the window opens, so a player chooses against the cost instead of
guessing. Bend 2.0.32 has no stdin, so the choice is a flag and not a prompt.
Quote the numbers as measured on the machine named in
`lab/native/2026-09-30-native-renderer-investigation.md`, never as a property of
the renderer. Re-run the benchmark before changing any of them, and never widen
the window on an extrapolation. `native/client_test.bend` divides the rate back
out of each cost field rather than reading it from a table, so a drifted
measurement fails the gate.

### Bend 2.0.32 has no stdin

`IO` offers `print`, `args`, `get_env`, `sleep`, `now`, `thread_count` and
`random_u32`, and there is no way to read a key from a terminal. Anything that
must be chosen before the window opens is chosen from `IO.args()` or an
environment variable, and the choice is echoed to stdout. Do not design a
console prompt and discover this at the end.

## Toolchain

- Bend 2 is pinned as the `vendor/bend` submodule.
- On Windows, run the toolchain inside WSL. On macOS and Linux it runs natively; keep scripts portable to the bash 3.2 that macOS ships, so no bash 4+ builtin (`declare -A`, `mapfile`, `readarray`) and no Linux-only binary such as `setsid`.
- Bun is preferred from `.tools/bun/bin/bun`; `scripts/run-bun.sh` selects it automatically.
- The native CLI lives in the ignored `.tools/bend-local/`, built once by `scripts/bootstrap-native-bend.sh`. It refuses to overwrite an existing compiler, so delete that directory deliberately if a rebuild is what you mean.
- `vendor/bend` is upstream code. Do not edit it for application features.

## Required checks

Run at the repository root, from WSL on Windows and from a normal shell on macOS
or Linux:

```bash
npm run verify       # all Bend, proof, test, build and diff checks
npm run check:bend   # focused Bend checker
npm run proof        # focused law/proof check
npm run test         # world, inventory and game-state regressions, then the native Bend regressions
npm run build        # static browser bundle
```

`npm run test` runs the `native/*_test.bend` regressions in a throwaway working
directory under `scratchpad/`, because the native tests write save files
relative to it.

For browser behavior, run `npm run browser:smoke` when a local Playwright browser binary is available, then validate the canvas at `http://localhost:3000/`. Use `npm run smoke:dev` for a bounded server/readiness check. Test movement, collision, inventory selection, block removal/placement, and tree rendering when those features exist.

To play, run `Jogar-Bend2Craft.bat` on Windows or `Play-Bend2Craft.command` on
macOS: it rebuilds the bundle in WSL and serves `dist/` on port 8080.

For the native client, compile and run it inside WSL with WSLg:

```bash
.tools/bend-local/bin/bend native/client.bend -o .tools/bend-local/bin/bend2craft-client
.tools/bend-local/bin/bend2craft-client
```

## Bend 2 authoring rules (pinned 2.0.32)

These were established by experiment against the pinned compiler. They are not
obvious from the guide and each one costs a failed check to rediscover, so keep
new `world/`, `native/` and test code consistent with them.

- **No forward references.** A `def` must be written before any `def` that calls
  it. Calling a later definition is reported as "expected: a filled definition
  (an unfilled law is a dead claim)". A helper cycle is therefore impossible;
  only direct self-recursion is available.
- **`do` blocks take binds and one final term.** No tuple-destructuring
  statement (`(a, b) = pair`), no `match`, no bare constructor and no two
  consecutive actions. Return a built value with `return <value>`; hand a bound
  pair to a helper that destructures it in a plain `def`.
- **A `match` scrutinizes a parameter or a field only.** Not a computed value,
  not a local binder, not a closure binder and not an affine (`+`) parameter. To
  branch on a computed result, pass it to a `def` whose parameter is matched.
- **Every value is consumed once.** A `U32` local, a data record and a frame all
  support exactly one use, so a room or frame cannot be read and then stored.
  Thread linear state through records and recompute what a second use needs.
- **Products are binary.** Use `A & B`; there is no `A & B & C`. Give multi-field
  state a `type ... is Type` record instead of a tuple.
- **A generic type argument cannot be a product.** `def f(-A: Type, ...)` may be
  instantiated with `Socket` or a record, but not with `Socket & String`; give
  that shape its own failure helper.
- **Patterns list every field** of the constructor (`Record{a, b, c}`), and a
  `case` body is a single term. Adding a field to a record is a change to every
  construction and every pattern of it, in the tests too.
- **Match usage annotations to the producer.** A value typed `Maybe<&2, T>` must
  be received as `Maybe<&2, T>`.

## Implementation rules

- Keep world generation pure and typed in Bend.
- Keep chunk generation and bulk block materialization in Bend. The browser must call a bulk Bend chunk export, then only cache, stream and render the returned data; never loop over `World.block` once per cell for normal chunk loading. Benchmark chunk bootstrap when changing this boundary.
- Keep browser adapters dependency-free and tested, but keep authoritative inventory/crafting rules in Bend 2 as they migrate.
- Reach a `world/*.bend` module only through `web/bend-modules.js`. It is the
  single place that knows how the JS lane spells a datatype, so a second path
  around it reintroduces the bug it exists to prevent.
- A Bend `Nat` cannot be negative and the 2.0.32 JS lane refuses one, so a cell
  or chunk below the origin is spelled by `cellNat`/`chunkNat` on the way in and
  read back the same way. Never spell a cell twice: a double fold addresses a
  cell nothing else names. `tests/inventory.test.mjs` pins the offset.
- Keep all repository-authored source comments, UI copy, tests, plans and documentation in English.
- Add a failing test before changing behavior, then run the focused test, implement the smallest fix, and run the full checks.
- For a bug fix, keep the regression at the failing contract seam and add a browser smoke assertion when the symptom crosses into WebGL or input handling.
- Do not expand adjacent block/item contracts while fixing one behavior without a focused test and an explicit scope justification in the final report.
- Treat delegated changes as untrusted until the parent reviews their diff and reruns the affected focused checks plus `npm run verify`.
- Keep block IDs and their meanings synchronized through one explicit contract. Current IDs are documented in `world/world.bend` and `web/inventory.js`.
- Preserve affine/termination guarantees in Bend. Do not use `@unsafe` to hide a failed proof.
- Prefer focused changes over broad refactors. Do not add a dependency when WebGL or the existing runtime is enough.
- When moving a file, move its callers with it in the same change: every `import`,
  every shell script path, every `scripts/test-suite.sh` entry and every prose
  reference. Then run `npm run verify`, which is what catches the ones missed.
- Never commit credentials, generated `dist/`, `.tools/`, or local caches.

## GitHub

The origin is `https://github.com/lennix1337/bend2craft.git`. Always use the `lennix1337` GitHub account in this repository (`gh auth switch --user lennix1337`); never use any other authenticated account here. Do not force-push, merge, release, or change repository settings without explicit authorization. Before pushing, run the checks above and inspect `git status` and `git diff`.

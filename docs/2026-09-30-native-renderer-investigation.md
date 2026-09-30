# Native renderer investigation log

A record of one investigation session, kept because the measurements are the
useful part and because three of the conclusions here contradict what the code
looks like at a glance. Every number below was measured on the machine named in
each table; none is extrapolated unless it says so.

Platform: WSL2 on an AMD Ryzen 7 9800X3D (8 cores visible to WSL), Bend 2.0.32
pinned, native C target, `--gpu off`, 8 threads, 7-9 samples, per-call medians.

## Summary

The native client works: it opens a real window on the Windows desktop, takes
real key events, moves, collides, digs, places, saves and quits cleanly. What it
could not do, until this session, was show a world, and the reasons turned out to
be four separate defects rather than one.

The renderer's cost is dominated by a quadratic term that nobody had measured, and
the agreement gate between the two renderers is structurally incapable of
catching a whole class of visual bugs, because it compares which block is nearest
and never what gets painted.

## Defects found and fixed

### The palette covered 11 of 30 block ids

`Voxel.block_color` knew ids 0-10 and returned one flat `rgb(170, 170, 170)` for
everything above. `world/structures.bend` builds a village out of ids 11 (furnace),
13 (bed) and 14 (door), so the entire village painted as a single grey slab, shaded
to `0x8E8E8E` on the 84% face.

Fixed by rewriting the table as a `match` over the id, with 11-29 taken from the
base colour of the matching material in `web/texture-atlas.js` — the renderer that
has always displayed them correctly. Ids 0-10 are byte-identical, so every pinned
golden still holds.

### The agreement gate could not see it

`native/face-probe` compares the face renderer against the per-pixel ray renderer
and reports zero disagreements at 32x32, 64x64 and 128x128. It compares *which
block is nearest*, never the colour painted. A renderer that paints every surface
one colour passes that gate with a perfect score.

Added `palette_walk`, which fails on the first id with no colour, and
`village_palette_test`, which requires furnace, bed and door to be mutually
distinct. `unknown_block_color()` is now a named constant so "the palette ran out"
is visible in a frame instead of looking like a material.

### The client crashed on its way out

`native-client: the loop asked for a step on a closed frame`. The loop turned a
spent frame, whose empty events set `running` back to true, so the client neither
drew nor quit. `native/client-probe/smoke.sh` passed anyway, because it only
checked that the process was gone — which a crash also satisfies. The smoke now
requires exit status 0.

The fix is not a patch to the old loop. A self-recursive loop in Bend 2.0.32
cannot both end on a data condition and satisfy the termination checker: the
checker needs every self-call argument unchanged up to the one that visibly
shrank, and a `case` that binds a frame's fields makes every other parameter
unmatchable. The `Maybe` the tick returns is the mechanism `App.loop` already uses
to end, which is why it exists. The client uses it, and the pointer grab became
two grabs with a pause between them, because a `Window` is a linear handle and a
retry loop would need the same one twice in a pass.

### The renderer could only see one chunk

`Face.render_size_at_with_tile_size` took a single `Array<U32>`, capping the
visible world at 16x16 cells. From inside the village at spawn that is a wooden
wall; at a chunk edge it is an all-sky frame.

The walk was already generic in its step count, so generalising it was
parameterising the extent and adding a builder that lays several chunks out as one
array. The gate came back with identical numbers (`faces=1298`, `same=1024/4096/16384`,
`wrong_block=0`), so the refactor is semantically transparent.

## The spawn contract, and why the client cannot use it yet

The browser asks `World.spawn_cell(seed)`. The client hardcoded `(25, 25, 9)`.
For seed 1337 the contract answers `(25, 16, 9)` — and with the region at chunk
(1, 1) that is local `(9, 0)`, the minimum z edge. A camera at yaw 0 looks toward
-z with zero rows of world in front of it, so the frame is all sky and a dig ray
leaves the region before it reaches anything.

Wiring the contract in is blocked on the region origin, and the origin is also what
the camera's eye is rebased onto. Moving it to chunk (0, 0) covers the whole
48x48 world and fixes the spawn, but it invalidates the frame probe's single-chunk
render fixtures, which compare a one-chunk ray render against a sky control. Three
chunks per axis at origin (0, 0) also built a 46,080-cell collision region and the
machine stack overflowed, so the view region and the collision region have to be
sized apart.

## Measurements

### Resolution, one chunk

| size | pixels | render | marginal |
|------|--------|--------|----------|
| 32x32 | 1,024 | 6.56 ms | |
| 64x64 | 4,096 | 8.65 ms | 0.68 us/px |
| 128x128 | 16,384 | 22.80 ms | 1.15 us/px |
| 256x256 | 65,536 | 74.33 ms | 1.09 us/px |
| 512x512 | 262,144 | 349.50 ms | 1.42 us/px |

Cost is linear in pixels at roughly 1.1-1.4 us each. `640x480` is 307,200 pixels,
which projects to about 436 ms against a 16.7 ms budget: **26x over**.

**64x64 is the largest power-of-two size that fits 60 Hz.** 128x128 is ~24 ms,
about 41 FPS. A 128x128 window at 41 FPS against 64x64 at ~87 FPS is a product
decision, not an engineering one, and it has not been made.

### Region width

| | 1 chunk | 2x2 region |
|---|---|---|
| frame 64x64 | 11.10 ms | 26.30 ms |
| render 32x32 | 6.93 | 21.41 |
| render 64x64 | 9.85 | 19.10 |
| region build | 0.35 | 1.30 |

The region misses the budget at *every* resolution, which is the tell: 32x32 costs
more than 64x64. The cost is not per-pixel, it is the four times the data going
through passes that are already O(n) per layer.

### Tile edge

| depth | size | edge 8 | edge 16 | edge 32 |
|-------|------|--------|---------|---------|
| 5 | 32x32 | 6.49 | 6.57 | 10.32 |
| 6 | 64x64 | 10.30 | 8.65 | 12.55 |
| 7 | 128x128 | 38.90 | 20.80 | 24.40 |
| 8 | 256x256 | 218.67 | 74.33 | 64.33 |
| 9 | 512x512 | 1370.00 | 349.50 | 222.00 |

The crossover sits between 128 and 256. Below it the per-tile cost dominates and
16 wins; above it the per-pixel bucket walk dominates and 32 wins. The client now
derives the edge from the depth of the frame being built: 16 below 256x256, 32
above. This is worth 32% at 512x512.

### Where the render time actually goes

| phase | cost |
|-------|------|
| world build | 0.35 ms |
| face extraction | 1.35 ms |
| everything else | ~5-7 ms |

Face extraction is 15% of the render. The rest is projection and bucketing, and
`native/face-probe/face_probe.bend` says why, at the comment above `bucket_all`:

> The row-major builder below scans this list once per tile and conses matches
> into that tile's bucket.

It scans the 1,298 projected screens once **per tile**. The term is
`tiles x faces`:

| size | tiles (edge 16) | screen visits |
|------|-----------------|---------------|
| 32x32 | 2x2 | 5,192 |
| 64x64 | 4x4 | 20,768 |
| 128x128 | 8x8 | 83,072 |
| 256x256 | 16x16 | 332,288 |
| 512x512 | 32x32 | 1,328,576 |

That one term explains every other observation in this file: why larger tiles win
so decisively, why the arithmetic short-circuit below barely helped, and why the
marginal cost per pixel gets *worse* with resolution.

Bucketing by tile **row** instead of by tile would reduce the term to
`across x faces` — 4x fewer visits at 128x128 and 16x fewer at 512x512. It is the
highest-value change left and it has not been done.

## Attempts that did not land

### Short-circuiting the candidate test

`closer` computed the plane intersection — a divide, three multiplies and six float
compares — for every candidate in a tile, even when the cheap screen-box test had
already rejected it. Splitting the two across a `match` on a *parameter* (rather
than `Bool.pick`, whose arguments are built before the call) skips the rejected
branch.

Worth 9% at 64x64 and 1.7% at 512x512. It is in, and the gate is unchanged, but it
is small — and being small is what identified the real bottleneck above. A guess
that costs 9% is a sign the hypothesis was wrong, not that the work was wasted.

### One-pass region layout

`List.drop` is O(n) and the region builder called it once per chunk per layer, so
laying four chunks out cost `chunks * layers` full passes before any face was
looked at. The fix is to consume each chunk's cells once.

It is a nested loop, and Bend allows no helper cycles, so every decomposition hit
the same wall: separate helpers are a cycle; flattening into one loop needs two
fields of a record read inside a `match` arm, which is a scrutinee error; unrolling
the chunk loop for 1, 2, 4 and 9 works but only for sizes already known. Reverted.
The target is still right — it is just not reachable from Bend's recursion rules
without changing the data the walk consumes.

### Faster compilation

Bend 2.0.34 was evaluated and the pin left at 2.0.32. `window.c` is byte-identical
between the two, so the 60 Hz cap (`due = ... + 16666667`) and the X11 backend are
unchanged. The `base.bend` diff is 181 lines of internal refactor — `Bool.full_add`
rewritten with `xor`/`and`/`or`, some `Cmp` cleanup — with no new defs. Compiled the
benchmark with both and ran seven samples of each:

| phase | 2.0.32 | 2.0.34 |
|-------|--------|---------|
| frame 64x64 | 11.45 ms | 11.85 ms |
| render 128x128 | 22.70 | 22.20 |
| render 256x256 | 76.67 | 79.67 |
| render 512x512 | 355.50 | 362.00 |

Everything is inside +/-4%, which is noise. **The compiler version is not a
performance lever here**, and that is now a measurement rather than an inference.

## Bend 2 and Windows

The runtime does not support Windows, and says so in `vendor/bend/WONTFIX.txt`:

> A handle type is a law of Base (#825) ... A user law of kind `Type` counts as
> open, so a custom effect reuses a Base handle type.
>
> CAPACITY ... Windows is not supported (#788). Use WSL.

`Window` is a `law`, not a `def`, so a project cannot shadow it, and a
project-authored Win32 effect would need a user handle type, which is an open
compiler item. The link flags in `cli_build` are conditional on the generated C
including `<X11/`, which looked like a way in until it became clear that the
runtime's own `io_eff` constructor still registers the X11 implementation and the
link resolves to it regardless.

A Windows build therefore needs a fork, at one of three depths. The cheapest is
pointing `base.bend`'s `Window` effects at a Win32 C file in `.tools/bend-local`,
which leaves `vendor/bend` untouched but is still a fork. Not taken.

WSLg, by contrast, was a configuration problem: `guiApplications=false` in
`~/.wslconfig`, off deliberately to save 200-400 MB. With it on, the client opens a
real window on the desktop at `(4841, 490)`, 64x64, accepts `w a s d`, and exits on
escape with status 0. The backup is `~/.wslconfig.bak-before-wslg`.

## Also found

**The raycast cannot reach the ground the player is standing on.**
`Player.raycast.loop(160n, ...)` steps 0.05 at a time from 0.1, so the reach is
8.05 cells. The spawn pitch is -0.18, which puts flat ground about 9.3 cells away.
The player spawns unable to dig until they look down. The save test used to pass
by accident, because the old spawn was inside a village and a wall happened to be
within reach.

**The collision region was two-thirds of the world.** Two chunks per axis from
chunk (1, 1) is 32x32 of a 48x48 world, so a third of it had no collision at all.

**The frame benchmark was measuring a different program.** `frame_bench.bend`
inlined its own copy of the render call over a single chunk, which stopped being
what the client does the moment the client rendered a region, and its `chunk` phase
generated one chunk when the client generates the region. A benchmark that measures
a different program than the one that ships is worse than no benchmark. The client
now exposes `image_at_depth` and the benchmark calls it.

## Method

Three times in this session the intuition about where the render time went was
wrong: it was assumed to be arithmetic, then candidate count, then the region
builder. The arithmetic short-circuit was the last to be tried and the first to be
measured, and its 9% is what pointed at the real term.

The rule that came out of it: when cost grows worse than linearly with resolution,
look for a nested loop over a variable-sized structure, and count its visits
before changing anything. The table above is four measurements agreeing, not a
conclusion from reading the code.

`bend <file> --check-only` takes seconds and the native build takes six. Use it
before launching a build, every time.

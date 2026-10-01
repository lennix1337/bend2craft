# The native client

Bend 2.0.32 running as a native program: a window, a world derived from the
same `world/*.bend` contracts the browser bundle uses, a player that walks and
digs, and a save file. This directory is the target that ships. Experiments and
the measurements taken of it live in `lab/native/`, and nothing here imports
from there.

## Layout

| file | owns |
| --- | --- |
| `client.bend` | the client: the window, the event fold, the tick, the dig/place/save decisions |
| `voxel.bend` | the camera, the region grid, and the per-pixel DDA raycaster the face renderer is checked against |
| `face.bend` | the visible-face renderer: one pass over the bulk cells, bucket, project |
| `frame.bend` | one frame as data: player state, camera basis, fingerprint, and the dirty check |
| `player.bend` | the player region, collision, the chunk seam, and `Player.raycast` |
| `save.bend` | the `B2CW:1` snapshot codec and the legacy browser/multiplayer migration |
| `main.bend`, `world.bend` | the 16x16 feasibility slice: a cursor, one editable cell, a two-byte save |
| `client_test.bend` and the `*_test.bend` files | the focused regressions, all in `scripts/test-suite.sh` |

## Building and running

`scripts/bootstrap-native-bend.sh` builds the pinned CLI into
`.tools/bend-local/` once, from the vendored `vendor/bend` submodule.

```bash
bash scripts/bootstrap-native-bend.sh                       # once
.tools/bend-local/bin/bend native/client.bend -o .tools/bend-local/bin/bend2craft-client
.tools/bend-local/bin/bend2craft-client                     # 128x128
.tools/bend-local/bin/bend2craft-client --size=64           # 32, 64, 128 or 256
```

On Windows both run **inside WSL** with WSLg. On Linux or macOS they need a
graphical display. A macOS build and a desktop-visible session on Windows have
not been verified in this repository.

## Choosing a resolution

The client prints its table before the window opens:

```
     32x32   4.1 ms   ~60 FPS   render + tick, derived
     64x64   6.7 ms   ~60 FPS   render + tick, derived
  * 128x128   14.2 ms   ~60 FPS   measured frame, 2.5 ms of slack
    256x256   49.9 ms   ~20 FPS   render + tick, misses 60 Hz
```

`--size=32|64|128|256` chooses; the default is 128 and an unknown width falls back
to it. The cost column is the measured frame, and the FPS column is
`10000 / tenths` capped at 60, because the runtime's `window_pace` sleeps every
presented frame to a 16.666667 ms tick — so 60 is a ceiling, not a budget, and a
size cheaper than the tick still presents at 60 rather than at the quotient.

Bend 2.0.32 has no stdin, which is why the choice is a command-line flag rather
than a prompt: `IO` offers `print`, `args`, `get_env`, `sleep`, `now`,
`thread_count` and `random_u32`, and nothing that reads a key from a terminal.
`native/client_test.bend` divides the rate back out of each cost field rather than
reading it out of a table, so a re-measurement that drifts fails the test.

## Controls

`W`, `A`, `S`, `D` walk, mouse looks, `F` digs the aimed block, `R` places,
`T` writes the save, `Escape` leaves. A key must be released and pressed again
to act: the client tests for an edge, not a level, so a held key digs once.

The save goes to `native/client-world.b2cw` relative to the working directory,
in the `B2CW:1` format. It is **not** compatible with browser or multiplayer
saves; `native/save.bend` reads those instead, as a migration.

## Window size

`window_width()` in `client.bend` is the size the benchmarks measure and the
selector defaults to, and `frame_depth()` is the matching quadtree depth. They
are not free: the read-back of the painted frame into the `Image` quadtree the
runtime draws is the wall, at 79 ms for 1024x1024 against a 16.67 ms tick.
`lab/native/client-probe/README.md` has the measured per-size table behind the
selector, and `lab/native/2026-09-30-native-renderer-investigation.md` has the
investigation.

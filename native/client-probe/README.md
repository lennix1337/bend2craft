# native/client-probe

The native client's own frame cost, and the end-to-end proof that it runs under a
real display.

`frame_bench.bend` is the clock; `native/client.bend` is the client. Nothing in the
benchmark reimplements a rule: every stage calls the client's or a probe's own def,
so a phase can only be as wrong as the rule it calls.

## What a frame is

Between two `Window.frame` calls the client does:

1. re-ask the pointer grab,
2. fold the tick's events into the held-key mask and run the player transition,
3. read the raycast an action key would read,
4. materialise the bulk chunk,
5. render it with the face renderer at the client's tile edge,
6. let `Window.frame` walk the image into the X pixmap and free it.

`frame` and `frame_look` are the two together, which is the number the 60 Hz budget
is judged on. `tick`, `chunk` and `render` are the parts, so a regression can be
attributed rather than guessed at.

The image is read back before it is released, because a build whose result nothing
observes is elidable and a phase that measured an elided build would report the cost
of nothing. The read is a full quadtree walk, and the client pays it too:
`Window.frame` calls `window_show`, which walks the same tree with `window_fill` into
the X pixmap before `XPutImage`. The fingerprint is a fair stand-in for the present
step and leaves out only the X transfer.

The action keys are deliberately not in a timed phase: dig and save both reach the
filesystem, and a benchmark that writes the world twenty times measures the disk
rather than the tick. The edit and save paths are covered by `native/client_test.bend`.

## Measured

`bash native/client-probe/run-bench.sh` — 7 samples per phase, per-call medians,
native C executable, `--gpu off`.

AMD Ryzen 7 9800X3D, 8 cores visible to WSL2, Bend 2.0.32.

| threads | phase | size | median ms | min ms | max ms |
| --- | --- | --- | --- | --- | --- |
| 1 | tick | 128 | 0.90 | 0.90 | 0.91 |
| 1 | chunk | 128 | 0.05 | 0.05 | 0.10 |
| 1 | render | 128 | 82.40 | 79.45 | 85.75 |
| 1 | frame | 128 | 80.70 | 80.50 | 85.50 |
| 8 | tick | 128 | 0.88 | 0.88 | 0.88 |
| 8 | chunk | 128 | 0.10 | 0.05 | 0.10 |
| 8 | render | 32 | 5.98 | 5.97 | 6.30 |
| 8 | render | 64 | 9.45 | 9.45 | 9.85 |
| 8 | render | 128 | 22.55 | 22.45 | 23.40 |
| 8 | frame | 128 | 24.35 | 23.75 | 24.65 |

The 1-thread figures are 3 samples, not 7; the 8-thread ones are the current
seven-sample run. Re-run the script for the current table.

## What it says

- **64x64 fits 60 Hz with headroom.** 9.45 ms of render plus 0.88 ms of tick is
  about 10.3 ms against a 16.7 ms budget, so the client has roughly 6 ms of room
  for the X transfer and the window's own pacing.
- **128x128 does not fit 60 Hz.** 24.35 ms per frame is about 41 FPS. The plan
  previously claimed 128x128 at 60 Hz on the strength of a face-probe number taken
  at a different, sparser camera pose; measured at the client's own spawn camera,
  that claim is not supported and the plan now says so.
- **The chunk is not the cost.** Rebuilding `WorldState.chunk` every frame is
  0.10 ms, so caching the chunk would save nothing worth having. The whole cost is
  the face render at a camera that actually sees the world.
- **Threads help about 3.4x, not 8x.** The render is partly serial: the bucketing
  pass is parallel, the per-pixel selection is not.

The 16.7 ms budget comes from the pinned runtime's own frame pacing, which hardcodes
a 16666667 ns interval, so 60 Hz is the ceiling whatever the renderer does.

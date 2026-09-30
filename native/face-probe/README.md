# Native visible-face probe

This probe compares the per-pixel ray renderer in
`native/voxel-probe/voxel_probe.bend` with a visible-face renderer. Both use the
same camera rays, palette, per-face tint and quadtree image shape.

**The agreement fix now produces identical block and face IDs for every pixel in
the pinned seed-1337 view at 32², 64² and 128².** The cost is substantial: with
the selected 8-pixel tile edge, 128² takes 46.375 ms at one thread and 19.500 ms
at eight threads, so it no longer meets a 16.7 ms budget. An edge-16 experiment
measures 13.875 ms at 128²/eight threads, but is slower at one thread; the
production default remains edge 8 pending a target-thread choice.

## Pipeline and pixel correctness

1. `faces_from_chunk` walks all 5,120 cells in y/z/x order and emits every
   exposed face. Neighbor values come from carried rows, not per-cell lookups.
2. `bucket_faces` projects the four face corners to a conservative screen box
   and inserts each face into every overlapping tile. If a face crosses the
   near plane, its candidate box covers the frame; wholly-behind faces are
   discarded. Screen-coordinate conversion is clamped before integer conversion.
3. At each pixel, the renderer builds the same normalized ray as the reference,
   intersects every candidate face plane, and compares the per-pixel ray
   distance. A candidate owns the pixel only when the hit point lies within the
   face's unit square. This world-space plane/quad test is equivalent to a
   point-in-projected-quad test, without a screen-edge winding convention.

The conservative near-plane box can add candidates, but it cannot add visible
pixels: the ray/plane intersection and unit-square test remain authoritative.
An exactly parallel ray has no plane hit (`abs(direction) <= 0.00001`); a hit
must be farther than `0.0001`. The local quad test allows `0.00001` world-space
tolerance for floating-point boundary comparisons.

The focused test covers a single-block silhouette, a parallel/edge-on face, a
face crossing the near plane, a subpixel face between pixel sample centres, and
a camera inside a solid block. It also checks front/back/away views, exact face
extraction masks, and every cell in the real chunk. The extraction scan reports
**1,298 emitted, 1,298 expected, zero mismatches**.

## Agreement gate

On `World.chunk(1337n, 0n, 0n)` at eye `(8, 14, 0.5)`, yaw `0.7`, pitch `0.30`,
the regression compares every pixel's block and face against the ray renderer.
`wrong_block` counts different blocks when both renderers hit a block;
`only_face` counts a face-renderer block where the ray sees sky; `only_ray` is the
opposite. `block_diff` includes all block-visibility or block-identity
disagreements, and `face_only` is a same-block/different-face result.

The test fails if `wrong_block`, `only_face`, or total `block_diff` exceeds 1%
of frame pixels, and pins `only_ray=0`. This is a ceiling, not an acceptable
measured error rate: the three tested frames currently have **0% wrong-block,
0% spurious-block, and 0% total block disagreement**.

| size | pixels | same | both empty | face only | block diff | only face | only ray | wrong block |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 32² | 1,024 | 1,024 | 553 | 0 | 0 | 0 | 0 | 0 |
| 64² | 4,096 | 4,096 | 2,219 | 0 | 0 | 0 | 0 | 0 |
| 128² | 16,384 | 16,384 | 8,889 | 0 | 0 | 0 | 0 | 0 |

`same` includes both-empty pixels; `same + face_only + block_diff` equals the
frame pixel count. Zero disagreement is established only for this fixed chunk,
camera and tested sizes. The 1% gate leaves a bounded allowance for future
floating-point boundary cases; arbitrary chunks and camera poses are not proven
by this fixture.

## Reproduce

```bash
bash native/face-probe/run.sh
```

The harness requires Bend 2.0.32 and a native C compiler. It runs correctness
checks with `--gpu off` at `--threads 1` and `8` before collecting seven timing
samples per phase. Timings are milliseconds per call, shown as median and
minimum–maximum range. Measurements below are from WSL2 x86_64, AMD Ryzen 7
9800X3D (8 cores visible), Ubuntu clang 21.1.8.

## Full-frame measurements

The selected production path is scatter bucketing with `tile_size() = 8`. A
frame includes chunk generation, extraction, projection/bucketing, image
generation and fingerprinting. All frame sizes below were measured with seven
samples at both thread counts.

| threads | size | face frame ms |
| --- | ---: | ---: |
| 1 | 32² | 7.188 [6.875, 7.438] |
| 1 | 64² | 14.438 [13.938, 14.875] |
| 1 | 128² | 46.375 [45.875, 47.375] |
| 1 | 256² | 222.500 [218.250, 227.250] |
| 8 | 32² | 4.000 [3.875, 4.188] |
| 8 | 64² | 6.625 [6.562, 6.938] |
| 8 | 128² | 19.500 [18.750, 19.875] |
| 8 | 256² | 97.750 [96.500, 99.250] |

For context, the reference ray renderer measured 21.812 [21.125, 22.688],
54.812 [52.812, 55.625], and 184.125 [179.625, 186.500] ms at sizes 32²,
64², and 128² with one thread. At eight threads it measured 16.938
[16.500, 17.062], 32.438 [32.000, 33.188], and 95.250 [94.750, 96.250] ms.

| threads | size | prep ms | extract ms | project ms |
| --- | ---: | ---: | ---: | ---: |
| 1 | 32² | 2.188 [2.062, 2.250] | 1.312 [1.266, 1.328] | 0.578 [0.547, 0.609] |
| 1 | 64² | 3.375 [3.188, 3.750] | 1.297 [1.250, 1.312] | 1.891 [1.797, 1.922] |
| 1 | 128² | 11.500 [10.750, 12.625] | 1.281 [1.266, 1.359] | 9.375 [9.203, 9.609] |
| 8 | 32² | 2.125 [2.000, 2.500] | 1.297 [1.250, 1.391] | 0.578 [0.562, 0.609] |
| 8 | 64² | 3.375 [3.312, 3.562] | 1.297 [1.266, 1.375] | 1.844 [1.797, 1.922] |
| 8 | 128² | 11.125 [11.000, 11.500] | 1.312 [1.266, 1.375] | 9.484 [9.188, 9.641] |

`extract` includes chunk generation and face extraction. `project` reuses an
extracted list and includes projection, bucketing and a full candidate digest.
The near-plane fallback accounts for additional candidates in this camera view;
the exact pixel test also performs more work per candidate than the former
scalar-depth box test.

## Tile and bucket measurements

The table compares scatter tile edges at 128². Candidate count is charged once
for each pixel in a tile. Edge 16 is a measured option, not the configured
default.

| edge | candidates | candidates/pixel | project, 1 thread | frame, 1 thread | project, 8 threads | frame, 8 threads |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 8 | 796,736 | 48.629 | 9.359 [9.234, 9.656] | 46.250 [45.000, 48.000] | 9.562 [9.453, 10.156] | 19.500 [19.375, 19.750] |
| 16 | 1,123,072 | 68.546 | 1.859 [1.812, 1.938] | 47.500 [46.875, 48.375] | 1.875 [1.844, 2.047] | 13.875 [13.625, 14.375] |
| 32 | 2,188,288 | 133.562 | 0.609 [0.578, 0.609] | 86.375 [84.500, 89.250] | 0.609 [0.578, 0.688] | 21.625 [21.500, 22.375] |

The whole-frame edge-8 timing in the previous table comes from the independent
frame benchmark; the tile comparison uses the tuning benchmark. They agree
within sampling variation. Edge 16 reduces scatter-build cost enough to win at
128²/eight threads, despite increasing candidate count, and is the only measured
configuration here that fits 16.7 ms at that size. It loses at one thread and
is not changed as the default in this visual-correctness task.

At edge 8, source-level bucket list-cell counts (not allocator/GC metadata) are:

| size | direct scatter grid | row-major grid | projected screen list | row-major total |
| --- | ---: | ---: | ---: | ---: |
| 32² | 13,664 | 2,150 | 1,298 | 3,448 |
| 64² | 46,719 | 4,456 | 1,298 | 5,754 |
| 128² | 234,161 | 12,721 | 1,298 | 14,019 |

Row-major uses fewer list cells but its tile-by-face containment scans remain a
measured alternative; scatter remains the selected builder.

## Budget verdict and limits

- With the configured edge 8, **128² does not fit 16.7 ms** at one or eight
  threads. The largest measured size meeting that budget at both thread counts
  is 64². The measured edge-16/eight-thread option fits 128² at 13.875 ms.
- At 33.3 ms, configured edge 8 supports 128² at eight threads but not at one;
  256² exceeds the budget at both thread counts.
- The agreement gate is verified only for one generated chunk and one camera
  pose. This remains a single-chunk opaque renderer with no streaming,
  transparency, texture, or lighting model. Near-plane-crossing faces use a
  conservative full-frame candidate box, so other camera poses may have
  different performance even though exact per-pixel coverage is retained.

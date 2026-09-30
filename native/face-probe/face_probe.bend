import Base
import ../../world/world.bend as World
import ../voxel-probe/voxel_probe.bend as Voxel

# ---------------------------------------------------------------------------
# Visible-face renderer, against the per-pixel ray renderer in
# `voxel_probe.bend`.
# The ray renderer pays about 21 DDA probes per pixel, each probe three nested
# `List.get` walks, so a pixel costs roughly 1100 cons steps. This renderer inverts
# the work:
#
#   1. `faces_from_chunk` walks the 5120 bulk cells once, in the same y/z/x
#      order the nested grid uses, and emits one `Face` per exposed side. All six
#      neighbours of a cell are already in hand from the walk: -x is the previous
#      value, +x the next one, -z the previous z-row, +z the next z-row, and
#      -y/+y the carried rows of the layers below and above. No neighbour is ever
#      read back from the grid, so extraction is linear in the cell count.
#   2. `bucket_faces` projects each face's corners to a conservative screen box
#      and pushes the face into every screen tile that box meets.
#   3. `image` casts the corresponding pixel ray against each candidate's plane,
#      keeps only hits inside the unit face quad, and chooses the nearest hit.
#
# The quadtree fold, the block palette and the per-face tint are reused from
# `Voxel` unchanged, so the two renderers are directly comparable per pixel.
# ---------------------------------------------------------------------------

# One exposed side of one solid cell.
#
# `dir` is the ray renderer's own label for the side the face sits on, so no
# translation table is needed to compare or to tint: 3 is -x, 0 is +x, 4 is -y,
# 1 is +y, 5 is -z and 2 is +z. Those are the labels `Voxel.trace_steps` assigns
# when a ray enters a cell through that side, and `Voxel.shade_color` reduces
# them by `mod 3` to the same three axes.
type Face is Data:
  Face{x: U32, y: U32, z: U32, dir: Nat, block: U32}

# The six neighbour block values around one cell, gathered from the walk.
type Neighbours is Data:
  Neighbours{block: U32, xm: U32, xp: U32, ym: U32, yp: U32, zm: U32, zp: U32}

# A world point.
type P is Data:
  P{x: F32, y: F32, z: F32}

# A projected corner: screen position and camera-space depth.
type Q is Data:
  Q{sx: F32, sy: F32, depth: F32}

# The running bounds over a face's four projected corners.
type Bounds is Data:
  Bounds{x0: F32, y0: F32, x1: F32, y1: F32, near: F32, alive: Bool}

# A face reduced to a conservative pixel box. Near-plane-crossing faces use the
# full frame as their candidate box; the ray/quad test still decides ownership.
type Screen is Data:
  Screen{x0: U32, y0: U32, x1: U32, y1: U32, depth: F32, block: U32, dir: Nat,
    alive: Bool, origin: P}

# The screen tile grid: tile rows, then buckets within a row, then the faces in a
# bucket. A bucket is only ever read, so one `&2` grid is shared by every pixel.
type Tiles is Data:
  Tiles{rows: List<&2, List<&2, List<&2, Screen>>>, size: U32, edge: U32,
    camera: Voxel.Camera, half: F32, focal: F32}

# The winning face for one pixel, with how many candidates were considered.
type Best is Data:
  Best{block: U32, dir: Nat, depth: F32, candidates: U32}

# What an observation pass counted over one frame.
type Observed is Data:
  Observed{hits: U32, wrong: U32, sky: U32}

# The ray-versus-face agreement tally for one frame.
type Agreement is Data:
  Agreement{same: U32, face_only: U32, block_diff: U32}

def agreement_same(a: Agreement) -> U32:
  match a:
    case Agreement{same, face_only, block_diff}:
      same

def agreement_face_only(a: Agreement) -> U32:
  match a:
    case Agreement{same, face_only, block_diff}:
      face_only

def agreement_block_diff(a: Agreement) -> U32:
  match a:
    case Agreement{same, face_only, block_diff}:
      block_diff

# One layer is `extent_z` z-rows of `extent_x` cells; `Layers` is 20 of those.
type Layers is Data:
  Layers{rows: List<&2, List<&2, U32>>}

# A region of `columns` x `rows` chunks is `chunk_size * columns` cells wide and
# `chunk_size * rows` deep. The walks below take that extent as an argument instead
# of reading one chunk's width, so the same walk covers one chunk or nine and the
# face count stops being capped by the size of a single `Array<U32>`.
def width() -> U32:
  U32.from_nat(World.chunk_size())

def extent_x(columns: Nat) -> U32:
  U32.mul(width(), U32.from_nat(columns))

def extent_z(rows: Nat) -> U32:
  U32.mul(width(), U32.from_nat(rows))

def layer_count() -> Nat:
  World.max_y()

def tile_shift() -> Nat:
  3n

def share_blocks(blocks: List<&1, U32>) -> List<&2, U32>:
  match blocks:
    case Nil{}:
      []
    case +block <> rest:
      block <> share_blocks(rest)

def air_row(extent: U32) -> List<&2, U32>:
  List.replicate(U32, U32.to_nat(extent), 0)

def air_values(cells: U32, rows_deep: U32) -> List<&2, U32>:
  List.replicate(U32, U32.to_nat(U32.mul(cells, rows_deep)), 0)

def rows_of(remaining: Nat, +cells: U32, +values: List<&2, U32>,
  +rows: List<&2, List<&2, U32>>) -> List<&2, List<&2, U32>>:
  match remaining:
    case 0n:
      List.reverse(&2, List<&2, U32>, rows)
    case 1n+p:
      +row : List<&2, U32> = List.take(&2, U32, values, U32.to_nat(cells))
      rows_of(p, cells, List.drop(&2, U32, values, U32.to_nat(cells)), row <> rows)

def air_layer(+cells: U32, +rows_deep: U32) -> List<&2, List<&2, U32>>:
  rows_of(U32.to_nat(rows_deep), cells, air_values(cells, rows_deep), [])

def layers_of(remaining: Nat, +cells: U32, +rows_deep: U32, +values: List<&2, U32>,
  +layers: List<&2, List<&2, List<&2, U32>>>) -> List<&2, List<&2, List<&2, U32>>>:
  match remaining:
    case 0n:
      List.reverse(&2, List<&2, List<&2, U32>>, layers)
    case 1n+p:
      +per_layer = U32.to_nat(U32.mul(cells, rows_deep))
      layers_of(p, cells, rows_deep, List.drop(&2, U32, values, per_layer),
        rows_of(U32.to_nat(rows_deep), cells,
          List.take(&2, U32, values, per_layer), []) <> layers)

# ---------------------------------------------------------------------------
# 1. Face extraction: one forward pass, no per-neighbour lookups.
# ---------------------------------------------------------------------------

# Emit the exposed sides of one cell. A side is exposed when the cell is solid
# and the neighbour on that side is air. The label is the ray renderer's label
# for that side, so a face's index is directly comparable with a ray hit's.
#
# The six sides are folded in a fixed order (3, 0, 4, 1, 5, 2) so each step
# receives the accumulator once and returns it once, which the linear
# accumulator demands.
# Offer one face, or nothing, so the shared accumulator is consumed exactly once
# on each path. `Bool.pick` would need both of its branches to hold the
# accumulator at the same time, which the linear check rejects.
def offer(cond: Bool, +x: U32, +y: U32, +z: U32, dir: Nat, +b: U32) -> Maybe<&2, Face>:
  Bool.pick(Maybe<&2, Face>, cond, Some{Face{x, y, z, dir, b}}, None{})

def put(m: Maybe<&2, Face>, acc: List<&2, Face>) -> List<&2, Face>:
  match m:
    case None{}:
      acc
    case Some{face}:
      face <> acc

def emit_sides(+b: U32, +xm: U32, +xp: U32, +ym: U32, +yp: U32, +zm: U32,
  +zp: U32, +x: U32, +y: U32, +z: U32, acc: List<&2, Face>) -> List<&2, Face>:
  +a = put(offer(U32.is_eq(xm, 0), x, y, z, 3n, b), acc)
  +c = put(offer(U32.is_eq(xp, 0), x, y, z, 0n, b), a)
  +d = put(offer(U32.is_eq(ym, 0), x, y, z, 4n, b), c)
  +e = put(offer(U32.is_eq(yp, 0), x, y, z, 1n, b), d)
  +f = put(offer(U32.is_eq(zm, 0), x, y, z, 5n, b), e)
  put(offer(U32.is_eq(zp, 0), x, y, z, 2n, b), f)

# Emit the exposed sides of one cell. A side is exposed when the cell is solid
# and the neighbour on that side is air. The label is the ray renderer's label
# for that side, so a face's index is directly comparable with a ray hit's.
#
# The six sides are folded in a fixed order (3, 0, 4, 1, 5, 2) so each step
# receives the accumulator once and returns it once, which the linear
# accumulator demands.
def emit(solid: Bool, b: U32, xm: U32, xp: U32, ym: U32, yp: U32, zm: U32, zp: U32,
  +x: U32, +y: U32, +z: U32, acc: List<&2, Face>) -> List<&2, Face>:
  match solid:
    case False{}:
      acc
    case True{}:
      emit_sides(b, xm, xp, ym, yp, zm, zp, x, y, z, acc)

# Walk the 16 cells of one z-row. Five rows are peeled in lockstep, so every
# neighbour of the current cell is a list head: `zm_row` is the same x of the
# previous z-row, `row` is this cell, `zp_row` the next z-row, `ym_row` the same
# x of the layer below and `yp_row` the layer above. `prev_value` carries the -x
# neighbour, because it is the cell just visited.
def x_walk(remaining: Nat, +zm_row: List<&2, U32>, +row: List<&2, U32>,
  +zp_row: List<&2, U32>, +ym_row: List<&2, U32>, +yp_row: List<&2, U32>,
  +prev_value: U32, +x: U32, +y: U32, +z: U32, +acc: List<&2, Face>) -> List<&2, Face>:
  match remaining:
    case 0n:
      acc
    case 1n+r:
      match zm_row row zp_row ym_row yp_row:
        case Nil{} _ _ _ _:
          acc
        case _ Nil{} _ _ _:
          acc
        case _ _ Nil{} _ _:
          acc
        case _ _ _ Nil{} _:
          acc
        case _ _ _ _ Nil{}:
          acc
        case zm <> zmt +h <> t +zp <> zpt ym <> ymt yp <> ypt:
          +xp = Maybe.default(&2, U32, List.head(&2, U32, t), 0)
          +faces = emit(U32.is_ne(h, 0), h, prev_value, xp, ym, yp, zm, zp, x, y, z, acc)
          x_walk(r, zmt, t, zpt, ymt, ypt, h, (x + 1 : U32), y, z, faces)

# Walk the 16 z-rows of one layer. The three carried layer cursors give the
# below/this/above rows at the same z, and each step advances all of them. The
# walk runs `rows_deep` z-rows and each of those runs `cells` x-steps, which is what
# lets one region of chunks be walked with the same code that walks a single chunk.
def z_walk(remaining: Nat, +cells: U32, +below: List<&2, List<&2, U32>>,
  +here: List<&2, List<&2, U32>>, +above: List<&2, List<&2, U32>>,
  +prev_row: List<&2, U32>, +z: U32, +y: U32, +acc: List<&2, Face>) -> List<&2, Face>:
  match remaining:
    case 0n:
      acc
    case 1n+r:
      match below here above:
        case Nil{} _ _:
          acc
        case _ Nil{} _:
          acc
        case _ _ Nil{}:
          acc
        case b <> bt h <> ht a <> at:
          +zprow = Maybe.default(&2, List<&2, U32>,
            List.head(&2, List<&2, U32>, ht), air_row(cells))
          +x_walked = x_walk(U32.to_nat(cells), prev_row, h, zprow, b, a, 0, 0, y, z, acc)
          z_walk(r, cells, bt, ht, at, h, (z + 1 : U32), y, x_walked)

# Walk the 20 layers. `l0..l3` are the layers y-1, y, y+1 and y+2, so the whole
# run keeps the rows it needs one and two layers ahead without an index walk.
def layer_walk(remaining: Nat, +cells: U32, +rows_deep: U32,
  +l0: List<&2, List<&2, U32>>, +l1: List<&2, List<&2, U32>>,
  +l2: List<&2, List<&2, U32>>, +l3: List<&2, List<&2, U32>>,
  +rest: List<&2, List<&2, List<&2, U32>>>, +y: U32, +acc: List<&2, Face>) -> List<&2, Face>:
  match remaining:
    case 0n:
      acc
    case 1n+r:
      +walked = z_walk(U32.to_nat(rows_deep), cells, l0, l1, l2, air_row(cells), 0, y, acc)
      +l3_next = Maybe.default(&2, List<&2, List<&2, U32>>,
        List.head(&2, List<&2, List<&2, U32>>, rest), air_layer(cells, rows_deep))
      layer_walk(r, cells, rows_deep, l1, l2, l3, l3_next,
        List.tail(&2, List<&2, List<&2, U32>>, rest), (y + 1 : U32), walked)

# The head layer of a layer stack, or all air when the stack is exhausted. This
# is what makes the y=0 and y=19 boundaries read as air without a bounds check.
def head_layer(stack: List<&2, List<&2, List<&2, U32>>>, cells: U32,
  rows_deep: U32) -> List<&2, List<&2, U32>>:
  match stack:
    case Nil{}:
      air_layer(cells, rows_deep)
    case head <> rest:
      head

# The 20 real layers in y order, behind one all-air layer so the walk that
# carries the layer below reads air at y=0 rather than the layer itself. Two
# air layers are not needed at the top: `head_layer` turns a missing layer into
# air, and the walk only ever looks one layer past the last real one.
def padded_layers(flat: List<&2, U32>, +cells: U32, +rows_deep: U32) ->
  List<&2, List<&2, List<&2, U32>>>:
  +air : List<&2, List<&2, U32>> = air_layer(cells, rows_deep)
  air <> layers_of(World.max_y(), cells, rows_deep, flat, [])

# `layer_walk` needs the layers y-1, y, y+1 and y+2, plus the tail of the stack
# beginning at y+3. Four heads and one tail over the same shared stack give all
# five cursors without an index walk.
def faces_from_layers(+stack: List<&2, List<&2, List<&2, U32>>>, +cells: U32,
  +rows_deep: U32) -> List<&2, Face>:
  +s1 = List.tail(&2, List<&2, List<&2, U32>>, stack)
  +s2 = List.tail(&2, List<&2, List<&2, U32>>, s1)
  +s3 = List.tail(&2, List<&2, List<&2, U32>>, s2)
  +s4 = List.tail(&2, List<&2, List<&2, U32>>, s3)
  layer_walk(layer_count(), cells, rows_deep, head_layer(stack, cells, rows_deep),
    head_layer(s1, cells, rows_deep), head_layer(s2, cells, rows_deep),
    head_layer(s3, cells, rows_deep), s4, 0, [])

# One chunk is the region of one chunk by one chunk, so the single-chunk entry the
# agreement gate uses stays the same walk over the same numbers.
def faces_from_chunk(chunk: Array<U32>) -> List<&2, Face>:
  faces_from_layers(padded_layers(share_blocks(Array.to_list(~U32, chunk)),
    extent_x(1n), extent_z(1n)), extent_x(1n), extent_z(1n))

# --- a region of chunks -----------------------------------------------------
#
# The renderer's input used to be exactly one `Array<U32>`, which capped the visible
# world at 16x16 cells: from inside a village that is a wooden wall, and the camera at
# the chunk's own edge has nothing in front of it at all. A region is the same walk
# over a wider footprint, so the only new code here is laying several chunks out as one
# array. The chunks arrive in region order, one chunk row at a time and x within it,
# because concatenating their layers in that order is exactly the x-fastest layout
# `rows_of` and the walks already read.
#
# The layout used to reach into each chunk with `List.drop` once per layer, and
# `List.drop` is O(n), so four chunks cost `chunks * layers` full passes over every
# cell before a single face was looked at. That was the whole of the region's extra
# fixed cost: 20.6 ms of plumbing against 6.3 ms of work, barely moving with the output
# resolution. Cutting a chunk consumes its cells instead, so the layout is one pass.

def chunk_blocks(chunk: Array<U32>) -> List<&2, U32>:
  share_blocks(Array.to_list(~U32, chunk))

# `per` cells off the front of a chunk, in order, with what is left. A record rather
# than a bare pair because the two halves have different types and naming them makes
# the call sites read.
def chunk_layer(blocks: List<&2, U32>, y: Nat) -> List<&2, U32>:
  +per_chunk = U32.to_nat(U32.mul(width(), width()))
  List.take(&2, U32, List.drop(&2, U32, blocks, Nat.mul(y, per_chunk)), per_chunk)

def chunk_layers(+chunks: List<&2, List<&2, U32>>, +y: Nat) -> List<&2, List<&2, U32>>:
  match chunks:
    case Nil{}:
      []
    case blocks <> rest:
      chunk_layer(blocks, y) <> chunk_layers(rest, y)

def region_layer(chunks: List<&2, List<&2, U32>>, y: Nat) -> List<&2, U32>:
  List.concat(&2, U32, chunk_layers(chunks, y))

def region_layers(remaining: Nat, +y: Nat, +chunks: List<&2, List<&2, U32>>) ->
  List<&2, List<&2, U32>>:
  match remaining:
    case 0n:
      []
    case 1n+r:
      region_layer(chunks, y) <> region_layers(r, Nat.add(y, 1n), chunks)

def region_flat(chunks: List<&2, List<&2, U32>>) -> List<&2, U32>:
  List.concat(&2, U32, region_layers(layer_count(), 0n, chunks))

def faces_from_chunks(+chunks: List<&2, List<&2, U32>>, +columns: Nat, +rows: Nat) ->
  List<&2, Face>:
  faces_from_layers(padded_layers(region_flat(chunks), extent_x(columns), extent_z(rows)),
    extent_x(columns), extent_z(rows))

def face_total(faces: List<&2, Face>) -> U32:
  match faces:
    case Nil{}:
      0
    case +face <> rest:
      (1 + face_total(rest) : U32)

# The side labels present at one cell, as a bitmask over 0..5, and the count.
type At is Data:
  At{mask: U32, total: U32}

def face_bit(dir: Nat) -> U32:
  U32.shln(1, dir)

def face_at_step(faces: List<&2, Face>, +x: U32, +y: U32, +z: U32, +mask: U32,
  +total: U32) -> At:
  match faces:
    case Nil{}:
      At{mask, total}
    case Face{fx, fy, fz, dir, block} <> rest:
      +here = Bool.and(Bool.and(U32.is_eq(fx, x), U32.is_eq(fy, y)), U32.is_eq(fz, z))
      face_at_step(rest, x, y, z,
        Bool.pick(U32, here, U32.or(mask, face_bit(dir)), mask),
        Bool.pick(U32, here, (total + 1 : U32), total))

def face_at(faces: List<&2, Face>, +x: U32, +y: U32, +z: U32) -> At:
  face_at_step(faces, x, y, z, 0, 0)

# ---------------------------------------------------------------------------
# 2. Project each face to screen space and bucket it by screen tile.
# ---------------------------------------------------------------------------

# The camera basis pieces the projection needs, taken apart once per frame so
# the per-face work never re-destructures the shared camera.
def cam_eye(+camera: Voxel.Camera) -> Voxel.Vec:
  Voxel.Camera.eye(camera)

def cam_right(+camera: Voxel.Camera) -> Voxel.Vec:
  Voxel.Camera{eye, forward, right, up} = camera
  right

def cam_up(+camera: Voxel.Camera) -> Voxel.Vec:
  Voxel.Camera{eye, forward, right, up} = camera
  up

def cam_forward(+camera: Voxel.Camera) -> Voxel.Vec:
  Voxel.Camera{eye, forward, right, up} = camera
  forward

def dot3(+a: Voxel.Vec, +b: Voxel.Vec) -> F32:
  Voxel.Vec{ax, ay, az} = a
  Voxel.Vec{bx, by, bz} = b
  (ax * bx + ay * by + az * bz : F32)

def vx(+v: Voxel.Vec) -> F32:
  Voxel.Vec{x, y, z} = v
  x

def vy(+v: Voxel.Vec) -> F32:
  Voxel.Vec{x, y, z} = v
  y

def vz(+v: Voxel.Vec) -> F32:
  Voxel.Vec{x, y, z} = v
  z

# Project a world point to a pixel position and a view-space depth, using the
# same basis and the same `half`/`focal` pair the ray renderer uses, so the two
# agree on the framing.
def project(+eye: Voxel.Vec, +right: Voxel.Vec, +up: Voxel.Vec,
  +forward: Voxel.Vec, +px: F32, +py: F32, +pz: F32, +half: F32, +focal: F32) -> Q:
  +dx = (px - vx(eye) : F32)
  +dy = (py - vy(eye) : F32)
  +pz2 = (pz - vz(eye) : F32)
  +depth = dot3(forward, Voxel.Vec{dx, dy, pz2})
  +safe_depth = F32.max(depth, 0.0001)
  +sx = (half - 0.5 + focal * dot3(right, Voxel.Vec{dx, dy, pz2}) / safe_depth : F32)
  +sy = (half - 0.5 - focal * dot3(up, Voxel.Vec{dx, dy, pz2}) / safe_depth : F32)
  Q{sx, sy, depth}

# The running screen bounds over a face's four projected corners, plus a
# diagnostic mean depth and whether any/all corners are in front of the near plane.
type Span is Data:
  Span{sx0: F32, sy0: F32, sx1: F32, sy1: F32, sum: F32, alive: Bool, front: Bool}

def q_sx(q: Q) -> F32:
  match q:
    case Q{sx, sy, depth}:
      sx

def q_sy(q: Q) -> F32:
  match q:
    case Q{sx, sy, depth}:
      sy

def q_depth(q: Q) -> F32:
  match q:
    case Q{sx, sy, depth}:
      depth

# Fold one corner into the running span. Every value is a plain F32 or Bool, so
# each is read once and returned once, which is what the linear checker requires.
def widen(+sx0: F32, +sy0: F32, +sx1: F32, +sy1: F32, +sum: F32, +alive: Bool,
  +front: Bool, +x: F32, +y: F32, +depth: F32) -> Span:
  Span{F32.min(sx0, x), F32.min(sy0, y), F32.max(sx1, x), F32.max(sy1, y),
    F32.add(sum, depth), Bool.and(alive, F32.is_gt(depth, 0.0001)),
    Bool.or(front, F32.is_gt(depth, 0.0001))}

def span_sx0(s: Span) -> F32:
  match s:
    case Span{sx0, sy0, sx1, sy1, near, alive, front}:
      sx0

def span_sy0(s: Span) -> F32:
  match s:
    case Span{sx0, sy0, sx1, sy1, near, alive, front}:
      sy0

def span_sx1(s: Span) -> F32:
  match s:
    case Span{sx0, sy0, sx1, sy1, near, alive, front}:
      sx1

def span_sy1(s: Span) -> F32:
  match s:
    case Span{sx0, sy0, sx1, sy1, near, alive, front}:
      sy1

# The diagnostic mean of the four corner depths, clamped away from zero.
def span_near(s: Span) -> F32:
  match s:
    case Span{sx0, sy0, sx1, sy1, sum, live, front}:
      F32.max(F32.mul(sum, 0.25), 0.0001)

def span_sum(s: Span) -> F32:
  match s:
    case Span{sx0, sy0, sx1, sy1, sum, live, front}:
      sum

def span_alive(s: Span) -> Bool:
  match s:
    case Span{sx0, sy0, sx1, sy1, sum, live, front}:
      live

def span_front(s: Span) -> Bool:
  match s:
    case Span{sx0, sy0, sx1, sy1, sum, live, front}:
      front

# Seed the span from the first corner. The record is read exactly once, so its
# three fields are destructured together.
def span_from(+x: F32, +y: F32, +depth: F32) -> Span:
  +front = F32.is_gt(depth, 0.0001)
  Span{x, y, x, y, depth, front, front}

def seed(q: Q) -> Span:
  match q:
    case Q{x, y, depth}:
      span_from(x, y, depth)

# Fold one more corner in, reading the span through accessors so each field is
# consumed once. The corner's three values are unpacked by `corner` first,
# because a record can only be read once.
def corner(q: Q) -> Q:
  match q:
    case Q{x, y, depth}:
      Q{x, y, depth}

def span_copy(s: Span) -> Span:
  match s:
    case Span{x0, y0, x1, y1, sum, live, front}:
      Span{x0, y0, x1, y1, sum, live, front}

def widen_row(s: Span, q: Q) -> Span:
  +sp = span_copy(s)
  +c = corner(q)
  +x = q_sx(c)
  +y = q_sy(c)
  +depth = q_depth(c)
  widen(span_sx0(sp), span_sy0(sp), span_sx1(sp), span_sy1(sp), span_sum(sp),
    span_alive(sp), span_front(sp), x, y, depth)

def screen_coord(+value: F32) -> U32:
  +nonnegative = F32.max(value, 0.0)
  +bounded = F32.min(nonnegative, 65535.0)
  F32.to_u32(F32.floor(bounded))

# Reduce four projected corners to the inclusive pixel box they can cover. A
# face crossing the near plane gets a conservative full-frame box so no visible
# portion is lost; per-pixel plane and unit-square tests reject false candidates.
def corners(a: Q, b: Q, c: Q, d: Q, +block: U32, dir: Nat, origin: P) -> Screen:
  +s0 = seed(a)
  +s1 = widen_row(s0, b)
  +s2 = widen_row(s1, c)
  +s3 = widen_row(s2, d)
  +all_front = span_alive(s3)
  +any_front = span_front(s3)
  +raw_x0 = screen_coord(span_sx0(s3))
  +raw_y0 = screen_coord(span_sy0(s3))
  +raw_x1 = screen_coord(span_sx1(s3))
  +raw_y1 = screen_coord(span_sy1(s3))
  +x0 = Bool.pick(U32, all_front, raw_x0, 0)
  +y0 = Bool.pick(U32, all_front, raw_y0, 0)
  +x1 = Bool.pick(U32, all_front, raw_x1, 65535)
  +y1 = Bool.pick(U32, all_front, raw_y1, 65535)
  Screen{x0, y0, x1, y1, F32.max(span_near(s3), 0.0001), block, dir,
    any_front, origin}

# Project the four corners of the unit square whose plane coordinate is fixed and
# whose other two axes run from the cell origin to origin+1. `axis` is the
# constant axis; the other two are the in-plane ones in cyclic order.
def square(dir: Nat, +fx: F32, +fy: F32, +fz: F32, +plane: F32, axis: Nat,
  +eye: Voxel.Vec, +right: Voxel.Vec, +up: Voxel.Vec, +forward: Voxel.Vec,
  +half: F32, +focal: F32, +block: U32) -> Screen:
  match axis:
    case 0n:
      corners(project(eye, right, up, forward, plane, fy, fz, half, focal),
        project(eye, right, up, forward, plane, (fy + 1.0 : F32), fz, half, focal),
        project(eye, right, up, forward, plane, fy, (fz + 1.0 : F32), half, focal),
        project(eye, right, up, forward, plane, (fy + 1.0 : F32), (fz + 1.0 : F32), half, focal),
        block, dir, P{fx, fy, fz})
    case 1n:
      corners(project(eye, right, up, forward, fx, plane, fz, half, focal),
        project(eye, right, up, forward, (fx + 1.0 : F32), plane, fz, half, focal),
        project(eye, right, up, forward, fx, plane, (fz + 1.0 : F32), half, focal),
        project(eye, right, up, forward, (fx + 1.0 : F32), plane, (fz + 1.0 : F32), half, focal),
        block, dir, P{fx, fy, fz})
    case _:
      corners(project(eye, right, up, forward, fx, fy, plane, half, focal),
        project(eye, right, up, forward, (fx + 1.0 : F32), fy, plane, half, focal),
        project(eye, right, up, forward, fx, (fy + 1.0 : F32), plane, half, focal),
        project(eye, right, up, forward, (fx + 1.0 : F32), (fy + 1.0 : F32), plane, half, focal),
        block, dir, P{fx, fy, fz})

# The screen box a face covers. dir 0..5 are +x, +y, +z, -x, -y, -z, so the plane
# coordinate is origin+1 for the first three and origin for the last three, and
# the in-plane axes are the other two.
def box_of(dir: Nat, +block: U32, +fx: F32, +fy: F32, +fz: F32, +eye: Voxel.Vec,
  +right: Voxel.Vec, +up: Voxel.Vec, +forward: Voxel.Vec, +half: F32, +focal: F32) -> Screen:
  match dir:
    case 0n:
      square(dir, fx, fy, fz, F32.add(fx, 1.0), 0n, eye, right, up, forward, half, focal, block)
    case 1n:
      square(dir, fx, fy, fz, F32.add(fy, 1.0), 1n, eye, right, up, forward, half, focal, block)
    case 2n:
      square(dir, fx, fy, fz, F32.add(fz, 1.0), 2n, eye, right, up, forward, half, focal, block)
    case 3n:
      square(dir, fx, fy, fz, fx, 0n, eye, right, up, forward, half, focal, block)
    case 4n:
      square(dir, fx, fy, fz, fy, 1n, eye, right, up, forward, half, focal, block)
    case _:
      square(dir, fx, fy, fz, fz, 2n, eye, right, up, forward, half, focal, block)

# ---------------------------------------------------------------------------
# 3. The screen tile grid, and the per-pixel fold over one tile's candidates.
# ---------------------------------------------------------------------------

# Default production tile edge; the benchmark passes alternatives explicitly.
def tile_size() -> U32:
  (8 : U32)

def tiles_across(size: U32, +edge: U32) -> U32:
  U32.div(size, edge)

# The bucket a pixel reads: the tile's list of projected faces. Rows and buckets
# are shared, so a pixel only walks the faces its own tile collected.
def empty_buckets(count: U32) -> List<&2, List<&2, Screen>>:
  List.replicate(List<&2, Screen>, U32.to_nat(count), [])

def grid_rows_of(count: Nat, +blank: List<&2, List<&2, Screen>>) ->
  List<&2, List<&2, List<&2, Screen>>>:
  match count:
    case 0n:
      []
    case 1n+p:
      +rest = grid_rows_of(p, blank)
      blank <> rest

# The empty tile grid: every row shares one empty bucket spine. Build the outer
# row spine directly instead of repeatedly appending and copying its prefix.
def empty_grid(+across: U32) -> List<&2, List<&2, List<&2, Screen>>>:
  # `+across` is affine: a U32 is Copy, so it is readable many times.
  +blank : List<&2, List<&2, Screen>> = empty_buckets(across)
  grid_rows_of(U32.to_nat(across), blank)

# Screen-face accessors. A `Screen` record can be read exactly once, so every
# field the caller needs is taken by its own accessor.
def s_x0(s: Screen) -> U32:
  match s:
    case Screen{x0, y0, x1, y1, depth, block, dir, alive, origin}:
      x0

def s_y0(s: Screen) -> U32:
  match s:
    case Screen{x0, y0, x1, y1, depth, block, dir, alive, origin}:
      y0

def s_x1(s: Screen) -> U32:
  match s:
    case Screen{x0, y0, x1, y1, depth, block, dir, alive, origin}:
      x1

def s_y1(s: Screen) -> U32:
  match s:
    case Screen{x0, y0, x1, y1, depth, block, dir, alive, origin}:
      y1

def s_depth(s: Screen) -> F32:
  match s:
    case Screen{x0, y0, x1, y1, depth, block, dir, alive, origin}:
      depth

def s_block(s: Screen) -> U32:
  match s:
    case Screen{x0, y0, x1, y1, depth, block, dir, alive, origin}:
      block

def s_dir(s: Screen) -> Nat:
  match s:
    case Screen{x0, y0, x1, y1, depth, block, dir, alive, origin}:
      dir

def s_alive(s: Screen) -> Bool:
  match s:
    case Screen{x0, y0, x1, y1, depth, block, dir, alive, origin}:
      alive

def s_origin(s: Screen) -> P:
  match s:
    case Screen{x0, y0, x1, y1, depth, block, dir, alive, origin}:
      origin

def position_key(origin: P) -> U32:
  match origin:
    case P{x, y, z}:
      U32.xor(U32.xor(F32.to_u32(x), U32.mul(F32.to_u32(y), 31)),
        U32.mul(F32.to_u32(z), 997))

# A digest of every projected face field, so a benchmark that folds the bucket
# grid observes the actual screen boxes, face plane and material in every bucket.
def s_depth_key(s: Screen) -> U32:
  match s:
    case Screen{x0, y0, x1, y1, depth, block, dir, alive, origin}:
      +xy0 = U32.xor(U32.mul(x0, 73856093), U32.mul(y0, 19349663))
      +xy1 = U32.xor(U32.mul(x1, 83492791), U32.mul(y1, 2971215073))
      +z = F32.to_u32(F32.mul(depth, 1024.0))
      +material = U32.xor(U32.mul(block, 2654435761), U32.from_nat(dir))
      +live = Bool.pick(U32, alive, 1, 0)
      +position = position_key(origin)
      U32.xor(U32.xor(xy0, xy1), U32.xor(z, U32.xor(material, U32.xor(live, position))))

# Clamp a face's box to the frame and mark it not alive when the clamped box is
# empty or the face crossed the near plane. The depth, block and label pass
# through untouched; only the box and the liveness flag change. The fields are
# parameters rather than a record so the liveness match can scrutinize one.
def clip(x0: U32, y0: U32, x1: U32, y1: U32, depth: F32, block: U32, dir: Nat,
  alive: Bool, origin: P, +size: U32) -> Screen:
  +cx0 = U32.min(x0, U32.sub(size, 1))
  +cy0 = U32.min(y0, U32.sub(size, 1))
  +cx1 = U32.min(x1, U32.sub(size, 1))
  +cy1 = U32.min(y1, U32.sub(size, 1))
  +ok = Bool.and(alive, Bool.and(U32.is_le(cx0, cx1), U32.is_le(cy0, cy1)))
  Screen{cx0, cy0, cx1, cy1, depth, block, dir, ok, origin}

def clip_screen(+s: Screen, +size: U32) -> Screen:
  clip(s_x0(s), s_y0(s), s_x1(s), s_y1(s), s_depth(s), s_block(s), s_dir(s),
    s_alive(s), s_origin(s), size)

# Add one projected face to the bucket at (tx, ty). Both spines are rebuilt, so
# the grid is threaded through the insertion rather than mutated in place.
def add_at_bucket(+row: List<&2, List<&2, Screen>>, +tx: U32, +screen: Screen) ->
  List<&2, List<&2, Screen>>:
  +bucket = Maybe.default(&2, List<&2, Screen>, List.get(&2, List<&2, Screen>, row, U32.to_nat(tx)), [])
  List.set(&2, List<&2, Screen>, row, U32.to_nat(tx), screen <> bucket)

def set_existing_row(found: Maybe<&2, List<&2, List<&2, Screen>>>,
  +rows: List<&2, List<&2, List<&2, Screen>>>, +ty: U32, +tx: U32,
  +screen: Screen) -> List<&2, List<&2, List<&2, Screen>>>:
  match found:
    case None{}:
      rows
    case Some{row}:
      List.set(&2, List<&2, List<&2, Screen>>, rows, U32.to_nat(ty),
        add_at_bucket(row, tx, screen))

def add_at_row(+rows: List<&2, List<&2, List<&2, Screen>>>, +ty: U32, +tx: U32,
  +screen: Screen) -> List<&2, List<&2, List<&2, Screen>>>:
  +found = List.get(&2, List<&2, List<&2, Screen>>, rows, U32.to_nat(ty))
  set_existing_row(found, rows, ty, tx, screen)

# Fill one tile row: every tile from tx0 to tx1 receives the same face.
def tiles_in_row(columns: Nat, +tx: U32, +ty: U32,
  +rows: List<&2, List<&2, List<&2, Screen>>>, +screen: Screen) ->
  List<&2, List<&2, List<&2, Screen>>>:
  match columns:
    case 0n:
      rows
    case 1n+p:
      tiles_in_row(p, (tx + 1 : U32), ty,
        add_at_row(rows, ty, tx, screen), screen)

# Walk the tile rows from ty0 to ty1, filling each with the same face.
def rows_of_tiles(rows_left: Nat, +ty: U32, +tx0: U32, +span_x: Nat,
  +rows: List<&2, List<&2, List<&2, Screen>>>, +screen: Screen) ->
  List<&2, List<&2, List<&2, Screen>>>:
  match rows_left:
    case 0n:
      rows
    case 1n+p:
      rows_of_tiles(p, (ty + 1 : U32), tx0, span_x,
        tiles_in_row(span_x, tx0, ty, rows, screen), screen)

# Put one face into every tile its box covers, or keep the grid unchanged when
# the face is not alive. The box is passed unpacked so the match can scrutinize
# the liveness flag, which the language only allows on a parameter.
def place(alive: Bool, x0: U32, y0: U32, x1: U32, y1: U32, s: Screen, +across: U32,
  +edge: U32,
  +rows: List<&2, List<&2, List<&2, Screen>>>) -> List<&2, List<&2, List<&2, Screen>>>:
  match alive:
    case False{}:
      rows
    case True{}:
      +tx0 = U32.div(x0, edge)
      +ty0 = U32.div(y0, edge)
      +tx1 = U32.min(U32.div(x1, edge), U32.sub(across, 1))
      +ty1 = U32.min(U32.div(y1, edge), U32.sub(across, 1))
      +span_x = Nat.sub(U32.to_nat(U32.add(tx1, 1)), U32.to_nat(tx0))
      +span_y = Nat.sub(U32.to_nat(U32.add(ty1, 1)), U32.to_nat(ty0))
      rows_of_tiles(span_y, ty0, tx0, span_x, rows, s)

# The whole face list, projected, clipped and bucketed. `size` is the frame edge
# in pixels, so the tile grid is size/edge tiles across.
def bucket_all(faces: List<&2, Face>, +eye: Voxel.Vec, +right: Voxel.Vec, +up: Voxel.Vec,
  +forward: Voxel.Vec, +half: F32, +focal: F32, +size: U32, +across: U32, +edge: U32,
  +rows: List<&2, List<&2, List<&2, Screen>>>) -> List<&2, List<&2, List<&2, Screen>>>:
  match faces:
    case Nil{}:
      rows
    case Face{fx, fy, fz, dir, block} <> rest:
      +boxed = box_of(dir, block, U32.to_f32(fx), U32.to_f32(fy), U32.to_f32(fz),
        eye, right, up, forward, half, focal)
      +screen = clip_screen(boxed, size)
      bucket_all(rest, eye, right, up, forward, half, focal, size, across, edge,
        place(s_alive(screen), s_x0(screen), s_y0(screen), s_x1(screen), s_y1(screen),
          screen, across, edge, rows))

def bucket_faces_with_tile_size(faces: List<&2, Face>, +eye: Voxel.Vec, +right: Voxel.Vec,
  +up: Voxel.Vec, +forward: Voxel.Vec, +half: F32, +focal: F32, +size: U32,
  +edge: U32) -> Tiles:
  +across = tiles_across(size, edge)
  +empty : List<&2, List<&2, List<&2, Screen>>> = empty_grid(across)
  Tiles{bucket_all(faces, eye, right, up, forward, half, focal, size, across, edge, empty),
    size, edge, Voxel.Camera{eye, forward, right, up}, half, focal}

def bucket_faces(faces: List<&2, Face>, +eye: Voxel.Vec, +right: Voxel.Vec, +up: Voxel.Vec,
  +forward: Voxel.Vec, +half: F32, +focal: F32, +size: U32) -> Tiles:
  bucket_faces_with_tile_size(faces, eye, right, up, forward, half, focal, size, tile_size())

# Project once into a forward-ordered screen list. The row-major builder below
# scans this list once per tile and conses matches into that tile's bucket.
def project_screens(faces: List<&2, Face>, +eye: Voxel.Vec, +right: Voxel.Vec,
  +up: Voxel.Vec, +forward: Voxel.Vec, +half: F32, +focal: F32, +size: U32) ->
  List<&2, Screen>:
  match faces:
    case Nil{}:
      []
    case Face{fx, fy, fz, dir, block} <> rest:
      +boxed = box_of(dir, block, U32.to_f32(fx), U32.to_f32(fy), U32.to_f32(fz),
        eye, right, up, forward, half, focal)
      +screen = clip_screen(boxed, size)
      +tail = project_screens(rest, eye, right, up, forward, half, focal, size)
      screen <> tail

def tile_overlaps(alive: Bool, x0: U32, y0: U32, x1: U32, y1: U32,
  +tx: U32, +ty: U32, +edge: U32) -> Bool:
  +left = U32.mul(tx, edge)
  +top = U32.mul(ty, edge)
  +right = U32.sub(U32.mul((tx + 1 : U32), edge), 1)
  +bottom = U32.sub(U32.mul((ty + 1 : U32), edge), 1)
  Bool.and(alive, Bool.and(Bool.and(U32.is_le(x0, right), U32.is_le(left, x1)),
    Bool.and(U32.is_le(y0, bottom), U32.is_le(top, y1))))

def screen_hits_tile(+screen: Screen, tx: U32, ty: U32, +edge: U32) -> Bool:
  tile_overlaps(s_alive(screen), s_x0(screen), s_y0(screen), s_x1(screen), s_y1(screen),
    tx, ty, edge)

def maybe_screen(hit: Bool, screen: Screen) -> Maybe<&2, Screen>:
  Bool.pick(Maybe<&2, Screen>, hit, Some{screen}, None{})

def put_screen(maybe: Maybe<&2, Screen>, acc: List<&2, Screen>) -> List<&2, Screen>:
  match maybe:
    case None{}:
      acc
    case Some{screen}:
      screen <> acc

def bucket_screens(screens: List<&2, Screen>, +tx: U32, +ty: U32,
  +edge: U32, +bucket: List<&2, Screen>) -> List<&2, Screen>:
  match screens:
    case Nil{}:
      bucket
    case +screen <> rest:
      +hit = screen_hits_tile(screen, tx, ty, edge)
      +candidate = maybe_screen(hit, screen)
      +next = put_screen(candidate, bucket)
      bucket_screens(rest, tx, ty, edge, next)

def row_major_buckets(columns: Nat, +tx: U32, +ty: U32,
  +edge: U32, +screens: List<&2, Screen>) -> List<&2, List<&2, Screen>>:
  match columns:
    case 0n:
      []
    case 1n+p:
      +tail = row_major_buckets(p, (tx + 1 : U32), ty, edge, screens)
      +bucket = bucket_screens(screens, tx, ty, edge, [])
      bucket <> tail

def row_major_rows(count: Nat, +ty: U32, +across: U32,
  +edge: U32, +screens: List<&2, Screen>) -> List<&2, List<&2, List<&2, Screen>>>:
  match count:
    case 0n:
      []
    case 1n+p:
      +tail = row_major_rows(p, (ty + 1 : U32), across, edge, screens)
      +row = row_major_buckets(U32.to_nat(across), 0, ty, edge, screens)
      row <> tail

def bucket_faces_row_major_with_tile_size(faces: List<&2, Face>, +eye: Voxel.Vec,
  +right: Voxel.Vec, +up: Voxel.Vec, +forward: Voxel.Vec, +half: F32, +focal: F32,
  +size: U32, +edge: U32) -> Tiles:
  +across = tiles_across(size, edge)
  +screens = project_screens(faces, eye, right, up, forward, half, focal, size)
  Tiles{row_major_rows(U32.to_nat(across), 0, across, edge, screens), size, edge,
    Voxel.Camera{eye, forward, right, up}, half, focal}

def bucket_faces_row_major(faces: List<&2, Face>, +eye: Voxel.Vec, +right: Voxel.Vec,
  +up: Voxel.Vec, +forward: Voxel.Vec, +half: F32, +focal: F32, +size: U32) -> Tiles:
  bucket_faces_row_major_with_tile_size(faces, eye, right, up, forward, half, focal, size,
    tile_size())

# ---------------------------------------------------------------------------
# 4. Per pixel: walk one tile's candidates and keep the nearest covering face.
# ---------------------------------------------------------------------------

# The bucket list, and the pixel it is being asked about.
def bucket_at(+rows: List<&2, List<&2, List<&2, Screen>>>, +tx: U32, +ty: U32) ->
  List<&2, Screen>:
  +row = Maybe.default(&2, List<&2, List<&2, Screen>>,
    List.get(&2, List<&2, List<&2, Screen>>, rows, U32.to_nat(ty)), [])
  Maybe.default(&2, List<&2, Screen>, List.get(&2, List<&2, Screen>, row, U32.to_nat(tx)), [])

def b_block(b: Best) -> U32:
  match b:
    case Best{block, dir, depth, candidates}:
      block

def b_dir(b: Best) -> Nat:
  match b:
    case Best{block, dir, depth, candidates}:
      dir

def b_depth(b: Best) -> F32:
  match b:
    case Best{block, dir, depth, candidates}:
      depth

def b_candidates(b: Best) -> U32:
  match b:
    case Best{block, dir, depth, candidates}:
      candidates

def position_x(origin: P) -> F32:
  match origin:
    case P{x, y, z}:
      x

def position_y(origin: P) -> F32:
  match origin:
    case P{x, y, z}:
      y

def position_z(origin: P) -> F32:
  match origin:
    case P{x, y, z}:
      z

# Parameter distance along the normalized pixel ray to this face's world plane.
# A parallel ray has no finite plane hit and is rejected without dividing by zero.
def plane_depth(plane: F32, eye_coordinate: F32, +component: F32) -> F32:
  +crosses = F32.is_gt(F32.abs(component), 0.00001)
  +safe_component = Bool.pick(F32, crosses, component, 1.0)
  +distance = (F32.sub(plane, eye_coordinate) / safe_component : F32)
  Bool.pick(F32, crosses, distance, 1.0e30)

def ray_plane_depth(dir: Nat, origin: P, eye: Voxel.Vec, ray: Voxel.Vec) -> F32:
  match dir:
    case 0n:
      plane_depth(F32.add(position_x(origin), 1.0), vx(eye), vx(ray))
    case 1n:
      plane_depth(F32.add(position_y(origin), 1.0), vy(eye), vy(ray))
    case 2n:
      plane_depth(F32.add(position_z(origin), 1.0), vz(eye), vz(ray))
    case 3n:
      plane_depth(position_x(origin), vx(eye), vx(ray))
    case 4n:
      plane_depth(position_y(origin), vy(eye), vy(ray))
    case _:
      plane_depth(position_z(origin), vz(eye), vz(ray))

def within_unit(+coord: F32, +origin: F32) -> Bool:
  +above = F32.is_ge(coord, F32.sub(origin, 0.00001))
  +below = F32.is_le(coord, F32.add(origin, 1.00001))
  Bool.and(above, below)

# Intersecting the face plane is an exact point-in-projected-quad test: the hit
# belongs to the projected face iff its world point lies in the face's unit square.
def face_contains_hit(origin: P, eye: Voxel.Vec, ray: Voxel.Vec, +distance: F32) -> Bool:
  P{x, y, z} = origin
  Voxel.Vec{ex, ey, ez} = eye
  Voxel.Vec{dx, dy, dz} = ray
  +hit_x = F32.add(ex, F32.mul(dx, distance))
  +hit_y = F32.add(ey, F32.mul(dy, distance))
  +hit_z = F32.add(ez, F32.mul(dz, distance))
  Bool.and(Bool.and(within_unit(hit_x, x), within_unit(hit_y, y)),
    within_unit(hit_z, z))

# Keep the exact face-quad hit that is nearest along this pixel's normalized ray.
def covers_pixel(+s: Screen, +px: U32, +py: U32) -> Bool:
  Bool.and(
    Bool.and(U32.is_le(s_x0(s), px), U32.is_le(px, s_x1(s))),
    Bool.and(U32.is_le(s_y0(s), py), U32.is_le(py, s_y1(s))))

# A candidate that fails the screen-box test is counted and dropped. The counter
# advances on every candidate, whether or not it wins, so it measures the walk
# rather than the result.
def missed(+best: Best) -> Best:
  Best{b_block(best), b_dir(best), b_depth(best), (b_candidates(best) + 1 : U32)}

# The exact face-quad hit that is nearest along this pixel's normalized ray.
def nearer(+s: Screen, +eye: Voxel.Vec, +ray: Voxel.Vec, +best: Best) -> Best:
  +limit = b_depth(best)
  +block = b_block(best)
  +dir = b_dir(best)
  +seen = (b_candidates(best) + 1 : U32)
  +face_dir = s_dir(s)
  +distance = ray_plane_depth(face_dir, s_origin(s), eye, ray)
  +nearer_ok = Bool.and(F32.is_gt(distance, 0.0001), F32.is_lt(distance, limit))
  +inside_face = face_contains_hit(s_origin(s), eye, ray, distance)
  +covered = Bool.and(nearer_ok, inside_face)
  +winner : Best = Best{s_block(s), face_dir, distance, seen}
  +loser : Best = Best{block, dir, limit, seen}
  Bool.pick(Best, covered, winner, loser)

# Keep the nearest covering face. The two tests are split across a `match` on a
# parameter because the second is enormously more expensive than the first: the box
# test is four integer compares, and the plane hit behind it is a divide, three
# multiplies and six float compares. Running the second for every candidate in the
# tile was most of the per-pixel cost, and a `Bool.pick` would not have helped
# because its arguments are built before the call, whereas a `match` on a parameter
# skips the rejected branch outright. Most candidates in a tile fail the box test,
# since a bucket holds every face that overlaps the tile and a pixel is covered by
# only the few whose screen box contains it.
def decide(inside: Bool, +s: Screen, +eye: Voxel.Vec, +ray: Voxel.Vec, +best: Best) -> Best:
  match inside:
    case False{}:
      missed(best)
    case True{}:
      nearer(s, eye, ray, best)

def closer(+s: Screen, +px: U32, +py: U32, +eye: Voxel.Vec, +ray: Voxel.Vec,
  +best: Best) -> Best:
  decide(covers_pixel(s, px, py), s, eye, ray, best)

# Walk the bucket, folding the best covering face forward. The counter is the
# measured candidates-per-pixel, not an assumption about the cost model.
def scan_bucket(bucket: List<&2, Screen>, +px: U32, +py: U32, +eye: Voxel.Vec,
  +ray: Voxel.Vec, +best: Best) -> Best:
  match bucket:
    case Nil{}:
      best
    case +s <> rest:
      scan_bucket(rest, px, py, eye, ray, closer(s, px, py, eye, ray, best))

# The nearest face covering one pixel, or the sky block when nothing covers it.
# The depth starts at the maximum so the first candidate always wins its test.
def no_face() -> Best:
  Best{(0 : U32), 0n, (1.0e30 : F32), (0 : U32)}

def face_at_pixel(tiles: Tiles, +px: U32, +py: U32) -> Best:
  Tiles{rows, size, +edge, +camera, half, focal} = tiles
  +eye = Voxel.Camera.eye(camera)
  +ray = Voxel.Camera.ray_for(camera, px, py, half, focal)
  scan_bucket(bucket_at(rows, U32.div(px, edge), U32.div(py, edge)), px, py,
    eye, ray, no_face())

# The colour of one pixel, using the ray renderer's palette and per-face tint so
# the two renderers' colours are directly comparable.
def face_pixel_color(tiles: Tiles, +px: U32, +py: U32) -> U32:
  +best = face_at_pixel(tiles, px, py)
  Bool.pick(U32, U32.is_eq(b_block(best), 0), Voxel.sky_color(py),
    Voxel.shade_color(Voxel.block_color(b_block(best)), U32.from_nat(b_dir(best))))

# ---------------------------------------------------------------------------
# 5. The quadtree fold, the same shape as the ray renderer's `image`.
# ---------------------------------------------------------------------------

# At a leaf, pixel coordinates are divided by the configured edge to select a
# tile. The four-quadrant fork matches `Voxel.image` exactly.
def face_image(+depth: Nat, +tiles: Tiles, +px: U32, +py: U32) -> Image:
  match depth:
    case 0n:
      Pix{face_pixel_color(tiles, px, py)}
    case 1n+q:
      +step = U32.shln((1 : U32), q)
      tl tr bl br = face_image(q, tiles, px, py)
        face_image(q, tiles, (px + step : U32), py)
        face_image(q, tiles, px, (py + step : U32))
        face_image(q, tiles, (px + step : U32), (py + step : U32))
      Qua{tl, tr, bl, br}

# Render a 2^depth frame from an already-bucketed tile grid.
def render_size_tiles(tiles: Tiles, depth: Nat) -> Image:
  face_image(depth, tiles, 0, 0)

# The tile grid's rows, for a caller that wants to resolve pixels itself rather
# than through the quadtree. The pixel fold and the agreement measurement both
# use this, so they see exactly the same candidates the image does.
def tiles_rows(tiles: Tiles) -> List<&2, List<&2, List<&2, Screen>>>:
  match tiles:
    case Tiles{rows, size, edge, camera, half, focal}:
      rows

def tiles_edge(tiles: Tiles) -> U32:
  match tiles:
    case Tiles{rows, size, edge, camera, half, focal}:
      edge

def tiles_size(tiles: Tiles) -> U32:
  match tiles:
    case Tiles{rows, size, edge, camera, half, focal}:
      size

# The side labels present at one cell, as a bitmask over 0..5.
def at_mask(at: At) -> U32:
  match at:
    case At{mask, total}:
      mask

def at_total(at: At) -> U32:
  match at:
    case At{mask, total}:
      total

# Every projected face's box, as text. This is a diagnostic for a failing
# projection: it shows the pixel box and depth each face was given, so a wrong
# side or a wrong plane is visible without rendering a frame.
def boxes_go(faces: List<&2, Face>, +eye: Voxel.Vec, +right: Voxel.Vec, +up: Voxel.Vec,
  +forward: Voxel.Vec, +half: F32, +focal: F32, +size: U32, +acc: String) -> String:
  match faces:
    case Nil{}:
      acc
    case Face{fx, fy, fz, +dir, block} <> rest:
      +boxed = box_of(dir, block, U32.to_f32(fx), U32.to_f32(fy), U32.to_f32(fz),
        eye, right, up, forward, half, focal)
      +clipped = clip_screen(boxed, size)
      +line = "[dir=" ++ Nat.show(dir) ++ " box=" ++ U32.show(s_x0(clipped)) ++ ","
        ++ U32.show(s_y0(clipped)) ++ ".." ++ U32.show(s_x1(clipped)) ++ ","
        ++ U32.show(s_y1(clipped)) ++ " depthx100=" ++ U32.show(F32.to_u32(F32.mul(s_depth(clipped), 100.0)))
        ++ " alive=" ++ Bool.show(s_alive(clipped)) ++ "]"
      boxes_go(rest, eye, right, up, forward, half, focal, size, acc ++ line)

# A full frame from a bulk chunk: extract, project, bucket, then fold. This is
# the path the benchmark times, so it is exactly the work a real frame would do.
def render_size_at_with_tile_size(chunk: Array<U32>, +eye: Voxel.Vec, +yaw: F32,
  +pitch: F32, +depth: Nat, +edge: U32) -> Image:
  +camera : Voxel.Camera = Voxel.Camera.look(eye, yaw, pitch)
  +half = Voxel.projection_half(depth)
  +focal = F32.mul(1.5, half)
  +size = U32.shln((1 : U32), depth)
  +tiles = bucket_faces_with_tile_size(faces_from_chunk(chunk), cam_eye(camera),
    cam_right(camera), cam_up(camera), cam_forward(camera), half, focal, size, edge)
  render_size_tiles(tiles, depth)

# The same frame over a region of chunks. Identical to the entry above from the
# projection down; only the face source differs, so a region cannot drift into a
# different camera, bucket or fill than the one-chunk path the agreement gate checks.
def render_region_at_with_tile_size(chunks: List<&2, List<&2, U32>>, columns: Nat,
  rows: Nat, +eye: Voxel.Vec, +yaw: F32, +pitch: F32, +depth: Nat, +edge: U32) -> Image:
  +camera : Voxel.Camera = Voxel.Camera.look(eye, yaw, pitch)
  +half = Voxel.projection_half(depth)
  +focal = F32.mul(1.5, half)
  +size = U32.shln((1 : U32), depth)
  +tiles = bucket_faces_with_tile_size(faces_from_chunks(chunks, columns, rows),
    cam_eye(camera), cam_right(camera), cam_up(camera), cam_forward(camera),
    half, focal, size, edge)
  render_size_tiles(tiles, depth)

def render_size_at(chunk: Array<U32>, +eye: Voxel.Vec, +yaw: F32, +pitch: F32,
  +depth: Nat) -> Image:
  render_size_at_with_tile_size(chunk, eye, yaw, pitch, depth, 8)

def render_at(chunk: Array<U32>, +eye: Voxel.Vec, +yaw: F32, +pitch: F32) -> Image:
  render_size_at(chunk, eye, yaw, pitch, 5n)

# How many candidates the per-pixel walk actually considered across a whole
# frame. This is the measured cost model, not an assumption about it.
# Each tile's bucket is charged once per pixel in that tile, so this reports the
# actual candidate walk for the configured tile edge.
#
def count_row(+count: Nat, +tx: U32, +ty: U32, +edge: U32,
  +rows: List<&2, List<&2, List<&2, Screen>>>, +total: U32) -> U32:
  match count:
    case 0n:
      total
    case 1n+r:
      +bucket = bucket_at(rows, tx, ty)
      +added = (total + U32.from_nat(List.length(&2, Screen, bucket)) : U32)
      count_row(r, tx, ty, edge, rows, added)

# One row of tiles, each paying its own block cost.
def count_tile_row(remaining: Nat, +tx: U32, +ty: U32, +edge: U32,
  +rows: List<&2, List<&2, List<&2, Screen>>>, +across: U32, +total: U32) -> U32:
  match remaining:
    case 0n:
      total
    case 1n+p:
      +pixels = U32.to_nat(U32.mul(edge, edge))
      count_tile_row(p, (tx + 1 : U32), ty, edge, rows, across,
        count_row(pixels, tx, ty, edge, rows, total))

# Every tile row of the grid.
def count_tiles(remaining: Nat, +ty: U32, +edge: U32,
  +rows: List<&2, List<&2, List<&2, Screen>>>, +across: U32, +total: U32) -> U32:
  match remaining:
    case 0n:
      total
    case 1n+p:
      count_tiles(p, (ty + 1 : U32), edge, rows, across,
        count_tile_row(U32.to_nat(across), 0, ty, edge, rows, across, total))

def candidate_count(size: U32, +tiles: Tiles) -> U32:
  +rows = tiles_rows(tiles)
  +edge = tiles_edge(tiles)
  +across = tiles_across(size, edge)
  count_tiles(U32.to_nat(across), 0, edge, rows, across, 0)

type GridStats is Data:
  GridStats{entries: U32, path_cells: U32}

def stats_entries(stats: GridStats) -> U32:
  match stats:
    case GridStats{entries, path_cells}:
      entries

def stats_path_cells(stats: GridStats) -> U32:
  match stats:
    case GridStats{entries, path_cells}:
      path_cells

# Count candidate cons cells and the prefix cells rebuilt by each List.set in
# the scatter builder. A set at tile index tx copies tx+1 bucket-row cells; the
# row update similarly copies ty+1 outer-grid cells.
def stats_bucket_row(row: List<&2, List<&2, Screen>>, +tx: U32, +ty: U32,
  +entries: U32, +path_cells: U32) -> GridStats:
  match row:
    case Nil{}:
      GridStats{entries, path_cells}
    case +bucket <> rest:
      +length = U32.from_nat(List.length(&2, Screen, bucket))
      +per_entry = U32.add(U32.add(tx, ty), 3)
      +added_path = U32.mul(length, per_entry)
      stats_bucket_row(rest, (tx + 1 : U32), ty, U32.add(entries, length),
        U32.add(path_cells, added_path))

def stats_grid_rows(rows: List<&2, List<&2, List<&2, Screen>>>, +ty: U32,
  +entries: U32, +path_cells: U32) -> GridStats:
  match rows:
    case Nil{}:
      GridStats{entries, path_cells}
    case +row <> rest:
      +row_stats = stats_bucket_row(row, 0, ty, 0, 0)
      +row_entries = stats_entries(row_stats)
      +row_paths = stats_path_cells(row_stats)
      stats_grid_rows(rest, (ty + 1 : U32), U32.add(entries, row_entries),
        U32.add(path_cells, row_paths))

# The direct scatter builder allocates two empty spines (one shared bucket row
# and the outer row spine), then one candidate cell plus two set paths per face
# placement. This excludes screen records and the extracted Face list.
def scatter_grid_list_cells(size: U32, +tiles: Tiles) -> U32:
  +across = U32.div(size, tiles_edge(tiles))
  +stats = stats_grid_rows(tiles_rows(tiles), 0, 0, 0)
  U32.add(U32.mul(across, 2), stats_path_cells(stats))

# Row-major construction directly conses each bucket entry, one tile slot per
# tile, and one outer row cell per row. Its separate projected Screen list has
# one cell per exposed Face and is not part of the bucket grid.
def row_major_grid_list_cells(size: U32, +tiles: Tiles) -> U32:
  +across = U32.div(size, tiles_edge(tiles))
  +entries = stats_entries(stats_grid_rows(tiles_rows(tiles), 0, 0, 0))
  U32.add(entries, U32.add(U32.mul(across, across), across))

# Reconstruct the allocation count of the earlier scatter shape for comparison:
# quadratic append prefixes for the empty rows, plus an eager empty row passed
# as Maybe.default on every insertion.
def legacy_scatter_grid_list_cells(size: U32, +tiles: Tiles) -> U32:
  +across = U32.div(size, tiles_edge(tiles))
  +stats = stats_grid_rows(tiles_rows(tiles), 0, 0, 0)
  +empty_row = U32.add(across, U32.div(U32.mul(across, U32.add(across, 1)), 2))
  +fallback_rows = U32.mul(across, stats_entries(stats))
  U32.add(stats_path_cells(stats),
    U32.add(empty_row, fallback_rows))
# The candidate bucket one tile holds, as text. A diagnostic for a failing
# projection: it shows which faces reached the tile the failing pixel is in.
def dump_go(bucket: List<&2, Screen>, +acc: String) -> String:
  match bucket:
    case Nil{}:
      acc
    case +s <> rest:
      dump_go(rest, acc ++ "[d=" ++ Nat.show(s_dir(s)) ++ " " ++ U32.show(s_x0(s)) ++ ","
        ++ U32.show(s_y0(s)) ++ ".." ++ U32.show(s_x1(s)) ++ "," ++ U32.show(s_y1(s))
        ++ " z=" ++ U32.show(F32.to_u32(F32.mul(s_depth(s), 100.0))) ++ "]")

def dump_bucket(+rows: List<&2, List<&2, List<&2, Screen>>>, +tx: U32, +ty: U32) -> String:
  dump_go(bucket_at(rows, tx, ty), "")

def boxes_for(faces: List<&2, Face>, +eye: Voxel.Vec, +right: Voxel.Vec, +up: Voxel.Vec,
  +forward: Voxel.Vec, +half: F32, +focal: F32, +size: U32) -> String:
  boxes_go(faces, eye, right, up, forward, half, focal, size, "")

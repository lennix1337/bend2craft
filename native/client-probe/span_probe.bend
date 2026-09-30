import Base
import ../../world/player.bend as Player
import ../../world/world_state.bend as WorldState
import ../player-probe/player_probe.bend as PlayerProbe
import ../voxel-probe/voxel_probe.bend as Voxel
import ../frame-probe/frame_probe.bend as Frame
import ../face-probe/face_probe.bend as Face
import ../client.bend as Client

# ---------------------------------------------------------------------------
# What a painter's algorithm would cost, measured rather than argued.
#
# The shipping renderer is a per-pixel bucket walk: every pixel walks every face whose
# *bounding box* overlaps its tile, and rejects the ones that are not there. At the client's
# own camera that is 1,957,888 candidate steps for a 16,384-pixel frame, and `clip_area`
# says the boxes those steps cover total 1,547,675 pixels.
#
# A painter asks a different question: for each face, which pixels does its own quad
# actually cover? That is `Face.quad_area`, and the facts line reports 50,102 pixels for
# the same frame. So the geometry the walk charges for is 31x the geometry there is, and
# the gap is the box's waste over the quad: a face seen at a grazing angle is long and
# thin, and a bounding box around one is nearly square.
#
# That ratio is the whole case for replacing the walk, so the painter's dominant term is
# measured here rather than assumed:
#
#   1. spans. For each face and each scanline of its quad, the x-range the quad covers on
#      that line. A span is the unit of work a painter's algorithm actually has, and how
#      many there are is a property of the geometry, not of a renderer choice.
#   2. span pixels. How many pixels those spans cover, against the walk's candidates and
#      against the canvas.
#   3. the fill. Writing those spans into a flat `Array<U32>` frame, which is the painter's
#      own work and nothing else.
#
# The fill is timed unconditionally, in face-list order, with no depth test and no
# ordering. That is a lower bound and it is deliberate: it is the cheapest a painter can
# be, and it is the right shape for asking whether there is room in a 16.67 ms frame at a
# resolution the walk cannot reach. Correctness would add the ordering and the depth test;
# this says whether the term underneath them is affordable first.
#
# The array is `Array<U32>` of `size * size` slots, which is what `Face.Square` already
# projects into and what the quadtree fold will later read back.
# ---------------------------------------------------------------------------

type Counted is Data:
  Counted{spans: U32, pixels: U32}

# A scanline's x-range. A record rather than a pair because `span_x` has to be read back
# by a def that takes it as a parameter: a `match` cannot scrutinize a local binder, so a
# pair handed straight out of a call could not be destructured by its caller.
type Span is Data:
  Span{x0: U32, x1: U32}

# A face's rows inside the frame: the first row, and one past the last.
type Rows is Data:
  Rows{first: U32, stop: U32}

def fold_hash(+hash: U32, +value: U32) -> U32:
  U32.mul(U32.xor(hash, value), 16777619)

# --- the client's own camera, region and palette ------------------------------

def region_faces(+edits: List<&2, WorldState.Edit>) -> List<&2, Face.Face>:
  Face.faces_from_chunks(Client.region_chunks(Frame.seed(), edits), Frame.view_columns(),
    Frame.view_rows())

def camera_of(+pose: Frame.Pose) -> Voxel.Camera:
  Voxel.Camera.look(Frame.eye_of(pose), Frame.yaw_of(pose), Frame.pitch_of(pose))

def colour_of(+block: U32, +dir: Nat) -> U32:
  Voxel.shade_color(Voxel.block_color(block), U32.from_nat(dir))

# --- one scanline of a projected quad ----------------------------------------
#
# A projected quad is convex, so any interior scanline crosses exactly two of its four
# edges. Each edge contributes a crossing x when it straddles the line and nothing when it
# does not, so the left bound is the minimum over the four and the right bound is the
# maximum over the four, with a non-crossing edge contributing a sentinel each way. The
# sentinels are past any frame edge and before any pixel, so neither can win a comparison
# it should lose.

def far() -> F32:
  1.0e30

def near() -> F32:
  F32.neg(1.0e30)

def crossing_x(+y: F32, +ax: F32, +ay: F32, +bx: F32, +by: F32) -> F32:
  F32.add(ax, F32.mul(F32.div(F32.sub(y, ay), F32.sub(by, ay)), F32.sub(bx, ax)))

# Whether the edge straddles the line: y is at or above one end and strictly below the
# other. Half-open, so a scanline through a vertex counts the edge below it exactly once.
def straddles(+y: F32, +ay: F32, +by: F32) -> Bool:
  Bool.or(Bool.and(F32.is_ge(y, ay), F32.is_lt(y, by)),
    Bool.and(F32.is_ge(y, by), F32.is_lt(y, ay)))

def keep_left(crossed: Bool, +x: F32, +best: F32) -> F32:
  match crossed:
    case True{}:
      F32.min(best, x)
    case False{}:
      best

def keep_right(crossed: Bool, +x: F32, +best: F32) -> F32:
  match crossed:
    case True{}:
      F32.max(best, x)
    case False{}:
      best

# The x-range of one scanline of the quad, clamped into the frame. A face that crosses the
# eye plane projects a corner far outside any frame, and the clamp is what keeps that out
# of the arithmetic rather than the arithmetic out of the picture.
def span_x(s: Face.Square, +y: F32, +size: U32) -> Span:
  Face.Square{a, b, c, d} = s
  Face.Q{+ax, +ay, _} = a
  Face.Q{+bx, +by, _} = b
  Face.Q{+cx, +cy, _} = c
  Face.Q{+dx, +dy, _} = d
  +last = F32.from_nat(U32.to_nat(U32.sub(size, (1 : U32))))
  +e1 = keep_left(straddles(y, ay, by), crossing_x(y, ax, ay, bx, by), far())
  +e2 = keep_left(straddles(y, by, cy), crossing_x(y, bx, by, cx, cy), e1)
  +e3 = keep_left(straddles(y, cy, dy), crossing_x(y, cx, cy, dx, dy), e2)
  +e4 = keep_left(straddles(y, dy, ay), crossing_x(y, dx, dy, ax, ay), e3)
  +f1 = keep_right(straddles(y, ay, by), crossing_x(y, ax, ay, bx, by), near())
  +f2 = keep_right(straddles(y, by, cy), crossing_x(y, bx, by, cx, cy), f1)
  +f3 = keep_right(straddles(y, cy, dy), crossing_x(y, cx, cy, dx, dy), f2)
  +f4 = keep_right(straddles(y, dy, ay), crossing_x(y, dx, dy, ax, ay), f3)
  # The two bounds are clamped into the frame as floats and then converted, so an edge that
  # is nearly parallel to a scanline — where the crossing divides by almost zero and lands
  # far outside any frame — cannot become a pixel index.
  +left = F32.to_u32(F32.min(F32.max(e4, 0.0), last))
  +right = F32.to_u32(F32.max(F32.min(f4, last), 0.0))
  Span{left, U32.max(right, left)}

# A face wholly above the frame has a `bottom` below zero, and a face wholly below has a
# `top` past the last row. Either way the span clamps to nothing while the row count stays
# enormous, and `F32.to_u32` of a negative floor is not a small number, so a face that
# misses the frame is given an empty row range: `first == stop`, both inside the frame.
def span_bounds(+top: F32, +bottom: F32, +size: U32) -> Rows:
  +last = U32.sub(size, (1 : U32))
  +misses = Bool.or(F32.is_ge(top, F32.from_nat(U32.to_nat(size))),
    F32.is_le(bottom, 0.0))
  +first = Bool.pick(U32, misses, (0 : U32), F32.to_u32(F32.max(F32.floor(top), 0.0)))
  +stop = Bool.pick(U32, misses, first,
    U32.add(F32.to_u32(F32.min(F32.floor(bottom), F32.from_nat(U32.to_nat(last)))),
      (1 : U32)))
  Rows{U32.min(first, last), U32.max(stop, U32.min(first, last))}

# The quad's vertical extent as whole scanline rows inside the frame: the first row and
# one past the last. A quad that misses the frame vertically yields no rows at all, which
# is what a painter skips and a per-pixel walk does not.
def span_rows(s: Face.Square, +size: U32) -> Rows:
  Face.Square{a, b, c, d} = s
  Face.Q{_, +ay, _} = a
  Face.Q{_, +by, _} = b
  Face.Q{_, +cy, _} = c
  Face.Q{_, +dy, _} = d
  span_bounds(F32.min(F32.min(ay, by), F32.min(cy, dy)),
    F32.max(F32.max(ay, by), F32.max(cy, dy)), size)

def rows_first(r: Rows) -> U32:
  match r:
    case Rows{first, stop}:
      first

def rows_stop(r: Rows) -> U32:
  match r:
    case Rows{first, stop}:
      stop

# How many scanlines this face contributes inside the frame: none at all for a face that
# misses it, which is what `span_rows` reports.
def rows_of(r: Rows) -> Nat:
  match r:
    case Rows{first, stop}:
      Nat.sub(U32.to_nat(stop), U32.to_nat(first))

def span_left_at(s: Span) -> U32:
  match s:
    case Span{x0, x1}:
      x0

def span_right_at(s: Span) -> U32:
  match s:
    case Span{x0, x1}:
      x1

# The span's width in pixels. The bounds are already clamped, so this is the right less the
# left plus the pixel at the right — which is what the fill writes.
def span_width(s: Span) -> U32:
  Span{x0, x1} = s
  U32.add(U32.sub(x1, x0), (1 : U32))

# The span written into one row of the frame. It is a def over `Span` rather than a pair
# so the span's two coordinates can each be read once.
# One span is `remaining` pixels of one row in one colour. The walk is one array write and
# one add per pixel, with no arithmetic beyond the address.
def fill_span(remaining: Nat, +at: U32, +colour: U32, frame: Array<U32>) -> Array<U32>:
  match remaining:
    case 0n:
      frame
    case 1n+r:
      fill_span(r, (at + 1 : U32), colour, frame[at] <- colour)

# The span written into one row of the frame: `last` pixels wide at most, starting at
# `first`.
#
# The clamp is a correctness requirement, not a guard. `span_x` already clamps its two bounds
# into the frame, but a projected edge whose two ends share a screen y divides by zero, and
# the resulting infinity is not a number a `F32.to_u32` can be trusted with — the first run of
# this probe turned one such face into a four-billion-pixel span and hung. Clamping after the
# conversion is what makes the count a count: `first` and `stop` are both inside the frame,
# and a `stop` at or below `first` is one pixel rather than an underflow.
def fill_row(+span: Span, +row: U32, +colour: U32, frame: Array<U32>) -> Array<U32>:
  fill_span(U32.to_nat(span_width(span)), U32.add(row, span_left_at(span)), colour, frame)

def frame_size(depth: Nat) -> U32:
  U32.shln((1 : U32), depth)

# A `size`-square frame is a `2*depth`-deep array of `size * size` slots, and the depth is
# what `Array.new` takes.
def slots_of(depth: Nat) -> Nat:
  Nat.mul(2n, depth)

# --- counting and filling the spans ------------------------------------------

def counted.zero() -> Counted:
  Counted{(0 : U32), (0 : U32)}

def counted.plus(left: Counted, right: Counted) -> Counted:
  Counted{spans, pixels} = left
  Counted{more_spans, more_pixels} = right
  Counted{U32.add(spans, more_spans), U32.add(pixels, more_pixels)}

def counted_spans(c: Counted) -> U32:
  match c:
    case Counted{spans, pixels}:
      spans

def counted_pixels(c: Counted) -> U32:
  match c:
    case Counted{spans, pixels}:
      pixels

# The painter runs as two folds over the same face list, and the split is not a convenience.
#
# A painter needs two things from a span: its width, to know the work, and the frame to
# write into. An `Array` is a `Type` and has exactly one owner, so the frame cannot be
# carried beside a tally in one accumulator and unpacked at each step: unpacking a pair
# needs a parameter to destructure, and the fold's own list is already that parameter, and a
# helper to do the unpacking would be a cycle, which the language has none of. So the tally
# and the frame are folded separately. The tally's fold is cheap arithmetic on the same
# spans the fill writes, and the fill's fold touches only the frame.
#
# The two folds together are what a painter's algorithm costs on this scene, which is the
# number this probe exists to produce.

# One scanline of one face: the span's width folded into the tally.
def count.row(remaining: Nat, +y: U32, +square: Face.Square, +size: U32,
  counted: Counted) -> Counted:
  match remaining:
    case 0n:
      counted
    case 1n+r:
      count.row(r, (y + 1 : U32), square, size, counted.plus(
        Counted{(1 : U32), span_width(span_x(square, F32.from_nat(U32.to_nat(y)), size))},
        counted))

# The tally's fold over the whole face list. One face's projection is inline rather than in
# a helper, because a helper here would have to call back into this fold and the language
# has neither forward references nor helper cycles.
def count.go(faces: List<&2, Face.Face>, +eye: Voxel.Vec, +right: Voxel.Vec, +up: Voxel.Vec,
  +forward: Voxel.Vec, +half: F32, +focal: F32, +size: U32, counted: Counted) -> Counted:
  match faces:
    case Nil{}:
      counted
    case Face.Face{fx, fy, fz, dir, block} <> rest:
      +square = Face.square_of(dir, U32.to_f32(fx), U32.to_f32(fy), U32.to_f32(fz), eye, right,
        up, forward, half, focal)
      +rows = span_rows(square, size)
      count.go(rest, eye, right, up, forward, half, focal, size, count.row(rows_of(rows),
        rows_first(rows), square, size, counted))

# One scanline of one face, written into the frame. The span is computed once and its two
# coordinates read once each inside `fill_row`.
def fill.row(remaining: Nat, +y: U32, +square: Face.Square, +size: U32, +colour: U32,
  frame: Array<U32>) -> Array<U32>:
  match remaining:
    case 0n:
      frame
    case 1n+r:
      fill.row(r, (y + 1 : U32), square, size, colour,
        fill_row(span_x(square, F32.from_nat(U32.to_nat(y)), size), (y * size : U32), colour,
          frame))

# The fill's fold over the whole face list. It is the painter's own work and nothing else:
# one projection per face, one span per scanline, one array write per pixel, no depth test
# and no ordering.
def fill.go(faces: List<&2, Face.Face>, +eye: Voxel.Vec, +right: Voxel.Vec, +up: Voxel.Vec,
  +forward: Voxel.Vec, +half: F32, +focal: F32, +size: U32, frame: Array<U32>) -> Array<U32>:
  match faces:
    case Nil{}:
      frame
    case Face.Face{fx, fy, fz, dir, block} <> rest:
      # A pattern binds each field once, and this face's label is needed twice: once to
      # choose the plane and the in-plane axes, and once to shade the colour. A `+` let
      # reads it into a reusable binding, which is what lets both see it.
      +label : Nat = dir
      +square = Face.square_of(label, U32.to_f32(fx), U32.to_f32(fy), U32.to_f32(fz), eye,
        right, up, forward, half, focal)
      +rows = span_rows(square, size)
      fill.go(rest, eye, right, up, forward, half, focal, size, fill.row(rows_of(rows),
        rows_first(rows), square, size, colour_of(block, label), frame))

# --- the driver ---------------------------------------------------------------

# `half` and `focal` are the projection the renderer at this depth uses, so the quads here
# are the same quads `bucket_faces` would project.
def half_at(depth: Nat) -> F32:
  Voxel.projection_half(depth)

def focal_at(depth: Nat) -> F32:
  F32.mul(1.5, half_at(depth))

def camera_of_pose(pose: Frame.Pose, depth: Nat) -> Voxel.Camera:
  camera_of(pose)

def sample.at(read: Array<U32> & U32) -> U32:
  (_, seen) = read
  seen

# The fill's own colour, read back out of the middle of the frame so the answer depends on
# the fill having run over that pixel.
def sampled(pixels: Array<U32>, +size: U32) -> U32:
  sample.at(pixels[U32.add(U32.div(size, (2 : U32)), size)])

# One timed region per fold, so the tally and the fill are separately priced and the sum is
# what a painter costs. The tally runs untimed: it is arithmetic over the same spans and it
# is not part of what a painter has to do, since a painter's fill already knows the span it
# is writing.
def phase_line(+label: String, +size: U32, +iterations: Nat, started: Nat, finished: Nat,
  +seen: U32, +tally: Counted) -> String:
  "phase=" ++ label ++ " size=" ++ U32.show(size)
    ++ " pixels=" ++ U32.show(U32.mul(size, size))
    ++ " spans=" ++ U32.show(counted_spans(tally))
    ++ " spanpixels=" ++ U32.show(counted_pixels(tally))
    ++ " iterations=" ++ Nat.show(iterations)
    ++ " elapsed_ms=" ++ Nat.show(Nat.sub(finished, started))
    ++ " sampled=" ++ U32.show(seen)

def print_line(+line: String) -> IO(Unit):
  do IO<Unit>:
    IO.print(line)

# `phase_line` reads the tally twice, once for the span count and once for the span
# pixels, and a `Counted` is `Data`, so one copy answers both. The frame is read once.
def report(+label: String, +size: U32, +iterations: Nat, started: Nat, finished: Nat,
  tally: Counted, frame: Array<U32>) -> IO(Unit):
  print_line(phase_line(label, size, iterations, started, finished, sampled(frame, size), tally))

# The camera's four basis vectors, unpacked once from the camera record. The tally's entry
# point is the same shape as the fill's, so the two folds below are called the same way.
def tally_of(faces: List<&2, Face.Face>, +camera: Voxel.Camera, +half: F32, +focal: F32,
  size: U32) -> Counted:
  count.go(faces, Face.cam_eye(camera), Face.cam_right(camera), Face.cam_up(camera),
    Face.cam_forward(camera), half, focal, size, counted.zero())

# The camera's four basis vectors for the fill, unpacked once from the camera record.
def fill.of(faces: List<&2, Face.Face>, +camera: Voxel.Camera, +half: F32, +focal: F32,
  +size: U32, frame: Array<U32>) -> Array<U32>:
  fill.go(faces, Face.cam_eye(camera), Face.cam_right(camera),
    Face.cam_up(camera), Face.cam_forward(camera), half, focal, size, frame)

# The timed fill, repeated enough times for the clock to carry digits.
def fill.rounds(rounds: Nat, +faces: List<&2, Face.Face>, +camera: Voxel.Camera, +half: F32,
  +focal: F32, +size: U32, frame: Array<U32>) -> Array<U32>:
  match rounds:
    case 0n:
      frame
    case 1n+r:
      fill.rounds(r, faces, camera, half, focal, size,
        fill.of(faces, camera, half, focal, size, frame))

# The painter at the size and camera the client renders, repeated enough times for the clock
# to carry digits: one pass at 128x128 is a couple of milliseconds.
def paint_at(+label: String, +size: U32, +depth: Nat, +iterations: Nat,
  +faces: List<&2, Face.Face>, +pose: Frame.Pose) -> IO(Unit):
  do IO<Unit>:
    tally : Counted = tally_of(faces, camera_of(pose), half_at(depth), focal_at(depth), size)
    frame : Array<U32> = Array.new(U32, slots_of(depth), Voxel.sky_color(U32.sub(size, (1 : U32))))
    started : Nat <- IO.now()
    written : Array<U32> = fill.rounds(iterations, faces, camera_of(pose), half_at(depth),
      focal_at(depth), size, frame)
    finished : Nat <- IO.now()
    report(label, size, iterations, started, finished, tally, written)

# The client resolves the pointer's ray and the frame's spawn pose, so the probe measures
# at exactly the camera the client renders from.
def pose_of(player: Player.State) -> Frame.Pose:
  Frame.pose(player, Frame.origin_x(), Frame.origin_z())

def player_of(maybe: Maybe<&1, Player.State>) -> IO(Player.State):
  match maybe:
    case Some{player}:
      IO.pure(Player.State, player)
    case None{}:
      IO.die(Player.State, 1, "span-probe: the client spawn was refused")

def main() -> IO(Unit):
  do IO<Unit>:
    +edits : List<&2, WorldState.Edit> = WorldState.empty()
    +player : Player.State <- player_of(PlayerProbe.checked_create_player(25n, 25n, 9n))
    +faces : List<&2, Face.Face> = region_faces(edits)
    +pose : Frame.Pose = pose_of(player)
    # 128x128 is what the client ships, and it is the size the walk's cost model above was
    # measured at. 256x256 and 512x512 are the next two steps up, and 1024x1024 is the
    # resolution the goal names.
    a : Unit <- paint_at("paint_128", frame_size(7n), 7n, 200n, faces, pose)
    b : Unit <- paint_at("paint_256", frame_size(8n), 8n, 100n, faces, pose)
    c : Unit <- paint_at("paint_512", frame_size(9n), 9n, 30n, faces, pose)
    d : Unit <- paint_at("paint_1024", frame_size(10n), 10n, 10n, faces, pose)
    IO.print("span-probe=pass faces=" ++ Nat.show(U32.to_nat(Face.face_total(faces))))
import Base
import ../../world/player.bend as Player
import ../../world/world.bend as World
import ../../world/world_state.bend as WorldState
import ../voxel-probe/voxel_probe.bend as Voxel
import ../player-probe/player_probe.bend as PlayerProbe

# One frame of a native client, as data. `player` is the state the next tick
# reads, `pose` is the camera basis this frame was drawn from, `digest` is the
# fingerprint of what was shown and `rendered` says whether this tick paid for a
# draw. The record is affine: a frame is consumed once, by the next frame.
type Frame is Data:
  Frame{player: Player.State, pose: Pose, digest: U32, rendered: Bool}

# The camera basis, expressed in the render chunk's own cells. The player state
# counts domain cells and the render grid is one chunk, so the eye is rebased
# before it can index anything.

type Pose is Data:
  Pose{eye: Voxel.Vec, yaw: F32, pitch: F32}

# The tick's events folded into what `Player.step` reads: the held-key mask and
# the two look deltas.

type Keys is Data:
  Keys{keys: U32, turn: F32, tilt: F32}

# Input and the player transition applied, before the frame decides whether it
# has to draw. A frame that skips the render still answers one of these.

type Staged is Data:
  Staged{player: Player.State, pose: Pose, changed: Bool}

# Where the player is created and where `Player.step` respawns it. The region is
# anchored at its minimum chunk, so the spawn has to sit one chunk inside it.

type Spawn is Data:
  Spawn{x: Nat, z: Nat, height: Nat}

def seed() -> Nat:
  1337n

def chunk_x() -> Nat:
  1n

def chunk_z() -> Nat:
  1n

# Two chunks per axis, so the player has a seam to cross and the collision
# probes walk the longer region list `Player.region_block` really has. The bound
# `PlayerProbe.grid_is_sound` allows is sixteen chunks in total; this is four.

def columns() -> Nat:
  2n

def rows() -> Nat:
  2n

# The renderer reads this many chunks per axis. Measured at 8 threads, 7 samples, the
# client's own spawn camera, per call: a one-chunk view costs 9.45 ms to render at
# 64x64, a two-by-two region costs 19.10 ms at the same 64x64 and 21.41 ms even at
# 32x32. The region's extra cost is the cell walk and the list plumbing that lays four
# chunks out as one array, and it barely moves with the output size, so it is a fixed
# per-frame cost rather than a per-pixel one. Two per axis therefore misses the 16.7 ms
# budget at every resolution, and the shipped view is one chunk until that fixed cost
# comes down. The region renderer itself is kept and tested: `faces_from_chunks` is the
# same walk as `faces_from_chunk` over a wider extent, and the agreement gate covers both.
def view_columns() -> Nat:
  1n

def view_rows() -> Nat:
  1n

def spawn() -> Spawn:
  Spawn{25n, 25n, 9n}

# One tick is 1/60 s of held input, the same dt `native/player-probe` measured.

def tick_dt() -> F32:
  0.016

# The distance from the player's feet to the camera. `Player.State` is the body
# and carries no eye, so the eye belongs to the adapter that turns a player into
# a camera, and it lives here.

def eye_height() -> F32:
  1.62

# Just under a quarter turn, so no look event can flip the camera over.

def pitch_limit() -> F32:
  1.5533

def look_sensitivity() -> F32:
  0.0025

# `Player.step` reads these masks through `Player.held`, so the fold below maps a
# key code onto the bit the player transition tests rather than onto a key name.
# A code that is not in the table reads as 0, which is "no key held", so every key
# a client reacts to has to be in the table: the dig, place, save and quit keys are
# read from the same mask as the movement keys, and a code missing from here would
# read as always down.

def key_bit(+code: U32) -> U32:
  Bool.pick(U32, U32.is_eq(code, 119), 1,
    Bool.pick(U32, U32.is_eq(code, 115), 4,
      Bool.pick(U32, U32.is_eq(code, 97), 8,
        Bool.pick(U32, U32.is_eq(code, 100), 2,
          Bool.pick(U32, U32.is_eq(code, 32), 16,
            Bool.pick(U32, U32.is_eq(code, 16), 32,
              Bool.pick(U32, U32.is_eq(code, 17), 64,
                Bool.pick(U32, U32.is_eq(code, 27), 128,
                  Bool.pick(U32, U32.is_eq(code, 101), 256,
                    Bool.pick(U32, U32.is_eq(code, 114), 512,
                      Bool.pick(U32, U32.is_eq(code, 116), 1024, 0)))))))))))

def key_set(+keys: U32, +code: U32, down: Bool) -> U32:
  +bit = key_bit(code)
  +cleared = U32.and(keys, U32.xor(keys, bit))
  Bool.pick(U32, down, U32.or(cleared, bit), cleared)

# A `match` may only scrutinize a parameter or a field, and `event` is a list
# binder, so each event is routed by a def that receives it as its parameter.

def fold_keys(event: Event, +keys: U32) -> U32:
  match event:
    case Key{code, down}:
      key_set(keys, code, down)
    case _:
      keys

def fold_turn(event: Event, +turn: F32) -> F32:
  match event:
    case Look{dx, dy}:
      F32.add(turn, F32.mul(dx, look_sensitivity()))
    case _:
      turn

def fold_tilt(event: Event, +tilt: F32) -> F32:
  match event:
    case Look{dx, dy}:
      F32.add(tilt, F32.mul(dy, look_sensitivity()))
    case _:
      tilt

def input.go(events: List<&2, Event>, +keys: U32, +turn: F32, +tilt: F32) -> Keys:
  match events:
    case Nil{}:
      Keys{keys, turn, tilt}
    case +event <> rest:
      input.go(rest, fold_keys(event, keys), fold_turn(event, turn),
        fold_tilt(event, tilt))

# The input stage: one tick's events into the held-key mask and the two look
# deltas. A client reads this once per tick, before the player transition.

def input(events: List<&2, Event>) -> Keys:
  input.go(events, 0, 0.0, 0.0)

# A `match` may not scrutinize a `let`-bound local, so the folded record is read
# through three projections. Each is a field read, not a second fold.

def keys_mask(keys: Keys) -> U32:
  Keys{mask, _, _} = keys
  mask

def turn_delta(keys: Keys) -> F32:
  Keys{_, turn, _} = keys
  turn

def tilt_delta(keys: Keys) -> F32:
  Keys{_, _, tilt} = keys
  tilt

# The camera stage: the player's resulting eye, rebased onto the render chunk,
# with the angles the player state already carries.

def pose(state: Player.State, +origin_x: Nat, +origin_z: Nat) -> Pose:
  Player.State{+x, +y, +z, +yaw, +pitch, +velocity_y, +grounded, +health, +hunger,
    +air, +fall, +poison} = state
  +base_x = F32.from_nat(origin_x)
  +base_z = F32.from_nat(origin_z)
  Pose{Voxel.Vec{F32.sub(x, base_x), F32.add(y, eye_height()), F32.sub(z, base_z)},
    yaw, pitch}

def camera_of(+pose: Pose) -> Voxel.Camera:
  Pose{eye, yaw, pitch} = pose
  Voxel.Camera.look(eye, yaw, pitch)

def camera_forward_y(camera: Voxel.Camera) -> F32:
  Voxel.Camera{eye, forward, right, up} = camera
  Voxel.Vec{x, y, z} = forward
  y

def eye_of(+pose: Pose) -> Voxel.Vec:
  Pose{eye, _, _} = pose
  eye

def yaw_of(+pose: Pose) -> F32:
  Pose{_, yaw, _} = pose
  yaw

def pitch_of(+pose: Pose) -> F32:
  Pose{_, _, pitch} = pose
  pitch

def eye_x(eye: Voxel.Vec) -> F32:
  Voxel.Vec{x, _, _} = eye
  x

def eye_y(eye: Voxel.Vec) -> F32:
  Voxel.Vec{_, y, _} = eye
  y

def eye_z(eye: Voxel.Vec) -> F32:
  Voxel.Vec{_, _, z} = eye
  z

# The condition the client must test before it can skip a frame.
#
# The camera is the only thing the render stage reads, and `Camera.look` uses the
# eye's three components plus yaw and pitch and nothing else. So the image changes
# exactly when one of those five numbers changes. A state that moves hunger, air,
# fall damage, velocity or the grounded flag without moving the eye or turning
# the view produces the same pixels, and must not cost a frame. A world edit
# changes the grid rather than the pose, so it has to dirty the frame separately;
# this predicate is the pose half of that test.

def eye_moved(+before: Voxel.Vec, after: Voxel.Vec) -> Bool:
  Voxel.Vec{+bx, +by, +bz} = before
  Voxel.Vec{+ax, +ay, +az} = after
  Bool.or(F32.is_ne(bx, ax), Bool.or(F32.is_ne(by, ay), F32.is_ne(bz, az)))

# A `match` may only scrutinize a parameter or a field, so each of the five
# numbers the camera reads is compared through a def that receives it.

def pose_changed(+before: Pose, after: Pose) -> Bool:
  Pose{+before_eye, +before_yaw, +before_pitch} = before
  Pose{+eye, +yaw, +pitch} = after
  Bool.or(eye_moved(before_eye, eye),
    Bool.or(F32.is_ne(before_yaw, yaw), F32.is_ne(before_pitch, pitch)))

def is_grounded(state: Player.State) -> Bool:
  Player.State{x, y, z, yaw, pitch, velocity_y, grounded, health, hunger, air, fall,
    poison} = state
  grounded

# The render seam.
#
# This is the one function a face-based renderer replaces. It takes the prebuilt
# grid and the camera and answers the frame's image. `camera_of`, `fingerprint`,
# the input fold, the player transition, the dirty test and every timing in
# `frame_bench.bend` stay exactly where they are.

def render(+grid: Voxel.VoxelGrid, +camera: Voxel.Camera, depth: Nat) -> Image:
  Voxel.render_size(grid, camera, depth)

def fingerprint(image: Image) -> U32:
  Voxel.fingerprint(image)

# The same render through the voxel probe's own chunk-level entry point, which
# rebuilds the nested grid from the bulk chunk on every call. `render` and
# `render_chunk` answer the same image for the same pose; what differs is the
# grid build, which is what a client that does not cache a chunk pays per frame.

def render_chunk(chunk: Array<U32>, +pose: Pose, depth: Nat) -> Image:
  Pose{eye, yaw, pitch} = pose
  Voxel.render_size_at(chunk, eye, yaw, pitch, depth)

def ray_abs_x(+ray: Voxel.Vec) -> F32:
  Voxel.Vec{x, _, _} = ray
  F32.abs(x)

def sky_pixel(+camera: Voxel.Camera, +x: U32, +y: U32, +half: F32, +focal: F32) -> U32:
  +ray = Voxel.Camera.ray_for(camera, x, y, half, focal)
  Voxel.sky_color(U32.add(y, F32.to_u32(ray_abs_x(ray))))

# The voxel probe's `sky` control, which is what the render stage would cost with
# the trace and its grid reads left out: the same quadtree, the same per-pixel
# ray, the same leaf shape and the same fingerprint fold. The ray is folded into
# the color so it cannot be dropped as dead code, so what this omits is exactly
# the trace. It is the floor a different rasterizer would have to beat.

def sky_image(+depth: Nat, +camera: Voxel.Camera, +half: F32, +focal: F32,
  +x: U32, +y: U32) -> Image:
  match depth:
    case 0n:
      Pix{sky_pixel(camera, x, y, half, focal)}
    case 1n+p:
      +step = U32.shln(1, p)
      tl tr bl br = sky_image(p, camera, half, focal, x, y)
        sky_image(p, camera, half, focal, (x + step : U32), y)
        sky_image(p, camera, half, focal, x, (y + step : U32))
        sky_image(p, camera, half, focal, (x + step : U32), (y + step : U32))
      Qua{tl, tr, bl, br}

def render_sky(+camera: Voxel.Camera, +depth: Nat) -> Image:
  +half = Voxel.projection_half(depth)
  sky_image(depth, camera, half, F32.mul(1.5, half), 0, 0)

# ---------------------------------------------------------------------------
# The cached world the frame reads
#
# A client builds the collision region and the render grid once and keeps them;
# the two are separate objects here because `native/player-probe` owns the
# region and the voxel probe owns the grid, and this probe owns neither.
# ---------------------------------------------------------------------------
def region() -> Maybe<&1, PlayerProbe.Region>:
  PlayerProbe.checked_from_world_state(seed(), chunk_x(), chunk_z(), columns(), rows(),
    WorldState.empty())

def chunk() -> Array<U32>:
  World.chunk(seed(), chunk_x(), chunk_z())

def grid() -> Voxel.VoxelGrid:
  Voxel.grid_from_chunk(chunk())

# The chunk's domain origin, which is what the player's cells are counted from.

def origin_x() -> Nat:
  PlayerProbe.domain_cell(Nat.mul(chunk_x(), World.chunk_size()))

def origin_z() -> Nat:
  PlayerProbe.domain_cell(Nat.mul(chunk_z(), World.chunk_size()))

def initial_player() -> Player.State:
  PlayerProbe.create_player(25n, 25n, 9n)

def ready(state: Player.State, events: List<&2, Event>) -> Player.State & U32:
  # Every parameter is destructured before the first `let`: a `let` turns the
  # remaining binders into computed values and a `match` may only scrutinize a
  # parameter or a field.
  Player.State{+x, +y, +z, +yaw, +pitch, +velocity_y, grounded, +health, +hunger,
    +air, +fall, +poison} = state
  +folded : Keys = input(events)
  +keys = keys_mask(folded)
  +next_yaw = F32.add(yaw, turn_delta(folded))
  +next_pitch = F32.clamp(F32.add(pitch, tilt_delta(folded)),
    F32.neg(pitch_limit()), pitch_limit())
  (Player.State{x, y, z, next_yaw, next_pitch, velocity_y, grounded, health, hunger,
    air, fall, poison}, keys)

def ready_keys(ready: Player.State & U32) -> U32:
  (state, keys) = ready
  keys

def ready_state(ready: Player.State & U32) -> Player.State:
  (state, keys) = ready
  state

# The player stage: `Player.step` against the cached multi-chunk region. The
# probe owns the collision region, not the tick. A frame passes `prepared`
# straight through, so this def is also the seam a benchmark times on its own.

def tick(ready: Player.State & U32, +dt: F32,
  +region: PlayerProbe.Region) -> Player.State:
  (state, keys) = ready
  PlayerProbe.step(state, keys, dt, region, 25n, 25n, 9n)

# Input and the player transition, up to but not including the camera. A frame
# that skips the render still does exactly this, which is the dirty-frame cost.

def advance(state: Player.State, events: List<&2, Event>, +dt: F32,
  +region: PlayerProbe.Region, +origin_x: Nat, +origin_z: Nat,
  previous: Pose) -> Staged:
  prepared : Player.State & U32 = ready(state, events)
  +moved : Player.State = tick(prepared, dt, region)
  +next : Pose = pose(moved, origin_x, origin_z)
  Staged{moved, next, pose_changed(previous, next)}

def rebuild.painted(+player: Player.State, +pose: Pose, chunk: Array<U32>,
  depth: Nat, +previous: U32) -> Frame:
  +image : Image = render_chunk(chunk, pose, depth)
  Frame{player, pose, fingerprint(image), True{}}

# The `sky` frame's paint: the same image with the trace and its grid reads removed.

def sky_draw.painted(+player: Player.State, +pose: Pose, depth: Nat,
  +previous: U32) -> Frame:
  +image : Image = render_sky(camera_of(pose), depth)
  Frame{player, pose, fingerprint(image), True{}}

# ---------------------------------------------------------------------------
# Reading a frame back
#
# A frame is affine, so each field is read once. A benchmark that needs two of
# them threads the frame itself, or reads a projection per use.
# ---------------------------------------------------------------------------
def digest_of(f: Frame) -> U32:
  Frame{player, pose, digest, rendered} = f
  digest

def rendered_of(f: Frame) -> Bool:
  Frame{player, pose, digest, rendered} = f
  rendered

# How many times a loop of frames actually reached the render stage. A benchmark
# folds this, so a dirty-frame phase that rendered is caught rather than reported
# as a cheap frame.

def draws_of(f: Frame) -> U32:
  Frame{player, pose, digest, rendered} = f
  Bool.to_u32(rendered)

def player_of(f: Frame) -> Player.State:
  Frame{player, pose, digest, rendered} = f
  player

def pose_of(+f: Frame) -> Pose:
  Frame{player, pose, digest, rendered} = f
  pose

# The frame's pose together with its digest, which is what the next tick needs:
# the pose to decide whether it can skip, and the digest to carry if it does.

type Carried is Data:
  Carried{player: Player.State, pose: Pose, digest: U32}

def carry(+f: Frame) -> Carried:
  Frame{player, pose, digest, rendered} = f
  Carried{player, pose, digest}

# The state a loop starts from: no digest yet, so the first frame has to draw.

def carried_seed(state: Player.State, pose: Pose) -> Carried:
  Carried{state, pose, 0}

def carried_player(+carried: Carried) -> Player.State:
  Carried{player, pose, digest} = carried
  player

def carried_pose(+carried: Carried) -> Pose:
  Carried{player, pose, digest} = carried
  pose

def carried_digest(+carried: Carried) -> U32:
  Carried{player, pose, digest} = carried
  digest

# One tick's worth of events, for the two shapes a measured frame takes. An idle
# client holds nothing, which is the shape that exercises the dirty path, and a
# turning client is the shape that exercises the render.

def idle_events() -> List<&2, Event>:
  []

def turn_events() -> List<&2, Event>:
  [Key{119, True{}}, Key{100, True{}}, Look{2.0, 0.5}]

# The player state fields a reader needs, projected one at a time because
# `Player.State` is affine and can only be destructured once.

def player_x(state: Player.State) -> F32:
  Player.State{x, y, z, yaw, pitch, velocity_y, grounded, health, hunger, air, fall,
    poison} = state
  x

def player_y(state: Player.State) -> F32:
  Player.State{x, y, z, yaw, pitch, velocity_y, grounded, health, hunger, air, fall,
    poison} = state
  y

def player_z(state: Player.State) -> F32:
  Player.State{x, y, z, yaw, pitch, velocity_y, grounded, health, hunger, air, fall,
    poison} = state
  z

def player_yaw(state: Player.State) -> F32:
  Player.State{x, y, z, yaw, pitch, velocity_y, grounded, health, hunger, air, fall,
    poison} = state
  yaw

def player_pitch(state: Player.State) -> F32:
  Player.State{x, y, z, yaw, pitch, velocity_y, grounded, health, hunger, air, fall,
    poison} = state
  pitch

# The rendering policy the client applies. A `match` may only scrutinize a
# parameter, so the two policy bits are matched as a pair: redraw whenever either
# one is set.
#
# A world edit dirties the grid rather than the pose, so a client ORs a
# grid-version flag in at the same place: it would pass that flag as `changed`.

def draw.painted(+player: Player.State, +pose: Pose, +grid: Voxel.VoxelGrid,
  depth: Nat, +previous: U32) -> Frame:
  +image : Image = render(grid, camera_of(pose), depth)
  Frame{player, pose, fingerprint(image), True{}}

def rebuild.at(force: Bool, changed: Bool, +player: Player.State, +pose: Pose,
  chunk: Array<U32>, depth: Nat, +previous: U32) -> Frame:
  match force changed:
    case True{} True{}:
      rebuild.painted(player, pose, chunk, depth, previous)
    case True{} False{}:
      rebuild.painted(player, pose, chunk, depth, previous)
    case False{} True{}:
      rebuild.painted(player, pose, chunk, depth, previous)
    case False{} False{}:
      Frame{player, pose, previous, False{}}

def frame_rebuild(state: Player.State, events: List<&2, Event>, +dt: F32,
  +region: PlayerProbe.Region, chunk: Array<U32>, depth: Nat,
  +origin_x: Nat, +origin_z: Nat, previous: Pose, +digest: U32,
  force: Bool) -> Frame:
  prepared : Player.State & U32 = ready(state, events)
  +moved : Player.State = tick(prepared, dt, region)
  +next : Pose = pose(moved, origin_x, origin_z)
  +changed : Bool = pose_changed(previous, next)
  rebuild.at(force, changed, moved, next, chunk, depth, digest)

# The `sky` frame's draw: `draw.at` with `render_sky` in place of `render`.

def sky_draw.at(force: Bool, changed: Bool, +player: Player.State, +pose: Pose,
  depth: Nat, +previous: U32) -> Frame:
  match force changed:
    case True{} True{}:
      sky_draw.painted(player, pose, depth, previous)
    case True{} False{}:
      sky_draw.painted(player, pose, depth, previous)
    case False{} True{}:
      sky_draw.painted(player, pose, depth, previous)
    case False{} False{}:
      Frame{player, pose, previous, False{}}

def frame_sky(state: Player.State, events: List<&2, Event>, +dt: F32,
  +region: PlayerProbe.Region, depth: Nat,
  +origin_x: Nat, +origin_z: Nat, previous: Pose, +digest: U32,
  force: Bool) -> Frame:
  prepared : Player.State & U32 = ready(state, events)
  +moved : Player.State = tick(prepared, dt, region)
  +next : Pose = pose(moved, origin_x, origin_z)
  +changed : Bool = pose_changed(previous, next)
  sky_draw.at(force, changed, moved, next, depth, digest)

def draw.at(force: Bool, changed: Bool, +player: Player.State, +pose: Pose,
  +grid: Voxel.VoxelGrid, depth: Nat, +previous: U32) -> Frame:
  match force changed:
    case True{} True{}:
      draw.painted(player, pose, grid, depth, previous)
    case True{} False{}:
      draw.painted(player, pose, grid, depth, previous)
    case False{} True{}:
      draw.painted(player, pose, grid, depth, previous)
    case False{} False{}:
      Frame{player, pose, previous, False{}}

# The paint itself: the render seam and the fingerprint. This is the only place a
# frame reaches `render`.

def draw(force: Bool, staged: Staged, +grid: Voxel.VoxelGrid, depth: Nat,
  +previous: U32) -> Frame:
  Staged{player, pose, changed} = staged
  draw.at(force, changed, player, pose, grid, depth, previous)

# One full frame: the tick's events, the player transition through `Player.step`
# against the cached region, the camera rebuilt from the resulting eye and yaw,
# the render through the voxel probe, and the image fingerprint.

def frame(state: Player.State, events: List<&2, Event>, +dt: F32,
  +region: PlayerProbe.Region, +grid: Voxel.VoxelGrid, depth: Nat,
  +origin_x: Nat, +origin_z: Nat, previous: Pose, +digest: U32,
  force: Bool) -> Frame:
  +staged : Staged = advance(state, events, dt, region, origin_x, origin_z, previous)
  draw(force, staged, grid, depth, digest)

# The rebuild variant's draw: `draw.at` with `render_chunk` in place of `render`,
# so the only difference between the two frame paths is the grid build.

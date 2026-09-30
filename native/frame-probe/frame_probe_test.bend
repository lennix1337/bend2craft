import Base
import ../../world/player.bend as Player
import ../../world/world.bend as World
import ../voxel-probe/voxel_probe.bend as Voxel
import ../player-probe/player_probe.bend as PlayerProbe
import ./frame_probe.bend as Probe

# Every failure is IO.die, so a wrong dirty condition, a wrong render or a wrong
# region fails the run rather than printing a number that looks plausible.
def check(ok: Bool, message: String) -> IO(Unit):
  match ok:
    case True{}:
      IO.pure(Unit, Unit{})
    case False{}:
      IO.die(Unit, 1, "frame-probe-test: " ++ message)

def region_of(value: Maybe<&1, PlayerProbe.Region>) -> IO(PlayerProbe.Region):
  match value:
    case Some{region}:
      IO.pure(PlayerProbe.Region, region)
    case None{}:
      IO.die(PlayerProbe.Region, 1, "frame-probe-test: the benchmark region was refused")

def settle_ticks() -> Nat:
  120n

def render_depth() -> Nat:
  5n

# ---------------------------------------------------------------------------
# Fixtures
#
# `frame_of` and `rebuild_of` are the only two places that call `Probe.frame` and
# `Probe.frame_rebuild`, so the test and the benchmark measure the same frame.
# ---------------------------------------------------------------------------

def pose_at(+x: F32, +y: F32, +z: F32, +yaw: F32, +pitch: F32) -> Probe.Pose:
  Probe.Pose{Voxel.Vec{x, y, z}, yaw, pitch}

def state_at(+x: F32, +y: F32, +z: F32, +yaw: F32, +pitch: F32,
  +velocity_y: F32, grounded: Bool, +health: F32, +hunger: F32,
  +air: F32, +fall: F32) -> Player.State:
  Player.State{x, y, z, yaw, pitch, velocity_y, grounded, health, hunger, air, fall,
    0.0}

def frame_digest(+f: Probe.Frame) -> U32:
  Probe.Frame{player, pose, digest, rendered} = f
  digest

def frame_rendered(+f: Probe.Frame) -> Bool:
  Probe.Frame{player, pose, digest, rendered} = f
  rendered

def frame_player(f: Probe.Frame) -> Player.State:
  Probe.Frame{player, pose, digest, rendered} = f
  player

def frame_pose(+f: Probe.Frame) -> Probe.Pose:
  Probe.Frame{player, pose, digest, rendered} = f
  pose

def keys_of(folded: Probe.Keys) -> U32:
  Probe.Keys{mask, _, _} = folded
  mask

def region_shape(region: PlayerProbe.Region) -> Nat & Nat:
  PlayerProbe.Region{+blocks, +origin_x, +origin_y, +origin_z, +width, +height, +depth}
    = region
  (width, depth)

def frame_of(+state: Player.State, events: List<&2, Event>,
  +region: PlayerProbe.Region, +grid: Voxel.VoxelGrid, +digest: U32,
  force: Bool) -> Probe.Frame:
  Probe.frame(state, events, Probe.tick_dt(), region, grid, render_depth(),
    Probe.origin_x(), Probe.origin_z(),
    Probe.pose(state, Probe.origin_x(), Probe.origin_z()), digest, force)

def rebuild_of(+state: Player.State, events: List<&2, Event>,
  +region: PlayerProbe.Region, +digest: U32, force: Bool) -> Probe.Frame:
  Probe.frame_rebuild(state, events, Probe.tick_dt(), region, Probe.chunk(),
    render_depth(), Probe.origin_x(), Probe.origin_z(),
    Probe.pose(state, Probe.origin_x(), Probe.origin_z()), digest, force)

def settle.go(remaining: Nat, +state: Player.State,
  +region: PlayerProbe.Region) -> Player.State:
  match remaining:
    case 0n:
      state
    case 1n+p:
      settle.go(p, Probe.tick(Probe.ready(state, []), Probe.tick_dt(), region), region)

def settle(iterations: Nat, +state: Player.State,
  +region: PlayerProbe.Region) -> Player.State:
  settle.go(iterations, state, region)

# ---------------------------------------------------------------------------
# The dirty-frame condition
#
# This is the one pure rule the probe adds; everything else it measures already
# existed in the voxel probe or the player probe. It is what a client must test
# before it can skip a frame.
# ---------------------------------------------------------------------------

def same_pose_is_clean() -> IO(Unit):
  +before : Probe.Pose = pose_at(9.5, 10.6, 9.5, 0.25, 0.30)
  +after : Probe.Pose = pose_at(9.5, 10.6, 9.5, 0.25, 0.30)
  do IO<Unit>:
    Unit <- check(Bool.not(Probe.pose_changed(before, after)),
      "an identical pose was reported as changed")
    IO.print("dirty: an identical pose is clean")

def moved_eye_is_dirty() -> IO(Unit):
  +before : Probe.Pose = pose_at(9.5, 10.6, 9.5, 0.25, 0.30)
  +x : Probe.Pose = pose_at(9.75, 10.6, 9.5, 0.25, 0.30)
  +y : Probe.Pose = pose_at(9.5, 10.75, 9.5, 0.25, 0.30)
  +z : Probe.Pose = pose_at(9.5, 10.6, 9.75, 0.25, 0.30)
  do IO<Unit>:
    Unit <- check(Probe.pose_changed(before, x), "moving the eye in x did not dirty the frame")
    Unit <- check(Probe.pose_changed(before, y), "moving the eye in y did not dirty the frame")
    check(Probe.pose_changed(before, z), "moving the eye in z did not dirty the frame")

def turned_camera_is_dirty() -> IO(Unit):
  +before : Probe.Pose = pose_at(9.5, 10.6, 9.5, 0.25, 0.30)
  +yawed : Probe.Pose = pose_at(9.5, 10.6, 9.5, 0.75, 0.30)
  +pitched : Probe.Pose = pose_at(9.5, 10.6, 9.5, 0.25, 0.55)
  do IO<Unit>:
    Unit <- check(Probe.pose_changed(before, yawed), "turning the yaw did not dirty the frame")
    check(Probe.pose_changed(before, pitched), "tilting the pitch did not dirty the frame")

# The complement, and the reason the predicate is worth having: a state that moves
# hunger, air, health or velocity without moving the eye or turning the view
# produces the same pixels, so it must not cost a frame.
def survival_change_is_clean() -> IO(Unit):
  +before = state_at(9.5, 10.6, 9.5, 0.25, 0.30, 0.0, True{}, 20.0, 20.0, 10.0, 0.0)
  +hunger = state_at(9.5, 10.6, 9.5, 0.25, 0.30, 0.0, True{}, 20.0, 11.0, 10.0, 0.0)
  +air = state_at(9.5, 10.6, 9.5, 0.25, 0.30, 0.0, True{}, 20.0, 20.0, 4.0, 0.0)
  +hurt = state_at(9.5, 10.6, 9.5, 0.25, 0.30, 0.0, True{}, 6.0, 20.0, 10.0, 0.0)
  +airborne = state_at(9.5, 10.6, 9.5, 0.25, 0.30, 4.0, False{}, 20.0, 20.0, 10.0, 0.0)
  +before_eye : Probe.Pose = Probe.pose(before, 0n, 0n)
  +hunger_eye : Probe.Pose = Probe.pose(hunger, 0n, 0n)
  +air_eye : Probe.Pose = Probe.pose(air, 0n, 0n)
  +hurt_eye : Probe.Pose = Probe.pose(hurt, 0n, 0n)
  +airborne_eye : Probe.Pose = Probe.pose(airborne, 0n, 0n)
  do IO<Unit>:
    Unit <- check(Bool.not(Probe.pose_changed(before_eye, hunger_eye)),
      "a hunger change dirtied a frame whose pixels cannot change")
    Unit <- check(Bool.not(Probe.pose_changed(before_eye, air_eye)),
      "an air change dirtied a frame whose pixels cannot change")
    Unit <- check(Bool.not(Probe.pose_changed(before_eye, hurt_eye)),
      "a health change dirtied a frame whose pixels cannot change")
    check(Bool.not(Probe.pose_changed(before_eye, airborne_eye)),
      "a velocity change with the eye held still dirtied the frame")

# The eye is the player plus the eye height, rebased onto the render chunk, and
# `check_eye` is written before its caller because a def may not be referenced
# before it is defined.
def check_eye(+local: Probe.Pose, +rebased: Probe.Pose, +expected_y: F32) -> IO(Unit):
  +eye : Voxel.Vec = Probe.eye_of(local)
  +rebased_eye : Voxel.Vec = Probe.eye_of(rebased)
  +chunk_x : F32 = F32.from_nat(Probe.origin_x())
  +chunk_z : F32 = F32.from_nat(Probe.origin_z())
  do IO<Unit>:
    Unit <- check(F32.is_eq(Probe.eye_x(eye), 9.5), "the eye lost its x")
    Unit <- check(F32.is_eq(Probe.eye_y(eye), expected_y),
      "the eye is not the player plus the eye height")
    Unit <- check(F32.is_eq(Probe.eye_z(eye), 9.5), "the eye lost its z")
    Unit <- check(F32.is_eq(Probe.yaw_of(local), 0.25), "the pose lost the player's yaw")
    Unit <- check(F32.is_eq(Probe.pitch_of(local), 0.30),
      "the pose lost the player's pitch")
    Unit <- check(F32.is_eq(Probe.eye_x(rebased_eye), F32.sub(9.5, chunk_x)),
      "the eye lost its x rebasing onto the render chunk")
    check(F32.is_eq(Probe.eye_z(rebased_eye), F32.sub(9.5, chunk_z)),
      "the eye lost its z rebasing onto the render chunk")

# `Player.State` is the body and carries no eye, so the eye is the adapter's job.
def eye_is_the_player_plus_eye_height() -> IO(Unit):
  +state = state_at(9.5, 10.0, 9.5, 0.25, 0.30, 0.0, True{}, 20.0, 20.0, 10.0, 0.0)
  +local : Probe.Pose = Probe.pose(state, 0n, 0n)
  +rebased : Probe.Pose = Probe.pose(state, Probe.origin_x(), Probe.origin_z())
  +expected_y : F32 = F32.add(10.0, Probe.eye_height())
  check_eye(local, rebased, expected_y)

# The camera has to start inside the region the renderer is handed, or the DDA reads
# nothing and the render stage would measure an all-sky frame. The bound is the view
# region, not one chunk: the client renders `view_columns` x `view_rows` chunks, and
# the eye at the world's own spawn cell is inside that region but outside any single
# chunk of it.
def check_eye_inside(+eye: Voxel.Vec) -> IO(Unit):
  +limit_x : F32 = U32.to_f32(U32.mul(U32.from_nat(World.chunk_size()),
    U32.from_nat(Probe.view_columns())))
  +limit_z : F32 = U32.to_f32(U32.mul(U32.from_nat(World.chunk_size()),
    U32.from_nat(Probe.view_rows())))
  +height : F32 = U32.to_f32(U32.from_nat(World.max_y()))
  +ex : F32 = Probe.eye_x(eye)
  +ey : F32 = Probe.eye_y(eye)
  +ez : F32 = Probe.eye_z(eye)
  do IO<Unit>:
    Unit <- check(Bool.and(F32.is_ge(ex, 0.0), F32.is_lt(ex, limit_x)),
      "the spawned eye is outside the view region in x")
    Unit <- check(Bool.and(F32.is_ge(ey, 0.0), F32.is_lt(ey, height)),
      "the spawned eye is outside the view region in y")
    Unit <- check(Bool.and(F32.is_ge(ez, 0.0), F32.is_lt(ez, limit_z)),
      "the spawned eye is outside the view region in z")
    IO.print("spawn eye=" ++ F32.show(ex) ++ "," ++ F32.show(ey) ++ "," ++ F32.show(ez))

def eye_lands_inside_the_render_chunk() -> IO(Unit):
  +posed : Probe.Pose = Probe.pose(Probe.initial_player(), Probe.origin_x(),
    Probe.origin_z())
  +eye : Voxel.Vec = Probe.eye_of(posed)
  check_eye_inside(eye)

# ---------------------------------------------------------------------------
# The input stage
# ---------------------------------------------------------------------------

def input_folds_key_events() -> IO(Unit):
  +events : List<&2, Event> = [Key{119, True{}}, Key{100, True{}}]
  +folded : Probe.Keys = Probe.input(events)
  +held : U32 = keys_of(folded)
  do IO<Unit>:
    Unit <- check(U32.is_eq(held, 3), "holding w and d did not set the forward+strafe mask")
    IO.print("input: forward+right mask=" ++ U32.show(held))

def input_releases_keys() -> IO(Unit):
  +events : List<&2, Event> = [Key{119, True{}}, Key{119, False{}}]
  +folded : Probe.Keys = Probe.input(events)
  do IO<Unit>:
    check(U32.is_eq(keys_of(folded), 0), "releasing w left the key held")

def input_ignores_unmapped_codes() -> IO(Unit):
  +events : List<&2, Event> = [Key{4242, True{}}, Move{1, 2}]
  +folded : Probe.Keys = Probe.input(events)
  do IO<Unit>:
    check(U32.is_eq(keys_of(folded), 0), "an unmapped key code set a movement bit")

def check_look(+before: Probe.Pose, prepared: Player.State & U32) -> IO(Unit):
  (state, mask) = prepared
  +after : Probe.Pose = Probe.pose(state, 0n, 0n)
  +expected_yaw : F32 = F32.add(Probe.yaw_of(before),
    F32.mul(20.0, Probe.look_sensitivity()))
  +expected_pitch : F32 = F32.add(Probe.pitch_of(before),
    F32.mul(8.0, Probe.look_sensitivity()))
  do IO<Unit>:
    Unit <- check(F32.is_eq(Probe.yaw_of(after), expected_yaw),
      "two look events did not accumulate into yaw")
    Unit <- check(F32.is_eq(Probe.pitch_of(after), expected_pitch),
      "two look events did not accumulate into pitch")
    Unit <- check(U32.is_eq(mask, 0), "a look event set a movement key")
    check(F32.is_eq(Probe.eye_x(Probe.eye_of(after)),
      Probe.eye_x(Probe.eye_of(before))), "mouse look moved the player's position")

def input_accumulates_look() -> IO(Unit):
  +events : List<&2, Event> = [Look{10.0, 4.0}, Look{10.0, 4.0}]
  +before : Probe.Pose = Probe.pose(Probe.initial_player(), 0n, 0n)
  ready : Player.State & U32 = Probe.ready(Probe.initial_player(), events)
  check_look(before, ready)

# ---------------------------------------------------------------------------
# The cached world
# ---------------------------------------------------------------------------

def report_shape(+width: Nat, +depth: Nat, +chunks: Nat, +cells: Nat) -> IO(Unit):
  do IO<Unit>:
    Unit <- check(Nat.is_gt(chunks, 1n), "the benchmark region is not multi-chunk")
    Unit <- check(Nat.is_eq(width, 32n), "the region width is not two chunks")
    Unit <- check(Nat.is_eq(depth, 32n), "the region depth is not two chunks")
    IO.print("region chunks=" ++ Nat.show(chunks) ++ " width=" ++ Nat.show(width)
      ++ " depth=" ++ Nat.show(depth) ++ " cells=" ++ Nat.show(cells))

def report_region(shape: Nat & Nat) -> IO(Unit):
  (width, depth) = shape
  +chunks : Nat = Nat.mul(Probe.columns(), Probe.rows())
  +cells : Nat = PlayerProbe.region_cells(Probe.columns(), Probe.rows())
  report_shape(width, depth, chunks, cells)

def region_is_multi_chunk() -> IO(Unit):
  do IO<Unit>:
    +region : PlayerProbe.Region <- region_of(Probe.region())
    shape : Nat & Nat = region_shape(region)
    report_region(shape)

# The player tick has to run against that cached region: the spawn must settle on
# terrain inside it and stay there, or no frame is ever idle and the dirty case
# cannot be measured at all.
def report_settled(settled: Player.State) -> IO(Unit):
  Player.State{+x, +y, +z, +yaw, +pitch, +velocity_y, +grounded, +health, +hunger,
    +air, +fall, +poison} = settled
  do IO<Unit>:
    Unit <- check(F32.is_gt(y, 0.0), "the settled player fell out of the world")
    Unit <- check(grounded, "the settled player never landed, so no frame is idle")
    IO.print("settled at " ++ F32.show(x) ++ "," ++ F32.show(y) ++ "," ++ F32.show(z)
      ++ " grounded=" ++ Bool.show(grounded))

def player_tick_settles_on_the_region() -> IO(Unit):
  do IO<Unit>:
    +region : PlayerProbe.Region <- region_of(Probe.region())
    +settled : Player.State = settle(settle_ticks(), Probe.initial_player(), region)
    report_settled(settled)

# ---------------------------------------------------------------------------
# The frame
# ---------------------------------------------------------------------------

# The render seam and the voxel probe's own chunk-level entry point must agree, or
# "bootstrap once" and "rebuild per frame" would be two different programs. The
# frame must also differ from the `sky` control, or the render stage is not reading
# the grid at all and every number this probe reports would be the sky cost.
def check_seam(+region: PlayerProbe.Region, +grid: Voxel.VoxelGrid,
  +settled: Player.State) -> IO(Unit):
  +frame : Probe.Frame = frame_of(settled, [], region, grid, 0, True{})
  +posed : Probe.Pose = frame_pose(frame)
  +camera : Voxel.Camera = Probe.camera_of(posed)
  +seam : U32 = Probe.fingerprint(Probe.render(grid, camera, render_depth()))
  +voxel : U32 = Probe.fingerprint(Probe.render_chunk(Probe.chunk(), posed,
    render_depth()))
  +sky : U32 = Probe.fingerprint(Probe.render_sky(camera, render_depth()))
  +center : U32 = Voxel.pixel_color_for(grid, camera, 16, 16, 16.0, 24.0)
  +sky_center : U32 = Voxel.sky_color(16)
  do IO<Unit>:
    IO.print("seam_digest=" ++ U32.show(seam) ++ " render_chunk_digest="
      ++ U32.show(voxel) ++ " sky_digest=" ++ U32.show(sky)
      ++ " center=" ++ U32.show(center) ++ " sky_center=" ++ U32.show(sky_center))
    Unit <- check(U32.is_eq(seam, voxel),
      "the render seam does not match the voxel probe's render_size_at")
    Unit <- check(U32.is_ne(seam, sky),
      "the frame at the settled spawn equals the sky control, so it renders no terrain")
    check(U32.is_ne(center, sky_center),
      "the centre pixel of the settled frame is sky, so the render reads no blocks")

def seam_matches_render_size_at() -> IO(Unit):
  do IO<Unit>:
    +region : PlayerProbe.Region <- region_of(Probe.region())
    +grid : Voxel.VoxelGrid = Probe.grid()
    +settled : Player.State = settle(settle_ticks(), Probe.initial_player(), region)
    check_seam(region, grid, settled)

# The dirty path: once the player is at rest, consecutive idle frames must skip the
# render and carry the previous digest forward unchanged.
def report_idle(+first: Probe.Frame, +second: Probe.Frame,
  +third: Probe.Frame) -> IO(Unit):
  +d1 : U32 = frame_digest(first)
  +d2 : U32 = frame_digest(second)
  +d3 : U32 = frame_digest(third)
  +r1 : Bool = frame_rendered(first)
  +r2 : Bool = frame_rendered(second)
  do IO<Unit>:
    Unit <- check(r1, "the forced first frame did not render")
    Unit <- check(Bool.not(r2), "the second settled idle frame rendered instead of skipping")
    Unit <- check(U32.is_eq(d1, d2),
      "a skipped frame changed the fingerprint it carried forward")
    Unit <- check(U32.is_eq(d2, d3), "the third idle frame changed the carried fingerprint")
    IO.print("forced frame rendered once, then two idle frames carried "
      ++ U32.show(d3) ++ " without rendering")

def idle_frames_skip_the_render() -> IO(Unit):
  do IO<Unit>:
    +region : PlayerProbe.Region <- region_of(Probe.region())
    +grid : Voxel.VoxelGrid = Probe.grid()
    +settled : Player.State = settle(settle_ticks(), Probe.initial_player(), region)
    +first : Probe.Frame = frame_of(settled, [], region, grid, 0, True{})
    +d1 : U32 = frame_digest(first)
    +second : Probe.Frame = frame_of(frame_player(first), [], region, grid, d1, False{})
    +d2 : U32 = frame_digest(second)
    +third : Probe.Frame = frame_of(frame_player(second), [], region, grid, d2, False{})
    report_idle(first, second, third)

# The rebuild path has to skip on the same condition, so the two frame paths stay
# comparable.
def report_rebuild(+first: Probe.Frame, +second: Probe.Frame) -> IO(Unit):
  +d1 : U32 = frame_digest(first)
  +d2 : U32 = frame_digest(second)
  +r1 : Bool = frame_rendered(first)
  +r2 : Bool = frame_rendered(second)
  do IO<Unit>:
    Unit <- check(r1, "the forced first rebuild frame did not render")
    Unit <- check(Bool.not(r2), "the rebuild path rendered a second idle frame")
    check(U32.is_eq(d1, d2), "the rebuild path changed the carried fingerprint")

def rebuild_skips_the_same_way() -> IO(Unit):
  do IO<Unit>:
    +region : PlayerProbe.Region <- region_of(Probe.region())
    +settled : Player.State = settle(settle_ticks(), Probe.initial_player(), region)
    +first : Probe.Frame = rebuild_of(settled, [], region, 0, True{})
    +d1 : U32 = frame_digest(first)
    +second : Probe.Frame = rebuild_of(frame_player(first), [], region, d1, False{})
    report_rebuild(first, second)

# Holding a movement key has to move the player and dirty the frame, or the dirty
# test would be true for the wrong reason.
def report_walk(+before: Probe.Pose, +after: Probe.Pose, +rendered: Bool) -> IO(Unit):
  +moved : Bool = Probe.pose_changed(before, after)
  +x0 : F32 = Probe.eye_x(Probe.eye_of(before))
  +x1 : F32 = Probe.eye_x(Probe.eye_of(after))
  +y0 : F32 = Probe.eye_y(Probe.eye_of(before))
  +y1 : F32 = Probe.eye_y(Probe.eye_of(after))
  +z0 : F32 = Probe.eye_z(Probe.eye_of(before))
  +z1 : F32 = Probe.eye_z(Probe.eye_of(after))
  do IO<Unit>:
    Unit <- check(moved, "holding forward for one tick did not move the camera")
    Unit <- check(rendered, "a moved player did not dirty the frame")
    IO.print("walked eye " ++ F32.show(x0) ++ "," ++ F32.show(y0) ++ "," ++ F32.show(z0)
      ++ " to " ++ F32.show(x1) ++ "," ++ F32.show(y1) ++ "," ++ F32.show(z1))

def held_input_dirties_the_frame() -> IO(Unit):
  do IO<Unit>:
    +region : PlayerProbe.Region <- region_of(Probe.region())
    +grid : Voxel.VoxelGrid = Probe.grid()
    +settled : Player.State = settle(settle_ticks(), Probe.initial_player(), region)
    +events : List<&2, Event> = [Key{119, True{}}]
    +idle : Probe.Frame = frame_of(settled, [], region, grid, 0, False{})
    +walking : Probe.Frame = frame_of(frame_player(idle), events, region, grid,
      frame_digest(idle), False{})
    report_walk(frame_pose(idle), frame_pose(walking), frame_rendered(walking))

def main() -> IO(Unit):
  do IO<Unit>:
    same_pose_is_clean()
    moved_eye_is_dirty()
    turned_camera_is_dirty()
    survival_change_is_clean()
    eye_is_the_player_plus_eye_height()
    eye_lands_inside_the_render_chunk()
    input_folds_key_events()
    input_releases_keys()
    input_ignores_unmapped_codes()
    input_accumulates_look()
    region_is_multi_chunk()
    player_tick_settles_on_the_region()
    seam_matches_render_size_at()
    idle_frames_skip_the_render()
    rebuild_skips_the_same_way()
    held_input_dirties_the_frame()
    IO.print("frame-probe-test=pass")

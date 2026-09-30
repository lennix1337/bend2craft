import Base
import ../../world/player.bend as Player
import ../../world/world_state.bend as WorldState
import ../player-probe/player_probe.bend as PlayerProbe
import ../face-probe/face_probe.bend as Face
import ../voxel-probe/voxel_probe.bend as Voxel
import ../frame-probe/frame_probe.bend as Frame
import ../client.bend as Client

# ---------------------------------------------------------------------------
# The client's own frame cost
#
# One frame is what native/client.bend's loop does between two `Window.frame`
# calls: the input fold, the player transition, the bulk `WorldState.chunk`, the
# face render at the client's own tile edge and window size, and the release of
# the image. This file owns the clock and nothing else: every stage calls the
# client's or a probe's own def, so a phase can only be as wrong as the rule it
# calls. `native/frame-probe` already measures input, tick and render separately
# against the raycast renderer; what is added here is the tick and the face
# render together, at the size and tile edge the client actually ships.
#
# Every timed phase folds its output into a hash and prints it inside the timed
# region, so no phase can be dropped as dead code.
# ---------------------------------------------------------------------------

def fold_hash(+hash: U32, +value: U32) -> U32:
  U32.mul(U32.xor(hash, value), 16777619)

def require(ok: Bool, message: String) -> IO(Unit):
  match ok:
    case True{}:
      IO.pure(Unit, Unit{})
    case False{}:
      IO.die(Unit, 1, "client-bench: " ++ message)

# The size is passed in rather than read from the client, because a phase can render
# at a depth other than the client's own and a line claiming the client's size for a
# 64x64 render would be a lie in the middle of a table.
def size_at(depth: Nat) -> U32:
  U32.shln(1, depth)

def phase_line(name: String, +size: U32, +iterations: Nat, started: Nat,
  finished: Nat, +digest: U32) -> String:
  "phase=" ++ name ++ " size=" ++ U32.show(size)
    ++ " iterations=" ++ Nat.show(iterations)
    ++ " elapsed_ms=" ++ Nat.show(Nat.sub(finished, started))
    ++ " digest=" ++ U32.show(digest)

# ---------------------------------------------------------------------------
# The state the phases share
#
# `Client` is `Data`, so the state is rebuilt per repetition rather than reused: the
# real loop hands each frame a fresh one, and a phase that threaded one state
# through every stage would be measuring a value the loop never reuses.
# ---------------------------------------------------------------------------

def region_of(value: Maybe<&1, PlayerProbe.Region>) -> IO(PlayerProbe.Region):
  match value:
    case Some{region}:
      IO.pure(PlayerProbe.Region, region)
    case None{}:
      IO.die(PlayerProbe.Region, 1, "the benchmark region was refused")

def player_of(value: Maybe<&1, Player.State>) -> IO(Player.State):
  match value:
    case Some{player}:
      IO.pure(Player.State, player)
    case None{}:
      IO.die(Player.State, 1, "the benchmark spawn was refused")

# The same state the client builds on start: the frame probe's seed and spawn, an
# empty edit log and the 2x2 collision region.
def spawn_pose(player: Player.State) -> Frame.Pose:
  Frame.pose(player, Frame.origin_x(), Frame.origin_z())

def posed(+player: Player.State, region: PlayerProbe.Region) -> Client.Client:
  Client.Client{player, spawn_pose(player), 0,
    WorldState.empty(), region, Client.path()}

def spawn_state(region: PlayerProbe.Region) -> IO(Client.Client):
  do IO<Client.Client>:
    player : Player.State <- player_of(PlayerProbe.checked_create_player(25n, 25n, 9n))
    IO.pure(Client.Client, posed(player, region))

def benchmark_region() -> IO(PlayerProbe.Region):
  region_of(PlayerProbe.checked_from_world_state(Frame.seed(), Frame.chunk_x(),
    Frame.chunk_z(), Frame.columns(), Frame.rows(), WorldState.empty()))

# ---------------------------------------------------------------------------
# Phases
# ---------------------------------------------------------------------------

# The clock on its own, because at a tenth of a millisecond a stage the clock's
# millisecond resolution is part of the answer.
def clock.go(remaining: Nat, +total: U32, +hash: U32) -> IO(U32):
  match remaining:
    case 0n:
      IO.pure(U32, total)
    case 1n+p:
      do IO<U32>:
        +started : Nat <- IO.now()
        consumed : Unit <- IO.print("consume=clock:" ++ U32.show(hash))
        finished : Nat <- IO.now()
        clock.go(p, U32.add(total, U32.from_nat(Nat.sub(finished, started))),
          U32.add(hash, 1))

def pose_of(state: Client.Client) -> Frame.Pose:
  Client.Client{player, +pose, keys, edits, region, path} = state
  pose

def eye_z_of(state: Client.Client) -> F32:
  Frame.eye_z(Frame.eye_of(pose_of(state)))

# The client's own tick, so the input fold, the edge decisions and the player
# transition are the ones the client runs. The step and its fold come before the
# fold that calls them, because a def must be written before anything that calls it.
def tick_fold(next: Client.Client, +hash: U32) -> U32:
  +z = F32.abs(eye_z_of(next))
  fold_hash(hash, F32.to_u32(z))

# The tick takes a `List<&1, Event>`, which is linear, so the fold cannot carry one
# across iterations; it carries the two `Event` values instead, which are `Data`, and
# builds the list per iteration. That list is the shape the runtime hands the client,
# so the fold being timed is the client's own.
#
# The tick answers with `Nothing` to leave, which is how `App.loop` ends, so a tick that
# keeps running has to be unwrapped here. The unwrap is a `match`, not a clamp: a tick
# that quit mid-benchmark is a different program than the one that ships, and the
# benchmark would quietly go on timing the wrong thing.
def client_or_die(maybe: Maybe<&1, Client.Client>) -> IO(Client.Client):
  match maybe:
    case Some{state}:
      IO.pure(Client.Client, state)
    case None{}:
      IO.die(Client.Client, 1, "frame-bench: the client stopped during a tick it should have kept running")

def tick_step(region: PlayerProbe.Region, +first: Event, +second: Event, +hash: U32) -> IO(U32):
  do IO<U32>:
    state : Client.Client <- spawn_state(region)
    answer : Maybe<&1, Client.Client> <- Client.tick.events([first, second], state)
    +next : Client.Client <- client_or_die(answer)
    IO.pure(U32, tick_fold(next, hash))

def tick.go(remaining: Nat, +region: PlayerProbe.Region, +first: Event, +second: Event,
  +hash: U32) -> IO(U32):
  match remaining:
    case 0n:
      IO.pure(U32, hash)
    case 1n+p:
      do IO<U32>:
        +next : U32 <- tick_step(region, first, second, hash)
        tick.go(p, region, first, second, next)

# The bulk world build on its own. The client materialises the whole view region on
# every frame, and the browser-path constitution says a client builds its world once and
# then only renders it, so this phase is what a cached region would save. It is timed
# separately because the two costs have different fixes.

# The client's per-frame world cost: the whole view region, not one chunk. The phase
# used to build a single chunk, which understated the client's own work by the region
# factor the moment the client rendered more than one. `List.length` is the observer
# because it traverses the list the client just built, so the generation cannot be
# elided; folding the cell values would double-count, since reading them is the
# renderer's cost and is measured by the render phases.
def region_cells(chunks: List<&2, List<&2, U32>>) -> U32:
  match chunks:
    case Nil{}:
      0
    case +cells <> rest:
      U32.add(U32.from_nat(List.length(&2, U32, cells)), region_cells(rest))

def chunk_step(+edits: List<&2, WorldState.Edit>, +hash: U32) -> U32:
  fold_hash(hash, region_cells(Client.region_chunks(Frame.seed(), edits)))

def chunk.go(remaining: Nat, +edits: List<&2, WorldState.Edit>, +hash: U32) -> IO(U32):
  match remaining:
    case 0n:
      IO.pure(U32, hash)
    case 1n+p:
      chunk.go(p, edits, chunk_step(edits, hash))

# The client's own frame, called rather than restated. The bench used to inline
# `Face.render_size_at_with_tile_size` over a single chunk, which stopped being what the
# client does the moment the client rendered a region, and a benchmark that measures a
# different program than the one that ships is worse than no benchmark.
def render_with(+edits: List<&2, WorldState.Edit>, +pose: Frame.Pose) -> Image:
  Client.image_of(edits, pose)

# The image is read back before it is released, because a build whose result nothing
# observes is elidable and a phase that measured an elided build would report the cost
# of nothing. The read is a full quadtree walk, and the client pays it too:
# `Window.frame` calls `window_show`, which walks the same tree with `window_fill` into
# the X pixmap before `XPutImage`. So the fingerprint is a fair stand-in for the
# present step, and the only thing it leaves out is the X transfer.
def render_step(+edits: List<&2, WorldState.Edit>, +pose: Frame.Pose, +hash: U32) -> U32:
  +image = render_with(edits, pose)
  +digest : U32 = Voxel.fingerprint(image)
  released : Unit = Image.drop(image)
  fold_hash(hash, digest)

def render.go(remaining: Nat, +region: PlayerProbe.Region, +edits: List<&2, WorldState.Edit>,
  +pose: Frame.Pose, +hash: U32) -> IO(U32):
  match remaining:
    case 0n:
      IO.pure(U32, hash)
    case 1n+p:
      render.go(p, region, edits, pose, render_step(edits, pose, hash))

# Face extraction on its own: the world cells turned into the exposed-face list, with
# the list observed so the walk cannot be elided. This is the phase that says where
# the render's fixed cost lives, and it is resolution-independent, so anything it
# reports is cost the client pays at every window size including the smallest.
def extract_with(+edits: List<&2, WorldState.Edit>) -> List<&2, Face.Face>:
  Face.faces_from_chunk(WorldState.chunk(Frame.seed(), Frame.chunk_x(),
    Frame.chunk_z(), edits))

def face_total(faces: List<&2, Face.Face>) -> U32:
  match faces:
    case Nil{}:
      0
    case +face <> rest:
      U32.add(1, face_total(rest))

def extract_step(+edits: List<&2, WorldState.Edit>, +hash: U32) -> U32:
  fold_hash(hash, face_total(extract_with(edits)))

def extract.go(remaining: Nat, +edits: List<&2, WorldState.Edit>, +hash: U32) -> IO(U32):
  match remaining:
    case 0n:
      IO.pure(U32, hash)
    case 1n+p:
      extract.go(p, edits, extract_step(edits, hash))

def extract_phase(+iterations: Nat, +edits: List<&2, WorldState.Edit>) -> IO(Unit):
  do IO<Unit>:
    started : Nat <- IO.now()
    +digest : U32 <- extract.go(iterations, edits, 2166136261)
    consumed : Unit <- IO.print("consume=extract:" ++ U32.show(digest))
    finished : Nat <- IO.now()
    IO.print(phase_line("extract", Client.window_width(), iterations, started, finished, digest))

# The render at a smaller window, at the same camera and tile edge, so the size the
# client can actually hold at 60 Hz is measured rather than extrapolated from the
# pixel count. The pose is the client's own spawn pose in every case; only the frame
# depth changes.
def render_at_with(+edits: List<&2, WorldState.Edit>, +pose: Frame.Pose, depth: Nat) -> Image:
  Client.image_at_depth(edits, pose, depth)

def render_at_step(+edits: List<&2, WorldState.Edit>, +pose: Frame.Pose, depth: Nat,
  +hash: U32) -> U32:
  +image = render_at_with(edits, pose, depth)
  +digest : U32 = Voxel.fingerprint(image)
  released : Unit = Image.drop(image)
  fold_hash(hash, digest)

def render_at.go(remaining: Nat, +edits: List<&2, WorldState.Edit>, +pose: Frame.Pose,
  +depth: Nat, +hash: U32) -> IO(U32):
  match remaining:
    case 0n:
      IO.pure(U32, hash)
    case 1n+p:
      do IO<U32>:
        +next : U32 <- IO.pure(U32, render_at_step(edits, pose, depth, hash))
        render_at.go(p, edits, pose, depth, next)

def render_at_phase(+label: String, +iterations: Nat, +region: PlayerProbe.Region,
  +edits: List<&2, WorldState.Edit>, +pose: Frame.Pose, +depth: Nat) -> IO(Unit):
  do IO<Unit>:
    started : Nat <- IO.now()
    +digest : U32 <- render_at.go(iterations, edits, pose, depth, 2166136261)
    consumed : Unit <- IO.print("consume=" ++ label ++ ":" ++ U32.show(digest))
    finished : Nat <- IO.now()
    IO.print(phase_line(label, size_at(depth), iterations, started, finished, digest))

# The whole frame: the tick, then the render, in the order the loop runs them. This
# is the number the 16.7 ms budget is judged on.
def frame_fold(next: Client.Client, +edits: List<&2, WorldState.Edit>,
  +pose: Frame.Pose, +hash: U32) -> U32:
  +z = F32.abs(eye_z_of(next))
  +image = render_with(edits, pose)
  +digest : U32 = Voxel.fingerprint(image)
  released : Unit = Image.drop(image)
  fold_hash(fold_hash(hash, F32.to_u32(z)), digest)

def frame_step(region: PlayerProbe.Region, +first: Event, +second: Event,
  +edits: List<&2, WorldState.Edit>, +pose: Frame.Pose, +hash: U32) -> IO(U32):
  do IO<U32>:
    state : Client.Client <- spawn_state(region)
    answer : Maybe<&1, Client.Client> <- Client.tick.events([first, second], state)
    +next : Client.Client <- client_or_die(answer)
    IO.pure(U32, frame_fold(next, edits, pose, hash))

def frame.go(remaining: Nat, +region: PlayerProbe.Region, +first: Event, +second: Event,
  +edits: List<&2, WorldState.Edit>, +pose: Frame.Pose, +hash: U32) -> IO(U32):
  match remaining:
    case 0n:
      IO.pure(U32, hash)
    case 1n+p:
      do IO<U32>:
        +next : U32 <- frame_step(region, first, second, edits, pose, hash)
        frame.go(p, region, first, second, edits, pose, next)

# ---------------------------------------------------------------------------
# Phases
# ---------------------------------------------------------------------------

def clock_phase(+iterations: Nat) -> IO(Unit):
  do IO<Unit>:
    started : Nat <- IO.now()
    +total : U32 <- clock.go(iterations, 0, 2166136261)
    consumed : Unit <- IO.print("consume=clock:" ++ U32.show(total))
    finished : Nat <- IO.now()
    IO.print(phase_line("clock", Client.window_width(), iterations, started, finished, total))

def tick_phase(+label: String, +iterations: Nat, +region: PlayerProbe.Region,
  +first: Event, +second: Event) -> IO(Unit):
  do IO<Unit>:
    started : Nat <- IO.now()
    +digest : U32 <- tick.go(iterations, region, first, second, 2166136261)
    consumed : Unit <- IO.print("consume=" ++ label ++ ":" ++ U32.show(digest))
    finished : Nat <- IO.now()
    IO.print(phase_line(label, Client.window_width(), iterations, started, finished, digest))

def chunk_phase(+iterations: Nat, +edits: List<&2, WorldState.Edit>) -> IO(Unit):
  do IO<Unit>:
    started : Nat <- IO.now()
    +digest : U32 <- chunk.go(iterations, edits, 2166136261)
    consumed : Unit <- IO.print("consume=region:" ++ U32.show(digest))
    finished : Nat <- IO.now()
    IO.print(phase_line("region", Client.window_width(), iterations, started, finished, digest))

def render_phase(+iterations: Nat, +region: PlayerProbe.Region,
  +edits: List<&2, WorldState.Edit>, +pose: Frame.Pose) -> IO(Unit):
  do IO<Unit>:
    started : Nat <- IO.now()
    +digest : U32 <- render.go(iterations, region, edits, pose, 2166136261)
    consumed : Unit <- IO.print("consume=render:" ++ U32.show(digest))
    finished : Nat <- IO.now()
    IO.print(phase_line("render", Client.window_width(), iterations, started, finished, digest))

def frame_phase(+label: String, +iterations: Nat, +region: PlayerProbe.Region,
  +first: Event, +second: Event, +edits: List<&2, WorldState.Edit>,
  +pose: Frame.Pose) -> IO(Unit):
  do IO<Unit>:
    started : Nat <- IO.now()
    +digest : U32 <- frame.go(iterations, region, first, second, edits, pose, 2166136261)
    consumed : Unit <- IO.print("consume=" ++ label ++ ":" ++ U32.show(digest))
    finished : Nat <- IO.now()
    IO.print(phase_line(label, Client.window_width(), iterations, started, finished, digest))

# The events a held movement key produces, and the events a look produces. Both are
# the client's real codes, in the shape the runtime hands the tick, so the client's
# own input fold is part of what the tick phase measures. A pair is a product and
# cannot be shared, so the two sets are passed on as four events.
#
# The action keys are deliberately not in a timed phase: dig and save both reach the
# filesystem, and a benchmark that writes the world twenty times measures the disk
# rather than the tick. The edit and save paths are covered by native/client_test.bend
# instead, and this file only times the two things a frame pays every tick.
type Events is Data:
  Events{first: Event, second: Event}

def held_events() -> Events:
  Events{Key{119, True{}}, Key{119, False{}}}

def look_events() -> Events:
  Events{Look{24.0, 0.0}, Key{Client.dig_code(), False{}}}

def first_of(events: Events) -> Event:
  Events{first, second} = events
  first

def second_of(events: Events) -> Event:
  Events{first, second} = events
  second

def run_events(+region: PlayerProbe.Region, +edits: List<&2, WorldState.Edit>,
  +pose: Frame.Pose, +held_first: Event, +held_second: Event, +action_first: Event,
  +action_second: Event) -> IO(Unit):
  do IO<Unit>:
    Unit <- clock_phase(7n)
    Unit <- tick_phase("tick_held", 200n, region, held_first, held_second)
    Unit <- tick_phase("tick_look", 200n, region, action_first, action_second)
    Unit <- chunk_phase(20n, edits)
    Unit <- extract_phase(40n, edits)
    Unit <- render_phase(20n, region, edits, pose)
    # The sizes the resolution question is actually about, measured at the client's own
    # camera and region rather than extrapolated from a pixel count. The depth is an
    # exponent, so the renderer is square and a power of two: 512 is the largest
    # expressible step below the next order of magnitude.
    Unit <- render_at_phase("render_512", 2n, region, edits, pose, 9n)
    Unit <- render_at_phase("render_256", 3n, region, edits, pose, 8n)
    Unit <- render_at_phase("render_128", 10n, region, edits, pose, 7n)
    Unit <- render_at_phase("render_64", 40n, region, edits, pose, 6n)
    Unit <- render_at_phase("render_32", 100n, region, edits, pose, 5n)
    Unit <- frame_phase("frame_held", 20n, region, held_first, held_second, edits, pose)
    Unit <- frame_phase("frame_look", 20n, region, action_first, action_second, edits, pose)
    IO.print("client-bench=pass size=" ++ U32.show(Client.window_width())
      ++ " tile=" ++ U32.show(Client.tile_edge())
      ++ " budget_ms=" ++ U32.show(U32.from_nat(Nat.div(1000n, 60n))))

def run_all(+region: PlayerProbe.Region, +edits: List<&2, WorldState.Edit>, +pose: Frame.Pose,
  +held: Events, +action: Events) -> IO(Unit):
  +held_first : Event = first_of(held)
  +held_second : Event = second_of(held)
  +action_first : Event = first_of(action)
  +action_second : Event = second_of(action)
  run_events(region, edits, pose, held_first, held_second, action_first, action_second)

def run_phases(region: PlayerProbe.Region, state: Client.Client) -> IO(Unit):
  +pose : Frame.Pose = pose_of(state)
  +edits : List<&2, WorldState.Edit> = WorldState.empty()
  +held : Events = held_events()
  +action : Events = look_events()
  run_all(region, edits, pose, held, action)

def main() -> IO(Unit):
  do IO<Unit>:
    +region : PlayerProbe.Region <- benchmark_region()
    state : Client.Client <- spawn_state(region)
    run_phases(region, state)

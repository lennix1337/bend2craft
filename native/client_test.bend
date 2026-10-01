import Base
import ../world/player.bend as Player
import ../world/world.bend as World
import ../world/world_state.bend as WorldState
import ./voxel.bend as Voxel
import ./player.bend as PlayerProbe
import ./frame.bend as Frame
import ./face.bend as Face
import ./save.bend as Migration
import ./client.bend as Client

# The client's own contracts, headless. Every game rule it leans on is already
# pinned by the probe it comes from (`Player.step`, `Player.raycast`, the region
# storage guard, the camera basis, the face renderer, the `B2CW:1` codec), so what
# is left here is the wiring the client itself owns: the fold between the player's
# encoded window and stored cells, the key edges, the raycast-to-edit path, the
# tick's decisions, the frame it hands the window, and a save that survives a
# restart.

def require(condition: Bool, message: String) -> IO(Unit):
  match condition:
    case True{}:
      IO.pure(Unit, Unit{})
    case False{}:
      IO.die(Unit, 1, "client: " ++ message)

# The last assertion of a check reads as the check's result rather than as a
# bound step, so both spellings exist and neither has to bind a value it ignores.
def check(condition: Bool, message: String) -> IO(Unit):
  require(condition, message)

# --- the coordinate fold -----------------------------------------------------

def cell_is(value: Maybe<&1, Nat>, expected: Nat) -> Bool:
  match value:
    case Some{cell}:
      Nat.is_eq(cell, expected)
    case None{}:
      False{}

def is_cell(value: Maybe<&1, Nat>, expected: Nat) -> Bool:
  cell_is(value, expected)

def is_refused(value: Maybe<&1, Nat>) -> Bool:
  Maybe.is_none(&1, Nat, value)

def verify_stored_cell() -> IO(Unit):
  do IO<Unit>:
    Unit <- require(is_cell(Client.stored_cell.of(32768n), 0n),
      "the encoded world origin did not decode to stored cell 0")
    Unit <- require(is_cell(Client.stored_cell.of(32784n), 16n),
      "an encoded cell did not decode to its stored cell")
    Unit <- require(is_cell(Client.stored_cell.of(32767n),
        Nat.sub(World.negative_origin(), 1n)),
      "an encoded cell below the window did not decode to a negative stored cell")
    Unit <- require(is_cell(Client.stored_cell.of(0n),
        Nat.sub(World.negative_origin(), 32768n)),
      "the low end of the encoded window did not decode to the far negative cell")
    Unit <- require(is_refused(Client.stored_cell.of(
        Nat.add(32768n, PlayerProbe.positive_cell_limit()))),
      "a cell past the storage limit was accepted")
    check(is_refused(Client.stored_cell.of(100000000n)),
      "a cell far outside the movement window was accepted")

# --- key edges ---------------------------------------------------------------

# A held key must dig once, not sixty times a second, so every action is an edge
# against the mask the previous tick ended with.
def verify_edges() -> IO(Unit):
  +dig = Client.bit_of(Client.dig_code())
  +place = Client.bit_of(Client.place_code())
  +escape = Client.bit_of(Client.escape_code())
  do IO<Unit>:
    Unit <- require(Client.wants_dig(0, dig), "a fresh dig press did not count as an edge")
    Unit <- require(Bool.not(Client.wants_dig(dig, dig)),
      "a held dig key repeated instead of firing once")
    Unit <- require(Client.wants_place(0, place), "a fresh place press did not count as an edge")
    Unit <- require(Bool.not(Client.wants_place(place, place)),
      "a held place key repeated instead of firing once")
    Unit <- require(Bool.not(Client.wants_dig(0, place)),
      "a place press was read as a dig press")
    check(Client.wants_quit(escape), "escape was not read as a quit key")

# --- the raycast-to-edit path ------------------------------------------------

# What the player's own raycast hit, still in the encoded window. The client is
# the only thing that can cross back to stored cells, so the test reads the aim
# through the client, exactly as the client does.
type Aim is Data:
  Aim{hit: Bool, hit_x: Nat, hit_y: Nat, hit_z: Nat, place_x: Nat, place_y: Nat,
    place_z: Nat, has_place: Bool}

type Cells is Type:
  Cells{hit_x: Maybe<&1, Nat>, hit_z: Maybe<&1, Nat>}

type Spot is Type:
  Spot{x: Maybe<&1, Nat>, y: Nat, z: Maybe<&1, Nat>}

type Spawned is Data:
  Spawned{edits: List<&2, WorldState.Edit>, region: PlayerProbe.Region}

def missed() -> Aim:
  Aim{False{}, 0n, 0n, 0n, 0n, 0n, 0n, False{}}

def landed(hit_x: Nat, hit_y: Nat, hit_z: Nat, place_x: Nat, place_y: Nat,
  place_z: Nat, has_place: Bool) -> Aim:
  Aim{True{}, hit_x, hit_y, hit_z, place_x, place_y, place_z, has_place}

def aim_of(result: Player.RayResult) -> Aim:
  match result:
    case Player.NoHit{}:
      missed()
    case Player.Hit{hit_x, hit_y, hit_z, place_x, place_y, place_z, has_place}:
      landed(hit_x, hit_y, hit_z, place_x, place_y, place_z, has_place)

def reached(aim: Aim) -> Bool:
  Aim{hit, hit_x, hit_y, hit_z, place_x, place_y, place_z, has_place} = aim
  hit

def hit_cells(hit: Bool, +x: Nat, +z: Nat) -> Cells:
  match hit:
    case True{}:
      Cells{Client.stored_cell.of(x), Client.stored_cell.of(z)}
    case False{}:
      Cells{None{}, None{}}

def hit_of(aim: Aim) -> Cells:
  Aim{hit, hit_x, hit_y, hit_z, _, _, _, _} = aim
  hit_cells(hit, hit_x, hit_z)

def place_spot(has_place: Bool, +x: Nat, +y: Nat, +z: Nat) -> Spot:
  match has_place:
    case True{}:
      Spot{Client.stored_cell.of(x), y, Client.stored_cell.of(z)}
    case False{}:
      Spot{None{}, y, None{}}

def place_of(aim: Aim) -> Spot:
  Aim{hit, hit_x, hit_y, hit_z, place_x, place_y, place_z, has_place} = aim
  place_spot(has_place, place_x, place_y, place_z)

def hit_height(aim: Aim) -> Nat:
  Aim{hit, hit_x, hit_y, hit_z, _, _, _, _} = aim
  hit_y

def read_at(edits: List<&2, WorldState.Edit>, mx: Maybe<&1, Nat>, y: Nat,
  mz: Maybe<&1, Nat>) -> U32:
  match mx mz:
    case Some{sx} Some{sz}:
      WorldState.block(edits, Frame.seed(), sx, y, sz)
    case _ _:
      0

def read_hit(edits: List<&2, WorldState.Edit>, cells: Cells, y: Nat) -> U32:
  Cells{hit_x, hit_z} = cells
  read_at(edits, hit_x, y, hit_z)

def read_spot(edits: List<&2, WorldState.Edit>, spot: Spot) -> U32:
  Spot{x, y, z} = spot
  read_at(edits, x, y, z)

# A dig has to empty the cell the player is looking at, and that cell has to have
# been solid: a dig that hit sky would otherwise pass a "the cell is empty now"
# check.
def dug_solid(+after: List<&2, WorldState.Edit>, +aim: Aim,
  +before: List<&2, WorldState.Edit>) -> Bool:
  was = read_hit(before, hit_of(aim), hit_height(aim))
  now = read_hit(after, hit_of(aim), hit_height(aim))
  Bool.and(U32.is_eq(now, 0), Bool.not(U32.is_eq(was, 0)))

def built_above(+after: List<&2, WorldState.Edit>, +aim: Aim,
  +before: List<&2, WorldState.Edit>) -> Bool:
  now = read_spot(after, place_of(aim))
  Bool.and(dug_solid(after, aim, before), U32.is_eq(now, 2))

# The client's spawn pose, pitched down so the ray lands on the ground under the
# player. `Player.direction` points up for a positive pitch, so looking down is
# negative.
def spawn_pose() -> Frame.Pose:
  Frame.Pose{Voxel.Vec{9.5, 10.62, 9.5}, 0.0, F32.neg(1.0)}

def region_of(maybe: Maybe<&1, PlayerProbe.Region>) -> IO(PlayerProbe.Region):
  match maybe:
    case Some{region}:
      IO.pure(PlayerProbe.Region, region)
    case None{}:
      IO.die(PlayerProbe.Region, 1, "the spawn region was refused")

def spawned(edits: List<&2, WorldState.Edit>, region: PlayerProbe.Region) -> Spawned:
  Spawned{edits, region}

def spawn_world() -> IO(Spawned):
  do IO<Spawned>:
    +edits : List<&2, WorldState.Edit> <- IO.pure(List<&2, WorldState.Edit>, WorldState.empty())
    region : PlayerProbe.Region <- region_of(PlayerProbe.checked_from_world_state(
      Frame.seed(), Frame.chunk_x(), Frame.chunk_z(), Frame.columns(), Frame.rows(), edits))
    IO.pure(Spawned, spawned(edits, region))

def aimed_at(region: PlayerProbe.Region) -> Aim:
  aim_of(Client.aimed(spawn_pose(), region))

def check_targeting(spawned: Spawned) -> IO(Unit):
  Spawned{+edits, +region} = spawned
  +aim : Aim = aimed_at(region)
  dug = Client.edited(edits, spawn_pose(), region, True{}, False{})
  built = Client.edited(edits, spawn_pose(), region, False{}, True{})
  do IO<Unit>:
    Unit <- require(reached(aim), "the spawn pose did not reach the ground")
    Unit <- require(dug_solid(dug, aim, edits),
      "digging did not empty the cell the player is looking at")
    check(built_above(built, aim, edits),
      "building did not empty the hit cell and put stone in the cell behind it")

def verify_targeting() -> IO(Unit):
  do IO<Unit>:
    spawned : Spawned <- spawn_world()
    check_targeting(spawned)

# --- the tick ----------------------------------------------------------------

type Peek is Data:
  Peek{eye_z: F32, edits: List<&2, WorldState.Edit>}

# The tick answers with `Nothing` to leave, which is how `App.loop` ends, so the tally
# holds one answer per case. A `Maybe` of a client is linear, so the record is linear
# too and each field is read exactly once.
type Tally is Type:
  Tally{before: Peek, after: Peek, released: Maybe<&1, Client.Client>,
    escaped: Maybe<&1, Client.Client>, closed: Maybe<&1, Client.Client>}

type Two is Data:
  Two{first: U32, second: U32}

# The client's entry point now takes the size the selector chose. The tests below
# are about the tick, the frame, the dig and the save rather than about the
# selector, so they all start at the shipped size and the selector has its own
# section. Going through one helper is what keeps that choice in one place: five
# call sites spelling `128` would be five places to change when the default moves.
def started() -> IO(Client.Client):
  Client.start(Client.size_of_width((128 : U32)))

def peek(state: Client.Client) -> Peek:
  Client.Client{player, +pose, keys, +edits, region, path, world, size} = state
  Peek{Frame.eye_z(Frame.eye_of(pose)), edits}

def eye_z_of(peeked: Peek) -> F32:
  Peek{eye_z, edits} = peeked
  eye_z

def edits_of(+peeked: Peek) -> List<&2, WorldState.Edit>:
  Peek{eye_z, edits} = peeked
  edits

def aim_of_state(+state: Client.Client) -> Aim:
  Client.Client{player, +pose, keys, edits, +region, path, world, size} = state
  aim_of(Client.aimed(pose, region))

# The tick's own answer, read through the same question the loop asks, so the test and
# the loop cannot disagree about when the client stops.
def still_open(maybe: Maybe<&1, Client.Client>) -> Bool:
  Bool.not(Maybe.is_none(&1, Client.Client, maybe))

def client_or_die(maybe: Maybe<&1, Client.Client>) -> IO(Client.Client):
  match maybe:
    case Some{state}:
      IO.pure(Client.Client, state)
    case None{}:
      IO.die(Client.Client, 1, "the tick closed the client unexpectedly")

# A `Maybe` of a client is linear, so it can only be unwrapped once. These unwraps are
# also the assertions: a tick that quit instead of acting fails here rather than
# quietly writing nothing.
def dug_or_die(maybe: Maybe<&1, Client.Client>) -> IO(Client.Client):
  match maybe:
    case Some{state}:
      IO.pure(Client.Client, state)
    case None{}:
      IO.die(Client.Client, 1, "the dig tick closed the client")

def saved_or_die(maybe: Maybe<&1, Client.Client>) -> IO(Client.Client):
  match maybe:
    case Some{state}:
      IO.pure(Client.Client, state)
    case None{}:
      IO.die(Client.Client, 1, "the save tick closed the client")

def require_closed(going: Bool) -> IO(Unit):
  match going:
    case True{}:
      IO.die(Unit, 1, "the tick kept the client running")
    case False{}:
      IO.pure(Unit, Unit{})

def expect_closed(maybe: Maybe<&1, Client.Client>) -> IO(Unit):
  require_closed(still_open(maybe))

def image_of(pair: Client.Client & Image) -> U32:
  (state, image) = pair
  Voxel.fingerprint(image)

def frame_of(state: Client.Client) -> U32:
  drawn = Client.view(state)
  image_of(drawn)

def two(first: U32, second: U32) -> Two:
  Two{first, second}

# One state has to render the same frame every time, which is the seam the
# window's per-frame `App.run` loop depends on.
def two_frames() -> IO(Two):
  do IO<Two>:
    +state : Client.Client <- started()
    first : U32 <- IO.pure(U32, frame_of(state))
    second : U32 <- IO.pure(U32, frame_of(state))
    IO.pure(Two, two(first, second))

def same_frame(frames: Two) -> IO(Unit):
  Two{first, second} = frames
  check(U32.is_eq(first, second),
    "the client rendered two different frames for one state")

def verify_frame() -> IO(Unit):
  do IO<Unit>:
    frames : Two <- two_frames()
    same_frame(frames)

# W walks toward the yaw 0 heading, which `Player.direction` puts at -z. Escape and
# the window manager's own close both end the loop, because the app stops when the
# tick hands back nothing.
# W walks toward the yaw 0 heading, which `Player.direction` puts at -z. Escape and
# the window manager's own close both end the loop.
def tally(before: Peek, after: Peek, released: Maybe<&1, Client.Client>,
  escaped: Maybe<&1, Client.Client>, closed: Maybe<&1, Client.Client>) -> Tally:
  Tally{before, after, released, escaped, closed}

def walk_ticks() -> IO(Tally):
  do IO<Tally>:
    +state : Client.Client <- started()
    walked : Maybe<&1, Client.Client> <- Client.tick.events([Key{119, True{}}], state)
    walked_state : Client.Client <- client_or_die(walked)
    released : Maybe<&1, Client.Client> <- Client.tick.events([Key{119, False{}}], state)
    escaped : Maybe<&1, Client.Client> <- Client.tick.events([Key{27, True{}}], state)
    closed : Maybe<&1, Client.Client> <- Client.tick.events([Close{}], state)
    IO.pure(Tally, tally(peek(state), peek(walked_state), released, escaped, closed))

def check_tick(tally_value: Tally) -> IO(Unit):
  Tally{before, after, released, escaped, closed} = tally_value
  do IO<Unit>:
    Unit <- require(F32.is_lt(eye_z_of(after), eye_z_of(before)),
      "W did not move the player toward the yaw 0 heading")
    Unit <- require(still_open(released),
      "the tick closed the client while it was still open")
    Unit <- expect_closed(escaped)
    expect_closed(closed)

def verify_tick() -> IO(Unit):
  do IO<Unit>:
    walked : Tally <- walk_ticks()
    check_tick(walked)

# --- persistence -------------------------------------------------------------

type Saved is Data:
  Saved{aim: Aim, before: Peek, kept: Peek}

def saved(aim: Aim, before: Peek, kept: Peek) -> Saved:
  Saved{aim, before, kept}

# Looking down before digging, because the raycast reaches 8.05 cells and the spawn
# pose's own pitch of -0.18 puts flat ground about 9.3 cells away, just out of reach.
# The old spawn sat inside a village, so a wall happened to be within reach and the
# save test passed by accident; at the world's own spawn cell there is nothing to hit
# until the player looks down, which is what a player does anyway.
def looked_down(state: Client.Client) -> IO(Client.Client):
  do IO<Client.Client>:
    looked : Maybe<&1, Client.Client> <- Client.tick.events(
      [Look{0.0, F32.neg(40.0)}], state)
    client_or_die(looked)

# One dig and one save, in that order, so the file has to carry the dig. A tick that
# stopped the client early fails here rather than quietly writing nothing. The aim is
# read from the state that has already looked down, so the cell the dig names and the
# cell the assertions check are the same one.
def dig_then_save(+state: Client.Client, +aim: Aim) -> IO(Saved):
  do IO<Saved>:
    dug : Maybe<&1, Client.Client> <- Client.tick.events(
      [Key{Client.dig_code(), True{}}], state)
    dug_state : Client.Client <- dug_or_die(dug)
    written : Maybe<&1, Client.Client> <- Client.tick.events(
      [Key{Client.save_code(), True{}}], dug_state)
    written_state : Client.Client <- saved_or_die(written)
    IO.pure(Saved, saved(aim, peek(state), peek(written_state)))

# The client starts on whatever its save file holds, so the test writes an empty
# snapshot first. Without this the second run of the test would start on the world
# the first run dug, and the dig below would have nothing solid left to remove.
def empty_world() -> IO(Unit):
  Client.save_text.at(Client.path(),
    Migration.encode(Migration.Snapshot{Frame.seed(), WorldState.empty()}))

# A save that survives a restart: the file the client wrote decodes back to the
# same edits, and a fresh client starts on the world that was dug rather than on a
# new one.
def check_save(saved_value: Saved) -> IO(Unit):
  Saved{+aim, +before, +kept} = saved_value
  do IO<Unit>:
    text : String <- Client.load_text.at(Client.path())
    reloaded : List<&2, WorldState.Edit> <- IO.pure(List<&2, WorldState.Edit>,
      Client.edits_from(text))
    restarted : Client.Client <- started()
    Unit <- require(dug_solid(edits_of(kept), aim, edits_of(before)),
      "the saved world did not carry the dug cell")
    Unit <- require(dug_solid(reloaded, aim, edits_of(before)),
      "the saved file did not decode back to the dug cell")
    check(dug_solid(edits_of(peek(restarted)), aim, edits_of(before)),
      "the restarted client did not load the saved world")

def verify_save() -> IO(Unit):
  do IO<Unit>:
    Unit <- empty_world()
    +state : Client.Client <- started()
    +aimed_state : Client.Client <- looked_down(state)
    +aim : Aim <- IO.pure(Aim, aim_of_state(aimed_state))
    Unit <- require(reached(aim),
      "the spawn pose still reaches nothing after looking down")
    saved : Saved <- dig_then_save(aimed_state, aim)
    check_save(saved)

# --- the world's cache --------------------------------------------------------
#
# The client extracts the view region's faces once and keeps them, so a frame's world
# has to follow the edit log and nothing else. Two failures are possible and both are
# silent in a frame rate: a cache that never invalidates draws the pre-dig world for
# the rest of the session, and a cache that always invalidates is the per-frame
# extraction this replaced, which costs more than the rest of the frame put together.
# The first is caught by the faces and the frame changing after a dig; the second by a
# state that did not move handing back the very same faces.

# What one `Client.view` produced: how many exposed faces the world holds, whether the
# world it returned already names the state's own edit log, and the frame it drew.
type Viewed is Data:
  Viewed{faces: U32, matched: Bool, frame: U32}

type Cache is Data:
  Cache{before: Viewed, again: Viewed, after: Viewed}

# `Client.view` answers a pair, and a pair can only be taken apart by a def that takes
# it as a parameter, which is what `viewed` is: the client's own draw step, with the
# assertions read off what it handed back.
def viewed(drawn: Client.Client & Image) -> Viewed:
  (next, image) = drawn
  Client.Client{player, pose, keys, +edits, region, path, +world, size} = next
  Viewed{Face.face_total(Client.w_faces(world)),
    Client.same_edits(Client.w_edits(world), edits), Voxel.fingerprint(image)}

def cache_views() -> IO(Cache):
  do IO<Cache>:
    +state : Client.Client <- started()
    +before : Viewed = viewed(Client.view(state))
    +again : Viewed = viewed(Client.view(state))
    +looked : Client.Client <- looked_down(state)
    dug : Maybe<&1, Client.Client> <- Client.tick.events(
      [Key{Client.dig_code(), True{}}], looked)
    dug_state : Client.Client <- dug_or_die(dug)
    IO.pure(Cache, Cache{before, again, viewed(Client.view(dug_state))})
def check_stable(before: Viewed, again: Viewed) -> IO(Unit):
  Viewed{faces, matched, frame} = before
  Viewed{again_faces, again_matched, again_frame} = again
  do IO<Unit>:
    Unit <- require(matched,
      "the world a frame was handed did not name the state's own edit log")
    Unit <- require(Bool.and(U32.is_eq(faces, again_faces), U32.is_eq(frame, again_frame)),
      "a state that did not move drew a different frame: the world cache is not stable")
    check(again_matched, "the world's edit log drifted from the state's")

def check_refreshed(before: Viewed, after: Viewed) -> IO(Unit):
  Viewed{faces, matched, frame} = before
  Viewed{after_faces, after_matched, after_frame} = after
  do IO<Unit>:
    Unit <- require(after_matched,
      "the world a frame was handed did not name the state's own edit log")
    Unit <- require(U32.is_ne(faces, after_faces),
      "the dig did not reach the world: the cache never invalidated")
    check(U32.is_ne(frame, after_frame),
      "the dig did not reach the frame: the world's faces were rebuilt but not used")

def check_cache(cache: Cache) -> IO(Unit):
  Cache{+before, +again, +after} = cache
  do IO<Unit>:
    Unit <- check_stable(before, again)
    check_refreshed(before, after)

def verify_cache() -> IO(Unit):
  do IO<Unit>:
    # The same reason `verify_save` writes an empty snapshot first: the client starts
    # on whatever its save holds, and the run before this one left a dug world there.
    Unit <- empty_world()
    cache : Cache <- cache_views()
    check_cache(cache)

# --- the resolution selector -------------------------------------------------
#
# The selector is the one part of the client that decides something a player chose
# rather than something a rule answered, so it is tested like a rule: each size's
# cost, the rate the pacing turns that into, the depth the renderer is asked for,
# and the flag each size answers to.
#
# The rate is divided from the cost field rather than read out of a table, so a
# cost that drifts fails the test instead of quietly disagreeing with a comment.

def tenths_of(size: Client.Size) -> U32:
  Client.Size{label, width, depth, tenths, note} = size
  tenths

def depth_of(size: Client.Size) -> Nat:
  Client.depth_of(size)

def width_of(size: Client.Size) -> U32:
  Client.width_of(size)

def fits_tick(size: Client.Size) -> Bool:
  U32.is_lt(tenths_of(size), Client.tick_tenths())

# 10000 tenths of a millisecond is 1000 ms, so a frame of `t` tenths allows
# 10000 / t frames a second before the runtime's pacing is considered at all. The
# 60 is that pacing: `window_pace` holds every frame to a 16.666667 ms tick.
def verify_costs.at(+size: Client.Size, want_tenths: U32, want_fps: U32) -> IO(Unit):
  do IO<Unit>:
    Unit <- require(U32.is_eq(tenths_of(size), want_tenths),
      "a size's cost is not the measured one")
    check(U32.is_eq(Client.rate(tenths_of(size)), want_fps),
      "a size's estimated FPS is not 10000 over its cost, capped at the pacing")

# 256 misses the tick, so it is the one row the "fits" claim must not make.
def verify_misses(+size: Client.Size) -> IO(Unit):
  do IO<Unit>:
    Unit <- require(U32.is_eq(Client.rate(tenths_of(size)), (20 : U32)),
      "256x256 is not estimated at 20 FPS from its measured cost")
    check(Bool.not(fits_tick(size)), "256x256 fits the 16.67 ms tick, which the measurement contradicts")

def verify_depths() -> IO(Unit):
  do IO<Unit>:
    Unit <- require(Nat.is_eq(depth_of(Client.size_32()), 5n), "32x32 is not depth 5")
    Unit <- require(Nat.is_eq(depth_of(Client.size_64()), 6n), "64x64 is not depth 6")
    Unit <- require(Nat.is_eq(depth_of(Client.size_128()), 7n), "128x128 is not depth 7")
    check(Nat.is_eq(depth_of(Client.size_256()), 8n), "256x256 is not depth 8")

# The flag is the bare width. Built from the label it would be `--size=256x256`,
# which is what this pins: the label is padded for the table and neither the pad
# nor the x belongs in something a player types.
def verify_flags() -> IO(Unit):
  do IO<Unit>:
    Unit <- require(String.eq(Client.flag_of(Client.size_32()), "--size=32"), "the 32 flag is wrong")
    Unit <- require(String.eq(Client.flag_of(Client.size_64()), "--size=64"), "the 64 flag is wrong")
    Unit <- require(String.eq(Client.flag_of(Client.size_128()), "--size=128"), "the 128 flag is wrong")
    check(String.eq(Client.flag_of(Client.size_256()), "--size=256"), "the 256 flag is wrong")

# A width the client does not offer falls back to the shipped size rather than to
# nothing, so a typo cannot open a window nobody asked for.
def verify_fallback() -> IO(Unit):
  do IO<Unit>:
    Unit <- require(U32.is_eq(width_of(Client.size_of_width((32 : U32))), (32 : U32)),
      "32 did not reach its own size")
    Unit <- require(U32.is_eq(width_of(Client.size_of_width((256 : U32))), (256 : U32)),
      "a known width did not reach its own size")
    check(U32.is_eq(width_of(Client.size_of_width((999 : U32))), (128 : U32)),
      "an unknown width did not fall back to 128")

# The table is what the player reads, so the measured costs have to be in it and
# the chosen row has to be the one marked.
def verify_table.at(+chosen: U32) -> IO(Unit):
  do IO<Unit>:
    +rows : String = Client.rows(chosen)
    Unit <- require(String.contains(rows, "14.2 ms"),
      "the table does not show the measured 128x128 frame cost")
    Unit <- require(String.contains(rows, "49.9 ms"),
      "the table does not show the measured 256x256 render cost")
    marked : String = Client.row(Client.size_of_width(chosen), chosen)
    check(String.contains(marked, "* "), "the chosen row is not the one marked")

def verify_selector() -> IO(Unit):
  do IO<Unit>:
    Unit <- verify_costs.at(Client.size_32(), (41 : U32), (60 : U32))
    Unit <- verify_costs.at(Client.size_64(), (67 : U32), (60 : U32))
    Unit <- verify_costs.at(Client.size_128(), (142 : U32), (60 : U32))
    Unit <- verify_misses(Client.size_256())
    Unit <- verify_depths()
    Unit <- verify_flags()
    Unit <- verify_fallback()
    Unit <- verify_table.at((128 : U32))
    Unit <- verify_table.at((32 : U32))
    verify_table.at((256 : U32))


def main() -> IO(Unit):
  do IO<Unit>:
    Unit <- verify_stored_cell()
    Unit <- verify_edges()
    Unit <- verify_targeting()
    Unit <- verify_tick()
    Unit <- verify_frame()
    Unit <- verify_cache()
    Unit <- verify_save()
    Unit <- verify_selector()
    IO.print("client: fold, key edges, targeting, tick, frame, world cache, save and resolution passed")

#|client: fold, key edges, targeting, tick, frame, world cache, save and resolution passed
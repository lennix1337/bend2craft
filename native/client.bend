import Base
import ../world/player.bend as Player
import ../world/world.bend as World
import ../world/world_state.bend as WorldState
import ./player-probe/player_probe.bend as PlayerProbe
import ./face-probe/face_probe.bend as Face
import ./frame-probe/frame_probe.bend as Frame
import ./save-migration/save_migration.bend as Migration

# The native client. It owns no game rule: the player transition is
# `Player.step`, the targeted cell is `Player.raycast`, the world is
# `WorldState.chunk`, the collision region and its storage guard are the player
# probe's, the camera and the input fold are the frame probe's, the image is the
# face renderer's, and the save format is the same `B2CW:1` the legacy importer
# reads and writes. What is here is the wiring, and only the wiring.
#
# The window is 64x64: the largest square whose measured frame cost fits the pinned
# runtime's own 60 Hz pacing on this machine. See `window_width` for the numbers.
type Client is Data:
  Client{
    player: Player.State,
    pose: Frame.Pose,
    keys: U32,
    edits: List<&2, WorldState.Edit>,
    region: PlayerProbe.Region,
    path: String
  }

# The window is 64x64, and that is a measured choice rather than a preference.
# `native/client-probe` times the client's own stages at its own spawn camera with
# the image read back through the same quadtree walk `window_show` performs:
# per-call medians over seven samples, native C, `--gpu off`, eight threads, give
# 5.98 ms of render at 32x32, 9.45 ms at 64x64 and 22.55 ms at 128x128, with the tick
# at 0.88 ms on top. So 64x64 is about 10.3 ms of a frame against the 16.7 ms the
# pinned runtime's own 60 Hz pacing leaves, and 128x128 would be 24.35 ms, which is
# about 41 FPS. 64x64 is the largest square this engine holds at 60 Hz on this
# machine; 128x128 is one benchmark away from being honest about not.
def window_width() -> U32:
  64

def frame_depth() -> Nat:
  6n

# The scatter tile edge, chosen by measurement at this window size: 16 buckets a
# tile reads 12.6 ms per frame at 128x128 and eight threads against the 8-pixel
# default's 21.4 ms, and both renderers agree exactly at either edge, so the choice
# is cost only.
# The tile edge the renderer buckets faces into, chosen from the frame depth by
# measurement rather than by taste. A tile costs a fixed amount to build, project and
# hold, and every pixel in it walks the whole bucket, so the two costs pull in opposite
# directions: small tiles mean less wasted walking per pixel, large tiles mean fewer
# tiles to pay for. At 8 threads on this machine, seven samples, per call:
#
#   depth  size   edge 8   edge 16   edge 32
#      5     32     6.49     6.57    10.32
#      6     64    10.30     8.65    12.55
#      7    128    38.90    20.80    24.40
#      8    256   218.67    74.33    64.33
#      9    512  1370.00   349.50   222.00
#
# The crossover sits between 128 and 256: below it the per-tile cost dominates and 16
# wins, above it the per-pixel bucket walk dominates and 32 wins. `edge 32` also costs
# 14.80 ms on the full 64x64 frame against 10.45 at 16, so the shipped size keeps 16.
#
# The edge follows the depth of the frame being built, not the depth the client ships,
# so that a frame measured at another size is measured with the edge that size wants.
def tile_edge_at(depth: Nat) -> U32:
  Bool.pick(U32, Nat.is_lt(depth, 8n), 16, 32)

def tile_edge() -> U32:
  tile_edge_at(frame_depth())

def title() -> String:
  "Bend2Craft native"

def path() -> String:
  "native/client-world.b2cw"

def place_block() -> U32:
  2

# --- coordinates -------------------------------------------------------------

# The inverse of `PlayerProbe.domain_cell`. The player and the raycast speak the
# encoded window while `WorldState` edits and the renderer speak stored cells, so
# an edit has to come back across that fold or it lands in the wrong cell. A
# cell the encoding cannot name is refused, which is the same bound the region
# guard uses.
def below_limit(limit: Nat, value: Nat) -> Bool:
  Nat.is_lt(value, limit)

def stored_cell.positive.at(inside: Bool, +cell: Nat) -> Maybe<&1, Nat>:
  match inside:
    case True{}:
      Some{cell}
    case False{}:
      None{}

def stored_cell.negative.at(inside: Bool, +distance: Nat) -> Maybe<&1, Nat>:
  match inside:
    case True{}:
      Some{Nat.sub(World.negative_origin(), distance)}
    case False{}:
      None{}

def stored_cell(branch: Bool, +domain: Nat) -> Maybe<&1, Nat>:
  match branch:
    case True{}:
      stored_cell.positive.at(below_limit(PlayerProbe.positive_cell_limit(),
        Nat.sub(domain, 32768n)), Nat.sub(domain, 32768n))
    case False{}:
      stored_cell.negative.at(below_limit(PlayerProbe.positive_cell_limit(),
        Nat.sub(32768n, domain)), Nat.sub(32768n, domain))

def stored_cell.of(+domain: Nat) -> Maybe<&1, Nat>:
  stored_cell(Nat.is_ge(domain, 32768n), domain)

# --- input -------------------------------------------------------------------

def bit_of(code: U32) -> U32:
  Frame.key_bit(code)

def dig_code() -> U32:
  101

def place_code() -> U32:
  114

def save_code() -> U32:
  116

def escape_code() -> U32:
  27

# An edge, not a level: a held key must not dig sixty times a second. A key is
# down now and was up in the previous tick's mask, which is the only thing an edge
# means. Testing the bit against the previous mask is what makes this work for
# every key code rather than only the first one.
def edge(keys: U32, previous: U32, +bit: U32) -> Bool:
  down = U32.is_eq(U32.and(bit, keys), bit)
  was_down = U32.is_eq(U32.and(bit, previous), 0)
  Bool.and(down, was_down)

# Whether the loop should keep going. The window manager's close is noticed while
# the events are shared; escape is the client's own way out, so a player is never
# trapped in a window they cannot close.
def edge_of(keys: U32, previous: U32, code: U32) -> Bool:
  edge(keys, previous, bit_of(code))

def wants_dig(previous: U32, keys: U32) -> Bool:
  edge_of(keys, previous, dig_code())

def wants_place(previous: U32, keys: U32) -> Bool:
  edge_of(keys, previous, place_code())

def wants_save(previous: U32, keys: U32) -> Bool:
  edge_of(keys, previous, save_code())

def wants_quit(keys: U32) -> Bool:
  U32.is_eq(U32.and(keys, bit_of(escape_code())), bit_of(escape_code()))

# Escape asks to leave; the window manager's own close is noticed while the
# events are shared and quits just the same.
def quitting_from(closing: Bool, keys: U32) -> Bool:
  Bool.or(closing, wants_quit(keys))

# --- targeting ---------------------------------------------------------------

# `Player.raycast` answers in the encoded window, so the aim state is rebuilt
# from the pose instead of taking the player the tick owns.
def aim_cast(+pose: Frame.Pose, +blocks: List<&2, U32>, +origin_x: Nat, +origin_y: Nat,
  +origin_z: Nat, +width: Nat, +height: Nat, +depth: Nat) -> Player.RayResult:
  +eye = Frame.eye_of(pose)
  +x = F32.add(Frame.eye_x(eye), F32.from_nat(origin_x))
  +y = F32.sub(Frame.eye_y(eye), Frame.eye_height())
  +z = F32.add(Frame.eye_z(eye), F32.from_nat(origin_z))
  Player.raycast(Player.state(x, y, z, Frame.yaw_of(pose), Frame.pitch_of(pose), 0.0,
    False{}, 20.0, 20.0), blocks, origin_x, origin_y, origin_z, width, height, depth)

def aimed(+pose: Frame.Pose, region: PlayerProbe.Region) -> Player.RayResult:
  PlayerProbe.Region{+blocks, +origin_x, +origin_y, +origin_z, +width, +height, +depth} = region
  aim_cast(pose, blocks, origin_x, origin_y, origin_z, width, height, depth)

# --- edits -------------------------------------------------------------------

def write_cell(mx: Maybe<&1, Nat>, mz: Maybe<&1, Nat>, edits: List<&2, WorldState.Edit>,
  +y: Nat, +block: U32) -> List<&2, WorldState.Edit>:
  match mx mz:
    case Some{sx} Some{sz}:
      WorldState.set(edits, sx, y, sz, block)
    case _ _:
      edits

def dig_cell(edits: List<&2, WorldState.Edit>, +x: Nat, +y: Nat, +z: Nat) ->
  List<&2, WorldState.Edit>:
  write_cell(stored_cell.of(x), stored_cell.of(z), edits, y, 0)

def place_cell(edits: List<&2, WorldState.Edit>, +x: Nat, +y: Nat, +z: Nat) ->
  List<&2, WorldState.Edit>:
  write_cell(stored_cell.of(x), stored_cell.of(z), edits, y, place_block())

def then_place(edits: List<&2, WorldState.Edit>, has_place: Bool, building: Bool,
  +x: Nat, +y: Nat, +z: Nat) -> List<&2, WorldState.Edit>:
  match has_place building:
    case True{} True{}:
      place_cell(edits, x, y, z)
    case _ _:
      edits

# Digging removes the targeted cell. Building removes it too and then puts a
# block in the cell the raycast says the face would open, which is the usual
# behaviour and keeps the two actions from disagreeing about the hit.
def dig_or_build(edits: List<&2, WorldState.Edit>, result: Player.RayResult, building: Bool) ->
  List<&2, WorldState.Edit>:
  match result:
    case Player.NoHit{}:
      edits
    case Player.Hit{hit_x, hit_y, hit_z, place_x, place_y, place_z, has_place}:
      then_place(dig_cell(edits, hit_x, hit_y, hit_z), has_place, building,
        place_x, place_y, place_z)

def edited(edits: List<&2, WorldState.Edit>, +pose: Frame.Pose, region: PlayerProbe.Region,
  digging: Bool, building: Bool) -> List<&2, WorldState.Edit>:
  match digging building:
    case True{} False{}:
      dig_or_build(edits, aimed(pose, region), False{})
    case False{} True{}:
      dig_or_build(edits, aimed(pose, region), True{})
    case _ _:
      edits

# --- persistence -------------------------------------------------------------

def snapshot_edits(snapshot: Migration.Snapshot) -> List<&2, WorldState.Edit>:
  Migration.Snapshot{seed, edits} = snapshot
  edits

def edits_of(maybe: Maybe<&2, Migration.Snapshot>) -> List<&2, WorldState.Edit>:
  match maybe:
    case Some{snapshot}:
      snapshot_edits(snapshot)
    case None{}:
      WorldState.empty()

def edits_from(text: String) -> List<&2, WorldState.Edit>:
  edits_of(Migration.decode(text))

def load_text.done(pair: File & Result<&1, &1, U32 & String, String>) -> IO(String):
  (file, result) = pair
  match result:
    case Fail{error}:
      do IO<String>:
        shut : Unit <- File.close(file)
        return ""
    case Done{text}:
      do IO<String>:
        shut : Unit <- File.close(file)
        return text

def load_text(result: Result<&1, &1, U32 & String, File>, read_size: U32) -> IO(String):
  match result:
    case Fail{error}:
      IO.pure(String, "")
    case Done{file}:
      do IO<String>:
        read : File & Result<&1, &1, U32 & String, String> <- File.read(file, read_size)
        load_text.done(read)

def load_cap() -> Nat:
  262144n

def load_text.at(path: String) -> IO(String):
  do IO<String>:
    opened : Result<&1, &1, U32 & String, File> <- File.open(path, "r")
    load_text(opened, U32.from_nat(load_cap()))

def save_text.done(pair: File & Result<&1, &1, U32 & String, Unit>) -> IO(Unit):
  (file, result) = pair
  match result:
    case Done{unit}:
      do IO<Unit>:
        shut : Unit <- File.close(file)
        IO.print("native-client: world saved")
    case Fail{error}:
      do IO<Unit>:
        shut : Unit <- File.close(file)
        IO.die(Unit, 1, "native-client: the world could not be written")

def save_text(file: File, text: String) -> IO(Unit):
  do IO<Unit>:
    written : File & Result<&1, &1, U32 & String, Unit> <- File.write(file, text)
    save_text.done(written)

def save_text.at(path: String, text: String) -> IO(Unit):
  do IO<Unit>:
    file : File <- IO.try(File, File.open(path, "w"))
    save_text(file, text)

# --- the frame ---------------------------------------------------------------

# The chunks of the client's region, in the order the region walk reads them: one
# chunk row at a time, x within it. The renderer's input used to be a single chunk,
# which capped the visible world at 16x16 cells; from inside the village at spawn
# that is a wooden wall with no sky, and the agreement gate could not see it because
# it compares which block is nearest, not what is on screen.
def region_row(remaining: Nat, +seed: Nat, +base_x: Nat, +z: Nat,
  +edits: List<&2, WorldState.Edit>) -> List<&2, List<&2, U32>>:
  match remaining:
    case 0n:
      []
    case 1n+r:
      Face.chunk_blocks(WorldState.chunk(seed, base_x, z, edits))
        <> region_row(r, seed, Nat.add(base_x, 1n), z, edits)

def region_rows(remaining: Nat, +seed: Nat, +base_x: Nat, +z: Nat,
  +edits: List<&2, WorldState.Edit>) -> List<&2, List<&2, U32>>:
  match remaining:
    case 0n:
      []
    case 1n+r:
      # `append`, not `<>`: a chunk row is already a list of chunks, so the rows
      # concatenate into one list of chunks rather than nesting.
      List.append(&2, List<&2, U32>, region_row(Frame.view_columns(), seed, base_x, z, edits),
        region_rows(r, seed, base_x, Nat.add(z, 1n), edits))

def region_chunks(+seed: Nat, +edits: List<&2, WorldState.Edit>) ->
  List<&2, List<&2, U32>>:
  region_rows(Frame.view_rows(), seed, Frame.chunk_x(), Frame.chunk_z(), edits)

# The frame at an explicit depth, so the benchmark can measure the sizes the client
# might ship at without restating the render call. The client's own `image_of` is this
# at the depth it ships; the benchmark used to inline its own copy of the call, which is
# how it came to measure a one-chunk render the client no longer does.
def image_at_depth(+edits: List<&2, WorldState.Edit>, +pose: Frame.Pose, +depth: Nat) ->
  Image:
  +eye = Frame.eye_of(pose)
  Face.render_region_at_with_tile_size(region_chunks(Frame.seed(), edits),
    Frame.view_columns(), Frame.view_rows(), eye, Frame.yaw_of(pose),
    Frame.pitch_of(pose), depth, tile_edge_at(depth))

def image_of(+edits: List<&2, WorldState.Edit>, +pose: Frame.Pose) -> Image:
  image_at_depth(edits, pose, frame_depth())

def view(state: Client) -> Client & Image:
  Client{player, +pose, keys, +edits, region, path} = state
  (state, image_of(edits, pose))

# --- the tick ----------------------------------------------------------------
#
# The three decisions are taken once, from the previous held-key mask against the
# one this tick's events produce, and then handed down as plain booleans: a mask
# is consumed by the fold, so it cannot be consulted again further down.
#
# The tick answers with `Nothing` to leave, which is how `App.loop` ends: the app
# stops when the tick hands back no client, so a quit needs no separate flag and no
# fuel of its own.

def tick.acting(player: Player.State, pose: Frame.Pose, +mask: U32,
  +edits: List<&2, WorldState.Edit>, region: PlayerProbe.Region, +path: String,
  saving: Bool) -> IO(Maybe<Client>):
  match saving:
    case True{}:
      do IO<Maybe<Client>>:
        written : Unit <- save_text.at(path, Migration.encode(Migration.Snapshot{Frame.seed(), edits}))
        return Some{Client{player, pose, mask, edits, region, path}}
    case False{}:
      IO.pure(Maybe<Client>, Some{Client{player, pose, mask, edits, region, path}})

def tick.quitting(quitting: Bool, player: Player.State, pose: Frame.Pose, +mask: U32,
  edits: List<&2, WorldState.Edit>, region: PlayerProbe.Region, path: String,
  saving: Bool) -> IO(Maybe<Client>):
  match quitting:
    case True{}:
      IO.pure(Maybe<Client>, None{})
    case False{}:
      tick.acting(player, pose, mask, edits, region, path, saving)

def tick.decided(next_edits: List<&2, WorldState.Edit>, staged: Frame.Staged, +mask: U32,
  region: PlayerProbe.Region, path: String, saving: Bool, closing: Bool) -> IO(Maybe<Client>):
  Frame.Staged{player, pose, changed} = staged
  quitting = quitting_from(closing, mask)
  tick.quitting(quitting, player, pose, mask, next_edits, region, path, saving)

# `App` hands the tick a `List<&1, Event>` and the frame probe folds a
# `List<&2, Event>`. This is the whole bridge: one pass that shares each event
# into a shared list and notes the window close, so the tick keeps the frame
# probe's input rule instead of a second copy of it.

type Folded is Data:
  Folded{events: List<&2, Event>, closing: Bool}

def is_close(event: Event) -> Bool:
  match event:
    case Close{}:
      True{}
    case _:
      False{}

# A close anywhere in the tick's events quits, and it is noticed in the same pass
# that shares them.
def closer(seen: Bool, event: Event) -> Bool:
  Bool.or(seen, is_close(event))

def share_events.go(events: List<&1, Event>, acc: List<&2, Event>, closing: Bool) -> Folded:
  match events:
    case Nil{}:
      Folded{acc, closing}
    case +h <> t:
      share_events.go(t, h <> acc, closer(closing, h))

def share_events(events: List<&1, Event>) -> Folded:
  share_events.go(events, Nil{}, False{})

# The mask is read off that fold for the edge decisions, and the player transition
# and the pose come from the probe's own `advance`, so no rule is asked twice.
def tick.folded(folded: Folded, player: Player.State, +pose: Frame.Pose, +keys: U32,
  edits: List<&2, WorldState.Edit>, +region: PlayerProbe.Region, path: String) -> IO(Maybe<Client>):
  Folded{+shared, closing} = folded
  +mask : U32 = Frame.keys_mask(Frame.input(shared))
  +staged : Frame.Staged = Frame.advance(player, shared, Frame.tick_dt(), region,
    Frame.origin_x(), Frame.origin_z(), pose)
  next_edits = edited(edits, pose, region, wants_dig(keys, mask), wants_place(keys, mask))
  tick.decided(next_edits, staged, mask, region, path, wants_save(keys, mask), closing)

def tick.events(events: List<&1, Event>, state: Client) -> IO(Maybe<Client>):
  Client{player, +pose, +keys, edits, +region, path} = state
  tick.folded(share_events(events), player, pose, keys, edits, region, path)

# --- start -------------------------------------------------------------------

def start.readied(player: Player.State, +pose: Frame.Pose, +region: PlayerProbe.Region,
  +edits: List<&2, WorldState.Edit>, +path: String) -> IO(Client):
  IO.pure(Client, Client{player, pose, 0, edits, region, path})

def start.placed(+player: Player.State, region: PlayerProbe.Region,
  +edits: List<&2, WorldState.Edit>, +path: String) -> IO(Client):
  pose = Frame.pose(player, Frame.origin_x(), Frame.origin_z())
  start.readied(player, pose, region, edits, path)

def start.spawned(maybe: Maybe<&1, Player.State>, region: PlayerProbe.Region,
  +edits: List<&2, WorldState.Edit>, +path: String) -> IO(Client):
  match maybe:
    case Some{player}:
      start.placed(player, region, edits, path)
    case None{}:
      IO.die(Client, 1, "native-client: the spawn cell was refused")

# The spawn cell is a world rule, not a client choice, and this is the measured reason
# the client cannot ask for it yet.
#
# `World.spawn_cell` answers (25, 16, 9) for seed 1337. The region the client loads
# starts at chunk (1, 1), so that cell is local (9, 0): the minimum z edge. A camera at
# yaw 0 looks toward -z with zero rows of world in front of it, so the frame comes out
# all sky, and a dig ray leaves the region before it reaches anything, which fails the
# client's own save test on the cell it dug.
#
# Using it needs the region origin moved to chunk (0, 0), so the whole 48x48 world is
# loaded and the spawn cell has terrain on every side. That origin is also what the
# camera's eye is rebased onto, so moving it invalidates the frame probe's single-chunk
# render fixtures, which compare a one-chunk ray render against a sky control. Three
# chunks per axis at origin (0, 0) also built a 46,080-cell collision region and the
# machine stack overflowed, so the view region and the collision region have to be
# sized apart. That is the remaining work, and it is a region change, not a spawn swap.
def start.player(region: PlayerProbe.Region, +edits: List<&2, WorldState.Edit>,
  +path: String) -> IO(Client):
  maybe = PlayerProbe.checked_create_player(25n, 25n, 9n)
  start.spawned(maybe, region, edits, path)

def start.region(maybe: Maybe<&1, PlayerProbe.Region>, +edits: List<&2, WorldState.Edit>,
  +path: String) -> IO(Client):
  match maybe:
    case Some{region}:
      start.player(region, edits, path)
    case None{}:
      IO.die(Client, 1, "native-client: the collision region was refused")

def start.grid(+edits: List<&2, WorldState.Edit>) -> IO(Client):
  region = PlayerProbe.checked_from_world_state(Frame.seed(), Frame.chunk_x(),
    Frame.chunk_z(), Frame.columns(), Frame.rows(), edits)
  start.region(region, edits, path())

def start.edits_of(text: String) -> IO(Client):
  edits = edits_from(text)
  start.grid(edits)

# A save that does not fit the read cap is refused rather than truncated. A
# truncated snapshot fails to decode, which would silently start a new world over
# a real one.
def oversized(cap: Nat, text: String) -> Bool:
  Nat.is_ge(String.length(text), cap)

def start.whole(too_large: Bool, text: String) -> IO(Client):
  match too_large:
    case True{}:
      IO.die(Client, 1, "native-client: the saved world is too large to read")
    case False{}:
      start.edits_of(text)

def start.fits(+text: String) -> IO(Client):
  start.whole(oversized(load_cap(), text), text)

def start() -> IO(Client):
  do IO<Client>:
    text : String <- load_text.at(path())
    start.fits(text)

# The window is opened and driven by hand rather than through `App.run`, because
# `App.run` has nowhere to put the pointer grab. The grab is not optional: the
# runtime only raises `Look` deltas while the pointer is grabbed, and without it the
# mouse arrives as `Move` and the player can never turn. The grab also refuses to
# engage until the window holds input focus, and focus arrives after the window is
# mapped, so a single grab at startup is a race the client can lose and then never
# turn again. Asking once per frame costs nothing: the runtime ignores the call once
# the grab is held, so the first frame after focus arrives takes it.
def grabbed(window: Window) -> IO(Window):
  Window.grab(window, True{})

# The runtime's pointer grab refuses to engage until the window holds input focus,
# and focus arrives after the window is mapped, so a single grab at startup is a race
# the client can lose and then never turn again: without the grab the mouse arrives as
# `Move` rather than `Look`, and the player can only walk. The runtime ignores the call
# once the grab is held, so asking a second time after a pause is free and covers the
# case where focus arrived late. Two grabs rather than a retry loop, because a `Window`
# is a linear handle and a loop would need the same one twice in a pass.
def grab_wait_ms() -> U32:
  250

# `App.loop` is the prelude's own frame loop and it ends when the tick hands back no
# client, so the quit needs no fuel and no flag of its own: the client answers `Nothing`
# to leave. The client opens the window itself rather than through `App.run` only so
# the grab can be taken first; everything after that is the prelude's.
def app() -> App<Client>:
  App{view, tick.events}

def run(state: Client) -> IO(Unit):
  do IO<Unit>:
    window : Window <- IO.try(Window, Window.open(title(), window_width(), window_width()))
    early : Window <- grabbed(window)
    pause : Unit <- IO.sleep(grab_wait_ms())
    held : Window <- grabbed(early)
    App.loop(Client, app(), 4294967295n, held, state)

def main() -> IO(Unit):
  do IO<Unit>:
    state : Client <- start()
    run(state)

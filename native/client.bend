import Base
import ../world/player.bend as Player
import ../world/world.bend as World
import ../world/world_state.bend as WorldState
import ./player.bend as PlayerProbe
import ./face.bend as Face
import ./shade.bend as Shade
import ./paint.bend as Paint
import ./scenery.bend as Scenery
import ./body.bend as Body
import ./tag.bend as Tag
import ./sky.bend as Sky
import ./net.bend as Net
import ./frame.bend as Frame
import ./pointer.bend as Pointer
import ./bag.bend as Bag
import ./hud.bend as Hud
import ./screen.bend as Screen
import ./stores.bend as Stores
import ./stash.bend as Stash
import ../world/inventory.bend as Inventory
import ../world/entities.bend as Entities
import ../world/multiplayer_mobs.bend as MultiplayerMobs
import ./save.bend as Migration

# The native client. It owns no game rule: the player transition is
# `Player.step`, the targeted cell is `Player.raycast`, the world is
# `WorldState.chunk`, the collision region and its storage guard are the player
# probe's, the camera and the input fold are the frame probe's, the image is the
# face renderer's, and the save format is the same `B2CW:1` the legacy importer
# reads and writes. What is here is the wiring, and only the wiring.
#
# The window is chosen before it opens, from `--size`. `size_128` is the default, and every
# size the selector offers fits the pinned runtime's 60 Hz pacing on this machine. See the
# selector below for the table.
#
# `clock` counts ticks from `Sky.clock_start`. It is the hour: the sky, the light and where
# the clouds have drifted to are rules on it, and nothing else reads it. It is not saved, so
# a session starts in the morning.
#
# `hosted` says where the look comes from: `True` when `native/pointer.bend` is reading the
# pointer from the Windows host, `False` when the runtime's own grab is what measures it.
# The block being dug: its cell as the ray names it, how long it has been dug, and how long
# it takes with what is in hand. A block comes away when the button has been held on it
# for as long as `Inventory.mining_duration` says, as in the browser; looking at another
# cell or letting go starts over.
type Dig is Data:
  Dig{x: Nat, y: Nat, z: Nat, done: F32, need: F32}

def resting() -> Dig:
  Dig{0n, 0n, 0n, 0.0, 0.0}

# How far a dig has got, over 256.
def dig_progress(dig: Dig) -> U32:
  Dig{x, y, z, +done, +need} = dig
  Bool.pick(U32, F32.is_gt(need, 0.0),
    F32.to_u32(F32.min(F32.div(F32.mul(done, 256.0), F32.max(need, 0.001)), 256.0)), 0)

type Client is Data:
  Client{
    player: Player.State,
    pose: Frame.Pose,
    keys: U32,
    hosted: Bool,
    edits: List<&2, WorldState.Edit>,
    region: PlayerProbe.Region,
    path: String,
    world: World,
    size: Size,
    bag: Bag.Bag,
    home: Frame.Home,
    clock: U32,
    dig: Dig
  }

def hosting(state: Client, hosted: Bool) -> Client:
  Client{player, pose, keys, _, edits, region, path, world, size, bag, home, clock, dig} = state
  Client{player, pose, keys, hosted, edits, region, path, world, size, bag, home, clock, dig}

# The view region's exposed faces, and the edit log they were extracted from.
#
# This is the client's world, kept between frames. The view region is a fixed set of
# chunks, so its cells and its exposed faces do not change when the player walks: only
# the camera does, and the camera is read after this. Re-extracting the region every
# frame costs more than the whole rest of the frame put together, so the client holds
# the faces and rebuilds them only when the edit log says the world did change.
#
# The key is the edit log itself and not its length, because `WorldState.set` replaces
# an existing entry in place: digging the same cell twice leaves the log the same size
# and the cell a different value. The log holds one entry per edited cell and a session
# edits a handful, so comparing it costs a few dozen field reads against a region walk
# of 20,480 cells.
# One chunk of the view region: where it is, in window chunks; a mark of the edits that fall
# in it; and its exposed faces, in the chunk's own cells.
type Slab is Data:
  Slab{x: Nat, z: Nat, mark: U32, faces: List<&2, Face.Face>}

# `faces` is every slab's faces in the region's cells, which is what the painter reads. The
# slabs are what it is kept from.
type World is Data:
  World{faces: List<&2, Face.Face>, edits: List<&2, WorldState.Edit>, home: Frame.Home,
    slabs: List<&2, Slab>}

def w_faces(world: World) -> List<&2, Face.Face>:
  match world:
    case World{faces, edits, home, slabs}:
      faces

def w_edits(world: World) -> List<&2, WorldState.Edit>:
  match world:
    case World{faces, edits, home, slabs}:
      edits

def w_home(world: World) -> Frame.Home:
  match world:
    case World{faces, edits, home, slabs}:
      home

def w_slabs(world: World) -> List<&2, Slab>:
  match world:
    case World{faces, edits, home, slabs}:
      slabs

def same_edit(a: WorldState.Edit, b: WorldState.Edit) -> Bool:
  WorldState.Edit{ax, ay, az, ablock} = a
  WorldState.Edit{bx, by, bz, bblock} = b
  Bool.and(Bool.and(Nat.is_eq(ax, bx), Nat.is_eq(ay, by)),
    Bool.and(Nat.is_eq(az, bz), U32.is_eq(ablock, bblock)))

def same_edits(+a: List<&2, WorldState.Edit>, +b: List<&2, WorldState.Edit>) -> Bool:
  match a b:
    case Nil{} Nil{}:
      True{}
    case Con{ah, at} Con{bh, bt}:
      Bool.and(same_edit(ah, bh), same_edits(at, bt))
    case _ _:
      False{}

# The default window is 128x128, and what bounds a window is the pinned runtime rather than
# the renderer.
#
# The frame rate the player sees is not the frame cost. `window_pace` in the pinned
# runtime's `effs/window.c` sleeps every presented frame to the next 16.67 ms tick, so the
# client is capped at 60 Hz however fast the frame is, and `vendor/bend` is not ours to edit.
# What is ours is the frame cost, and therefore how large a window fits inside the cap.
#
# Three renderers have drawn this window, on the same scene and the same machine (the one
# named in `lab/native/2026-09-30-native-renderer-investigation.md`), native C, `--gpu off`:
#
#   size    ray walk    whole-frame painter    partitioned painter
#    128     13.95            1.20                   0.70
#    256     49.00            3.52                   1.40
#    512    152.50           12.47                   3.77
#   1024       —             47.65                  11.65
#
# on one thread, and the partitioned painter is the only one of the three a second thread
# helps: 3.20 ms at 1024 on eight. `native/paint.bend` says why, `lab/native/paint/run.sh`
# re-measures the two painters and holds them to the same picture, and
# `native/paint_test.bend` holds the painter to the walk at the same 1% gate
# `native/face_test.bend` holds the walk to the ray renderer.
#
# `lab/native/client-probe/run-fps.sh` measures the live loop rather than the stages, and it
# is the number this comment is really about: 60.06 presented frames a second at 1024x1024
# and 60.07 at 512x512 over 600-frame runs under a real X server, which is the ceiling
# rather than a budget beside it.
#
# These two are the *benchmarked* size, and they are what `lab/native/client-probe`
# measures and what its scripts read, so they are constants rather than a reading of
# the selector. They are the default for the same reason, so a benchmark and the
# client agree on what shipped.
def window_width() -> U32:
  128

def frame_depth() -> Nat:
  7n

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
# That table is one chunk, and the edge was re-measured at the client's own region and
# camera before this was settled, because the two have to be compared as they ship. The
# per-pixel walk is cheaper at a smaller edge and the scatter builder is dearer, and the
# builder is not parallel: at 64x64 the walk charges 695,808 candidates at edge 16,
# 488,640 at edge 8 and 400,128 at edge 2, while the builder's cost is
# `2 * across * placements` list steps, which is 21,744 steps at edge 16 and 134,976 at
# edge 8. The walk parallelises and the builder does not, so the balance that puts the
# tile count at 16 is the balance that was measured. Dropping to edge 8 measured 9.50 ms
# of render against 7.75 at edge 16 at the time, and the whole-frame cost is what moved:
# the walk saves 4.0 ms and the builder spends 2.5 ms of it back.
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

# --- the resolution selector -------------------------------------------------
#
# The size is chosen before the window opens, and the cost of every choice is
# printed before it, so nobody has to open four windows to find out which one
# holds 60 Hz.
#
# Bend 2.0.32 cannot read a key from a terminal. `IO` offers `print`, `args`,
# `get_env`, `sleep`, `now`, `thread_count` and `random_u32`, and nothing that
# reads stdin, so a selector that waited for a keystroke would wait forever. The
# choice therefore comes from `IO.args()` as `--size=<n>`, and it is echoed to
# stdout before the window opens.
#
# `tenths` is a whole frame in tenths of a millisecond: the precision the
# measurement has, and the only one Bend can hold without a float. Every row is the
# measured draw plus the measured 0.03 ms tick.
#
# `window_pace` in the pinned runtime sleeps every presented frame to a 16.67 ms
# tick, so 60 is a ceiling and not a budget. `rate` divides out the rate the work
# allows and then caps it at what the pacing allows, so a 4.1 ms frame reads as
# 60 and not as 244: the cap is what a player actually sees.

# The label is padded to a fixed column so the costs line up, which is why the
# four are not the same string. `flag_of` builds the flag from the width rather
# than from this, so neither the pad nor the x reaches something a player types.
type Size is Data:
  Size{label: String, width: U32, depth: Nat, tenths: U32, note: String}

# The costs are the client's own frame — `image_at_depth` over its five-by-five view
# region from the spawn pose, lit, through the air, under the sky's clouds and sun — on the
# machine named in `lab/native/2026-09-30-native-renderer-investigation.md`, native C,
# `--gpu off`, on the eight threads the runtime starts by default there. Every row is the
# `client` phase of `lab/native/paint/run.sh` (medians of five samples) and the tick is the
# measured 0.03 ms, so the rows are comparable to each other.
#
#   size    draw      + tick     tenths   against a 16.67 ms tick
#    32     1.07      1.10        11        15.6 ms of slack
#    64     1.30      1.33        13        15.4 ms of slack
#   128     1.98      2.01        20        14.7 ms of slack
#   256     2.25      2.28        23        14.4 ms of slack
#   512     3.17      3.20        32        13.5 ms of slack
#  1024     6.10      6.13        61        10.6 ms of slack
#
# The spawn is inside a house, facing a wall, which is the cheapest frame there is. The
# dearest measured is from open ground looking down across the terrain: 8.47 ms at 1024.
# The part of a row that does not shrink with the window is the front half of a frame: the
# chunks that can be seen have their faces found and projected, each chunk its own task, and
# the polygons are put in order by counting. From the spawn it is under a millisecond and
# looking across open ground a millisecond and a half. The rest is a division, a texel, its
# light and its air for every pixel a face is seen in, once.
def size_32() -> Size:
  Size{" 32x32", (32 : U32), 5n, (11 : U32), "fits 60 Hz with 15.6 ms to spare"}

def size_64() -> Size:
  Size{" 64x64", (64 : U32), 6n, (13 : U32), "fits 60 Hz with 15.4 ms to spare"}

def size_128() -> Size:
  Size{"128x128", (128 : U32), 7n, (20 : U32), "fits 60 Hz with 14.7 ms to spare"}

def size_256() -> Size:
  Size{"256x256", (256 : U32), 8n, (23 : U32), "fits 60 Hz with 14.4 ms to spare"}

def size_512() -> Size:
  Size{"512x512", (512 : U32), 9n, (32 : U32), "fits 60 Hz with 13.5 ms to spare"}

def size_1024() -> Size:
  Size{"1024x1024", (1024 : U32), 10n, (61 : U32), "fits 60 Hz with 10.6 ms to spare"}

# The two things the rest of the client needs out of a size. The frame's quadtree
# depth is part of the size rather than a second lookup, so the window and the image
# it is asked for cannot disagree about how big they are.
def width_of(+size: Size) -> U32:
  Size{label, width, depth, tenths, note} = size
  width

def depth_of(size: Size) -> Nat:
  Size{label, width, depth, tenths, note} = size
  depth

# Smallest first: the bill gets worse as the window grows, so a reader scanning
# down the table sees the cost rise.
#
# The thread count is the runtime's, read before `main`, and the client's frame is measured
# at each. One frame, in milliseconds, from `lab/native/paint/run.sh`:
#
#   size    1 thread    2 threads    4 threads    8 threads
#    128       1.55        1.52         1.68         1.98
#    256       2.90        2.23         2.12         2.25
#    512       7.55        4.83         3.62         3.17
#   1024      24.52       13.93         8.40         6.10
#
# **1024 needs the pool.** On one thread it is 24.52 ms at the spawn and 27.20 looking down
# across open ground, which miss the tick; on two it is 13.93 at the spawn and 16.25 looking
# down, which is within half a millisecond of it; on four or eight it fits everywhere it was
# measured. The
# epilogue says so. Every other size fits at every count. A small window has few tiles to
# share out and pays for waking the pool; at 1024 the tiles are the work and the pool
# divides it.
def sizes() -> List<&2, Size>:
  [size_32(), size_64(), size_128(), size_256(), size_512(), size_1024()]

def tick_tenths() -> U32:
  167

# 16.666667 ms is the runtime's own pacing interval, and 1000 ms over it is 60
# frames a second. The literal is the ceiling rather than a division because
# 10000 / 167 truncates to 59, and quoting the pacing a player actually gets is
# better than quoting the floor of a rounded interval.
def fps_ceiling() -> U32:
  60

# 1000 ms in a second over tenths of a millisecond is 10000 / tenths: the rate the
# work allows. The pacing then holds the frame to the tick, so the rate a player
# sees is the smaller of the two, and a 4.1 ms frame reads as 60 rather than 244.
def rate(tenths: U32) -> U32:
  U32.min(U32.div((10000 : U32), tenths), fps_ceiling())

def ms_text.at(whole: U32, tenth: U32) -> String:
  U32.show(whole) ++ "." ++ U32.show(tenth)

# `tenths` is shared rather than linear because the figure needs both halves of
# the division and a value is spent once. There is no `U32.divmod` to read it in
# one go: the prelude only exposes `U32.div` and `U32.mod`, and each of those
# spends its argument.
def ms_text(+tenths: U32) -> String:
  ms_text.at(U32.div(tenths, (10 : U32)), U32.mod(tenths, (10 : U32)))

def row.at(chosen: Bool, label: String, ms: String, fps: U32, note: String) -> String:
  Bool.pick(String, chosen, "  * ", "    ") ++ label ++ "   " ++ ms ++ " ms   ~"
    ++ U32.show(fps) ++ " FPS   " ++ note ++ "\n"

# The chosen row is marked in place rather than moved to the top, so the table a
# player reads is the table the measurement produced. Whether a size fits the tick
# is in its note rather than computed here: the notes are the measured rows, and a
# second arithmetic path to the same claim would be a second thing to keep true.
def row(size: Size, chosen: U32) -> String:
  Size{label, width, _, +tenths, note} = size
  row.at(U32.is_eq(width, chosen), label, ms_text(tenths), rate(tenths), note)

def rows.at(sizes: List<&2, Size>, +chosen: U32) -> String:
  match sizes:
    case Nil{}:
      ""
    case size <> rest:
      row(size, chosen) ++ rows.at(rest, chosen)

def rows(chosen: U32) -> String:
  rows.at(sizes(), chosen)

def headline() -> String:
  "Bend2Craft native - resolution\n"
    ++ "  The runtime paces every presented frame to a 16.67 ms tick, so 60 FPS is the\n"
    ++ "  ceiling and not a budget. Costs are measured at the client's own spawn\n"
    ++ "  camera, native C target, --gpu off, 8 threads.\n\n"

def epilogue() -> String:
  "\n  Pass --size=32, --size=64, --size=128, --size=256, --size=512 or --size=1024."
    ++ " Default 128.\n  1024 needs the default thread pool: on --threads 1 it is 24.5 ms a"
    ++ " frame.\n"

# Which pointer the look is read from, said once before the first frame so a player who
# cannot turn knows which half to look at.
def pointer_note(hosted: Bool) -> String:
  Bool.pick(String, hosted,
    "  Pointer: read from the Windows host. It is taken while the window is in front"
      ++ " with the cursor inside it; Alt+Tab lets it go.\n",
    "  Pointer: the display's own grab. Click the window to take it.\n")

def report(chosen: U32, hosted: Bool) -> IO(Unit):
  IO.print(headline() ++ rows(chosen) ++ epilogue() ++ pointer_note(hosted))

# --- choosing the size -------------------------------------------------------
#
# The set of valid sizes is closed, so a flag is recognised by being exactly one
# of the four rather than by parsing a number and range-checking it. A closed set
# has no invalid member to reject, and comparing a string is exact where a
# hand-written digit parser is one more thing to get wrong.

# The flag is the bare width, not the label: the label is `256x256` and padded
# for the table, and neither belongs in something a player types.
def flag_of(size: Size) -> String:
  Size{_, width, depth, tenths, note} = size
  "--size=" ++ U32.show(width)

def mentions(args: List<&1, String>, +flag: String) -> Bool:
  match args:
    case Nil{}:
      False{}
    case arg <> rest:
      Bool.or(String.eq(arg, flag), mentions(rest, flag))

# `IO.args` hands out a fresh `List<&1, String>` per call and an element of a
# `&1` list is spent once, so one search per candidate over its own list is the
# shape that fits rather than one search over a shared list.
#
# The steps are written largest-first because there are no forward references:
# each one answers its own flag and otherwise hands the rest down a level, so the
# chain has to be built from the bottom up. The chain is one def per size rather than a
# list fold because a `match` may not scrutinise a computed value, and the flag
# being tested is one.
def chosen_width.at1024(w1024: Bool) -> U32:
  match w1024:
    case True{}:
      (1024 : U32)
    case False{}:
      (128 : U32)

def chosen_width.at512(w512: Bool, w1024: Bool) -> U32:
  match w512:
    case True{}:
      (512 : U32)
    case False{}:
      chosen_width.at1024(w1024)

def chosen_width.at256(w256: Bool, w512: Bool, w1024: Bool) -> U32:
  match w256:
    case True{}:
      (256 : U32)
    case False{}:
      chosen_width.at512(w512, w1024)

def chosen_width.at128(w128: Bool, w256: Bool, w512: Bool, w1024: Bool) -> U32:
  match w128:
    case True{}:
      (128 : U32)
    case False{}:
      chosen_width.at256(w256, w512, w1024)

def chosen_width.at64(w64: Bool, w128: Bool, w256: Bool, w512: Bool, w1024: Bool) -> U32:
  match w64:
    case True{}:
      (64 : U32)
    case False{}:
      chosen_width.at128(w128, w256, w512, w1024)

def chosen_width.at(w32: Bool, w64: Bool, w128: Bool, w256: Bool, w512: Bool,
  w1024: Bool) -> U32:
  match w32:
    case True{}:
      (32 : U32)
    case False{}:
      chosen_width.at64(w64, w128, w256, w512, w1024)

# A width with no size here is 128: the shipped size, and the only one measured as
# a whole frame rather than as a render plus a tick.
def size_of_width(width: U32) -> Size:
  match width:
    case 32:
      size_32()
    case 64:
      size_64()
    case 256:
      size_256()
    case 512:
      size_512()
    case 1024:
      size_1024()
    case _:
      size_128()

# More than one flag is a mistake rather than a request, and the smallest match
# wins because a window that misses the tick is the one a player cannot un-choose
# once the window is up.
def mentioned_sizes.at(a32: List<&1, String>, a64: List<&1, String>,
  a128: List<&1, String>, a256: List<&1, String>, a512: List<&1, String>,
  a1024: List<&1, String>) -> U32:
  chosen_width.at(mentions(a32, flag_of(size_32())), mentions(a64, flag_of(size_64())),
    mentions(a128, flag_of(size_128())), mentions(a256, flag_of(size_256())),
    mentions(a512, flag_of(size_512())), mentions(a1024, flag_of(size_1024())))

def width_arg() -> IO(Size):
  do IO<Size>:
    a32 : List<&1, String> <- IO.args()
    a64 : List<&1, String> <- IO.args()
    a128 : List<&1, String> <- IO.args()
    a256 : List<&1, String> <- IO.args()
    a512 : List<&1, String> <- IO.args()
    a1024 : List<&1, String> <- IO.args()
    return size_of_width(mentioned_sizes.at(a32, a64, a128, a256, a512, a1024))

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

# `F` digs from the keyboard and the left button digs from the mouse; `E` is the inventory's
# key (`Screen.key`), as in the game this one is modelled on.
def dig_code() -> U32:
  102

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

def wants_dig(+previous: U32, +keys: U32) -> Bool:
  Bool.or(edge_of(keys, previous, dig_code()), edge(keys, previous, Frame.left_bit()))

def wants_place(+previous: U32, +keys: U32) -> Bool:
  Bool.or(edge_of(keys, previous, place_code()), edge(keys, previous, Frame.right_bit()))

def wants_save(previous: U32, keys: U32) -> Bool:
  edge_of(keys, previous, save_code())

def wants_quit(keys: U32) -> Bool:
  U32.is_eq(U32.and(keys, bit_of(escape_code())), bit_of(escape_code()))

# Escape asks to leave; the window manager's own close is noticed while the
# events are shared and quits just the same.
#
# Escape is read as the press it is, and not while the inventory screen is open: there it
# closes the screen, and a key still held on the tick after must not then close the client.
def quitting_from(closing: Bool, previous: U32, keys: U32, screen: Bool) -> Bool:
  Bool.or(closing, Bool.and(Bool.not(screen), edge_of(keys, previous, escape_code())))

# --- targeting ---------------------------------------------------------------

# `Player.raycast` answers in the encoded window, so the aim state is rebuilt
# from the pose instead of taking the player the tick owns.
#
# The eye goes back into that window by the origin the pose was taken from,
# `Frame.origin_x`, and not by the region's own origin. The two were the same number
# while the collision region started at the pose's chunk; the region now starts a chunk
# earlier, and reading its origin here aimed sixteen cells away from where the player
# was looking.
def aim_cast(+pose: Frame.Pose, +blocks: List<&2, List<&2, U32>>, +origin_x: Nat, +origin_y: Nat,
  +origin_z: Nat, +width: Nat, +height: Nat, +depth: Nat) -> Player.RayResult:
  +eye = Frame.eye_of(pose)
  +x = F32.add(Frame.eye_x(eye), F32.from_nat(Frame.origin_x()))
  +y = F32.sub(Frame.eye_y(eye), Frame.eye_height())
  +z = F32.add(Frame.eye_z(eye), F32.from_nat(Frame.origin_z()))
  Player.raycast(Player.state(x, y, z, Frame.yaw_of(pose), Frame.pitch_of(pose), 0.0,
    False{}, 20.0, 20.0), blocks, origin_x, origin_y, origin_z, width, height, depth)

def aimed(+pose: Frame.Pose, region: PlayerProbe.Region) -> Player.RayResult:
  PlayerProbe.Region{+blocks, +origin_x, +origin_y, +origin_z, +width, +height, +depth} = region
  aim_cast(pose, blocks, origin_x, origin_y, origin_z, width, height, depth)

# --- edits -------------------------------------------------------------------

# What a tick's action left: the edit log and the bag, both as the rules answered.
type Turn is Data:
  Turn{edits: List<&2, WorldState.Edit>, bag: Bag.Bag}

def turn_edits(turn: Turn) -> List<&2, WorldState.Edit>:
  Turn{edits, bag} = turn
  edits

def turn_bag(turn: Turn) -> Bag.Bag:
  Turn{edits, bag} = turn
  bag

def turn.applied(ok: Bool, edit: WorldState.Edit, +edits: List<&2, WorldState.Edit>,
  bag: Bag.Bag) -> Turn:
  match ok:
    case True{}:
      WorldState.Edit{x, y, z, block} = edit
      Turn{WorldState.set(edits, x, y, z, block), bag}
    case False{}:
      Turn{edits, bag}

# The rules' answer, applied: the edit joins the log only when the rules allowed the
# action, and the bag is the slots they handed back either way.
def turn.done(result: Inventory.InteractionResult, bag: Bag.Bag,
  +edits: List<&2, WorldState.Edit>) -> Turn:
  Inventory.InteractionResult{edit, slots, ok} = result
  turn.applied(ok, edit, edits, Bag.with_slots(bag, slots))

# The turn after a dig, with the chest or the furnace that stood in the cell forgotten when
# the cell is now air.
def dig.cleared(turn: Turn, +block: U32, +x: Nat, +y: Nat, +z: Nat) -> Turn:
  Turn{+edits, +bag} = turn
  Turn{edits, Bool.pick(Bag.Bag, U32.is_eq(WorldState.block(edits, Frame.seed(), x, y, z), 0),
    Bag.with_store(bag, Stores.forgot(Bag.store_of(bag), block, x, y, z)), bag)}

def dig.cell(locked: Bool, +block: U32, +x: Nat, +y: Nat, +z: Nat, +edits: List<&2, WorldState.Edit>,
  +bag: Bag.Bag) -> Turn:
  match locked:
    case True{}:
      Turn{edits, bag}
    case False{}:
      dig.cleared(turn.done(Bag.mined(bag, block, x, y, z), bag, edits), block, x, y, z)

# Digging takes the block the ray hit, with what is in hand, and the rules decide whether
# it comes away and what lands in the bag. A chest that still holds something stays.
def dig.at(mx: Maybe<&1, Nat>, mz: Maybe<&1, Nat>, +y: Nat, +edits: List<&2, WorldState.Edit>,
  +bag: Bag.Bag) -> Turn:
  match mx mz:
    case Some{+sx} Some{+sz}:
      dig.cell(Stores.locked(Bag.store_of(bag), WorldState.block(edits, Frame.seed(), sx, y, sz), sx, y, sz),
        WorldState.block(edits, Frame.seed(), sx, y, sz), sx, y, sz, edits, bag)
    case _ _:
      Turn{edits, bag}

# Building puts what is in hand in the cell the ray says the hit face opens onto, and
# touches no other cell. It used to dig the cell it hit as well, on the theory that the two
# actions should agree about the hit: that is the block beside, below or behind the new one
# vanishing every time a block was placed.
def place.at(has_place: Bool, mx: Maybe<&1, Nat>, mz: Maybe<&1, Nat>, +y: Nat,
  +edits: List<&2, WorldState.Edit>, +bag: Bag.Bag, overlaps: Bool) -> Turn:
  match has_place mx mz:
    case True{} Some{+sx} Some{+sz}:
      turn.done(Bag.placed(bag, sx, y, sz,
          U32.is_eq(WorldState.block(edits, Frame.seed(), sx, y, sz), 0), overlaps),
        bag, edits)
    case _ _ _:
      Turn{edits, bag}

def dug(result: Player.RayResult, +edits: List<&2, WorldState.Edit>, +bag: Bag.Bag) -> Turn:
  match result:
    case Player.NoHit{}:
      Turn{edits, bag}
    case Player.Hit{hit_x, hit_y, hit_z, place_x, place_y, place_z, has_place}:
      dig.at(stored_cell.of(hit_x), stored_cell.of(hit_z), hit_y, edits, bag)

# The world's id for a crafting table.
def table_block() -> U32:
  27

# The screen a block opens under the place key, or 0. They open in a room as out of one: a
# room's chest is the room's, and its screen asks the room for each move (`Stores`).
def opens(+block: U32, shared: Bool) -> U32:
  Bool.pick(U32, U32.is_eq(block, table_block()), Screen.table(),
    Bool.pick(U32, U32.is_eq(block, Stores.chest_block()), Screen.chest(),
      Bool.pick(U32, U32.is_eq(block, Stores.furnace_block()), Screen.furnace(), 0)))

# The place key on a block with a screen opens it, and places nothing; on anything else it
# places what is in hand beside the block the ray hit.
def built.used(opening: Bool, +mode: U32, +x: Nat, +y: Nat, +z: Nat, has_place: Bool, +place_x: Nat,
  +place_y: Nat, +place_z: Nat, +edits: List<&2, WorldState.Edit>, +bag: Bag.Bag, player: Player.State,
  +size: U32) -> Turn:
  match opening:
    case True{}:
      Turn{edits, Screen.opened_at(bag, mode, x, y, z, size)}
    case False{}:
      place.at(has_place, stored_cell.of(place_x), stored_cell.of(place_z), place_y, edits,
        bag, Player.overlaps(player, place_x, place_y, place_z))

def built.at(mx: Maybe<&1, Nat>, mz: Maybe<&1, Nat>, +y: Nat, has_place: Bool, +place_x: Nat,
  +place_y: Nat, +place_z: Nat, +edits: List<&2, WorldState.Edit>, +bag: Bag.Bag, player: Player.State,
  +size: U32, +shared: Bool) -> Turn:
  match mx mz:
    case Some{+sx} Some{+sz}:
      built.used(U32.is_ne(opens(WorldState.block(edits, Frame.seed(), sx, y, sz), shared), 0),
        opens(WorldState.block(edits, Frame.seed(), sx, y, sz), shared), sx, y, sz, has_place, place_x,
        place_y, place_z, edits, bag, player, size)
    case _ _:
      place.at(has_place, stored_cell.of(place_x), stored_cell.of(place_z), place_y, edits,
        bag, Player.overlaps(player, place_x, place_y, place_z))

def built(result: Player.RayResult, +edits: List<&2, WorldState.Edit>, +bag: Bag.Bag,
  player: Player.State, +size: U32, +shared: Bool) -> Turn:
  match result:
    case Player.NoHit{}:
      Turn{edits, bag}
    case Player.Hit{hit_x, hit_y, hit_z, +place_x, +place_y, +place_z, has_place}:
      built.at(stored_cell.of(hit_x), stored_cell.of(hit_z), hit_y, has_place, place_x, place_y, place_z,
        edits, bag, player, size, shared)

def acted(+edits: List<&2, WorldState.Edit>, +bag: Bag.Bag, +pose: Frame.Pose,
  region: PlayerProbe.Region, player: Player.State, digging: Bool, building: Bool,
  +size: U32, +shared: Bool) -> Turn:
  match digging building:
    case True{} False{}:
      dug(aimed(pose, region), edits, bag)
    case False{} True{}:
      built(aimed(pose, region), edits, bag, player, size, shared)
    case _ _:
      Turn{edits, bag}

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

# --- the world, one chunk at a time ---------------------------------------------
#
# The view region's faces are kept per chunk, as slabs, and a slab is built from its own
# chunk and nothing else. So an edit rebuilds the one slab it is in, and a region that moved
# a chunk over builds the five slabs that came into view, one a frame: the two things that
# used to rebuild the whole region at once, 21 ms against a 16.67 ms tick when it was nine
# chunks, and were the late frame after every dig and every sixteenth cell walked.
#
# A slab's faces carry the light their corners take (`native/shade.bend`), worked out from
# the same chunk in the same build, so the light costs nothing in a frame.
#
# What makes a slab its own is that its faces are extracted with air outside the chunk, so
# a block on a chunk's edge always has its outward face, whether or not the next chunk has
# a block against it. Those extra faces are between two solid blocks, so nothing can see
# them: any ray that reaches one has already entered the block in front of it through a
# face that is nearer, and the painter writes a pixel once, nearest first. They cost a place
# in the sort and are never painted. Extracting the region as one piece instead leaves them
# out, and then every chunk's faces depend on its four neighbours.

# The edits that fall in one chunk, folded to a word: a slab whose mark still matches was
# built from the same edits. `cx` and `cz` are the chunk as storage spells it, which is how
# an edit's own cells are spelled.
def mark.step(edit: WorldState.Edit, +cx: Nat, +cz: Nat, +hash: U32) -> U32:
  WorldState.Edit{+x, +y, +z, block} = edit
  Bool.pick(U32, Bool.and(Nat.is_eq(Nat.div(x, World.chunk_size()), cx),
      Nat.is_eq(Nat.div(z, World.chunk_size()), cz)),
    U32.mul(U32.xor(U32.mul(U32.xor(U32.mul(U32.xor(U32.mul(U32.xor(hash, U32.from_nat(x)),
      16777619), U32.from_nat(y)), 16777619), U32.from_nat(z)), 16777619), block), 16777619),
    hash)

def mark.go(edits: List<&2, WorldState.Edit>, +cx: Nat, +cz: Nat, +hash: U32) -> U32:
  match edits:
    case Nil{}:
      hash
    case edit <> rest:
      mark.go(rest, cx, cz, mark.step(edit, cx, cz, hash))

# `x` and `z` are window chunks.
def mark_of(edits: List<&2, WorldState.Edit>, +x: Nat, +z: Nat) -> U32:
  mark.go(edits, PlayerProbe.stored_chunk(x), PlayerProbe.stored_chunk(z), 2166136261)

def slab_built(+x: Nat, +z: Nat, +edits: List<&2, WorldState.Edit>) -> Slab:
  Slab{x, z, mark_of(edits, x, z),
    Shade.faces_from_chunk(WorldState.chunk(Frame.seed(), PlayerProbe.stored_chunk(x),
      PlayerProbe.stored_chunk(z), edits))}

def slab_is(slab: Slab, +x: Nat, +z: Nat, +mark: U32) -> Bool:
  Slab{sx, sz, smark, faces} = slab
  Bool.and(Bool.and(Nat.is_eq(sx, x), Nat.is_eq(sz, z)), U32.is_eq(smark, mark))

# What walking the region's chunks left: the slabs it has, how many more it may still
# build this frame, and whether anything is not as it was.
type Kept is Data:
  Kept{slabs: List<&2, Slab>, budget: Nat, changed: Bool}

def slab_pick(found: Bool, slab: Slab, later: Maybe<&2, Slab>) -> Maybe<&2, Slab>:
  match found:
    case True{}:
      Some{slab}
    case False{}:
      later

def slab_find(slabs: List<&2, Slab>, +x: Nat, +z: Nat, +mark: U32) -> Maybe<&2, Slab>:
  match slabs:
    case Nil{}:
      None{}
    case +slab <> rest:
      slab_pick(slab_is(slab, x, z, mark), slab, slab_find(rest, x, z, mark))

# One wanted chunk: the slab already held for it, or a new one while the frame's budget
# lasts, or nothing this frame.
def slab_wanted(held: Maybe<&2, Slab>, kept: Kept, +x: Nat, +z: Nat,
  +edits: List<&2, WorldState.Edit>) -> Kept:
  match held kept:
    case Some{slab} Kept{slabs, budget, changed}:
      Kept{slab <> slabs, budget, changed}
    case None{} Kept{slabs, 0n, changed}:
      Kept{slabs, 0n, True{}}
    case None{} Kept{slabs, 1n+left, changed}:
      Kept{slab_built(x, z, edits) <> slabs, left, True{}}

def slabs.go(remaining: Nat, +index: Nat, +hx: Nat, +hz: Nat, +old: List<&2, Slab>,
  +edits: List<&2, WorldState.Edit>, kept: Kept) -> Kept:
  match remaining:
    case 0n:
      kept
    case 1n+r:
      +x = Nat.add(hx, Nat.mod(index, Frame.view_columns()))
      +z = Nat.add(hz, Nat.div(index, Frame.view_columns()))
      slabs.go(r, Nat.add(index, 1n), hx, hz, old, edits,
        slab_wanted(slab_find(old, x, z, mark_of(edits, x, z)), kept, x, z, edits))

# A slab's faces moved into the region's cells and put in front of `acc`.
def merge.faces(faces: List<&2, Face.Face>, +dx: U32, +dz: U32,
  acc: List<&2, Face.Face>) -> List<&2, Face.Face>:
  match faces:
    case Nil{}:
      acc
    case Face.Face{x, y, z, dir, block} <> rest:
      merge.faces(rest, dx, dz, Face.Face{U32.add(x, dx), y, U32.add(z, dz), dir, block} <> acc)

def merge.go(slabs: List<&2, Slab>, +hx: Nat, +hz: Nat,
  acc: List<&2, Face.Face>) -> List<&2, Face.Face>:
  match slabs:
    case Nil{}:
      acc
    case Slab{x, z, mark, faces} <> rest:
      merge.go(rest, hx, hz, merge.faces(faces,
        U32.from_nat(Nat.mul(Nat.sub(x, hx), World.chunk_size())),
        U32.from_nat(Nat.mul(Nat.sub(z, hz), World.chunk_size())), acc))

def merged(+slabs: List<&2, Slab>, +edits: List<&2, WorldState.Edit>, +home: Frame.Home) -> World:
  World{merge.go(slabs, Frame.home_x(home), Frame.home_z(home), []), edits, home, slabs}

def world_changed(changed: Bool, slabs: List<&2, Slab>, world: World,
  edits: List<&2, WorldState.Edit>, home: Frame.Home) -> World:
  match changed:
    case True{}:
      merged(slabs, edits, home)
    case False{}:
      world

# The world after the walk. Nothing changed and it is the world it was, list and all; else
# the slabs are merged again into the list the painter reads.
def world_kept(kept: Kept, +world: World, +edits: List<&2, WorldState.Edit>,
  +home: Frame.Home, moved: Bool) -> World:
  Kept{slabs, budget, changed} = kept
  world_changed(Bool.or(changed, moved), slabs, world, edits, home)

def region_cells_wide() -> Nat:
  Nat.mul(Frame.view_columns(), Frame.view_rows())

# The world for this frame: every slab still wanted is kept, and at most `budget` of the
# missing ones are built.
def world_with(+budget: Nat, +world: World, +edits: List<&2, WorldState.Edit>,
  +home: Frame.Home) -> World:
  world_kept(slabs.go(region_cells_wide(), 0n, Frame.home_x(home), Frame.home_z(home),
      w_slabs(world), edits, Kept{[], budget, False{}}),
    world, edits, home, Bool.not(Frame.same_home(w_home(world), home)))

# One slab a frame: a slab is about 2.5 ms to build and merge, which a frame has room for
# and five would not have. A chunk that has just come into view at the region's far edge is
# missing for a few frames before it is terrain, and that edge is past where the air has
# already hidden most of what is there.
def world_for(+world: World, +edits: List<&2, WorldState.Edit>, +home: Frame.Home) -> World:
  world_with(1n, world, edits, home)

# The whole region at once, which is what the client starts on.
def world_built(+edits: List<&2, WorldState.Edit>, +home: Frame.Home) -> World:
  world_with(region_cells_wide(), World{[], edits, home, []}, edits, home)

# The frame at an explicit depth, so the benchmark can measure the sizes the client
# might ship at without restating the render call.
#
# `Paint` draws the window, under the overlay `Hud` makes of the bag, and `Face` still
# answers the pointer's ray and is what `native/paint_test.bend` holds the painter against.
# The slabs as the painter takes them: each chunk's faces, in the chunk's own cells, beside
# where the chunk is in the region. The painter tests a chunk's box before it reads a face of
# it, and does the chunks it keeps at the same time.
def groups.go(slabs: List<&2, Slab>, +hx: Nat, +hz: Nat,
  acc: List<&2, Paint.Group>) -> List<&2, Paint.Group>:
  match slabs:
    case Nil{}:
      acc
    case Slab{x, z, mark, faces} <> rest:
      groups.go(rest, hx, hz,
        Paint.Group{U32.from_nat(Nat.mul(Nat.sub(x, hx), World.chunk_size())),
          U32.from_nat(Nat.mul(Nat.sub(z, hz), World.chunk_size())), True{}, faces} <> acc)

def w_groups(+world: World) -> List<&2, Paint.Group>:
  groups.go(w_slabs(world), Frame.home_x(w_home(world)), Frame.home_z(w_home(world)), [])

# How far the region's first cell is from the world's, along one axis: what a cell of the
# region is added to for its place in the world, which is where the clouds are.
def region_shift(home_chunk: Nat) -> F32:
  F32.from_nat(Nat.mul(home_chunk, World.chunk_size()))

# How far the movement window's first cell is from the world's origin. The player's own
# coordinates count from the window's first cell and a room's from the world's origin, which
# is the cell of world chunk 0.
def window_origin() -> F32:
  F32.from_nat(Nat.mul(PlayerProbe.window_origin_chunk(), World.chunk_size()))

# A room's other players as the painter takes them: where each stands in the region's own
# cells. `shift_x` and `shift_z` are the region's first cell in the world's coordinates.
def bodies.go(others: List<&2, Net.Other>, +shift_x: F32, +shift_z: F32,
  +acc: List<&2, Body.Body>) -> List<&2, Body.Body>:
  match others:
    case Nil{}:
      acc
    case Net.Other{id, name, Net.Place{x, y, z, yaw, pitch}, seen} <> rest:
      bodies.go(rest, shift_x, shift_z,
        Bool.pick(List<&2, Body.Body>, seen,
          Body.Body{Body.player_kind(), F32.sub(x, shift_x), y, F32.sub(z, shift_z), yaw} <> acc, acc))

# What the room simulates, the same way: a thing's kind is already the painter's.
def things.go(things: List<&2, Net.Thing>, +shift_x: F32, +shift_z: F32,
  acc: List<&2, Body.Body>) -> List<&2, Body.Body>:
  match things:
    case Nil{}:
      acc
    case Net.Thing{id, kind, count, x, y, z, yaw} <> rest:
      things.go(rest, shift_x, shift_z,
        Body.Body{kind, F32.sub(x, shift_x), y, F32.sub(z, shift_z), yaw} <> acc)

def bodies.at(others: List<&2, Net.Other>, things: List<&2, Net.Thing>, +shift_x: F32,
  +shift_z: F32) -> List<&2, Body.Body>:
  things.go(things, shift_x, shift_z, bodies.go(others, shift_x, shift_z, []))

def bodies(others: List<&2, Net.Other>, things: List<&2, Net.Thing>,
  home: Frame.Home) -> List<&2, Body.Body>:
  Frame.Home{hx, hz} = home
  bodies.at(others, things, F32.sub(region_shift(hx), window_origin()),
    F32.sub(region_shift(hz), window_origin()))

# How far over a player's feet its name is written: a little clear of its hair.
def tag_height() -> F32:
  2.2

# The names of the room's other players, each over where its player's head is in the
# region's cells. A player the room has not placed has nowhere to be named.
def labels.go(others: List<&2, Net.Other>, +shift_x: F32, +shift_z: F32,
  +acc: List<&2, Tag.Label>) -> List<&2, Tag.Label>:
  match others:
    case Nil{}:
      acc
    case Net.Other{id, name, Net.Place{x, y, z, yaw, pitch}, seen} <> rest:
      labels.go(rest, shift_x, shift_z,
        Bool.pick(List<&2, Tag.Label>, seen,
          Tag.Label{name, F32.sub(x, shift_x), F32.add(y, tag_height()), F32.sub(z, shift_z)} <> acc, acc))

def labels(others: List<&2, Net.Other>, home: Frame.Home) -> List<&2, Tag.Label>:
  Frame.Home{hx, hz} = home
  labels.go(others, F32.sub(region_shift(hx), window_origin()),
    F32.sub(region_shift(hz), window_origin()), [])

# The frame with a room's other players, mobs, villagers and dropped items in it, at the
# room's hour. The players' names are part of the overlay, under the hotbar and the hand. `clock` is the
# client's own ticks, which is where the clouds are, and `hour` the clock the sun is read
# from.
def image_among(+world: World, +pose: Frame.Pose, +depth: Nat, +bag: Bag.Bag, +health: U32,
  +food: U32, +clock: U32, +hour: U32, +others: List<&2, Net.Other>,
  things: List<&2, Net.Thing>, +mining: U32) -> Image:
  +eye = Frame.view_eye(Frame.eye_of(pose), w_home(world))
  Scenery.paint_among(w_groups(world), eye, Frame.yaw_of(pose), Frame.pitch_of(pose), depth,
    Paint.quads.after(
      Screen.quads(bag, U32.shln((1 : U32), depth),
        Hud.progress(mining, U32.shln((1 : U32), depth),
          Hud.overlay(bag, U32.shln((1 : U32), depth), health, food))),
      Tag.quads(labels(others, w_home(world)), eye, Frame.yaw_of(pose), Frame.pitch_of(pose), depth,
        Paint.QNil{})),
    region_shift(Frame.home_x(w_home(world))),
    region_shift(Frame.home_z(w_home(world))), clock, hour,
    bodies(others, things, w_home(world)))

def image_at(+world: World, +pose: Frame.Pose, +depth: Nat, bag: Bag.Bag, +health: U32,
  +food: U32, +clock: U32) -> Image:
  image_among(world, pose, depth, bag, health, food, clock, clock, [], [], 0)

# The frame at the hour a session starts, which is the one the benchmark prices.
def image_at_depth(+world: World, +pose: Frame.Pose, +depth: Nat, bag: Bag.Bag, +health: U32,
  +food: U32) -> Image:
  image_at(world, pose, depth, bag, health, food, Sky.clock_start())

# The player's health and hunger as whole points, which is what the overlay counts in.
def points(+value: F32) -> U32:
  F32.to_u32(F32.ceil(F32.max(value, 0.0)))

def image_of(+world: World, +pose: Frame.Pose, size: Size, bag: Bag.Bag,
  player: Player.State, +clock: U32, +hour: U32, others: List<&2, Net.Other>,
  things: List<&2, Net.Thing>, mining: U32) -> Image:
  Player.State{x, y, z, yaw, pitch, velocity_y, grounded, health, hunger, air, fall,
    poison} = player
  image_among(world, pose, depth_of(size), bag, points(health), points(hunger), clock, hour,
    others, things, mining)

# A room's hour, as the client holds it. The room says how far round its day it is and how
# long its day lasts, when the client joins and when someone calls the morning. That is
# `Heard`, until the next tick reads the time and it becomes `Running`: the clock it was at
# `start`, when that was, and the clock now, which every tick works out again from how long
# ago that was. So the hour follows the room's own rate without being told again, and a late
# frame does not put it behind.
type Hour is Data:
  Unheard{}
  Heard{turn: U32, length: U32}
  Running{clock: U32, start: U32, length: U32, at: Nat}

# The hour at the time `now`, in milliseconds as `IO.now` counts them.
def hour.at(hour: Hour, +now: Nat) -> Hour:
  match hour:
    case Unheard{}:
      Unheard{}
    case Heard{+turn, length}:
      Running{Sky.clock_of_turn(turn), Sky.clock_of_turn(turn), length, now}
    case Running{clock, +start, +length, +at}:
      Running{Sky.clock_after(start, U32.from_nat(Nat.sub(now, at)), length), start, length, at}

# The clock the sun is read from: the room's once it has said, and the client's own until.
def hour.clock(hour: Hour, own: U32) -> U32:
  match hour:
    case Running{clock, start, length, at}:
      clock
    case Heard{turn, length}:
      own
    case Unheard{}:
      own

def hour.running(hour: Hour) -> Bool:
  match hour:
    case Running{clock, start, length, at}:
      True{}
    case Heard{turn, length}:
      False{}
    case Unheard{}:
      False{}

# The client's frame with what else is in a room's world in it, at the room's hour.
def view_among(state: Client, others: List<&2, Net.Other>, hour: Hour,
  things: List<&2, Net.Thing>) -> Client & Image:
  Client{+player, +pose, keys, hosted, +edits, region, path, +world, +size, +bag, +home, +clock, +dig} = state
  +next : World = world_for(world, edits, home)
  (Client{player, pose, keys, hosted, edits, region, path, next, size, bag, home, clock, dig},
    image_of(next, pose, size, bag, player, clock, hour.clock(hour, clock), others, things,
      dig_progress(dig)))

def view(state: Client) -> Client & Image:
  view_among(state, [], Unheard{}, [])

# --- the collision region ------------------------------------------------------
#
# What the player collides with and aims through: two chunks by two around the player,
# placed by `Frame.den_for` so the player is always at least six cells inside it. It is
# smaller than the view region because the player only touches what is near, and it is
# rebuilt whole whenever the edit log changes: at two by two that is under half what three
# by three cost. It is built from the edit log, so it has to be built again when the log
# changes, or a dug block stays in the way after it has left the frame.
def den_start() -> Frame.Home:
  Frame.den_for(Frame.Home{0n, 0n}, Frame.initial_player())

def collision_region(+edits: List<&2, WorldState.Edit>, den: Frame.Home) ->
  Maybe<&1, PlayerProbe.Region>:
  Frame.Home{x, z} = den
  PlayerProbe.checked_window_region(Frame.seed(), x, z, 2n, 2n, edits)

# Where a region is: its first window chunk on each axis.
def den_of(region: PlayerProbe.Region) -> Frame.Home:
  PlayerProbe.Region{blocks, origin_x, origin_y, origin_z, width, height, depth} = region
  Frame.Home{Nat.div(origin_x, World.chunk_size()), Nat.div(origin_z, World.chunk_size())}

def region_or(maybe: Maybe<&1, PlayerProbe.Region>, old: PlayerProbe.Region) ->
  PlayerProbe.Region:
  match maybe:
    case Some{region}:
      region
    case None{}:
      old

# A region the storage encoding cannot name is refused, and the old one stands: that is
# the far edge of the world, and the player meets it as a wall.
def region_for(unchanged: Bool, old: PlayerProbe.Region,
  +edits: List<&2, WorldState.Edit>, den: Frame.Home) -> PlayerProbe.Region:
  match unchanged:
    case True{}:
      old
    case False{}:
      region_or(collision_region(edits, den), old)

# The region for the player the tick just moved: the same one while the log is the same
# and the player is still well inside it.
def region_after(+old: PlayerProbe.Region, +before: List<&2, WorldState.Edit>,
  +after: List<&2, WorldState.Edit>, +den: Frame.Home) -> PlayerProbe.Region:
  region_for(Bool.and(same_edits(before, after), Frame.same_home(den_of(old), den)), old,
    after, den)

# --- the tick ----------------------------------------------------------------
#
# The three decisions are taken once, from the previous held-key mask against the
# one this tick's events produce, and then handed down as plain booleans: a mask
# is consumed by the fold, so it cannot be consulted again further down.
#
# The tick answers with `Nothing` to leave, which is how `App.loop` ends: the app
# stops when the tick hands back no client, so a quit needs no separate flag and no
# fuel of its own.

# What the player carries and the world's chests and furnaces are saved beside the world,
# in a file of their own (`native/stash.bend`): the world's is a format other saves migrate
# into, and a bag is not part of it.
def stash_path(path: String) -> String:
  path ++ ".bag"

def tick.acting(player: Player.State, pose: Frame.Pose, +mask: U32, +hosted: Bool,
  +edits: List<&2, WorldState.Edit>, region: PlayerProbe.Region, +path: String,
  +world: World, +size: Size, +bag: Bag.Bag, home: Frame.Home, +clock: U32, dig: Dig,
  saving: Bool) -> IO(Maybe<Client>):
  match saving:
    case True{}:
      do IO<Maybe<Client>>:
        written : Unit <- save_text.at(path, Migration.encode(Migration.Snapshot{Frame.seed(), edits}))
        stashed : Unit <- save_text.at(stash_path(path), Stash.encode(Screen.closed(bag)))
        return Some{Client{player, pose, mask, hosted, edits, region, path, world, size, bag,
          home, clock, dig}}
    case False{}:
      IO.pure(Maybe<Client>,
        Some{Client{player, pose, mask, hosted, edits, region, path, world, size, bag, home,
          clock, dig}})

def tick.quitting(quitting: Bool, player: Player.State, pose: Frame.Pose, +mask: U32,
  +hosted: Bool, edits: List<&2, WorldState.Edit>, region: PlayerProbe.Region,
  path: String, +world: World, +size: Size, bag: Bag.Bag, home: Frame.Home, +clock: U32,
  dig: Dig, saving: Bool) -> IO(Maybe<Client>):
  match quitting:
    case True{}:
      IO.pure(Maybe<Client>, None{})
    case False{}:
      tick.acting(player, pose, mask, hosted, edits, region, path, world, size, bag, home,
        clock, dig, saving)

def tick.decided(acts: Turn, staged: Frame.Staged, +mask: U32,
  +hosted: Bool, region: PlayerProbe.Region, path: String, +world: World,
  +size: Size, home: Frame.Home, +clock: U32, dig: Dig, saving: Bool,
  quitting: Bool) -> IO(Maybe<Client>):
  Turn{edits, bag} = acts
  Frame.Staged{player, pose, changed} = staged
  tick.quitting(quitting, player, pose, mask, hosted, edits, region, path, world, size, bag,
    home, clock, dig, saving)

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

# The accumulator is prepended, so it comes out backwards and is reversed once at the
# end. Sharing is one way: the events arrive as a `List<&1, Event>` and the fold reads
# them as a `List<&2, Event>`, and each head is shared into the accumulator on the way.
#
# The order has to survive the pass because the fold reads it. `Window.frame` can hand
# a tick a press and the release of the same key together, and folding that pair
# backwards ends on the press: the key reads held with its release already spent, so
# it sticks for the rest of the session.
def share_events.go(events: List<&1, Event>, acc: List<&2, Event>, closing: Bool) -> Folded:
  match events:
    case Nil{}:
      Folded{List.reverse(&2, Event, acc), closing}
    case +h <> t:
      share_events.go(t, h <> acc, closer(closing, h))

def share_events(events: List<&1, Event>) -> Folded:
  share_events.go(events, Nil{}, False{})

# --- digging takes time ---------------------------------------------------------
#
# What a tick of holding the dig button came to: the dig as it now stands, and whether the
# block comes away this tick.
type Mined is Data:
  Mined{dig: Dig, breaks: Bool}

def mined_dig(mined: Mined) -> Dig:
  Mined{dig, breaks} = mined
  dig

def mined_breaks(mined: Mined) -> Bool:
  Mined{dig, breaks} = mined
  breaks

def block_struck(mx: Maybe<&1, Nat>, mz: Maybe<&1, Nat>, +y: Nat, +edits: List<&2, WorldState.Edit>) -> U32:
  match mx mz:
    case Some{sx} Some{sz}:
      WorldState.block(edits, Frame.seed(), sx, y, sz)
    case _ _:
      0

# One more tick on a block: the time so far carries over when it is the cell the last tick
# dug, and starts again when it is another. A block the hand cannot break gets nowhere.
def mining.block(+block: U32, +x: Nat, +y: Nat, +z: Nat, dig: Dig, +item: U32) -> Mined:
  Dig{dx, dy, dz, done, need} = dig
  +so_far = F32.add(
    Bool.pick(F32, Bool.and(Bool.and(Nat.is_eq(x, dx), Nat.is_eq(y, dy)), Nat.is_eq(z, dz)), done, 0.0),
    Frame.tick_dt())
  Bool.pick(Mined, Bool.and(U32.is_ne(block, 0), Inventory.can_mine(item, block)),
    Bool.pick(Mined, F32.is_ge(so_far, Inventory.mining_duration(item, block)),
      Mined{resting(), True{}},
      Mined{Dig{x, y, z, so_far, Inventory.mining_duration(item, block)}, False{}}),
    Mined{resting(), False{}})

def mining.hit(result: Player.RayResult, dig: Dig, +edits: List<&2, WorldState.Edit>, +item: U32) -> Mined:
  match result:
    case Player.NoHit{}:
      Mined{resting(), False{}}
    case Player.Hit{+hit_x, +hit_y, +hit_z, place_x, place_y, place_z, has_place}:
      mining.block(block_struck(stored_cell.of(hit_x), stored_cell.of(hit_z), hit_y, edits), hit_x, hit_y,
        hit_z, dig, item)

# The dig after one tick. With the button up there is none; held, the ray is cast and the
# block it meets is a tick nearer to coming away.
def mining(holding: Bool, dig: Dig, +pose: Frame.Pose, region: PlayerProbe.Region,
  +edits: List<&2, WorldState.Edit>, +item: U32) -> Mined:
  match holding:
    case False{}:
      Mined{resting(), False{}}
    case True{}:
      mining.hit(aimed(pose, region), dig, edits, item)

# Whether the dig button is down: the left button or the dig key, as a level.
def digging(+mask: U32) -> Bool:
  Bool.or(U32.is_eq(U32.and(mask, Frame.left_bit()), Frame.left_bit()),
    U32.is_eq(U32.and(mask, bit_of(dig_code())), bit_of(dig_code())))

# Out of a room the furnaces step here; in one they are the room's, and the store says so
# before the screen reads it.
def bag_ticked(roomed: Bool, +bag: Bag.Bag) -> Bag.Bag:
  match roomed:
    case True{}:
      Bag.with_store(bag, Stores.roomed(Bag.store_of(bag)))
    case False{}:
      Bag.with_store(bag, Stores.ticked(Bag.store_of(bag)))

# The turn with the screens' own tick applied to its bag, and the furnaces stepped.
def screened(turn: Turn, +previous: U32, +mask: U32, +dx: F32, +dy: F32, +size: U32,
  roomed: Bool) -> Turn:
  Turn{edits, bag} = turn
  Turn{edits, Screen.step(bag_ticked(roomed, bag), previous, mask, dx, dy, size)}

# The mask is read off that fold for the edge decisions, and the player transition
# and the pose come from the probe's own `advance`, so no rule is asked twice.
#
# `text` is what the host's pointer wrote since the last frame. `Pointer.events` decides what
# the fold reads: the host's one `Look` in place of the display's pointer events when the
# pointer is hosted, and the display's own events when it is not.
def tick.folded(folded: Folded, text: String, +player: Player.State, +pose: Frame.Pose,
  +keys: U32, +hosted: Bool, +edits: List<&2, WorldState.Edit>,
  +region: PlayerProbe.Region, path: String, +world: World,
  +size: Size, +bag: Bag.Bag, +home: Frame.Home, +clock: U32, dig: Dig,
  +guarded: Bool, +roomed: Bool) -> IO(Maybe<Client>):
  Folded{shared, closing} = folded
  +heard : List<&2, Event> = Pointer.events(hosted, text, shared)
  # With the inventory screen open the player stands still and looks nowhere: the same
  # events move the screen's arrow and click its slots instead, and the body is stepped
  # with nothing held. The mask is still folded from every event, because the screen reads
  # its keys and buttons as edges of it, and so does the tick after the screen closes.
  +screen = Bag.is_open(bag)
  +folded_keys : Frame.Keys = Frame.input_from(heard, keys)
  +events : List<&2, Event> = Bool.pick(List<&2, Event>, screen, [], heard)
  # Seeded with `keys`, the mask the previous tick ended with. `Window.frame` hands a
  # tick only the events that arrived during that frame, so a frame with no key event
  # is the ordinary frame of a held key: folding from zero made movement ride X11's
  # auto-repeat instead of the loop, and made the action edges below fire on every
  # repeat rather than once per press. See `Frame.input_from`.
  +mask : U32 = Frame.keys_mask(folded_keys)
  +staged : Frame.Staged = Frame.advance_holding(player, events, Bool.pick(U32, screen, 0, keys),
    Frame.tick_dt(), region, Frame.origin_x(), Frame.origin_z(), pose)
  # The number keys pick the slot before the action reads it, so a slot chosen and used in
  # the same frame is the one used.
  #
  # `guarded` is a room's mob under the crosshair: the dig key is then a hit on it, which
  # the session sends, and the block behind it is left alone.
  #
  # A block comes away when the dig button has been held on it for as long as the rules say
  # it takes with what is in hand, and not on the press.
  +mined : Mined = mining(Bool.and(digging(mask), Bool.and(Bool.not(guarded), Bool.not(screen))), dig, pose,
    region, edits, Bag.held_item(Bag.selecting(bag, events)))
  # The screen's own tick comes after the action reads the bag, so the press that opens
  # the screen acts on nothing and the click that the screen takes digs nothing.
  +acts : Turn = screened(acted(edits, Bag.selecting(bag, events), pose, region, player,
      mined_breaks(mined),
      Bool.and(wants_place(keys, mask), Bool.not(screen)), width_of(size), roomed),
    keys, mask, Frame.look_dx(folded_keys), Frame.look_dy(folded_keys), width_of(size), roomed)
  # Both regions follow the player the tick just moved. The collision region is rebuilt
  # here when the log changed or the player left its middle; the faces follow in `view`.
  +next_home : Frame.Home = Frame.home_for(home, Frame.staged_player(staged))
  tick.decided(acts, staged, mask, hosted,
    region_after(region, edits, turn_edits(acts),
      Frame.den_for(den_of(region), Frame.staged_player(staged))),
    path, world, size, next_home, U32.add(clock, 1), mined_dig(mined),
    Bool.and(wants_save(keys, mask), Bool.not(screen)), quitting_from(closing, keys, mask, screen))

def tick.heard(text: String, events: List<&1, Event>, state: Client,
  guarded: Bool, shared: Bool) -> IO(Maybe<Client>):
  Client{+player, +pose, +keys, +hosted, edits, +region, path, +world, +size, bag, +home, +clock, dig} = state
  tick.folded(share_events(events), text, player, pose, keys, hosted, edits, region, path,
    world, size, bag, home, clock, dig, guarded, shared)

# The host's pointer is read once per tick, hosted or not: an unopened host has nothing to
# say, so the read is what keeps this one code path.
def tick.guarded(events: List<&1, Event>, state: Client, guarded: Bool) -> IO(Maybe<Client>):
  do IO<Maybe<Client>>:
    text : String <- Pointer.host_read()
    tick.heard(text, events, state, guarded, False{})

# The tick of a client in a room: the world's chests and furnaces are the room's there.
def tick.shared(events: List<&1, Event>, state: Client, guarded: Bool) -> IO(Maybe<Client>):
  do IO<Maybe<Client>>:
    text : String <- Pointer.host_read()
    tick.heard(text, events, state, guarded, True{})

def tick.events(events: List<&1, Event>, state: Client) -> IO(Maybe<Client>):
  tick.guarded(events, state, False{})

# --- start -------------------------------------------------------------------

def start.readied(player: Player.State, +pose: Frame.Pose, +region: PlayerProbe.Region,
  +edits: List<&2, WorldState.Edit>, +path: String, +size: Size) -> IO(Client):
  # The world is built once here, from the edits the save carried, and every later
  # frame reads it back unless the tick changed the log. The bag is the one saved beside
  # the world, or the starting one when there is none.
  +world : World = world_built(edits, Frame.home_start())
  do IO<Client>:
    stash : String <- load_text.at(stash_path(path))
    return Client{player, pose, 0, False{}, edits, region, path, world, size,
      Stash.decode(stash, Bag.start()), Frame.home_start(), Sky.clock_start(), resting()}

def start.placed(+player: Player.State, region: PlayerProbe.Region,
  +edits: List<&2, WorldState.Edit>, +path: String, +size: Size) -> IO(Client):
  pose = Frame.pose(player, Frame.origin_x(), Frame.origin_z())
  start.readied(player, pose, region, edits, path, size)

def start.spawned(maybe: Maybe<&1, Player.State>, region: PlayerProbe.Region,
  +edits: List<&2, WorldState.Edit>, +path: String, +size: Size) -> IO(Client):
  match maybe:
    case Some{player}:
      start.placed(player, region, edits, path, size)
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
  +path: String, +size: Size) -> IO(Client):
  maybe = PlayerProbe.checked_create_player(25n, 25n, 9n)
  start.spawned(maybe, region, edits, path, size)

def start.region(maybe: Maybe<&1, PlayerProbe.Region>, +edits: List<&2, WorldState.Edit>,
  +path: String, +size: Size) -> IO(Client):
  match maybe:
    case Some{region}:
      start.player(region, edits, path, size)
    case None{}:
      IO.die(Client, 1, "native-client: the collision region was refused")

def start.grid(+edits: List<&2, WorldState.Edit>, +size: Size) -> IO(Client):
  region = collision_region(edits, den_start())
  start.region(region, edits, path(), size)

def start.edits_of(text: String, +size: Size) -> IO(Client):
  edits = edits_from(text)
  start.grid(edits, size)

# A save that does not fit the read cap is refused rather than truncated. A
# truncated snapshot fails to decode, which would silently start a new world over
# a real one.
def oversized(cap: Nat, text: String) -> Bool:
  Nat.is_ge(String.length(text), cap)

def start.whole(too_large: Bool, text: String, +size: Size) -> IO(Client):
  match too_large:
    case True{}:
      IO.die(Client, 1, "native-client: the saved world is too large to read")
    case False{}:
      start.edits_of(text, size)

def start.fits(+text: String, +size: Size) -> IO(Client):
  start.whole(oversized(load_cap(), text), text, size)

def start(+size: Size) -> IO(Client):
  do IO<Client>:
    text : String <- load_text.at(path())
    start.fits(text, size)

# The window is opened and driven by hand rather than through `App.run`, because
# `App.run` has nowhere to put the pointer grab. The runtime only raises `Look` deltas
# while the pointer is grabbed, and the grab is also what hides the cursor.
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

# --- a room ----------------------------------------------------------------------
#
# A client started with `--join=host:port` plays in a multiplayer room: the one the browsers
# are in, through the server's native door (`server/native-bridge.mjs`). `native/net.bend` is
# the lines; this is the socket and when it is read.
#
# The room's world is its seed and its edit log, and the client's world is exactly that too,
# so playing together is keeping the two logs the same. Once a tick, before the tick:
#
# - what the client's own tick changed since the room last heard is sent, as edits;
# - whatever the room has said is read, without waiting, and every cell it names is set.
#
# The client does not wait to be told its own dig was accepted: it has already dug, and the
# room sends the cell back to everyone, the sender included. If the room refuses an edit it
# sends back what the cell holds, and the cell goes back to that. The bag is the client's
# own and is not put back: a refused placing costs the item.
#
# The players are shared the same way, in the same exchange. The client says where it is —
# when that changed, and no more than twenty times a second — and the room says where the
# others are, who left, and where this player stands when it refuses a move
# (`world/multiplayer_moves.bend`). The others are kept beside the socket and handed to the
# view, which draws them (`native/body.bend`) and writes each one's name over its head
# (`native/tag.bend`).
#
# The hour is the room's too: its sun, its light and its night, which are the browsers'. The
# clouds keep the client's own pace.
#
# What the room simulates is drawn where the room says it is: its mobs, its villagers and
# the items on its ground, told whole five times a second and swapped when the list is
# complete (`Net.Sights`).
#
# The player acts on them through the room, as a browser does. The dig key with a mob under
# the crosshair, within `MultiplayerMobs.melee_range`, is a hit on it for
# `Inventory.melee_damage` of what is in hand, and the block behind is left alone; which
# mob that is, is `Entities.aim_distance`'s answer. An item on the ground within reach
# (`Entities.nearest_drop`) that the bag has room for is asked for, and joins the bag when
# the room hands it over. What a mob does to the player arrives as an amount and is
# `Player.damage`; a player it kills starts again at the spawn. The room judges every one
# of these from the pose it holds. Chests are not shared yet.
#
# A joined client starts from the room's log and not from its own save, and `T` writes
# another file, so a room never overwrites a single-player world.

# What the client knows of the room beside its cells: the other players as the room last
# placed them, the pose line it last sent, how many ticks it waits before it may send
# another, the room's hour, what the room simulates, the lines the last tick left to say,
# and how many ticks it rests before it asks for another item.
type Peers is Data:
  Peers{others: List<&2, Net.Other>, told: String, wait: U32, hour: Hour, sights: Net.Sights,
    say: String, rest: U32}

type Link is Type:
  Alone{}
  Online{socket: Socket, buffer: String, known: List<&2, WorldState.Edit>, peers: Peers}

type Session is Type:
  Session{client: Client, link: Link}

def room_path() -> String:
  "native/client-room.b2cw"

# The ticks between two poses: a pose every third tick is twenty a second.
def pose_gap() -> U32:
  2

# The ticks between two pickups: the room's next list, which no longer has the item, is a
# fifth of a second away, and asking again before it would ask for an item already given.
def pickup_rest() -> U32:
  30

def c_keys(client: Client) -> U32:
  Client{player, pose, keys, hosted, edits, region, path, world, size, bag, home, clock, dig} = client
  keys

def c_bag(client: Client) -> Bag.Bag:
  Client{player, pose, keys, hosted, edits, region, path, world, size, bag, home, clock, dig} = client
  bag

def c_edits(client: Client) -> List<&2, WorldState.Edit>:
  Client{player, pose, keys, hosted, edits, region, path, world, size, bag, home, clock, dig} = client
  edits

# Where a player is as the room has it: the world's coordinates, feet first.
def place_of(player: Player.State) -> Net.Place:
  Player.State{x, y, z, yaw, pitch, velocity_y, grounded, health, hunger, air, fall,
    poison} = player
  Net.Place{F32.sub(x, window_origin()), y, F32.sub(z, window_origin()), yaw, pitch}

def c_place(client: Client) -> Net.Place:
  Client{player, pose, keys, hosted, edits, region, path, world, size, bag, home, clock, dig} = client
  place_of(player)

# The player standing where the room says, and no longer falling or rising.
def stood_at(player: Player.State, stand: Net.Stand) -> Player.State:
  Player.State{x, y, z, yaw, pitch, velocity_y, grounded, health, hunger, air, fall,
    poison} = player
  Net.Stand{sx, sy, sz} = stand
  Player.State{F32.add(sx, window_origin()), sy, F32.add(sz, window_origin()), yaw, pitch, 0.0,
    False{}, health, hunger, air, fall, poison}

# The client put back where the room last accepted it, when the room refused a move. The
# next tick is what works out the camera and the regions from there.
def recalled(back: Maybe<&2, Net.Stand>, client: Client) -> Client:
  match back:
    case None{}:
      client
    case Some{stand}:
      Client{player, pose, keys, hosted, edits, region, path, world, size, bag, home, clock, dig} = client
      Client{stood_at(player, stand), pose, keys, hosted, edits, region, path, world, size, bag,
        home, clock, dig}

# The client with the room's cells set. The collision region is rebuilt with them, or a
# block another player placed would be in the picture and not in the way.
def absorbed.at(nothing: Bool, +client: Client, +batch: List<&2, WorldState.Edit>) -> Client:
  match nothing:
    case True{}:
      client
    case False{}:
      Client{player, pose, keys, hosted, edits, +region, path, world, size, bag, home, clock, dig} = client
      +next : List<&2, WorldState.Edit> = WorldState.set_many(edits, batch)
      Client{player, pose, keys, hosted, next,
        region_or(collision_region(next, den_of(region)), region), path, world, size, bag, home,
        clock, dig}

def absorbed(+client: Client, +batch: List<&2, WorldState.Edit>) -> Client:
  absorbed.at(List.is_empty(&2, WorldState.Edit, batch), client, batch)

# The connection is over: the socket is closed, the player is told why, and the client goes
# on alone in the world as the room left it.
def left(reason: String, socket: Socket, client: Client) -> IO(Session):
  do IO<Session>:
    closed : Unit <- Socket.close(socket)
    said : Unit <- IO.print("native-client: left the room: " ++ reason)
    return Session{client, Alone{}}

def wrong_seed(seed: Maybe<&2, Nat>) -> Bool:
  match seed:
    case None{}:
      False{}
    case Some{world}:
      Nat.is_ne(world, Frame.seed())

# --- what a room's mobs do, and what is done to them ------------------------------

# The mob under the crosshair: its name, how far it is, and whether there is one.
type Quarry is Data:
  Quarry{id: U32, away: F32, found: Bool}

def quarry_found(quarry: Quarry) -> Bool:
  Quarry{id, away, found} = quarry
  found

def quarry_id(quarry: Quarry) -> U32:
  Quarry{id, away, found} = quarry
  id

def quarry_away(quarry: Quarry) -> F32:
  Quarry{id, away, found} = quarry
  away

def is_mob(+kind: U32) -> Bool:
  Bool.and(U32.is_ge(kind, 1), U32.is_lt(kind, Net.villager_base()))

# The nearest mob the ray meets: each is only tested out to the nearest so far.
def quarry.go(things: List<&2, Net.Thing>, +ox: F32, +oy: F32, +oz: F32, +dx: F32, +dy: F32,
  +dz: F32, +best: Quarry) -> Quarry:
  match things:
    case Nil{}:
      best
    case Net.Thing{+id, +kind, count, x, y, z, yaw} <> rest:
      +away = Entities.aim_distance(ox, oy, oz, dx, dy, dz, x, y, z, Entities.body_height(kind),
        quarry_away(best))
      quarry.go(rest, ox, oy, oz, dx, dy, dz,
        Bool.pick(Quarry, Bool.and(is_mob(kind), F32.is_ge(away, 0.0)), Quarry{id, away, True{}}, best))

# The mob a player standing at `place` looks at, within a hit's reach: the ray is from the
# eye along `Player.direction`'s way.
def quarry(things: List<&2, Net.Thing>, place: Net.Place) -> Quarry:
  Net.Place{x, y, z, +yaw, +pitch} = place
  quarry.go(things, x, F32.add(y, Frame.eye_height()), z, F32.mul(F32.sin(yaw), F32.cos(pitch)),
    F32.sin(pitch), F32.neg(F32.mul(F32.cos(yaw), F32.cos(pitch))),
    Quarry{0, MultiplayerMobs.melee_range(), False{}})

# The items on the ground, as the rules' own drops.
def drops.go(things: List<&2, Net.Thing>, +acc: List<&2, Entities.Drop>) -> List<&2, Entities.Drop>:
  match things:
    case Nil{}:
      acc
    case Net.Thing{id, +kind, count, x, y, z, yaw} <> rest:
      drops.go(rest, Bool.pick(List<&2, Entities.Drop>, U32.is_ge(kind, Net.drop_base()),
        Entities.cons_drop(Entities.make_drop(U32.to_nat(id), U32.sub(kind, Net.drop_base()), x, y, z, count), acc),
        acc))

# An item is asked for only when the bag has room for all of it: the room hands it over
# whole, and what did not fit would be lost.
def wanted.at(target: Entities.DropTarget, bag: Bag.Bag) -> Maybe<&2, U32>:
  match target:
    case Entities.DropMissing{}:
      None{}
    case Entities.DropFound{id, item, amount}:
      Bool.pick(Maybe<&2, U32>,
        U32.is_eq(Inventory.add_remaining(Inventory.add_items(Bag.slots_of(bag), item, amount)), 0),
        Some{U32.from_nat(id)}, None{})

# The item on the ground the player would pick up now, if any: `Entities.nearest_drop`'s.
def wanted(things: List<&2, Net.Thing>, place: Net.Place, bag: Bag.Bag) -> Maybe<&2, U32>:
  Net.Place{x, y, z, yaw, pitch} = place
  wanted.at(Entities.nearest_drop(drops.go(things, Entities.empty_drops()), x, y, z), bag)

# A player a mob has killed starts again at the spawn, as one that fell out of the world does.
def revived(alive: Bool, player: Player.State) -> Player.State:
  match alive:
    case True{}:
      player
    case False{}:
      Frame.initial_player()

def hurt_player(+hurt: F32, +player: Player.State) -> Player.State:
  revived(Player.alive(Player.damage(player, hurt)), Player.damage(player, hurt))

# The client after what a room's mobs did to it this frame.
def harmed(+hurt: F32, client: Client) -> Client:
  Client{player, pose, keys, hosted, edits, region, path, world, size, bag, home, clock, dig} = client
  Client{hurt_player(hurt, player), pose, keys, hosted, edits, region, path, world, size, bag,
    home, clock, dig}

def gains.go(gains: List<&2, Net.Gain>, slots: List<&2, Inventory.Slot>) -> List<&2, Inventory.Slot>:
  match gains:
    case Nil{}:
      slots
    case Net.Gain{item, amount} <> rest:
      gains.go(rest, Inventory.add_slots(Inventory.add_items(slots, item, amount)))

def bag_gained(gains: List<&2, Net.Gain>, bag: Bag.Bag) -> Bag.Bag:
  Bag.Bag{slots, selected, desk, store} = bag
  Bag.Bag{gains.go(gains, slots), selected, desk, store}

# The client with the items the room handed over in its bag.
def gained(gains: List<&2, Net.Gain>, client: Client) -> Client:
  Client{player, pose, keys, hosted, edits, region, path, world, size, bag, home, clock, dig} = client
  Client{player, pose, keys, hosted, edits, region, path, world, size, bag_gained(gains, bag),
    home, clock, dig}

# What the room said its chests and furnaces hold, in the order it said it.
def boxes.go(boxes: List<&2, Net.Box>, store: Bag.Store) -> Bag.Store:
  match boxes:
    case Nil{}:
      store
    case box <> rest:
      boxes.go(rest, Stores.put(store, box))

def answered.moved(moved: Stores.Moved, slots: List<&2, Inventory.Slot>, selected: Nat, mode: U32,
  x: F32, y: F32, grid: List<&2, Inventory.Slot>) -> Bag.Bag:
  Stores.Moved{held, store} = moved
  Bag.Bag{slots, selected, Bag.Desk{mode, x, y, held, grid}, store}

# The room's answers to this client's requests, each applied to what the arrow carries.
def answers.go(answers: List<&2, Net.Answer>, bag: Bag.Bag) -> Bag.Bag:
  match answers:
    case Nil{}:
      bag
    case Net.Answer{ok, item, amount, durability} <> rest:
      Bag.Bag{slots, selected, Bag.Desk{mode, x, y, held, grid}, store} = bag
      answers.go(rest,
        answered.moved(Stores.answered(store, held, ok, item, amount, durability), slots, selected, mode, x,
          y, grid))

def bag_stored(boxes: List<&2, Net.Box>, answers: List<&2, Net.Answer>, bag: Bag.Bag) -> Bag.Bag:
  Bag.Bag{slots, selected, desk, store} = bag
  answers.go(answers, Bag.Bag{slots, selected, desk, boxes.go(boxes, store)})

# The client with the room's word on its chests and furnaces, and on what was asked of them.
def stored(boxes: List<&2, Net.Box>, answers: List<&2, Net.Answer>, client: Client) -> Client:
  Client{player, pose, keys, hosted, edits, region, path, world, size, bag, home, clock, dig} = client
  Client{player, pose, keys, hosted, edits, region, path, world, size, bag_stored(boxes, answers, bag),
    home, clock, dig}

def heard.sorted(refused: Maybe<&2, String>, other_world: Bool, socket: Socket, rest: String,
  +client: Client, +batch: List<&2, WorldState.Edit>, back: Maybe<&2, Net.Stand>,
  hurt: F32, gains: List<&2, Net.Gain>, boxes: List<&2, Net.Box>, answers: List<&2, Net.Answer>,
  peers: Peers) -> IO(Session):
  match refused other_world:
    case Some{reason} _:
      left(reason, socket, client)
    case None{} True{}:
      left("the room's world has another seed", socket, client)
    case None{} False{}:
      IO.pure(Session, Session{stored(boxes, answers, gained(gains, harmed(hurt, recalled(back, absorbed(client, batch))))),
        Online{socket, rest, c_edits(absorbed(client, batch)), peers}})

# The hour after a frame's lines: what the room just said, or what it was.
def hour.heard(said: Maybe<&2, Net.Day>, old: Hour) -> Hour:
  match said:
    case Some{Net.Day{turn, length}}:
      Heard{turn, length}
    case None{}:
      old

def heard.inbox(inbox: Net.Inbox, socket: Socket, rest: String, +client: Client, told: String,
  wait: U32, old: Hour, say: String, pause: U32) -> IO(Session):
  Net.Inbox{batch, +seed, refused, others, back, hour, sights, hurt, gains, boxes, answers} = inbox
  heard.sorted(refused, wrong_seed(seed), socket, rest, client, batch, back, hurt, gains, boxes, answers,
    Peers{others, told, wait, hour.heard(hour, old), sights, say, pause})

def heard.fed(fed: Net.Fed, socket: Socket, +client: Client, peers: Peers) -> IO(Session):
  Net.Fed{lines, rest} = fed
  Peers{others, told, wait, hour, sights, say, pause} = peers
  heard.inbox(Net.inbox(lines, others, sights), socket, rest, client, told, wait, hour, say,
    pause)

# An empty chunk is the peer's close, as `TCP.recv` answers it.
def heard.chunk(closed: Bool, chunk: String, socket: Socket, buffer: String,
  +client: Client, peers: Peers) -> IO(Session):
  match closed:
    case True{}:
      left("the server closed the connection", socket, client)
    case False{}:
      heard.fed(Net.feed(buffer, chunk), socket, client, peers)

def heard.result(result: Result<&1, &1, U32 & String, Maybe<&1, String>>, socket: Socket,
  buffer: String, +client: Client, peers: Peers) -> IO(Session):
  match result:
    case Fail{error}:
      left("the connection failed", socket, client)
    case Done{None{}}:
      IO.pure(Session, Session{client, Online{socket, buffer, c_edits(client), peers}})
    case Done{Some{+chunk}}:
      heard.chunk(String.is_empty(chunk), chunk, socket, buffer, client, peers)

def heard(polled: Socket & Result<&1, &1, U32 & String, Maybe<&1, String>>, buffer: String,
  +client: Client, peers: Peers) -> IO(Session):
  (socket, result) = polled
  heard.result(result, socket, buffer, client, peers)

# How much is read off the socket in one tick. A room's whole log can be much more than this
# when a client joins; it arrives over the ticks that follow.
def read_most() -> U32:
  8192

def listened(socket: Socket, buffer: String, +client: Client, peers: Peers) -> IO(Session):
  do IO<Session>:
    polled : Socket & Result<&1, &1, U32 & String, Maybe<&1, String>> <- TCP.poll(socket, read_most(), 0)
    heard(polled, buffer, client, peers)

def said(sent: Socket & Result<&1, &1, U32 & String, Unit>, buffer: String,
  +client: Client, peers: Peers) -> IO(Session):
  (socket, result) = sent
  match result:
    case Fail{error}:
      left("the connection failed", socket, client)
    case Done{unit}:
      listened(socket, buffer, client, peers)

# Nothing to say is not a send.
def say(quiet: Bool, socket: Socket, text: String) ->
  IO(Socket & Result<&1, &1, U32 & String, Unit>):
  match quiet:
    case True{}:
      IO.pure(Socket & Result<&1, &1, U32 & String, Unit>, (socket, Done{Unit{}}))
    case False{}:
      TCP.send(socket, text)

def synced.text(+text: String, socket: Socket, buffer: String, +client: Client,
  peers: Peers) -> IO(Session):
  do IO<Session>:
    sent : Socket & Result<&1, &1, U32 & String, Unit> <- say(String.is_empty(text), socket, text)
    said(sent, buffer, client, peers)

# The client's pose line, when the room should hear it: it is not the one last sent, and the
# wait since that one is over.
def synced.posed(+due: Bool, +line: String, +edits: String, socket: Socket, buffer: String,
  +client: Client, others: List<&2, Net.Other>, +told: String, +wait: U32,
  hour: Hour, sights: Net.Sights, pause: U32) -> IO(Session):
  synced.text(String.append(edits, Bool.pick(String, due, line, "")), socket, buffer, client,
    Peers{others, Bool.pick(String, due, line, told),
      Bool.pick(U32, due, pose_gap(), U32.sub(wait, U32.min(wait, 1))), hour, sights, "",
      pause})

# One tick's exchange with the room: what it has not heard is sent — the cells the client
# changed, the hits and pickups the last tick left to say, then where it is — and what it
# has said is read. `known` is the log as the room
# last heard it.
def synced(socket: Socket, buffer: String, known: List<&2, WorldState.Edit>, peers: Peers,
  +client: Client) -> IO(Session):
  Peers{others, +told, +wait, hour, sights, say, pause} = peers
  +line = Net.place_line(c_place(client))
  synced.posed(Bool.and(U32.is_eq(wait, 0), Bool.not(String.eq(line, told))), line,
    String.append(Net.edit_lines(Net.unheard(c_edits(client), known), ""), say), socket, buffer,
    client, others, told, wait, hour, sights, pause)

def link.closed(link: Link) -> IO(Maybe<Session>):
  match link:
    case Alone{}:
      IO.pure(Maybe<Session>, None{})
    case Online{socket, buffer, known, peers}:
      do IO<Maybe<Session>>:
        closed : Unit <- Socket.close(socket)
        return None{}

def session.next(link: Link, next: Maybe<Client>) -> IO(Maybe<Session>):
  match next:
    case None{}:
      link.closed(link)
    case Some{client}:
      IO.pure(Maybe<Session>, Some{Session{client, link}})

def session.ticked(events: List<&1, Event>, session: Session) -> IO(Maybe<Session>):
  Session{client, link} = session
  IO.bind(Maybe<Client>, Maybe<Session>, tick.events(events, client), next => session.next(link, next))

def peers.timed(peers: Peers, +now: Nat) -> Peers:
  Peers{others, told, wait, hour, sights, say, pause} = peers
  Peers{others, told, wait, hour.at(hour, now), sights, say, pause}

def link.timed(link: Link, +now: Nat) -> Link:
  match link:
    case Alone{}:
      Alone{}
    case Online{socket, buffer, known, peers}:
      Online{socket, buffer, known, peers.timed(peers, now)}

# The session with the room's hour brought up to `now`.
def session.timed(session: Session, +now: Nat) -> Session:
  Session{client, link} = session
  Session{client, link.timed(link, now)}

def shown_of(sights: Net.Sights) -> List<&2, Net.Thing>:
  Net.Sights{shown, pending} = sights
  shown

def things_of(peers: Peers) -> List<&2, Net.Thing>:
  Peers{others, told, wait, hour, sights, say, pause} = peers
  shown_of(sights)

# What the room simulates, as the last whole list it told: nothing when the session is alone.
def link.things(link: Link) -> Link & List<&2, Net.Thing>:
  match link:
    case Alone{}:
      (Alone{}, [])
    case Online{socket, buffer, known, +peers}:
      (Online{socket, buffer, known, peers}, things_of(peers))

def ask_line(ask: Maybe<&2, U32>) -> String:
  match ask:
    case Some{drop}:
      Net.pickup_line(drop)
    case None{}:
      ""

# The lines a tick left to say, kept for the next exchange: the hit, and the pickup when the
# rest since the last one is over.
def peers.said(peers: Peers, strike: String, +pickup: String) -> Peers:
  Peers{others, told, wait, hour, sights, say, +pause} = peers
  +due = Bool.and(U32.is_eq(pause, 0), Bool.not(String.is_empty(pickup)))
  Peers{others, told, wait, hour, sights,
    String.append(String.append(say, strike), Bool.pick(String, due, pickup, "")),
    Bool.pick(U32, due, pickup_rest(), U32.sub(pause, U32.min(pause, 1)))}

def link.said(link: Link, strike: String, pickup: String) -> Link:
  match link:
    case Alone{}:
      Alone{}
    case Online{socket, buffer, known, peers}:
      Online{socket, buffer, known, peers.said(peers, strike, pickup)}

# The hit a tick made: the dig key went down with a mob under the crosshair.
def strike_line(struck: Bool, +mob: U32, +damage: U32) -> String:
  match struck:
    case True{}:
      Net.strike_line(mob, damage)
    case False{}:
      ""

# The client with the request its tick left in the store marked as on its way.
def asked(client: Client) -> Client:
  Client{player, pose, keys, hosted, edits, region, path, world, size, +bag, home, clock, dig} = client
  Client{player, pose, keys, hosted, edits, region, path, world, size,
    Bag.with_store(bag, Stores.sent(Bag.store_of(bag))), home, clock, dig}

def session.acted(link: Link, next: Maybe<Client>, +quarry: Quarry, +before: U32,
  ask: Maybe<&2, U32>) -> IO(Maybe<Session>):
  match next:
    case None{}:
      link.closed(link)
    case Some{+client}:
      IO.pure(Maybe<Session>, Some{Session{asked(client),
        link.said(link,
          String.append(
            strike_line(Bool.and(quarry_found(quarry), wants_dig(before, c_keys(client))),
              quarry_id(quarry), Inventory.melee_damage(Bag.held_item(c_bag(client)))),
            Stores.line_of(Bag.store_of(c_bag(client)))),
          ask_line(ask))}})

def session.acting.among(events: List<&1, Event>, +client: Client, link: Link,
  +things: List<&2, Net.Thing>) -> IO(Maybe<Session>):
  # With the inventory screen open a click is the screen's, and hits nothing.
  +quarry : Quarry = Bool.pick(Quarry, Bag.is_open(c_bag(client)),
    Quarry{0, MultiplayerMobs.melee_range(), False{}}, quarry(things, c_place(client)))
  IO.bind(Maybe<Client>, Maybe<Session>, tick.shared(events, client, quarry_found(quarry)),
    next => session.acted(link, next, quarry, c_keys(client),
      wanted(things, c_place(client), c_bag(client))))

def session.acting.at(events: List<&1, Event>, +client: Client,
  seen: Link & List<&2, Net.Thing>) -> IO(Maybe<Session>):
  (link, things) = seen
  session.acting.among(events, client, link, things)

# The client's tick in a room: what is under the crosshair and on the ground beside the
# player is worked out first, from the pose the tick starts with, and what the tick did
# about them is left for the next exchange to say.
def session.acting(events: List<&1, Event>, session: Session) -> IO(Maybe<Session>):
  Session{client, link} = session
  session.acting.at(events, client, link.things(link))

def session.tick.at(link: Link, events: List<&1, Event>, +client: Client) -> IO(Maybe<Session>):
  match link:
    case Alone{}:
      session.ticked(events, Session{client, Alone{}})
    case Online{socket, buffer, known, peers}:
      do IO<Maybe<Session>>:
        session : Session <- synced(socket, buffer, known, peers, client)
        now : Nat <- IO.now()
        session.acting(events, session.timed(session, now))

# The session's tick: the room first, then the client's own.
def session.tick(events: List<&1, Event>, session: Session) -> IO(Maybe<Session>):
  Session{client, link} = session
  session.tick.at(link, events, client)

def session.viewed(drawn: Client & Image, link: Link) -> Session & Image:
  (client, image) = drawn
  (Session{client, link}, image)

def others_of(peers: Peers) -> List<&2, Net.Other>:
  Peers{others, told, wait, hour, sights, say, pause} = peers
  others

def hour_of(peers: Peers) -> Hour:
  Peers{others, told, wait, hour, sights, say, pause} = peers
  hour

def session.things.at(client: Client, seen: Link & List<&2, Net.Thing>) -> Session & List<&2, Net.Thing>:
  (link, things) = seen
  (Session{client, link}, things)

def session.things(session: Session) -> Session & List<&2, Net.Thing>:
  Session{client, link} = session
  session.things.at(client, link.things(link))

# The room's hour as the session last worked it out: unheard when it is alone.
def link.hour(link: Link) -> Link & Hour:
  match link:
    case Alone{}:
      (Alone{}, Unheard{})
    case Online{socket, buffer, known, +peers}:
      (Online{socket, buffer, known, peers}, hour_of(peers))

def session.hour.at(client: Client, seen: Link & Hour) -> Session & Hour:
  (link, hour) = seen
  (Session{client, link}, hour)

def session.hour(session: Session) -> Session & Hour:
  Session{client, link} = session
  session.hour.at(client, link.hour(link))

# The room's other players as the session last heard them: none when it is alone.
def link.others(link: Link) -> Link & List<&2, Net.Other>:
  match link:
    case Alone{}:
      (Alone{}, [])
    case Online{socket, buffer, known, +peers}:
      (Online{socket, buffer, known, peers}, others_of(peers))

def session.others.at(client: Client, seen: Link & List<&2, Net.Other>) -> Session & List<&2, Net.Other>:
  (link, others) = seen
  (Session{client, link}, others)

def session.others(session: Session) -> Session & List<&2, Net.Other>:
  Session{client, link} = session
  session.others.at(client, link.others(link))

def session.view.sighted(client: Client, others: List<&2, Net.Other>, hour: Hour,
  seen: Link & List<&2, Net.Thing>) -> Session & Image:
  (link, things) = seen
  session.viewed(view_among(client, others, hour, things), link)

def session.view.timed(client: Client, others: List<&2, Net.Other>, seen: Link & Hour) -> Session & Image:
  (link, hour) = seen
  session.view.sighted(client, others, hour, link.things(link))

def session.view.at(client: Client, seen: Link & List<&2, Net.Other>) -> Session & Image:
  (link, others) = seen
  session.view.timed(client, others, link.hour(link))

# The session's frame: the client's, with the room's other players and what the room
# simulates standing in it, at the room's hour.
def session.view(session: Session) -> Session & Image:
  Session{client, link} = session
  session.view.at(client, link.others(link))

# --- joining ---------------------------------------------------------------------

# `--join=host:port` among the arguments, as its `host:port`.
def join_value(parts: List<&2, String>) -> Maybe<&2, String>:
  match parts:
    case flag <> value <> Nil{}:
      Bool.pick(Maybe<&2, String>, String.eq(flag, "--join"), Some{value}, None{})
    case _:
      None{}

def join_first(found: Maybe<&2, String>, later: Maybe<&2, String>) -> Maybe<&2, String>:
  match found:
    case Some{value}:
      Some{value}
    case None{}:
      later

def join_arg(args: List<&1, String>) -> Maybe<&2, String>:
  match args:
    case Nil{}:
      None{}
    case arg <> rest:
      join_first(join_value(String.split(arg, Chr{61})), join_arg(rest))

def greeted(sent: Socket & Result<&1, &1, U32 & String, Unit>, client: Client) -> IO(Session):
  (socket, result) = sent
  match result:
    case Fail{error}:
      left("the hello could not be sent", socket, client)
    case Done{unit}:
      IO.pure(Session, Session{client, Online{socket, "", [], Peers{[], "", 0, Unheard{}, Net.Sights{[], []}, "", 0}}})

def connected(result: Result<&1, &1, U32 & String, Socket>, client: Client) -> IO(Session):
  match result:
    case Fail{error}:
      do IO<Session>:
        said : Unit <- IO.print("native-client: could not join the room; playing alone")
        return Session{client, Alone{}}
    case Done{socket}:
      do IO<Session>:
        said : Unit <- IO.print("native-client: joined the room")
        sent : Socket & Result<&1, &1, U32 & String, Unit> <- TCP.send(socket, Net.hello("Native"))
        greeted(sent, client)

def join.at(address: Maybe<&2, Net.Address>, client: Client) -> IO(Session):
  match address:
    case None{}:
      do IO<Session>:
        said : Unit <- IO.print("native-client: --join wants host:port; playing alone")
        return Session{client, Alone{}}
    case Some{Net.Address{host, port}}:
      do IO<Session>:
        result : Result<&1, &1, U32 & String, Socket> <- TCP.connect(host, port)
        connected(result, client)

# A client's chests and furnaces are its own world's. In a room they are the room's, told
# on joining, so the ones a stash brought along are left behind.
def unstored(client: Client) -> Client:
  Client{player, pose, keys, hosted, edits, region, path, world, size, bag, home, clock, dig} = client
  Client{player, pose, keys, hosted, edits, region, path, world, size,
    Bag.with_store(bag, Bag.stores()), home, clock, dig}

# A room's client: the room's world, which is the generated one until the room says
# otherwise, and its own save file.
def room_client(+size: Size) -> IO(Client):
  region = collision_region(WorldState.empty(), den_start())
  IO.bind(Client, Client, start.region(region, WorldState.empty(), room_path(), size),
    client => IO.pure(Client, unstored(client)))

def session.started(target: Maybe<&2, String>, +size: Size) -> IO(Session):
  match target:
    case None{}:
      do IO<Session>:
        client : Client <- start(size)
        return Session{client, Alone{}}
    case Some{text}:
      do IO<Session>:
        client : Client <- room_client(size)
        join.at(Net.address(text), client)

# The client alone from its save, or in a room when `--join=host:port` was passed.
def session.start(+size: Size) -> IO(Session):
  do IO<Session>:
    args : List<&1, String> <- IO.args()
    session.started(join_arg(args), size)

# `App.loop` is the prelude's own frame loop and it ends when the tick hands back no
# client, so the quit needs no fuel and no flag of its own: the client answers `Nothing`
# to leave. The client opens the window itself rather than through `App.run` only so
# the grab can be taken first; everything after that is the prelude's.
def app() -> App<Client>:
  App{view, tick.events}

# The same app over a session, which is what the window runs: the client's own view and
# tick, with the room's exchange in front of the tick.
def session_app() -> App<Session>:
  App{session.view, session.tick}

# The window is opened at the size the selector chose, and the table is printed
# first so the choice is made against its cost rather than guessed.
def opened(+width: U32) -> IO(Window):
  IO.try(Window, Window.open(title(), width, width))

# The frame loop, which asks for the grab **every frame** rather than once at startup.
#
# `window_grab` in the pinned runtime engages only `if (on && !win->grab && focus ==
# win->win)` — the X11 path in `vendor/bend/bend2/effs/window.c:771`. Focus is not
# something the client can arrange: the window can be mapped without it, and the player
# has to click the window to give it focus, which is after the loop has started. So a
# startup-only grab can be lost for the whole session. The runtime also clears
# `win->grab` on `FocusOut` (`window.c:584`), so alt-tabbing away and back would leave the
# mouse dead for the rest of the session too. Asking again every frame costs one
# already-held grab check per frame, which the runtime short-circuits on `!win->grab`.
#
# `App.step` rather than `App.loop` for exactly this: `App.loop` builds its own
# continuation and never hands the window anywhere a grab can be taken, while `App.step`
# takes the continuation as an argument. Quitting is unchanged — the continuation is only
# reached when the tick hands back a client, and `App.next` closes the window when it
# hands back nothing.
#
# The grab is taken whether or not the pointer is hosted. Hosted, the movement comes from
# `native/pointer.bend` and the grab is only what hides the cursor over the window; the
# `Look` events it raises are dropped by `Pointer.events`.
def frames(fuel: Nat, window: Window, state: Session) -> IO(Unit):
  match fuel:
    case 0n:
      Window.close(window)
    case 1n+f:
      do IO<Unit>:
        held : Window <- grabbed(window)
        App.step(Session, session_app(), held, state, w => s => frames(f, w, s))

def session.hosting(session: Session, hosted: Bool) -> Session:
  Session{client, link} = session
  Session{hosting(client, hosted), link}

# The host's pointer is asked for before the window opens, so the table can say which
# pointer the look is read from and is still printed before the window. The host script
# finds the window by its title and waits for it to appear.
def run.hosted(+width: U32, state: Session, +hosted: Bool) -> IO(Unit):
  do IO<Unit>:
    shown : Unit <- report(width, hosted)
    window : Window <- opened(width)
    early : Window <- grabbed(window)
    pause : Unit <- IO.sleep(grab_wait_ms())
    frames(4294967295n, early, session.hosting(state, hosted))

def run(+width: U32, state: Session) -> IO(Unit):
  do IO<Unit>:
    opened : U32 <- Pointer.host_open(title())
    run.hosted(width, state, U32.is_eq(opened, 1))

# A bound value is spent once, and the width is wanted twice: once for the client
# and once for the window. `width_arg` is a pure function of the arguments, so it
# is asked twice rather than shared, and the two answers cannot disagree.
def main() -> IO(Unit):
  do IO<Unit>:
    for_client : Size <- width_arg()
    state : Session <- session.start(for_client)
    for_window : Size <- width_arg()
    run(width_of(for_window), state)

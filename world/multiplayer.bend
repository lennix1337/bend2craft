import Base
import ./world.bend as World
import ./world_state.bend as WorldState

# Multiplayer authority.
#
# A multiplayer server holds one Room: the ordered edit log of the shared world
# and a sequence number that advances once per submitted batch. Clients submit
# block edits in stored (Bend) coordinates, the same encoding WorldState uses;
# the room accepts the valid edits in arrival order and folds them into its log
# with WorldState.set, so every client that replays the accepted batches in
# sequence order converges on the same world as the room.
#
# Player poses are validated here as well: the server relays only poses that
# are finite and inside the world's vertical band, with the pitch clamped.

type Room is Data:
  Room{seq: U32, edits: List<&2, WorldState.Edit>}

type Split is Data:
  Split{edits: List<&2, WorldState.Edit>, accepted: List<&2, WorldState.Edit>, rejected: List<&2, WorldState.Edit>}

type Submission is Data:
  Submission{room: Room, accepted: List<&2, WorldState.Edit>, rejected: List<&2, WorldState.Edit>}

# The highest block ID a client may place (27: crafting table). IDs are listed
# in world.bend and web/inventory.js.
def max_block() -> U32:
  27

# The largest batch a client may submit in one message.
def max_batch() -> Nat:
  4096n

def empty() -> Room:
  Room{0, Nil{}}

def restore(seq: U32, edits: List<&2, WorldState.Edit>) -> Room:
  Room{seq, edits}

def room_seq(room: Room) -> U32:
  Room{+seq, edits} = room
  seq

def room_edits(room: Room) -> List<&2, WorldState.Edit>:
  Room{seq, +edits} = room
  edits

def submission_room(result: Submission) -> Room:
  Submission{+room, accepted, rejected} = result
  room

def submission_accepted(result: Submission) -> List<&2, WorldState.Edit>:
  Submission{room, +accepted, rejected} = result
  accepted

def submission_rejected(result: Submission) -> List<&2, WorldState.Edit>:
  Submission{room, accepted, +rejected} = result
  rejected

# A stored coordinate is a non-negative world coordinate, or a negative one
# moved to negative_origin() + x. Values at or past negative_origin() never
# come from a signed world coordinate, so they are refused.
def valid_coordinate(+value: Nat) -> Bool:
  Nat.is_lt(value, World.negative_origin())

def valid_position(+x: Nat, +y: Nat, +z: Nat) -> Bool:
  Bool.and(Bool.and(valid_coordinate(x), Nat.is_lt(y, World.max_y())), valid_coordinate(z))

def valid_block(+block: U32) -> Bool:
  U32.is_le(block, max_block())

def valid_edit(edit: WorldState.Edit) -> Bool:
  WorldState.Edit{+x, +y, +z, +block} = edit
  Bool.and(valid_position(x, y, z), valid_block(block))

def batch_length(edits: List<&2, WorldState.Edit>) -> Nat:
  match edits:
    case Nil{}:
      0n
    case Con{head, tail}:
      1n+batch_length(tail)

def valid_batch_size(+batch: List<&2, WorldState.Edit>) -> Bool:
  Nat.is_le(batch_length(batch), max_batch())

def apply_if(+ok: Bool, edits: List<&2, WorldState.Edit>, edit: WorldState.Edit) -> List<&2, WorldState.Edit>:
  match ok:
    case True{}:
      WorldState.Edit{+x, +y, +z, +block} = edit
      WorldState.set(edits, x, y, z, block)
    case False{}:
      edits

def keep_if(+ok: Bool, edit: WorldState.Edit, rest: List<&2, WorldState.Edit>) -> List<&2, WorldState.Edit>:
  match ok:
    case True{}:
      Con{edit, rest}
    case False{}:
      rest

def split.finish(
  +ok: Bool, +head: WorldState.Edit, result: Split
) -> Split:
  Split{+edits, +accepted, +rejected} = result
  Split{edits, keep_if(ok, head, accepted), keep_if(Bool.not(ok), head, rejected)}

# Folds a batch into an edit log in order. Accepted and rejected keep the
# batch's order, so a later edit of the same cell still wins downstream.
def split(batch: List<&2, WorldState.Edit>, edits: List<&2, WorldState.Edit>) -> Split:
  match batch:
    case Nil{}:
      Split{edits, Nil{}, Nil{}}
    case Con{+head, tail}:
      +ok = valid_edit(head)
      next = apply_if(ok, edits, head)
      split.finish(ok, head, split(tail, next))

def submit.wrap(+seq: U32, result: Split) -> Submission:
  Split{+edits, +accepted, +rejected} = result
  Submission{Room{(seq + 1 : U32), edits}, accepted, rejected}

def submit.checked(+fits: Bool, +room: Room, +batch: List<&2, WorldState.Edit>) -> Submission:
  match fits:
    case True{}:
      Room{+seq, +log} = room
      submit.wrap(seq, split(batch, log))
    case False{}:
      Submission{room, Nil{}, batch}

# Submits one client batch. An oversized batch is refused whole and leaves the
# room untouched; otherwise every valid edit is applied in order.
def submit(+room: Room, +batch: List<&2, WorldState.Edit>) -> Submission:
  submit.checked(valid_batch_size(batch), room, batch)

def revert.pick(
  +inside: Bool, +x: Nat, +y: Nat, +z: Nat, +edits: List<&2, WorldState.Edit>, +seed: Nat,
  rest: List<&2, WorldState.Edit>
) -> List<&2, WorldState.Edit>:
  match inside:
    case True{}:
      Con{WorldState.make_edit(x, y, z, WorldState.block(edits, seed, x, y, z)), rest}
    case False{}:
      rest

# The authoritative value of every in-world cell a rejected batch named, so the
# submitting client can undo its local prediction.
def revert(
  rejected: List<&2, WorldState.Edit>, +edits: List<&2, WorldState.Edit>, +seed: Nat
) -> List<&2, WorldState.Edit>:
  match rejected:
    case Nil{}:
      Nil{}
    case Con{+head, tail}:
      WorldState.Edit{+x, +y, +z, block} = head
      +rest = revert(tail, edits, seed)
      revert.pick(valid_position(x, y, z), x, y, z, edits, seed, rest)

# Replays accepted batches on a client: the room already validated them, so
# they fold into the local edit log in order.
def merge(batch: List<&2, WorldState.Edit>, edits: List<&2, WorldState.Edit>) -> List<&2, WorldState.Edit>:
  match batch:
    case Nil{}:
      edits
    case Con{+head, tail}:
      WorldState.Edit{+x, +y, +z, +block} = head
      merge(tail, WorldState.set(edits, x, y, z, block))

# Player poses ----------------------------------------------------------------

# Horizontal bound on a relayed position: half the negative origin, past which
# the stored-coordinate encoding stops being unambiguous.
def pose_horizontal_limit() -> F32:
  47185920.0

def pose_lowest_y() -> F32:
  F32.neg(64.0)

def pose_highest_y() -> F32:
  256.0

def finite_within(+value: F32, +limit: F32) -> Bool:
  Bool.and(F32.is_lt(value, limit), F32.is_gt(value, F32.neg(limit)))

# NaN fails every comparison and an infinity fails the bound, so both are
# refused along with positions outside the world.
def valid_pose(+x: F32, +y: F32, +z: F32, +yaw: F32, +pitch: F32) -> Bool:
  +horizontal = pose_horizontal_limit()
  Bool.and(
    Bool.and(finite_within(x, horizontal), finite_within(z, horizontal)),
    Bool.and(
      Bool.and(F32.is_ge(y, pose_lowest_y()), F32.is_le(y, pose_highest_y())),
      Bool.and(finite_within(yaw, 1000000.0), finite_within(pitch, 1000000.0))
    )
  )

def pitch_limit() -> F32:
  1.5533

def clamp_pitch(+pitch: F32) -> F32:
  F32.max(F32.neg(pitch_limit()), F32.min(pitch, pitch_limit()))

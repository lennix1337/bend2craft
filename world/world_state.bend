import Base
import ./world.bend as World

type Edit is Data:
  Edit{x: Nat, y: Nat, z: Nat, block: U32}

def empty() -> List<&2, Edit>:
  Nil{}

def torches(edits: List<&2, Edit>) -> List<&2, Edit>:
  match edits:
    case Nil{}:
      Nil{}
    case Con{+head, +tail}:
      Edit{+x, +y, +z, +block} = head
      +rest = torches(tail)
      +is_torch = U32.is_eq(block, 12)
      Bool.pick(List<&2, Edit>, is_torch, Con{head, rest}, rest)

def light_source(+block: U32) -> Bool:
  Bool.or(U32.is_eq(block, 12), U32.is_eq(block, 21))

def light_sources(edits: List<&2, Edit>) -> List<&2, Edit>:
  match edits:
    case Nil{}:
      Nil{}
    case Con{+head, +tail}:
      Edit{+x, +y, +z, +block} = head
      +rest = light_sources(tail)
      Bool.pick(List<&2, Edit>, light_source(block), Con{head, rest}, rest)

def edit_matches(edit: Edit, +x: Nat, +y: Nat, +z: Nat) -> Bool:
  Edit{ex, ey, ez, block} = edit
  Bool.and(Bool.and(Nat.is_eq(ex, x), Nat.is_eq(ey, y)), Nat.is_eq(ez, z))

def edit_value(edit: Edit) -> U32:
  Edit{x, y, z, block} = edit
  block

def make_edit(x: Nat, y: Nat, z: Nat, block: U32) -> Edit:
  Edit{x, y, z, block}

def cons_edit(edit: Edit, tail: List<&2, Edit>) -> List<&2, Edit>:
  Con{edit, tail}

def set(edits: List<&2, Edit>, +x: Nat, +y: Nat, +z: Nat, +block: U32) -> List<&2, Edit>:
  match edits:
    case Nil{}:
      cons_edit(make_edit(x, y, z, block), Nil{})
    case Con{+head, +tail}:
      +same = edit_matches(head, x, y, z)
      +rest = set(tail, x, y, z, block)
      Bool.pick(
        List<&2, Edit>, same,
        cons_edit(make_edit(x, y, z, block), tail),
        cons_edit(head, rest)
      )

def block(
  edits: List<&2, Edit>, +seed: Nat, +x: Nat, +y: Nat, +z: Nat
) -> U32:
  match edits:
    case Nil{}:
      World.block(seed, x, y, z)
    case Con{+head, tail}:
      +rest = block(tail, seed, x, y, z)
      Bool.pick(U32, edit_matches(head, x, y, z), edit_value(head), rest)

def chunk.apply.write(
  edit: Edit, +chunk_x: Nat, +chunk_z: Nat, blocks: Array<U32>, inside: Bool
) -> Array<U32>:
  Edit{x, y, z, value} = edit
  match inside:
    case False{}:
      blocks
    case True{}:
      +local_x = Nat.sub(x, Nat.mul(chunk_x, World.chunk_size()))
      +local_z = Nat.sub(z, Nat.mul(chunk_z, World.chunk_size()))
      +index = U32.from_nat(Nat.add(local_x, Nat.mul(World.chunk_size(), Nat.add(local_z, Nat.mul(World.chunk_size(), y)))))
      Array.set(U32, blocks, index, value)

def chunk.apply(
  edits: List<&2, Edit>, +seed: Nat, +chunk_x: Nat, +chunk_z: Nat,
  blocks: Array<U32>
) -> Array<U32>:
  match edits:
    case Nil{}:
      blocks
    case Con{+head, tail}:
      Edit{x, y, z, value} = head
      +base_x = Nat.mul(chunk_x, World.chunk_size())
      +base_z = Nat.mul(chunk_z, World.chunk_size())
      +inside = Bool.and(
        Bool.and(Nat.is_ge(x, base_x), Nat.is_lt(x, Nat.add(base_x, World.chunk_size()))),
        Bool.and(
          Bool.and(Nat.is_ge(z, base_z), Nat.is_lt(z, Nat.add(base_z, World.chunk_size()))),
          Nat.is_lt(y, World.max_y())
        )
      )
      updated = chunk.apply.write(head, chunk_x, chunk_z, blocks, inside)
      chunk.apply(tail, seed, chunk_x, chunk_z, updated)

def chunk(
  +seed: Nat, +chunk_x: Nat, +chunk_z: Nat, edits: List<&2, Edit>
) -> Array<U32>:
  chunk.apply(edits, seed, chunk_x, chunk_z, World.chunk(seed, chunk_x, chunk_z))

import Base
import ./world.bend as World

def array_depth() -> Nat:
  13n

def grid.fill(
  +seed: Nat, +remaining: Nat, +index: Nat,
  +min_x: Nat, +min_z: Nat, +columns: Nat, +step: Nat,
  blocks: Array<U32>
) -> Array<U32>:
  match remaining:
    case 0n:
      blocks
    case 1n+p:
      +sample_x = Nat.mod(index, columns)
      +sample_z = Nat.div(index, columns)
      +x = Nat.add(min_x, Nat.mul(sample_x, step))
      +z = Nat.add(min_z, Nat.mul(sample_z, step))
      +height = U32.from_nat(World.column_height(seed, x, z))
      updated = blocks[U32.from_nat(index)] <- height
      grid.fill(seed, p, Nat.add(index, 1n), min_x, min_z, columns, step, updated)

def grid(
  +seed: Nat, +min_x: Nat, +min_z: Nat,
  +columns: Nat, +rows: Nat, +step: Nat
) -> Array<U32>:
  +cells = Nat.mul(columns, rows)
  +depth = array_depth()
  grid.fill(seed, cells, 0n, min_x, min_z, columns, step, Array.new(U32, depth, 0))

def surface_grid.fill(
  +seed: Nat, +remaining: Nat, +index: Nat,
  +min_x: Nat, +min_z: Nat, +columns: Nat, +step: Nat,
  blocks: Array<U32>
) -> Array<U32>:
  match remaining:
    case 0n:
      blocks
    case 1n+p:
      +sample_x = Nat.mod(index, columns)
      +sample_z = Nat.div(index, columns)
      +x = Nat.add(min_x, Nat.mul(sample_x, step))
      +z = Nat.add(min_z, Nat.mul(sample_z, step))
      +height = World.column_height(seed, x, z)
      +water = World.water_at(seed, x, World.sea_level(), z)
      +surface = Bool.pick(U32, water, U32.add(U32.from_nat(World.sea_level()), 33), U32.from_nat(height))
      updated = blocks[U32.from_nat(index)] <- surface
      surface_grid.fill(seed, p, Nat.add(index, 1n), min_x, min_z, columns, step, updated)

def surface_grid(
  +seed: Nat, +min_x: Nat, +min_z: Nat,
  +columns: Nat, +rows: Nat, +step: Nat
) -> Array<U32>:
  +cells = Nat.mul(columns, rows)
  +depth = array_depth()
  surface_grid.fill(seed, cells, 0n, min_x, min_z, columns, step, Array.new(U32, depth, 0))

type SurfacePoint is Data:
  SurfacePoint{x: Nat, z: Nat}

def surface_points.fill(
  +seed: Nat, +remaining: Nat, +index: Nat,
  points: List<&2, SurfacePoint>, blocks: Array<U32>
) -> Array<U32>:
  match remaining:
    case 0n:
      blocks
    case 1n+p:
      match points:
        case Nil{}:
          blocks
        case Con{+head, +tail}:
          SurfacePoint{+x, +z} = head
          +height = World.column_height(seed, x, z)
          +water = World.water_at(seed, x, World.sea_level(), z)
          +surface = Bool.pick(U32, water, U32.add(U32.from_nat(World.sea_level()), 33), U32.from_nat(height))
          updated = blocks[U32.from_nat(index)] <- surface
          surface_points.fill(seed, p, Nat.add(index, 1n), tail, updated)

def surface_points(
  +seed: Nat, +count: Nat, points: List<&2, SurfacePoint>
) -> Array<U32>:
  surface_points.fill(seed, count, 0n, points, Array.new(U32, array_depth(), 0))

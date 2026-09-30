import Base
import ../../world/world.bend as World
import ../voxel-probe/voxel_probe.bend as Voxel
import ./face_probe.bend as Face

# Pins how many faces a real chunk must expose.
#
# These numbers are not the probe's opinion of itself. They were counted twice,
# by two independent routes that share no code with it: once in Bend through the
# ray renderer's already-validated nested grid, and once through the JavaScript
# lane reading the same `WorldState.chunk` bytes. Both report 2102 solid cells
# and 1298 exposed faces for seed 1337, chunk 0,0, of which 296 are top faces.
#
# A renderer that extracts fewer faces than this is not rendering the world: it
# draws an almost empty frame, and any speed it appears to win is the speed of
# not drawing. That is the failure this test exists to catch.
#
# Every label carries its pinned count, because this compiler consumes a value
# once: a failure message cannot quote the observed number and the pinned one
# from the same binding.
type Reference is Data:
  Reference{solid: U32, exposed: U32}

def is_eq(a: U32, b: U32) -> Bool:
  U32.is_eq(a, b)

def report(ok: Bool, +label: String) -> IO(Unit):
  match ok:
    case True{}:
      IO.pure(Unit, Unit{})
    case False{}:
      IO.die(Unit, 1, "face-extraction: " ++ label)

def solid_at(+grid: Voxel.VoxelGrid, +x: U32, +y: U32, +z: U32) -> Bool:
  U32.is_ne(Voxel.grid_at(grid, x, y, z), 0)

def solid_neighbours(+grid: Voxel.VoxelGrid, +x: U32, +y: U32, +z: U32, +size: U32,
  +height: U32) -> U32:
  +last_x = U32.sub(size, 1)
  +last_y = U32.sub(height, 1)
  +last_z = U32.sub(size, 1)
  +n = Bool.pick(U32, Bool.and(U32.is_gt(x, 0), solid_at(grid, U32.sub(x, 1), y, z)), 1, 0)
  +n2 = Bool.pick(U32, Bool.and(U32.is_lt(x, last_x), solid_at(grid, U32.add(x, 1), y, z)), 1, 0)
  +n3 = Bool.pick(U32, Bool.and(U32.is_gt(y, 0), solid_at(grid, x, U32.sub(y, 1), z)), 1, 0)
  +n4 = Bool.pick(U32, Bool.and(U32.is_lt(y, last_y), solid_at(grid, x, U32.add(y, 1), z)), 1, 0)
  +n5 = Bool.pick(U32, Bool.and(U32.is_gt(z, 0), solid_at(grid, x, y, U32.sub(z, 1))), 1, 0)
  +n6 = Bool.pick(U32, Bool.and(U32.is_lt(z, last_z), solid_at(grid, x, y, U32.add(z, 1))), 1, 0)
  U32.add(U32.add(n, n2), U32.add(U32.add(n3, n4), U32.add(n5, n6)))

def solid_of(flag: Bool) -> U32:
  match flag:
    case True{}:
      1
    case False{}:
      0

def faces_of(flag: Bool, +grid: Voxel.VoxelGrid, +x: U32, +y: U32, +z: U32, +size: U32,
  +height: U32) -> U32:
  match flag:
    case True{}:
      U32.sub(6, solid_neighbours(grid, x, y, z, size, height))
    case False{}:
      0

def count_solid(+grid: Voxel.VoxelGrid, +remaining: Nat, +index: U32, +size: U32,
  +solid: U32) -> U32:
  match remaining:
    case 0n:
      solid
    case 1n+p:
      +x = U32.mod(index, size)
      +z = U32.mod(U32.div(index, size), size)
      +y = U32.div(index, U32.mul(size, size))
      count_solid(grid, p, (index + 1 : U32), size,
        U32.add(solid, solid_of(solid_at(grid, x, y, z))))

def count_exposed(+grid: Voxel.VoxelGrid, +remaining: Nat, +index: U32, +size: U32,
  +height: U32, +exposed: U32) -> U32:
  match remaining:
    case 0n:
      exposed
    case 1n+p:
      +x = U32.mod(index, size)
      +z = U32.mod(U32.div(index, size), size)
      +y = U32.div(index, U32.mul(size, size))
      +here = faces_of(solid_at(grid, x, y, z), grid, x, y, z, size, height)
      count_exposed(grid, p, (index + 1 : U32), size, height, U32.add(exposed, here))

def size() -> U32:
  U32.from_nat(World.chunk_size())

def height() -> U32:
  U32.from_nat(World.max_y())

def cells() -> Nat:
  U32.to_nat(U32.mul(U32.mul(size(), size()), height()))

def reference() -> IO(Reference):
  exposed = count_exposed(Voxel.grid_from_chunk(World.chunk(1337n, 0n, 0n)),
    cells(), 0, size(), height(), 0)
  solid = count_solid(Voxel.grid_from_chunk(World.chunk(1337n, 0n, 0n)),
    cells(), 0, size(), 0)
  IO.pure(Reference, Reference{solid, exposed})

def checked(pinned: Reference, +extracted: U32) -> IO(Unit):
  Reference{solid, exposed} = pinned
  solid_ok = is_eq(solid, 2102)
  exposed_ok = is_eq(exposed, 1298)
  extracted_ok = is_eq(extracted, 1298)
  do IO<Unit>:
    cells : Unit <- report(solid_ok, "solid cells must be 2102")
    faces : Unit <- report(exposed_ok, "the reference must expose 1298 faces")
    probe : Unit <- report(extracted_ok, "the probe must extract 1298 faces, not fewer")
    IO.print("face-extraction=pass solid=2102 exposed=1298 extracted=1298")

def main() -> IO(Unit):
  +extracted : U32 = U32.from_nat(List.length(&2, Face.Face,
    Face.faces_from_chunk(World.chunk(1337n, 0n, 0n))))
  do IO<Unit>:
    pinned : Reference <- reference()
    checked(pinned, extracted)

import Base

def default_seed() -> Nat:
  1337n

def width() -> Nat:
  48n

def depth() -> Nat:
  48n

def max_y() -> Nat:
  20n

def same(+a: Nat, +b: Nat) -> Bool:
  Nat.is_eq(a, b)

def near(+a: Nat, +b: Nat) -> Bool:
  Nat.is_eq(a, b) || Nat.is_eq(a, Nat.add(b, 1n))
    || Nat.is_eq(Nat.add(a, 1n), b)

def mix(+seed: Nat, +x: Nat, +z: Nat) -> Nat:
  +seed_x = Nat.mod(seed, 97n)
  +seed_z = Nat.mod(seed, 193n)
  +base = Nat.add(Nat.mul(x, 13n), Nat.mul(z, 31n))
  +with_x = Nat.add(base, Nat.mul(seed_x, 7n))
  Nat.mod(Nat.add(with_x, Nat.mul(seed_z, 11n)), 23n)

def column_height(+seed: Nat, +x: Nat, +z: Nat) -> Nat:
  +wave0 = Nat.mod(mix(seed, x, z), 7n)
  +wave1 = Nat.mod(mix(seed, z, x), 3n)
  Nat.add(4n, Nat.add(wave0, wave1))

def tree_at(+seed: Nat, +x: Nat, +z: Nat) -> Bool:
  +hash = Nat.mod(Nat.add(mix(seed, x, z), Nat.mod(seed, 41n)), 41n)
  +away_x = Nat.is_gt(x, 1n) && Nat.is_lt(x, Nat.sub(width(), 2n))
  +away_z = Nat.is_gt(z, 1n) && Nat.is_lt(z, Nat.sub(depth(), 2n))
  away_x && away_z && Nat.is_eq(hash, 0n)

def trunk_at(+seed: Nat, +x: Nat, +y: Nat, +z: Nat) -> Bool:
  +h = column_height(seed, x, z)
  +trunk_y = same(y, h) || same(y, Nat.add(h, 1n))
    || same(y, Nat.add(h, 2n))
  tree_at(seed, x, z) && trunk_y

def canopy_at(
  +seed: Nat, +cx: Nat, +cz: Nat, +x: Nat, +y: Nat, +z: Nat
) -> Bool:
  +h = column_height(seed, cx, cz)
  +canopy_y = same(y, Nat.add(h, 2n)) || same(y, Nat.add(h, 3n))
  tree_at(seed, cx, cz) && near(x, cx) && near(z, cz) && canopy_y

def canopy(+seed: Nat, +x: Nat, +y: Nat, +z: Nat) -> Bool:
  +xm = Nat.sub(x, 1n)
  +xp = Nat.add(x, 1n)
  +zm = Nat.sub(z, 1n)
  +zp = Nat.add(z, 1n)
  canopy_at(seed, xm, zm, x, y, z) || canopy_at(seed, xm, z, x, y, z)
    || canopy_at(seed, xm, zp, x, y, z) || canopy_at(seed, x, zm, x, y, z)
    || canopy_at(seed, x, z, x, y, z) || canopy_at(seed, x, zp, x, y, z)
    || canopy_at(seed, xp, zm, x, y, z) || canopy_at(seed, xp, z, x, y, z)
    || canopy_at(seed, xp, zp, x, y, z)

def terrain_block(+seed: Nat, +x: Nat, +y: Nat, +z: Nat) -> U32:
  +h = column_height(seed, x, z)
  +inside = Nat.is_lt(y, h)
  +top = same(y, Nat.sub(h, 1n))
  +deep = Nat.is_lt(y, Nat.sub(h, 3n))
  Bool.pick(U32, inside,
    Bool.pick(U32, top, 3, Bool.pick(U32, deep, 1, 2)),
    0)

def block(+seed: Nat, +x: Nat, +y: Nat, +z: Nat) -> U32:
  +wood = trunk_at(seed, x, y, z)
  +leaf = canopy(seed, x, y, z)
  Bool.pick(U32, wood, 5,
    Bool.pick(U32, leaf, 4, terrain_block(seed, x, y, z)))

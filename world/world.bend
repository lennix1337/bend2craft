import Base
import ./structures.bend as Structures

# Block IDs: 0 air, 1 stone, 2 dirt, 3 grass, 4 leaves, 5 wood, 6 sand, 7 water,
# 8 coal ore, 9 iron ore, 10 diamond ore, 11 furnace, 12 torch, 13 bed,
# 14 closed door, 15 open door, 16-19 wheat growth stages, 20 farmland, 21 lava,
# 22 cobblestone, 23 obsidian, 25 glass, 26 chest, 27 crafting table.

def default_seed() -> Nat:
  1337n

def chunk_size() -> Nat:
  16n

def width() -> Nat:
  48n

def depth() -> Nat:
  48n

def max_y() -> Nat:
  20n

def sea_level() -> Nat:
  7n

def plains_limit() -> Nat:
  96n

def same(+a: Nat, +b: Nat) -> Bool:
  Nat.is_eq(a, b)

def near(+a: Nat, +b: Nat) -> Bool:
  Nat.is_eq(a, b) || Nat.is_eq(a, Nat.add(b, 1n))
    || Nat.is_eq(Nat.add(a, 1n), b)

def triangle(+value: Nat, +period: Nat) -> Nat:
  +phase = Nat.mod(value, period)
  Nat.min(phase, Nat.sub(period, phase))

def mix(+seed: Nat, +x: Nat, +z: Nat) -> Nat:
  +seed_part = Nat.mod(seed, 997n)
  +safe_x = Nat.mod(x, 4096n)
  +safe_z = Nat.mod(z, 4096n)
  +x_square = Nat.mul(safe_x, safe_x)
  +z_square = Nat.mul(safe_z, safe_z)
  +quadratic = Nat.add(Nat.mul(x_square, 17n), Nat.mul(z_square, 31n))
  +cross = Nat.mul(Nat.mul(safe_x, safe_z), 13n)
  +spread = Nat.add(quadratic, cross)
  Nat.mod(Nat.add(spread, Nat.mul(seed_part, 7n)), 97n)

def plains_at(+x: Nat, +z: Nat) -> Bool:
  Nat.is_lt(x, plains_limit()) && Nat.is_lt(z, plains_limit())

def biome_at(+seed: Nat, +x: Nat, +z: Nat) -> U32:
  Bool.pick(
    U32, plains_at(x, z), 0,
    U32.from_nat(Nat.mod(mix(seed, Nat.div(x, 32n), Nat.div(z, 32n)), 4n))
  )

def rolling_height(+seed: Nat, +x: Nat, +z: Nat) -> Nat:
  +macro_phase = Nat.add(Nat.add(x, z), Nat.mod(seed, 24n))
  +macro = triangle(macro_phase, 24n)
  +ridge_phase = Nat.add(
    Nat.add(Nat.mul(x, 2n), Nat.mul(z, 3n)),
    Nat.mod(seed, 18n)
  )
  +ridge = triangle(ridge_phase, 18n)
  +detail = Nat.mod(mix(seed, x, z), 3n)
  Nat.add(5n, Nat.add(Nat.div(macro, 3n), Nat.add(Nat.div(ridge, 2n), detail)))

def plains_height(+seed: Nat, +x: Nat, +z: Nat) -> Nat:
  +macro_phase = Nat.add(Nat.add(x, z), Nat.mod(seed, 48n))
  +macro = triangle(macro_phase, 48n)
  +ridge_phase = Nat.add(
    Nat.add(Nat.mul(x, 2n), z),
    Nat.mod(seed, 40n)
  )
  +ridge = triangle(ridge_phase, 40n)
  +region_noise = Nat.mod(mix(seed, Nat.div(x, 4n), Nat.div(z, 4n)), 2n)
  Nat.add(7n, Nat.add(Nat.div(macro, 12n), Nat.add(Nat.div(ridge, 20n), region_noise)))

def desert_height(+seed: Nat, +x: Nat, +z: Nat) -> Nat:
  +macro = triangle(Nat.add(Nat.add(x, z), Nat.mod(seed, 32n)), 32n)
  +detail = Nat.mod(mix(seed, Nat.div(x, 4n), Nat.div(z, 4n)), 2n)
  Nat.add(6n, Nat.add(Nat.div(macro, 16n), detail))

def mountain_height(+seed: Nat, +x: Nat, +z: Nat) -> Nat:
  +macro = triangle(Nat.add(Nat.add(x, z), Nat.mod(seed, 32n)), 32n)
  +ridge = triangle(Nat.add(Nat.add(Nat.mul(x, 3n), z), Nat.mod(seed, 24n)), 24n)
  Nat.add(10n, Nat.add(Nat.div(macro, 4n), Nat.div(ridge, 3n)))

def column_height(+seed: Nat, +x: Nat, +z: Nat) -> Nat:
  +biome = biome_at(seed, x, z)
  +desert = U32.is_eq(biome, 2)
  +mountain = U32.is_eq(biome, 3)
  Bool.pick(Nat, plains_at(x, z), plains_height(seed, x, z),
    Bool.pick(Nat, desert, desert_height(seed, x, z),
      Bool.pick(Nat, mountain, mountain_height(seed, x, z), rolling_height(seed, x, z))))

def tree_at_height(+seed: Nat, +x: Nat, +z: Nat, +h: Nat) -> Bool:
  +biome = biome_at(seed, x, z)
  +forest = U32.is_eq(biome, 1)
  +hash = Nat.mod(Nat.add(mix(seed, x, z), Nat.mod(seed, 17n)), 37n)
  +forest_hash = Nat.mod(Nat.add(mix(seed, x, z), Nat.mod(seed, 9n)), 9n)
  +selected = Bool.pick(Bool, forest, Nat.is_eq(forest_hash, 0n), Nat.is_eq(hash, 0n))
  +highland = Nat.is_gt(h, Nat.add(sea_level(), 1n))
  +away_x = Nat.is_gt(x, 1n)
  +away_z = Nat.is_gt(z, 1n)
  +woodland = Bool.or(U32.is_eq(biome, 0), forest)
  highland && woodland && away_x && away_z && selected

def tree_at(+seed: Nat, +x: Nat, +z: Nat) -> Bool:
  tree_at_height(seed, x, z, column_height(seed, x, z))

def trunk_at_height(+seed: Nat, +x: Nat, +y: Nat, +z: Nat, +h: Nat) -> Bool:
  +trunk_y = same(y, h) || same(y, Nat.add(h, 1n))
    || same(y, Nat.add(h, 2n))
  tree_at_height(seed, x, z, h) && trunk_y

def trunk_at(+seed: Nat, +x: Nat, +y: Nat, +z: Nat) -> Bool:
  +h = column_height(seed, x, z)
  trunk_at_height(seed, x, y, z, h)

def canopy_at(
  +seed: Nat, +cx: Nat, +cz: Nat, +x: Nat, +y: Nat, +z: Nat
) -> Bool:
  +h = column_height(seed, cx, cz)
  +near_x = near(x, cx)
  +near_z = near(z, cz)
  +lower_canopy = same(y, Nat.add(h, 2n)) && near_x && near_z
  +upper_arm = same(y, Nat.add(h, 3n)) && near_x && near_z
    && (same(x, cx) || same(z, cz))
  tree_at_height(seed, cx, cz, h) && (lower_canopy || upper_arm)

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

def cave_at_height(+seed: Nat, +x: Nat, +y: Nat, +z: Nat, +h: Nat) -> Bool:
  +enclosed = Nat.is_gt(y, 1n) && Nat.is_lt(Nat.add(y, 2n), h)
  +hash = Nat.mod(Nat.add(mix(seed, x, z), Nat.mul(y, 17n)), 43n)
  enclosed && Nat.is_eq(hash, 0n)

def cave_at(+seed: Nat, +x: Nat, +y: Nat, +z: Nat) -> Bool:
  cave_at_height(seed, x, y, z, column_height(seed, x, z))

def water_at_height(+h: Nat, +y: Nat) -> Bool:
  Nat.is_le(h, y) && Nat.is_lt(y, Nat.add(sea_level(), 1n))

def water_at(+seed: Nat, +x: Nat, +y: Nat, +z: Nat) -> Bool:
  water_at_height(column_height(seed, x, z), y)

def lava_at(+seed: Nat, +x: Nat, +y: Nat, +z: Nat) -> Bool:
  +height = column_height(seed, x, z)
  +deep = Bool.and(Nat.is_gt(y, 1n), Nat.is_le(y, 3n))
  +inside = Nat.is_lt(y, height)
  +hash = Nat.mod(Nat.add(mix(seed, x, z), Nat.mul(y, 13n)), 29n)
  Bool.and(Bool.and(deep, inside), Nat.is_eq(hash, 0n))

def ore_block(+seed: Nat, +x: Nat, +y: Nat, +z: Nat) -> U32:
  +hash = Nat.mod(Nat.add(Nat.add(mix(seed, x, z), Nat.mul(y, 17n)), Nat.mod(seed, 89n)), 97n)
  +diamond = Nat.is_eq(Nat.mod(hash, 97n), 0n)
  +iron = Nat.is_eq(Nat.mod(hash, 31n), 0n)
  +coal = Nat.is_eq(Nat.mod(hash, 11n), 0n)
  Bool.pick(U32, diamond, 10,
    Bool.pick(U32, iron, 9,
      Bool.pick(U32, coal, 8, 1)))

def deep_block(+seed: Nat, +x: Nat, +y: Nat, +z: Nat, +h: Nat) -> U32:
  Bool.pick(U32, Bool.and(Nat.is_gt(y, 0n), Nat.is_lt(y, Nat.sub(h, 3n))), ore_block(seed, x, y, z), 2)

def terrain_block_height(+h: Nat, +y: Nat) -> U32:
  +inside = Nat.is_lt(y, h)
  +top = same(y, Nat.sub(h, 1n))
  +second = same(y, Nat.sub(h, 2n))
  +deep = Nat.is_lt(y, Nat.sub(h, 3n))
  +beach = Nat.is_le(h, sea_level())
  +top_block = Bool.pick(U32, beach, 6, 3)
  +soil_block = Bool.pick(U32, beach, 6, 2)
  Bool.pick(U32, inside,
    Bool.pick(U32, top, top_block,
      Bool.pick(U32, second, soil_block,
        Bool.pick(U32, deep, 1, 2))),
    0)

def shoreline_at(+seed: Nat, +x: Nat, +z: Nat, +h: Nat) -> Bool:
  +west = Nat.is_lt(column_height(seed, Nat.sub(x, 1n), z), h)
  +east = Nat.is_lt(column_height(seed, Nat.add(x, 1n), z), h)
  +north = Nat.is_lt(column_height(seed, x, Nat.sub(z, 1n)), h)
  +south = Nat.is_lt(column_height(seed, x, Nat.add(z, 1n)), h)
  +low_neighbor = Bool.or(west, Bool.or(east, Bool.or(north, south)))
  Bool.and(low_neighbor, Nat.is_le(h, Nat.add(sea_level(), 1n)))

def terrain_block_at(
  +seed: Nat, +x: Nat, +y: Nat, +z: Nat, +h: Nat
) -> U32:
  +biome = biome_at(seed, x, z)
  +desert = U32.is_eq(biome, 2)
  +beach = Nat.is_le(h, sea_level())
  +shore = shoreline_at(seed, x, z, h)
  +sand_surface = Bool.or(beach, Bool.or(shore, desert))
  +inside = Nat.is_lt(y, h)
  +top = same(y, Nat.sub(h, 1n))
  +second = same(y, Nat.sub(h, 2n))
  +deep = Nat.is_lt(y, Nat.sub(h, 3n))
  +top_block = Bool.pick(U32, sand_surface, 6, 3)
  +soil_block = Bool.pick(U32, sand_surface, 6, 2)
  Bool.pick(U32, inside,
    Bool.pick(U32, top, top_block,
      Bool.pick(U32, second, soil_block,
        Bool.pick(U32, deep, deep_block(seed, x, y, z, h), 2))),
    0)

def terrain_block(+seed: Nat, +x: Nat, +y: Nat, +z: Nat) -> U32:
  terrain_block_at(seed, x, y, z, column_height(seed, x, z))

def block(+seed: Nat, +x: Nat, +y: Nat, +z: Nat) -> U32:
  +height = column_height(seed, x, z)
  +village_height = column_height(seed, Structures.village_origin_x(seed), Structures.village_origin_z(seed))
  +structure = Structures.block(seed, x, y, z, village_height)
  +wood = trunk_at(seed, x, y, z)
  +leaf = canopy(seed, x, y, z)
  +lava = lava_at(seed, x, y, z)
  +cave = cave_at(seed, x, y, z)
  +water = water_at(seed, x, y, z)
  Bool.pick(U32, U32.is_ne(structure, 0), structure,
    Bool.pick(U32, wood, 5,
      Bool.pick(U32, leaf, 4,
        Bool.pick(U32, lava, 21,
          Bool.pick(U32, cave, 0,
            Bool.pick(U32, water, 7, terrain_block(seed, x, y, z)))))))

# Above the terrain surface only generated structures, trunks, and canopy can
# provide shade. Keep this narrower query separate from the full block rule so
# sunlight does not repeatedly evaluate caves, water, lava, and ore generation.
def generated_tree_cover_at(
  +seed: Nat, +center_x: Nat, +center_z: Nat, +x: Nat, +z: Nat, +cell_y: Nat
) -> Bool:
  +h = column_height(seed, center_x, center_z)
  +lower_y = Nat.add(h, 2n)
  +upper_y = Nat.add(h, 3n)
  Bool.or(
    Bool.and(Nat.is_gt(lower_y, cell_y), canopy_at(seed, center_x, center_z, x, lower_y, z)),
    Bool.and(Nat.is_gt(upper_y, cell_y), canopy_at(seed, center_x, center_z, x, upper_y, z))
  )

def generated_tree_cover(+seed: Nat, +x: Nat, +z: Nat, +cell_y: Nat) -> Bool:
  Bool.or(
    generated_tree_cover_at(seed, Nat.sub(x, 1n), Nat.sub(z, 1n), x, z, cell_y),
    Bool.or(
      generated_tree_cover_at(seed, Nat.sub(x, 1n), z, x, z, cell_y),
      Bool.or(
        generated_tree_cover_at(seed, Nat.sub(x, 1n), Nat.add(z, 1n), x, z, cell_y),
        Bool.or(
          generated_tree_cover_at(seed, x, Nat.sub(z, 1n), x, z, cell_y),
          Bool.or(
            generated_tree_cover_at(seed, x, z, x, z, cell_y),
            Bool.or(
              generated_tree_cover_at(seed, x, Nat.add(z, 1n), x, z, cell_y),
              Bool.or(
                generated_tree_cover_at(seed, Nat.add(x, 1n), Nat.sub(z, 1n), x, z, cell_y),
                Bool.or(
                  generated_tree_cover_at(seed, Nat.add(x, 1n), z, x, z, cell_y),
                  generated_tree_cover_at(seed, Nat.add(x, 1n), Nat.add(z, 1n), x, z, cell_y)
                )
              )
            )
          )
        )
      )
    )
  )

def generated_cover_above(+seed: Nat, +x: Nat, +cell_y: Nat, +z: Nat) -> U32:
  +village_height = column_height(seed, Structures.village_origin_x(seed), Structures.village_origin_z(seed))
  +structure_1 = Structures.block(seed, x, Nat.add(cell_y, 1n), z, village_height)
  +structure_2 = Structures.block(seed, x, Nat.add(cell_y, 2n), z, village_height)
  +structure_3 = Structures.block(seed, x, Nat.add(cell_y, 3n), z, village_height)
  +structure_4 = Structures.block(seed, x, Nat.add(cell_y, 4n), z, village_height)
  +structure = Bool.pick(U32, U32.is_ne(structure_1, 0), structure_1,
    Bool.pick(U32, U32.is_ne(structure_2, 0), structure_2,
      Bool.pick(U32, U32.is_ne(structure_3, 0), structure_3, structure_4)))
  +tree_cover = generated_tree_cover(seed, x, z, cell_y)
  Bool.pick(U32, U32.is_ne(structure, 0), structure, Bool.pick(U32, tree_cover, 4, 0))

type SpawnCell is Data:
  SpawnCell{x: Nat, z: Nat, height: Nat}

def spawn_tree_row_left(+seed: Nat, +x: Nat, +row_z: Nat) -> Bool:
  +a = tree_at(seed, Nat.sub(x, 7n), row_z)
  +b = tree_at(seed, Nat.sub(x, 6n), row_z)
  +c = tree_at(seed, Nat.sub(x, 5n), row_z)
  +d = tree_at(seed, Nat.sub(x, 4n), row_z)
  +e = tree_at(seed, Nat.sub(x, 3n), row_z)
  +f = tree_at(seed, Nat.sub(x, 2n), row_z)
  +g = tree_at(seed, Nat.sub(x, 1n), row_z)
  Bool.or(a, Bool.or(b, Bool.or(c, Bool.or(d, Bool.or(e,
    Bool.or(f, g))))))

def spawn_tree_row_right(+seed: Nat, +x: Nat, +row_z: Nat) -> Bool:
  +h = tree_at(seed, x, row_z)
  +i = tree_at(seed, Nat.add(x, 1n), row_z)
  +j = tree_at(seed, Nat.add(x, 2n), row_z)
  +k = tree_at(seed, Nat.add(x, 3n), row_z)
  +l = tree_at(seed, Nat.add(x, 4n), row_z)
  +m = tree_at(seed, Nat.add(x, 5n), row_z)
  +n = tree_at(seed, Nat.add(x, 6n), row_z)
  +o = tree_at(seed, Nat.add(x, 7n), row_z)
  Bool.or(h, Bool.or(i, Bool.or(j, Bool.or(k, Bool.or(l,
    Bool.or(m, Bool.or(n, o)))))))

def spawn_tree_row(+seed: Nat, +x: Nat, +row_z: Nat) -> Bool:
  Bool.or(spawn_tree_row_left(seed, x, row_z), spawn_tree_row_right(seed, x, row_z))

def spawn_tree_band(+seed: Nat, +x: Nat, +row_z: Nat) -> Bool:
  +row0 = spawn_tree_row(seed, x, row_z)
  +row1 = spawn_tree_row(seed, x, Nat.add(row_z, 1n))
  +row2 = spawn_tree_row(seed, x, Nat.add(row_z, 2n))
  +row3 = spawn_tree_row(seed, x, Nat.add(row_z, 3n))
  +row4 = spawn_tree_row(seed, x, Nat.add(row_z, 4n))
  Bool.or(row0, Bool.or(row1, Bool.or(row2, Bool.or(row3, row4))))

def spawn_tree_near(+seed: Nat, +x: Nat, +z: Nat) -> Bool:
  +north = spawn_tree_band(seed, x, Nat.sub(z, 7n))
  +middle = spawn_tree_band(seed, x, Nat.sub(z, 2n))
  +south = spawn_tree_band(seed, x, Nat.add(z, 3n))
  Bool.or(north, Bool.or(middle, south))

def spawn_tree_free(+seed: Nat, +x: Nat, +z: Nat) -> Bool:
  Bool.not(spawn_tree_near(seed, x, z))

def spawn_structure_open(+seed: Nat, +x: Nat, +y: Nat, +z: Nat, +village_height: Nat) -> Bool:
  U32.is_eq(Structures.block(seed, x, y, z, village_height), 0)

def spawn_structure_row(+seed: Nat, +x: Nat, +y: Nat, +row_z: Nat, +village_height: Nat) -> Bool:
  +a = spawn_structure_open(seed, Nat.sub(x, 4n), y, row_z, village_height)
  +b = spawn_structure_open(seed, Nat.sub(x, 3n), y, row_z, village_height)
  +c = spawn_structure_open(seed, Nat.sub(x, 2n), y, row_z, village_height)
  +d = spawn_structure_open(seed, Nat.sub(x, 1n), y, row_z, village_height)
  +e = spawn_structure_open(seed, x, y, row_z, village_height)
  +f = spawn_structure_open(seed, Nat.add(x, 1n), y, row_z, village_height)
  +g = spawn_structure_open(seed, Nat.add(x, 2n), y, row_z, village_height)
  +h = spawn_structure_open(seed, Nat.add(x, 3n), y, row_z, village_height)
  +i = spawn_structure_open(seed, Nat.add(x, 4n), y, row_z, village_height)
  Bool.and(a, Bool.and(b, Bool.and(c, Bool.and(d, Bool.and(e,
    Bool.and(f, Bool.and(g, Bool.and(h, i))))))))

def spawn_structure_band(+seed: Nat, +x: Nat, +y: Nat, +row_z: Nat, +village_height: Nat) -> Bool:
  +row0 = spawn_structure_row(seed, x, y, row_z, village_height)
  +row1 = spawn_structure_row(seed, x, y, Nat.add(row_z, 1n), village_height)
  +row2 = spawn_structure_row(seed, x, y, Nat.add(row_z, 2n), village_height)
  Bool.and(row0, Bool.and(row1, row2))

def spawn_structures_free(+seed: Nat, +x: Nat, +y: Nat, +z: Nat, +village_height: Nat) -> Bool:
  +north = spawn_structure_band(seed, x, y, Nat.sub(z, 4n), village_height)
  +middle = spawn_structure_band(seed, x, y, Nat.sub(z, 1n), village_height)
  +south = spawn_structure_band(seed, x, y, Nat.add(z, 2n), village_height)
  Bool.and(north, Bool.and(middle, south))

def spawn_structure_front_left(+seed: Nat, +x: Nat, +y: Nat, +row_z: Nat, +village_height: Nat) -> Bool:
  +a = spawn_structure_open(seed, Nat.sub(x, 6n), y, row_z, village_height)
  +b = spawn_structure_open(seed, Nat.sub(x, 5n), y, row_z, village_height)
  +c = spawn_structure_open(seed, Nat.sub(x, 4n), y, row_z, village_height)
  +d = spawn_structure_open(seed, Nat.sub(x, 3n), y, row_z, village_height)
  +e = spawn_structure_open(seed, Nat.sub(x, 2n), y, row_z, village_height)
  +f = spawn_structure_open(seed, Nat.sub(x, 1n), y, row_z, village_height)
  Bool.and(a, Bool.and(b, Bool.and(c, Bool.and(d, Bool.and(e, f)))))

def spawn_structure_front_right(+seed: Nat, +x: Nat, +y: Nat, +row_z: Nat, +village_height: Nat) -> Bool:
  +h = spawn_structure_open(seed, Nat.add(x, 1n), y, row_z, village_height)
  +i = spawn_structure_open(seed, Nat.add(x, 2n), y, row_z, village_height)
  +j = spawn_structure_open(seed, Nat.add(x, 3n), y, row_z, village_height)
  +k = spawn_structure_open(seed, Nat.add(x, 4n), y, row_z, village_height)
  +l = spawn_structure_open(seed, Nat.add(x, 5n), y, row_z, village_height)
  +m = spawn_structure_open(seed, Nat.add(x, 6n), y, row_z, village_height)
  Bool.and(h, Bool.and(i, Bool.and(j, Bool.and(k, Bool.and(l, m)))))

def spawn_structure_front_row(+seed: Nat, +x: Nat, +y: Nat, +row_z: Nat, +village_height: Nat) -> Bool:
  +center = spawn_structure_open(seed, x, y, row_z, village_height)
  Bool.and(spawn_structure_front_left(seed, x, y, row_z, village_height),
    Bool.and(center, spawn_structure_front_right(seed, x, y, row_z, village_height)))

def spawn_structure_front(+seed: Nat, +x: Nat, +y: Nat, +z: Nat, +village_height: Nat) -> Bool:
  +far = spawn_structure_front_row(seed, x, y, Nat.sub(z, 6n), village_height)
  +middle = spawn_structure_front_row(seed, x, y, Nat.sub(z, 5n), village_height)
  +front_near = spawn_structure_front_row(seed, x, y, Nat.sub(z, 4n), village_height)
  Bool.and(far, Bool.and(middle, front_near))

def spawn_ground_level(+seed: Nat, +x: Nat, +z: Nat, +low: Nat, +high: Nat) -> Bool:
  +h = column_height(seed, x, z)
  Bool.and(Nat.is_ge(h, low), Nat.is_le(h, high))

def spawn_ground_free(+seed: Nat, +x: Nat, +z: Nat, +height: Nat) -> Bool:
  +xm = Nat.sub(x, 1n)
  +xp = Nat.add(x, 1n)
  +zm = Nat.sub(z, 1n)
  +zp = Nat.add(z, 1n)
  +low = Nat.sub(height, 1n)
  +high = height
  +row_north = Bool.and(spawn_ground_level(seed, xm, zm, low, high), Bool.and(spawn_ground_level(seed, x, zm, low, high), spawn_ground_level(seed, xp, zm, low, high)))
  +row_middle = Bool.and(spawn_ground_level(seed, xm, z, low, high), Bool.and(spawn_ground_level(seed, x, z, low, high), spawn_ground_level(seed, xp, z, low, high)))
  +row_south = Bool.and(spawn_ground_level(seed, xm, zp, low, high), Bool.and(spawn_ground_level(seed, x, zp, low, high), spawn_ground_level(seed, xp, zp, low, high)))
  Bool.and(row_north, Bool.and(row_middle, row_south))

def spawn_clear(+seed: Nat, +x: Nat, +z: Nat) -> Bool:
  +height = column_height(seed, x, z)
  +village_height = column_height(seed, Structures.village_origin_x(seed), Structures.village_origin_z(seed))
  +trees = spawn_tree_free(seed, x, z)
  +struct_feet = spawn_structures_free(seed, x, height, z, village_height)
  +struct_head = spawn_structures_free(seed, x, Nat.add(height, 1n), z, village_height)
  +struct_upper = spawn_structures_free(seed, x, Nat.add(height, 2n), z, village_height)
  +struct_front = spawn_structure_front(seed, x, height, z, village_height)
  +ground = spawn_ground_free(seed, x, z, height)
  +open = Bool.and(Bool.and(trees, struct_feet), Bool.and(struct_head,
    Bool.and(struct_upper, Bool.and(struct_front, ground))))
  Bool.and(open, Nat.is_gt(height, sea_level()))

def spawn_search(+seed: Nat, +remaining: Nat, +index: Nat) -> SpawnCell:
  match remaining:
    case 0n:
      SpawnCell{8n, 8n, column_height(seed, 8n, 8n)}
    case 1n+p:
      +x = Nat.mod(index, width())
      +z = Nat.div(index, width())
      +height = column_height(seed, x, z)
      +valid = spawn_clear(seed, x, z)
      +next_index = Nat.mod(Nat.add(index, 1n), Nat.mul(width(), depth()))
      Bool.pick(SpawnCell, valid, SpawnCell{x, z, height}, spawn_search(seed, p, next_index))

def spawn_cell(+seed: Nat) -> SpawnCell:
  spawn_search(
    seed,
    Nat.mul(width(), depth()),
    Nat.add(Nat.mul(Nat.div(depth(), 3n), width()), Nat.div(width(), 2n)),
  )

def chunk_wood.if(
  +seed: Nat, +x: Nat, +y: Nat, +z: Nat, +h: Nat, in_range: Bool
) -> Bool:
  match in_range:
    case True{}:
      trunk_at_height(seed, x, y, z, h)
    case False{}:
      False{}

def chunk_wood(+seed: Nat, +x: Nat, +y: Nat, +z: Nat, +h: Nat) -> Bool:
  chunk_wood.if(seed, x, y, z, h,
    Nat.is_ge(y, h) && Nat.is_lt(y, Nat.add(h, 3n)))

def chunk_leaf.if(+seed: Nat, +x: Nat, +y: Nat, +z: Nat, visible: Bool) -> Bool:
  match visible:
    case True{}:
      canopy(seed, x, y, z)
    case False{}:
      False{}

def chunk_leaf(+seed: Nat, +x: Nat, +y: Nat, +z: Nat) -> Bool:
  chunk_leaf.if(seed, x, y, z, Nat.is_gt(y, 10n))

def chunk_cave.if(
  +seed: Nat, +x: Nat, +y: Nat, +z: Nat, +h: Nat, enclosed: Bool
) -> Bool:
  match enclosed:
    case True{}:
      cave_at_height(seed, x, y, z, h)
    case False{}:
      False{}

def chunk_cave(+seed: Nat, +x: Nat, +y: Nat, +z: Nat, +h: Nat) -> Bool:
  chunk_cave.if(seed, x, y, z, h,
    Nat.is_gt(y, 1n) && Nat.is_lt(Nat.add(y, 2n), h))

def chunk_structure.if(
  +seed: Nat, +x: Nat, +y: Nat, +z: Nat, +village_height: Nat, near: Bool
) -> U32:
  match near:
    case True{}:
      Structures.block(seed, x, y, z, village_height)
    case False{}:
      0

def chunk_structure(
  +seed: Nat, +x: Nat, +y: Nat, +z: Nat, +village_height: Nat
) -> U32:
  +origin_x = Structures.village_origin_x(seed)
  +origin_z = Structures.village_origin_z(seed)
  +near_x = Nat.is_ge(x, Nat.sub(origin_x, 8n))
    && Nat.is_lt(x, Nat.add(origin_x, 14n))
  +near_z = Nat.is_ge(z, Nat.sub(origin_z, 8n))
    && Nat.is_lt(z, Nat.add(origin_z, 14n))
  chunk_structure.if(
    seed, x, y, z, village_height,
    Structures.village_height_valid(village_height) && Bool.and(near_x, near_z)
  )

def chunk_terrain.if(
  +seed: Nat, +x: Nat, +y: Nat, +z: Nat, +height: Nat, inside: Bool
) -> U32:
  match inside:
    case True{}:
      terrain_block_at(seed, x, y, z, height)
    case False{}:
      0

def chunk_terrain(
  +seed: Nat, +x: Nat, +y: Nat, +z: Nat, +height: Nat
) -> U32:
  chunk_terrain.if(seed, x, y, z, height, Nat.is_lt(y, height))

def chunk_block.height(
  +seed: Nat, +x: Nat, +y: Nat, +z: Nat, +h: Nat, +village_height: Nat
) -> U32:
  +structure = chunk_structure(seed, x, y, z, village_height)
  +wood = chunk_wood(seed, x, y, z, h)
  +leaf = chunk_leaf(seed, x, y, z)
  +cave = chunk_cave(seed, x, y, z, h)
  +water = water_at_height(h, y)
  +terrain = chunk_terrain(seed, x, y, z, h)
  Bool.pick(U32, U32.is_ne(structure, 0), structure,
    Bool.pick(U32, wood, 5,
      Bool.pick(U32, leaf, 4,
        Bool.pick(U32, cave, 0,
          Bool.pick(U32, water, 7, terrain)))))

def chunk_block(+seed: Nat, +x: Nat, +y: Nat, +z: Nat) -> U32:
  +h = column_height(seed, x, z)
  +village_height = column_height(seed, Structures.village_origin_x(seed), Structures.village_origin_z(seed))
  chunk_block.height(seed, x, y, z, h, village_height)

def chunk.value.if(
  +seed: Nat, +chunk_x: Nat, +chunk_z: Nat, +index: Nat, valid: Bool
) -> U32:
  match valid:
    case True{}:
      +column = Nat.mul(chunk_size(), chunk_size())
      +y = Nat.div(index, column)
      +in_column = Nat.mod(index, column)
      +z = Nat.div(in_column, chunk_size())
      +x = Nat.mod(in_column, chunk_size())
      +global_x = Nat.add(Nat.mul(chunk_x, chunk_size()), x)
      +global_z = Nat.add(Nat.mul(chunk_z, chunk_size()), z)
      chunk_block(seed, global_x, y, global_z)
    case False{}:
      0

def chunk_cells() -> Nat:
  Nat.mul(Nat.mul(chunk_size(), chunk_size()), max_y())

def chunk.value(+seed: Nat, +chunk_x: Nat, +chunk_z: Nat, +index: Nat) -> U32:
  chunk.value.if(seed, chunk_x, chunk_z, index, Nat.is_lt(index, chunk_cells()))

def chunk.column.fill(
  +seed: Nat, +global_x: Nat, +global_z: Nat, +local_x: Nat, +local_z: Nat,
  +height: Nat, +village_height: Nat, +remaining: Nat, +y: Nat,
  blocks: Array<U32>
) -> Array<U32>:
  match remaining:
    case 0n:
      blocks
    case 1n+p:
      +index = Nat.add(local_x, Nat.mul(chunk_size(), Nat.add(local_z, Nat.mul(chunk_size(), y))))
      updated = blocks[U32.from_nat(index)] <- chunk_block.height(seed, global_x, y, global_z, height, village_height)
      chunk.column.fill(seed, global_x, global_z, local_x, local_z, height, village_height, p, Nat.add(y, 1n), updated)

def chunk.columns.x(
  +seed: Nat, +chunk_x: Nat, +chunk_z: Nat, +village_height: Nat,
  +remaining: Nat, +local_x: Nat, +local_z: Nat, blocks: Array<U32>
) -> Array<U32>:
  match remaining:
    case 0n:
      blocks
    case 1n+p:
      +global_x = Nat.add(Nat.mul(chunk_x, chunk_size()), local_x)
      +global_z = Nat.add(Nat.mul(chunk_z, chunk_size()), local_z)
      +height = column_height(seed, global_x, global_z)
      updated = chunk.column.fill(seed, global_x, global_z, local_x, local_z, height, village_height, max_y(), 0n, blocks)
      chunk.columns.x(seed, chunk_x, chunk_z, village_height, p, Nat.add(local_x, 1n), local_z, updated)

def chunk.columns.z(
  +seed: Nat, +chunk_x: Nat, +chunk_z: Nat, +village_height: Nat,
  +remaining: Nat, +local_z: Nat, blocks: Array<U32>
) -> Array<U32>:
  match remaining:
    case 0n:
      blocks
    case 1n+p:
      updated = chunk.columns.x(seed, chunk_x, chunk_z, village_height, chunk_size(), 0n, local_z, blocks)
      chunk.columns.z(seed, chunk_x, chunk_z, village_height, p, Nat.add(local_z, 1n), updated)

def chunk(+seed: Nat, +chunk_x: Nat, +chunk_z: Nat) -> Array<U32>:
  +village_height = column_height(seed, Structures.village_origin_x(seed), Structures.village_origin_z(seed))
  chunk.columns.z(seed, chunk_x, chunk_z, village_height, chunk_size(), 0n, Array.new(U32, 13n, 0))

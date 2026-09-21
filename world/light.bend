import Base
import ./world.bend as World
import ./lightflood.bend as Flood

type Edit is Data:
  Edit{x: Nat, y: Nat, z: Nat, block: U32}

type Point is Data:
  Point{x: Nat, y: Nat, z: Nat}

type LightField is Data:
  Field{x: Nat, y: Nat, z: Nat, light: U32}

type Cell is Data:
  Cell{x: Nat, y: Nat, z: Nat}

type LightCell is Data:
  LightCell{x: Nat, y: Nat, z: Nat, light: U32}

def max_light() -> U32:
  15

def source(+x: Nat, +y: Nat, +z: Nat) -> Edit:
  Edit{x, y, z, 12}

def lava_source(+x: Nat, +y: Nat, +z: Nat) -> Edit:
  Edit{x, y, z, 21}

def is_light_source(+block: U32) -> Bool:
  Bool.or(U32.is_eq(block, 12), U32.is_eq(block, 21))

def cave_ambient(+y: Nat) -> U32:
  U32.from_nat(Nat.min(12n, Nat.add(3n, Nat.div(y, 2n))))

def distance_component(+a: Nat, +b: Nat) -> Nat:
  Bool.pick(Nat, Nat.is_ge(a, b), Nat.sub(a, b), Nat.sub(b, a))

def opaque(+seed: Nat, point: Point) -> Bool:
  Point{+x, +y, +z} = point
  +height = World.column_height(seed, x, z)
  +terrain = World.terrain_block_at(seed, x, y, z, height)
  +cave = World.cave_at_height(seed, x, y, z, height)
  +water = World.water_at_height(height, y)
  +lava = World.lava_at(seed, x, y, z)
  +open_door = U32.is_eq(terrain, 15)
  Bool.and(Nat.is_lt(y, height),
    Bool.and(U32.is_ne(terrain, 0),
      Bool.not(Bool.or(Bool.or(Bool.or(cave, water), open_door), lava))))

def axis_coord(point: Point, +axis: U32) -> Nat:
  Point{+x, +y, +z} = point
  Bool.pick(Nat, U32.is_eq(axis, 0), x,
    Bool.pick(Nat, U32.is_eq(axis, 1), y, z))

def move_coord(+current: Nat, +forward: Bool) -> Nat:
  Bool.pick(Nat, forward, Nat.add(current, 1n), Nat.sub(current, 1n))

def move_point(point: Point, target: Point, +axis: U32, +forward: Bool) -> Point:
  Point{+x, +y, +z} = point
  Point{+tx, +ty, +tz} = target
  +on_x = U32.is_eq(axis, 0)
  +on_y = U32.is_eq(axis, 1)
  Point{
    Bool.pick(Nat, on_x, move_coord(x, forward), x),
    Bool.pick(Nat, on_y, move_coord(y, forward), y),
    Bool.pick(Nat, Bool.or(on_x, on_y), z, move_coord(z, forward))
  }

def clear_path(
  +seed: Nat, +remaining: Nat, +current: Point, +target: Point, +axis: U32, +forward: Bool,
  +same: Bool
) -> Bool:
  match remaining:
    case 0n:
      False{}
    case 1n+p:
      match same:
        case True{}:
          True{}
        case False{}:
          +next = move_point(current, target, axis, forward)
          Bool.and(Bool.not(opaque(seed, next)),
            clear_path(seed, p, next, target, axis, forward,
              Nat.is_eq(axis_coord(next, axis), axis_coord(target, axis))))

def path_clear(+seed: Nat, +current: Point, +target: Point, +axis: U32, +forward: Bool) -> Bool:
  clear_path(seed, 16n, current, target, axis, forward,
    Nat.is_eq(axis_coord(current, axis), axis_coord(target, axis)))

def make_point(x: Nat, y: Nat, z: Nat) -> Point:
  Point{x, y, z}

def source_visible(+seed: Nat, +sx: Nat, +sy: Nat, +sz: Nat, +x: Nat, +y: Nat, +z: Nat) -> Bool:
  +source_point = make_point(sx, sy, sz)
  +x_point = make_point(x, sy, sz)
  +y_point = make_point(x, y, sz)
  +z_point = make_point(sx, sy, z)
  +yz_point = make_point(sx, y, z)
  +target = make_point(x, y, z)
  +canonical = Bool.and(
    Bool.and(path_clear(seed, source_point, x_point, 0, Nat.is_lt(sx, x)),
      path_clear(seed, x_point, y_point, 1, Nat.is_lt(sy, y))),
    path_clear(seed, y_point, target, 2, Nat.is_lt(sz, z)))
  +alternate = Bool.and(
    Bool.and(path_clear(seed, source_point, z_point, 2, Nat.is_lt(sz, z)),
      path_clear(seed, z_point, yz_point, 1, Nat.is_lt(sy, y))),
    path_clear(seed, yz_point, target, 0, Nat.is_lt(sx, x)))
  Bool.or(canonical, alternate)

def near_sources(sources: List<&2, Edit>, +x: Nat, +y: Nat, +z: Nat) -> List<&2, Edit>:
  match sources:
    case Nil{}:
      Nil{}
    case Con{+head, +tail}:
      Edit{+sx, +sy, +sz, block} = head
      +distance = Nat.add(Nat.add(distance_component(sx, x), distance_component(sy, y)), distance_component(sz, z))
      +rest = near_sources(tail, x, y, z)
      Bool.pick(List<&2, Edit>, Nat.is_lt(distance, 15n), Con{head, rest}, rest)

def window_walls(
  +remaining: Nat, +index: Nat, +seed: Nat, +y: Nat,
  +base_x: Nat, +base_z: Nat, +walls: List<&2, Flood.Wall>
) -> List<&2, Flood.Wall>:
  match remaining:
    case 0n:
      walls
    case 1n+p:
      +z = Nat.div(index, 32n)
      +x = Nat.mod(index, 32n)
      +global_x = Nat.add(base_x, x)
      +global_z = Nat.add(base_z, z)
      +blocked = opaque(seed, make_point(global_x, y, global_z))
      +next = Bool.pick(List<&2, Flood.Wall>, blocked, Con{Flood.Wall{x, z}, walls}, walls)
      window_walls(p, Nat.add(index, 1n), seed, y, base_x, base_z, next)

def make_field(x: Nat, y: Nat, z: Nat, light: U32) -> LightField:
  Field{x, y, z, light}

def fields_from_cells(
  cells: List<&2, Flood.Cell>, +base_x: Nat, +y: Nat, +base_z: Nat
) -> List<&2, LightField>:
  match cells:
    case Nil{}:
      Nil{}
    case Con{+head, +tail}:
      Flood.Cell{+x, +z, +light} = head
      make_field(Nat.add(base_x, x), y, Nat.add(base_z, z), light)
        <> fields_from_cells(tail, base_x, y, base_z)

def lava_fields.one(source: Edit) -> List<&2, LightField>:
  Edit{+x, +y, +z, block} = source
  Con{
    Field{x, y, z, 15},
    Con{
      Field{Nat.add(x, 1n), y, z, 14},
      Con{
        Field{Nat.sub(x, 1n), y, z, 14},
        Con{
          Field{x, y, Nat.add(z, 1n), 14},
          Con{Field{x, y, Nat.sub(z, 1n), 14}, Nil{}}
        }
      }
    }
  }

def source_fields.one.if(
  source: Edit, +seed: Nat, is_lava: Bool
) -> List<&2, LightField>:
  Edit{+sx, +sy, +sz, +block} = source
  match is_lava:
    case True{}:
      lava_fields.one(source)
    case False{}:
      +base_x = Nat.sub(sx, 14n)
      +base_z = Nat.sub(sz, 14n)
      +walls = window_walls(1024n, 0n, seed, sy, base_x, base_z, Nil{})
      +local_x = Nat.sub(sx, base_x)
      +local_z = Nat.sub(sz, base_z)
      +source_cell = Bool.pick(Flood.Cell, U32.is_eq(block, 21), Flood.lava_source(local_x, local_z), Flood.source(local_x, local_z))
      +cells = Flood.run(Flood.sources(source_cell), walls, 1024n)
      fields_from_cells(cells, base_x, sy, base_z)

def source_fields.one(source: Edit, +seed: Nat) -> List<&2, LightField>:
  Edit{x, y, z, +block} = source
  source_fields.one.if(source, seed, U32.is_eq(block, 21))

def source_fields_one(source: Edit, +seed: Nat) -> List<&2, LightField>:
  source_fields.one(source, seed)

def append_fields(
  fields: List<&2, LightField>, tail: List<&2, LightField>
) -> List<&2, LightField>:
  match fields:
    case Nil{}:
      tail
    case Con{+head, +rest}:
      Con{head, append_fields(rest, tail)}

def source_fields(sources: List<&2, Edit>, +seed: Nat) -> List<&2, LightField>:
  match sources:
    case Nil{}:
      Nil{}
    case Con{+head, +tail}:
      Edit{+x, +y, +z, +block} = head
      +rest = source_fields(tail, seed)
      +own = Bool.pick(List<&2, LightField>, is_light_source(block), source_fields.one(head, seed), Nil{})
      append_fields(own, rest)

def source_relevant(source: Edit, +chunk_x: Nat, +chunk_z: Nat) -> Bool:
  Edit{+x, +y, +z, block} = source
  +base_x = Nat.mul(chunk_x, 16n)
  +base_z = Nat.mul(chunk_z, 16n)
  +end_x = Nat.add(base_x, 16n)
  +end_z = Nat.add(base_z, 16n)
  Bool.and(
    Bool.and(Nat.is_ge(Nat.add(x, 14n), base_x), Nat.is_lt(x, Nat.add(end_x, 14n))),
    Bool.and(Nat.is_ge(Nat.add(z, 14n), base_z), Nat.is_lt(z, Nat.add(end_z, 14n)))
  )

def source_fields.chunk(
  sources: List<&2, Edit>, +seed: Nat, +chunk_x: Nat, +chunk_z: Nat
) -> List<&2, LightField>:
  match sources:
    case Nil{}:
      Nil{}
    case Con{+head, +tail}:
      Edit{+x, +y, +z, +block} = head
      +rest = source_fields.chunk(tail, seed, chunk_x, chunk_z)
      +relevant = Bool.and(is_light_source(block), source_relevant(head, chunk_x, chunk_z))
      +own = Bool.pick(List<&2, LightField>, relevant, source_fields.one(head, seed), Nil{})
      append_fields(own, rest)

def source_fields_chunk(
  sources: List<&2, Edit>, +seed: Nat, +chunk_x: Nat, +chunk_z: Nat
) -> List<&2, LightField>:
  source_fields.chunk(sources, seed, chunk_x, chunk_z)

def field_light(fields: List<&2, LightField>, +x: Nat, +y: Nat, +z: Nat, +best: U32) -> U32:
  match fields:
    case Nil{}:
      best
    case Con{+head, +tail}:
      Field{+fx, +fy, +fz, +light} = head
      +same = Bool.and(Bool.and(Nat.is_eq(fx, x), Nat.is_eq(fy, y)), Nat.is_eq(fz, z))
      field_light(tail, x, y, z, Bool.pick(U32, same, U32.max(best, light), best))

def empty_edits() -> List<&2, Edit>:
  Nil{}

def base_light(+seed: Nat, +x: Nat, +y: Nat, +z: Nat) -> U32:
  +height = World.column_height(seed, x, z)
  +above_surface = Nat.is_ge(y, height)
  +cave = World.cave_at_height(seed, x, y, z, height)
  +water = World.water_at_height(height, y)
  +lava = World.lava_at(seed, x, y, z)
  +transparent = Bool.or(cave, water)
  +sky = Bool.pick(U32, above_surface, max_light(), Bool.pick(U32, transparent, cave_ambient(y), 0))
  Bool.pick(U32, lava, max_light(), sky)

def static_with_fields(fields: List<&2, LightField>, +seed: Nat, +x: Nat, +y: Nat, +z: Nat) -> U32:
  U32.max(base_light(seed, x, y, z), field_light(fields, x, y, z, 0))

def make_light_cell(x: Nat, y: Nat, z: Nat, light: U32) -> LightCell:
  LightCell{x, y, z, light}

def patch_cells(
  +fields: List<&2, LightField>, +seed: Nat, +cells: List<&2, Cell>
) -> List<&2, LightCell>:
  match cells:
    case Nil{}:
      Nil{}
    case Con{+head, +tail}:
      Cell{+x, +y, +z} = head
      make_light_cell(x, y, z, static_with_fields(fields, seed, x, y, z))
        <> patch_cells(fields, seed, tail)

def patch(+sources: List<&2, Edit>, +seed: Nat, cells: List<&2, Cell>) -> List<&2, LightCell>:
  patch_cells(source_fields(sources, seed), seed, cells)

def patch_fields(
  +fields: List<&2, LightField>, +seed: Nat, +cells: List<&2, Cell>
) -> List<&2, LightCell>:
  patch_cells(fields, seed, cells)

def chunk.value.fields(
  fields: List<&2, LightField>, +seed: Nat, +chunk_x: Nat, +chunk_z: Nat, +index: Nat
) -> U32:
  +column = Nat.mul(World.chunk_size(), World.chunk_size())
  +y = Nat.div(index, column)
  +in_column = Nat.mod(index, column)
  +z = Nat.div(in_column, World.chunk_size())
  +x = Nat.mod(in_column, World.chunk_size())
  +global_x = Nat.add(Nat.mul(chunk_x, World.chunk_size()), x)
  +global_z = Nat.add(Nat.mul(chunk_z, World.chunk_size()), z)
  static_with_fields(fields, seed, global_x, y, global_z)

def chunk.fill.fields(
  +fields: List<&2, LightField>, +seed: Nat, +chunk_x: Nat, +chunk_z: Nat,
  +remaining: Nat, +index: Nat, blocks: Array<U32>
) -> Array<U32>:
  match remaining:
    case 0n:
      blocks
    case 1n+p:
      chunk.fill.fields(fields, seed, chunk_x, chunk_z, p, Nat.add(index, 1n),
        blocks[U32.from_nat(index)] <- chunk.value.fields(fields, seed, chunk_x, chunk_z, index))

def source_light(sources: List<&2, Edit>, +seed: Nat, +x: Nat, +y: Nat, +z: Nat, +best: U32) -> U32:
  match sources:
    case Nil{}:
      best
    case Con{+head, +tail}:
      Edit{+sx, +sy, +sz, +block} = head
      +distance = Nat.add(Nat.add(distance_component(sx, x), distance_component(sy, y)), distance_component(sz, z))
      +within = Nat.is_lt(distance, 15n)
      +emission = Bool.pick(Nat, U32.is_eq(block, 21), 15n, 14n)
      +level = Nat.sub(emission, distance)
      +visible = Bool.pick(Bool, within, source_visible(seed, sx, sy, sz, x, y, z), False{})
      +candidate = Bool.pick(U32, Bool.and(Bool.and(within, visible), is_light_source(block)), U32.from_nat(level), 0)
      source_light(tail, seed, x, y, z, U32.max(best, candidate))

def block(sources: List<&2, Edit>, +seed: Nat, +x: Nat, +y: Nat, +z: Nat) -> U32:
  +height = World.column_height(seed, x, z)
  +above_surface = Nat.is_ge(y, height)
  +cave = World.cave_at_height(seed, x, y, z, height)
  +water = World.water_at_height(height, y)
  +transparent = Bool.or(cave, water)
  +sky = Bool.pick(U32, above_surface, max_light(), Bool.pick(U32, transparent, cave_ambient(y), 0))
  +near = near_sources(sources, x, y, z)
  U32.max(sky, source_light(near, seed, x, y, z, 0))

def chunk_cells() -> Nat:
  Nat.mul(Nat.mul(World.chunk_size(), World.chunk_size()), World.max_y())

def chunk.value(+sources: List<&2, Edit>, +seed: Nat, +chunk_x: Nat, +chunk_z: Nat, +index: Nat) -> U32:
  +column = Nat.mul(World.chunk_size(), World.chunk_size())
  +y = Nat.div(index, column)
  +in_column = Nat.mod(index, column)
  +z = Nat.div(in_column, World.chunk_size())
  +x = Nat.mod(in_column, World.chunk_size())
  +global_x = Nat.add(Nat.mul(chunk_x, World.chunk_size()), x)
  +global_z = Nat.add(Nat.mul(chunk_z, World.chunk_size()), z)
  block(sources, seed, global_x, y, global_z)

def chunk.fill(+sources: List<&2, Edit>, +seed: Nat, +chunk_x: Nat, +chunk_z: Nat, +remaining: Nat, +index: Nat, blocks: Array<U32>) -> Array<U32>:
  match remaining:
    case 0n:
      blocks
    case 1n+p:
      chunk.fill(sources, seed, chunk_x, chunk_z, p, Nat.add(index, 1n), blocks[U32.from_nat(index)] <- chunk.value(sources, seed, chunk_x, chunk_z, index))

def chunk(+sources: List<&2, Edit>, +seed: Nat, +chunk_x: Nat, +chunk_z: Nat) -> Array<U32>:
  match sources:
    case Nil{}:
      chunk.fill(sources, seed, chunk_x, chunk_z, chunk_cells(), 0n, Array.new(U32, 13n, 0))
    case Con{head, tail}:
      +fields = source_fields.chunk(sources, seed, chunk_x, chunk_z)
      chunk.fill.fields(fields, seed, chunk_x, chunk_z, chunk_cells(), 0n, Array.new(U32, 13n, 0))

type EditOverride is Data:
  EditFound{block: U32}
  EditMissing{}

def edit_matches(edit: Edit, +x: Nat, +y: Nat, +z: Nat) -> Bool:
  Edit{+ex, +ey, +ez, block} = edit
  Bool.and(Bool.and(Nat.is_eq(ex, x), Nat.is_eq(ey, y)), Nat.is_eq(ez, z))

def edit_override(edits: List<&2, Edit>, +x: Nat, +y: Nat, +z: Nat) -> EditOverride:
  match edits:
    case Nil{}:
      EditMissing{}
    case Con{+head, +tail}:
      Edit{+ex, +ey, +ez, +block} = head
      +same = Bool.and(Bool.and(Nat.is_eq(ex, x), Nat.is_eq(ey, y)), Nat.is_eq(ez, z))
      Bool.pick(EditOverride, same, EditFound{block}, edit_override(tail, x, y, z))

def transparent_block(+block: U32) -> Bool:
  Bool.or(
    U32.is_eq(block, 0),
    Bool.or(
      U32.is_eq(block, 7),
      Bool.or(
        U32.is_eq(block, 12),
        Bool.or(
          U32.is_eq(block, 15),
          Bool.or(U32.is_eq(block, 21), U32.is_eq(block, 24))
        )
      )
    )
  )

def opaque_override(override: EditOverride, +seed: Nat, point: Point) -> Bool:
  match override:
    case EditMissing{}:
      opaque(seed, point)
    case EditFound{+block}:
      Bool.not(transparent_block(block))

def opaque_with_edits(edits: List<&2, Edit>, +seed: Nat, point: Point) -> Bool:
  Point{+x, +y, +z} = point
  opaque_override(edit_override(edits, x, y, z), seed, point)

def transparent_override(override: EditOverride, +seed: Nat, point: Point) -> Bool:
  match override:
    case EditMissing{}:
      Point{+x, +y, +z} = point
      Bool.or(World.cave_at_height(seed, x, y, z, World.column_height(seed, x, z)),
        World.water_at_height(World.column_height(seed, x, z), y))
    case EditFound{+block}:
      transparent_block(block)

def transparent_at(edits: List<&2, Edit>, +seed: Nat, point: Point) -> Bool:
  Point{+x, +y, +z} = point
  transparent_override(edit_override(edits, x, y, z), seed, point)

def lava_override(override: EditOverride, +seed: Nat, point: Point) -> Bool:
  match override:
    case EditMissing{}:
      Point{+x, +y, +z} = point
      World.lava_at(seed, x, y, z)
    case EditFound{+block}:
      U32.is_eq(block, 21)

def lava_at(edits: List<&2, Edit>, +seed: Nat, point: Point) -> Bool:
  Point{+x, +y, +z} = point
  lava_override(edit_override(edits, x, y, z), seed, point)

def sky_visible(
  +edits: List<&2, Edit>, +seed: Nat, +remaining: Nat, +x: Nat, +y: Nat, +z: Nat
) -> Bool:
  match remaining:
    case 0n:
      True{}
    case 1n+p:
      +point = make_point(x, y, z)
      Bool.and(
        Bool.not(opaque_with_edits(edits, seed, point)),
        sky_visible(edits, seed, p, x, Nat.add(y, 1n), z)
      )

def base_light_with_edits(
  +edits: List<&2, Edit>, +seed: Nat, +x: Nat, +y: Nat, +z: Nat
) -> U32:
  +point = make_point(x, y, z)
  +transparent = transparent_at(edits, seed, point)
  +sky = Bool.pick(U32, sky_visible(edits, seed, Nat.sub(World.max_y(), y), x, y, z),
    max_light(), Bool.pick(U32, transparent, cave_ambient(y), 0))
  Bool.pick(U32, lava_at(edits, seed, point), max_light(), sky)

def static_with_fields_with_edits(
  fields: List<&2, LightField>, edits: List<&2, Edit>, +seed: Nat,
  +x: Nat, +y: Nat, +z: Nat
) -> U32:
  U32.max(base_light_with_edits(edits, seed, x, y, z), field_light(fields, x, y, z, 0))

def patch_cells_with_edits(
  +fields: List<&2, LightField>, +edits: List<&2, Edit>, +seed: Nat,
  +cells: List<&2, Cell>
) -> List<&2, LightCell>:
  match cells:
    case Nil{}:
      Nil{}
    case Con{+head, +tail}:
      Cell{+x, +y, +z} = head
      make_light_cell(x, y, z, static_with_fields_with_edits(fields, edits, seed, x, y, z))
        <> patch_cells_with_edits(fields, edits, seed, tail)

def patch_fields_with_edits(
  +fields: List<&2, LightField>, edits: List<&2, Edit>, +seed: Nat,
  +cells: List<&2, Cell>
) -> List<&2, LightCell>:
  match edits:
    case Nil{}:
      patch_fields(fields, seed, cells)
    case Con{head, tail}:
      patch_cells_with_edits(fields, edits, seed, cells)

def chunk.value.with_edits(
  +fields: List<&2, LightField>, edits: List<&2, Edit>, +seed: Nat,
  +chunk_x: Nat, +chunk_z: Nat, +index: Nat
) -> U32:
  +column = Nat.mul(World.chunk_size(), World.chunk_size())
  +y = Nat.div(index, column)
  +in_column = Nat.mod(index, column)
  +z = Nat.div(in_column, World.chunk_size())
  +x = Nat.mod(in_column, World.chunk_size())
  +global_x = Nat.add(Nat.mul(chunk_x, World.chunk_size()), x)
  +global_z = Nat.add(Nat.mul(chunk_z, World.chunk_size()), z)
  static_with_fields_with_edits(fields, edits, seed, global_x, y, global_z)

def chunk.fill.with_edits(
  +fields: List<&2, LightField>, +edits: List<&2, Edit>, +seed: Nat,
  +chunk_x: Nat, +chunk_z: Nat, +remaining: Nat, +index: Nat, blocks: Array<U32>
) -> Array<U32>:
  match remaining:
    case 0n:
      blocks
    case 1n+p:
      chunk.fill.with_edits(
        fields, edits, seed, chunk_x, chunk_z, p, Nat.add(index, 1n),
        blocks[U32.from_nat(index)] <- chunk.value.with_edits(fields, edits, seed, chunk_x, chunk_z, index)
      )

def chunk_with_edits(
  sources: List<&2, Edit>, edits: List<&2, Edit>, +seed: Nat,
  +chunk_x: Nat, +chunk_z: Nat
) -> Array<U32>:
  match edits:
    case Nil{}:
      chunk(sources, seed, chunk_x, chunk_z)
    case Con{head, tail}:
      +fields = source_fields.chunk(sources, seed, chunk_x, chunk_z)
      chunk.fill.with_edits(
        fields, edits, seed, chunk_x, chunk_z, chunk_cells(), 0n, Array.new(U32, 13n, 0)
      )

import Base

type Sample is Data:
  Sample{x: Nat, y: Nat, z: Nat, block: U32}

type Flow is Data:
  Flow{x: Nat, y: Nat, z: Nat, level: U32, source: Bool, block: U32}

type State is Data:
  State{flows: List<&2, Flow>}

type Edit is Data:
  Edit{x: Nat, y: Nat, z: Nat, block: U32}

def sample(x: Nat, y: Nat, z: Nat, block: U32) -> Sample:
  Sample{x, y, z, block}

def water_block() -> U32:
  7

def lava_block() -> U32:
  21

def cobblestone_block() -> U32:
  22

def obsidian_block() -> U32:
  23

def is_fluid(+block: U32) -> Bool:
  Bool.or(U32.is_eq(block, water_block()), U32.is_eq(block, lava_block()))

def flow(x: Nat, y: Nat, z: Nat, level: U32) -> Flow:
  Flow{x, y, z, level, False{}, water_block()}

def lava_flow(x: Nat, y: Nat, z: Nat, level: U32) -> Flow:
  Flow{x, y, z, level, False{}, lava_block()}

def sample_block(
  samples: List<&2, Sample>, +x: Nat, +y: Nat, +z: Nat
) -> U32:
  match samples:
    case Nil{}:
      1
    case Con{+head, +tail}:
      Sample{+sx, +sy, +sz, +block} = head
      +same = Bool.and(
        Bool.and(Nat.is_eq(sx, x), Nat.is_eq(sy, y)),
        Nat.is_eq(sz, z)
      )
      Bool.pick(U32, same, block, sample_block(tail, x, y, z))

def open_cell(samples: List<&2, Sample>, +x: Nat, +y: Nat, +z: Nat) -> Bool:
  +block = sample_block(samples, x, y, z)
  Bool.or(U32.is_eq(block, 0), is_fluid(block))

def append_if(
  flows: List<&2, Flow>, +x: Nat, +y: Nat, +z: Nat, +level: U32,
  +block: U32, valid: Bool
) -> List<&2, Flow>:
  match valid:
    case True{}:
      Con{Flow{x, y, z, level, False{}, block}, flows}
    case False{}:
      flows

def spread(source: Flow, +samples: List<&2, Sample>) -> List<&2, Flow>:
  Flow{+x, +y, +z, +level, source, +source_block} = source
  +can_down = Bool.and(
    Nat.is_gt(y, 0n),
    open_cell(samples, x, Nat.sub(y, 1n), z)
  )
  +side_valid = Bool.and(Bool.not(can_down), U32.is_gt(level, 1))
  +side_level = U32.sub(level, 1)
  +down = append_if(Nil{}, x, Nat.sub(y, 1n), z, level, source_block, can_down)
  +south = append_if(down, x, y, Nat.add(z, 1n), side_level, source_block,
    Bool.and(side_valid, open_cell(samples, x, y, Nat.add(z, 1n))))
  +north = append_if(south, x, y, Nat.sub(z, 1n), side_level, source_block,
    Bool.and(side_valid, open_cell(samples, x, y, Nat.sub(z, 1n))))
  +east = append_if(north, Nat.add(x, 1n), y, z, side_level, source_block,
    Bool.and(side_valid, open_cell(samples, Nat.add(x, 1n), y, z)))
  append_if(east, Nat.sub(x, 1n), y, z, side_level, source_block,
    Bool.and(side_valid, open_cell(samples, Nat.sub(x, 1n), y, z)))

def empty() -> State:
  State{Nil{}}

def state_flows(state: State) -> List<&2, Flow>:
  State{flows} = state
  flows

def same_position(flow: Flow, +x: Nat, +y: Nat, +z: Nat) -> Bool:
  Flow{+fx, +fy, +fz, level, source, block} = flow
  Bool.and(Bool.and(Nat.is_eq(fx, x), Nat.is_eq(fy, y)), Nat.is_eq(fz, z))

def contains(flows: List<&2, Flow>, +x: Nat, +y: Nat, +z: Nat) -> Bool:
  match flows:
    case Nil{}:
      False{}
    case Con{+head, +tail}:
      Bool.or(same_position(head, x, y, z), contains(tail, x, y, z))

def remove_entries(flows: List<&2, Flow>, +x: Nat, +y: Nat, +z: Nat) -> List<&2, Flow>:
  match flows:
    case Nil{}:
      Nil{}
    case Con{+head, +tail}:
      +rest = remove_entries(tail, x, y, z)
      Bool.pick(
        List<&2, Flow>,
        same_position(head, x, y, z),
        rest,
        Con{head, rest}
      )

def append_unique(+flows: List<&2, Flow>, +candidate: Flow) -> List<&2, Flow>:
  Flow{+x, +y, +z, level, source, block} = candidate
  Bool.pick(List<&2, Flow>, contains(flows, x, y, z), flows, Con{candidate, flows})

def append_source(+flows: List<&2, Flow>, +candidate: Flow) -> List<&2, Flow>:
  Flow{+x, +y, +z, level, +source, block} = candidate
  Bool.pick(List<&2, Flow>, source, append_unique(flows, candidate), flows)

def append_spread(
  +candidates: List<&2, Flow>, +flows: List<&2, Flow>
) -> List<&2, Flow>:
  match candidates:
    case Nil{}:
      flows
    case Con{+head, +tail}:
      append_spread(tail, append_unique(flows, head))

def take(+remaining: Nat, +flows: List<&2, Flow>) -> List<&2, Flow>:
  match remaining:
    case 0n:
      Nil{}
    case 1n+p:
      match flows:
        case Nil{}:
          Nil{}
        case Con{+head, +tail}:
          Con{head, take(p, tail)}

def max_flow_cells() -> Nat:
  256n

def limit(+state: State) -> State:
  State{+flows} = state
  State{take(max_flow_cells(), flows)}

def append_edits(
  edits: List<&2, Edit>, +tail: List<&2, Edit>
) -> List<&2, Edit>:
  match edits:
    case Nil{}:
      tail
    case Con{+head, +rest}:
      Con{head, append_edits(rest, tail)}

def removed_edits(
  +before: List<&2, Flow>, +after: List<&2, Flow>
) -> List<&2, Edit>:
  match before:
    case Nil{}:
      Nil{}
    case Con{+head, +tail}:
      Flow{+x, +y, +z, level, source, block} = head
      +rest = removed_edits(tail, after)
      Bool.pick(
        List<&2, Edit>,
        contains(after, x, y, z),
        rest,
        Con{Edit{x, y, z, 0}, rest}
      )

def added_edits(
  +after: List<&2, Flow>, +before: List<&2, Flow>
) -> List<&2, Edit>:
  match after:
    case Nil{}:
      Nil{}
    case Con{+head, +tail}:
      Flow{+x, +y, +z, level, source, block} = head
      +rest = added_edits(tail, before)
      Bool.pick(
        List<&2, Edit>,
        contains(before, x, y, z),
        rest,
        Con{Edit{x, y, z, block}, rest}
      )

def opposite_block(+block: U32) -> U32:
  Bool.pick(U32, U32.is_eq(block, lava_block()), water_block(), lava_block())

def opposite_near(
  +samples: List<&2, Sample>, +x: Nat, +y: Nat, +z: Nat, +block: U32
) -> Bool:
  +opposite = opposite_block(block)
  Bool.or(
    Bool.or(
      U32.is_eq(sample_block(samples, Nat.sub(x, 1n), y, z), opposite),
      U32.is_eq(sample_block(samples, Nat.add(x, 1n), y, z), opposite)
    ),
    Bool.or(
      U32.is_eq(sample_block(samples, x, y, Nat.sub(z, 1n)), opposite),
      U32.is_eq(sample_block(samples, x, y, Nat.add(z, 1n)), opposite)
    )
  )

def reactive(flow: Flow, +samples: List<&2, Sample>) -> Bool:
  Flow{+x, +y, +z, level, source, +block} = flow
  Bool.and(is_fluid(block), opposite_near(samples, x, y, z, block))

def reaction_block(+source: Bool) -> U32:
  Bool.pick(U32, source, obsidian_block(), cobblestone_block())

def reaction_entries(
  +flows: List<&2, Flow>, +samples: List<&2, Sample>,
  +result: List<&2, Edit>
) -> List<&2, Edit>:
  match flows:
    case Nil{}:
      result
    case Con{+head, +tail}:
      Flow{+x, +y, +z, +level, +source, block} = head
      +rest = reaction_entries(tail, samples, result)
      Bool.pick(List<&2, Edit>, reactive(head, samples), Con{Edit{x, y, z, reaction_block(source)}, rest}, rest)

def remove_reactive(
  +flows: List<&2, Flow>, +samples: List<&2, Sample>
) -> List<&2, Flow>:
  match flows:
    case Nil{}:
      Nil{}
    case Con{+head, +tail}:
      +rest = remove_reactive(tail, samples)
      Bool.pick(List<&2, Flow>, reactive(head, samples), rest, Con{head, rest})

def reactions(+state: State, +samples: List<&2, Sample>) -> List<&2, Edit>:
  State{+flows} = state
  reaction_entries(flows, samples, Nil{})

def react(+state: State, +samples: List<&2, Sample>) -> State:
  State{+flows} = state
  State{remove_reactive(flows, samples)}

def changes(+before: State, +after: State) -> List<&2, Edit>:
  State{+old_flows} = before
  State{+new_flows} = after
  append_edits(removed_edits(old_flows, new_flows), added_edits(new_flows, old_flows))

def tick_entries(
  +remaining: List<&2, Flow>, +samples: List<&2, Sample>,
  +result: List<&2, Flow>
) -> List<&2, Flow>:
  match remaining:
    case Nil{}:
      result
    case Con{+head, +tail}:
      +with_flow = append_spread(spread(head, samples), result)
      +with_source = append_source(with_flow, head)
      tick_entries(tail, samples, with_source)

def seed(+state: State, +x: Nat, +y: Nat, +z: Nat, +level: U32) -> State:
  State{+flows} = state
  State{take(max_flow_cells(), append_unique(flows, Flow{x, y, z, level, True{}, water_block()}))}

def seed_lava(+state: State, +x: Nat, +y: Nat, +z: Nat, +level: U32) -> State:
  State{+flows} = state
  State{take(max_flow_cells(), append_unique(flows, Flow{x, y, z, level, True{}, lava_block()}))}

def tick(+state: State, +samples: List<&2, Sample>) -> State:
  State{+flows} = state
  +bounded = take(64n, flows)
  State{take(max_flow_cells(), tick_entries(bounded, samples, Nil{}))}

def remove(+state: State, +x: Nat, +y: Nat, +z: Nat) -> State:
  State{+flows} = state
  State{remove_entries(flows, x, y, z)}

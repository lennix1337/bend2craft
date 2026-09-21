import Base
import ./world_state.bend as WorldState

# Item IDs: 0 empty, 1 stone, 2 dirt, 3 grass, 4 leaves, 5 wood,
# 6 sand, 7 water, 8 planks, 9 sticks, 10 crafting table, 11 wooden pickaxe,
# 12 wool, 13 rotten flesh, 14 coal, 15 raw iron, 16 diamond,
# 17 stone pickaxe, 18 iron pickaxe, 19 diamond pickaxe, 20 iron ingot,
# 21 furnace, 22 torch, 23 bed, 24 door, 25 wheat seeds, 26 wheat,
# 27 wooden hoe, 28 empty bucket, 29 water bucket, 30 lava bucket.
# Block 20 is farmland and drops dirt; it has no standalone inventory item.

type Slot is Data:
  Slot{item: U32, count: U32, durability: U32}

type InventoryResult is Data:
  InventoryResult{slots: List<&2, Slot>, ok: Bool}

type TradeResult is Data:
  TradeResult{slots: List<&2, Slot>, ok: Bool}

type AddResult is Data:
  AddResult{slots: List<&2, Slot>, remaining: U32}

type RemoveResult is Data:
  RemoveResult{slots: List<&2, Slot>, remaining: U32}

type Lookup is Data:
  Found{slot: Slot}
  Missing{}

type Recipe is Data:
  Recipe{item_a: U32, count_a: U32, item_b: U32, count_b: U32, output: U32, output_count: U32}

type ToolResult is Data:
  ToolResult{durability: U32, broken: Bool, valid: Bool}

type MiningResult is Data:
  MiningResult{item: U32, amount: U32, valid: Bool}

type InteractionResult is Data:
  InteractionResult{edit: WorldState.Edit, slots: List<&2, Slot>, ok: Bool}

def tool_max_durability(+item: U32) -> U32:
  Bool.pick(U32, U32.is_eq(item, 27), 59,
    Bool.pick(U32, U32.is_eq(item, 19), 1561,
      Bool.pick(U32, U32.is_eq(item, 18), 250,
        Bool.pick(U32, U32.is_eq(item, 17), 131,
          Bool.pick(U32, U32.is_eq(item, 11), 59, 0)))))

def slot_count() -> Nat:
  36n

def max_stack() -> U32:
  64

def food_value(+item: U32) -> U32:
  Bool.pick(U32, U32.is_eq(item, 13), 4,
    Bool.pick(U32, U32.is_eq(item, 26), 2, 0))

def slot_item(slot: Slot) -> U32:
  Slot{item, count, durability} = slot
  item

def slot_count_value(slot: Slot) -> U32:
  Slot{item, count, durability} = slot
  count

def slot_durability(slot: Slot) -> U32:
  Slot{item, count, durability} = slot
  durability

def make_slot(item: U32, count: U32, durability: U32) -> Slot:
  Slot{item, count, durability}

def cons_slot(slot: Slot, tail: List<&2, Slot>) -> List<&2, Slot>:
  Con{slot, tail}

def empty_slots(+remaining: Nat) -> List<&2, Slot>:
  match remaining:
    case 0n:
      Nil{}
    case 1n+p:
      Slot{0, 0, 0} <> empty_slots(p)

def create() -> List<&2, Slot>:
  Slot{1, 32, 0} <> Slot{2, 24, 0} <> Slot{3, 16, 0} <> Slot{4, 8, 0}
    <> Slot{5, 8, 0} <> empty_slots(31n)

def result(slots: List<&2, Slot>, ok: Bool) -> InventoryResult:
  InventoryResult{slots, ok}

def inventory_slots(state: InventoryResult) -> List<&2, Slot>:
  InventoryResult{slots, ok} = state
  slots

def inventory_ok(state: InventoryResult) -> Bool:
  InventoryResult{slots, ok} = state
  ok

def trade_slots(state: TradeResult) -> List<&2, Slot>:
  TradeResult{slots, ok} = state
  slots

def trade_ok(state: TradeResult) -> Bool:
  TradeResult{slots, ok} = state
  ok

def add_slots(state: AddResult) -> List<&2, Slot>:
  AddResult{slots, remaining} = state
  slots

def add_remaining(state: AddResult) -> U32:
  AddResult{slots, remaining} = state
  remaining

def remove_slots(state: RemoveResult) -> List<&2, Slot>:
  RemoveResult{slots, remaining} = state
  slots

def remove_remaining(state: RemoveResult) -> U32:
  RemoveResult{slots, remaining} = state
  remaining

def count_item(slots: List<&2, Slot>, +item: U32, total: U32) -> U32:
  match slots:
    case Nil{}:
      total
    case Con{+head, tail}:
      +added = Bool.pick(U32, U32.is_eq(slot_item(head), item), slot_count_value(head), 0)
      count_item(tail, item, U32.add(total, added))

def count(slots: List<&2, Slot>, item: U32) -> U32:
  count_item(slots, item, 0)

def add_existing(slots: List<&2, Slot>, +item: U32, +amount: U32) -> AddResult:
  match slots:
    case Nil{}:
      AddResult{Nil{}, amount}
    case Con{+head, tail}:
      +same_item = U32.is_eq(slot_item(head), item)
      +has_room = U32.is_lt(slot_count_value(head), max_stack())
      +has_amount = U32.is_ne(amount, 0)
      +eligible = Bool.and(Bool.and(same_item, has_room), has_amount)
      +space = U32.sub(max_stack(), slot_count_value(head))
      +added = Bool.pick(U32, eligible, U32.min(amount, space), 0)
      +updated = make_slot(slot_item(head), U32.add(slot_count_value(head), added), slot_durability(head))
      +rest = add_existing(tail, item, U32.sub(amount, added))
      AddResult{cons_slot(updated, add_slots(rest)), add_remaining(rest)}

def add_empty(slots: List<&2, Slot>, +item: U32, +amount: U32) -> AddResult:
  match slots:
    case Nil{}:
      AddResult{Nil{}, amount}
    case Con{+head, tail}:
      +empty = Bool.and(U32.is_eq(slot_item(head), 0), U32.is_eq(slot_count_value(head), 0))
      +eligible = Bool.and(empty, U32.is_ne(amount, 0))
      +added = Bool.pick(U32, eligible, U32.min(amount, max_stack()), 0)
      +new_item = Bool.pick(U32, eligible, item, slot_item(head))
      +new_durability = Bool.pick(U32, eligible, tool_max_durability(item), slot_durability(head))
      +updated = make_slot(new_item, U32.add(slot_count_value(head), added), new_durability)
      +rest = add_empty(tail, item, U32.sub(amount, added))
      AddResult{cons_slot(updated, add_slots(rest)), add_remaining(rest)}

def add_items(slots: List<&2, Slot>, +item: U32, +amount: U32) -> AddResult:
  +first = add_existing(slots, item, amount)
  add_empty(add_slots(first), item, add_remaining(first))

def is_block_item(+item: U32) -> Bool:
  Bool.or(
    Bool.and(U32.is_ne(item, 0), U32.is_lt(item, 7)),
    Bool.or(U32.is_eq(item, 31), U32.is_eq(item, 32))
  )

def collect.finalize(
  original: List<&2, Slot>, added: AddResult, valid: Bool
) -> InventoryResult:
  match valid:
    case True{}:
      result(add_slots(added), True{})
    case False{}:
      result(original, False{})

def collect.if(
  +slots: List<&2, Slot>, +item: U32, amount: U32, valid: Bool
) -> InventoryResult:
  match valid:
    case False{}:
      result(slots, False{})
    case True{}:
      +added = add_items(slots, item, amount)
      collect.finalize(slots, added, U32.is_eq(add_remaining(added), 0))

def collect(slots: List<&2, Slot>, +item: U32, +amount: Nat) -> InventoryResult:
  +valid_item = Bool.and(U32.is_ne(item, 0), U32.is_lt(item, 7))
  +valid_amount = Nat.is_gt(amount, 0n)
  collect.if(slots, item, U32.from_nat(amount), Bool.and(valid_item, valid_amount))

def pickup_item(+item: U32) -> Bool:
  +mob = Bool.or(Bool.or(U32.is_eq(item, 11), U32.is_eq(item, 12)), U32.is_eq(item, 13))
  +ore = Bool.or(Bool.or(U32.is_eq(item, 14), U32.is_eq(item, 15)), U32.is_eq(item, 16))
  +tools = Bool.or(Bool.or(Bool.or(U32.is_eq(item, 17), U32.is_eq(item, 18)), U32.is_eq(item, 19)), U32.is_eq(item, 27))
  +smelted = Bool.or(Bool.or(U32.is_eq(item, 20), U32.is_eq(item, 21)), Bool.or(Bool.or(Bool.or(U32.is_eq(item, 22), U32.is_eq(item, 23)), U32.is_eq(item, 24)), Bool.or(U32.is_eq(item, 25), U32.is_eq(item, 26))))
  +buckets = Bool.or(Bool.or(U32.is_eq(item, 28), U32.is_eq(item, 29)), U32.is_eq(item, 30))
  Bool.or(is_block_item(item), Bool.or(mob, Bool.or(ore, Bool.or(tools, Bool.or(smelted, buckets)))))

def pickup(slots: List<&2, Slot>, +item: U32, +amount: Nat) -> InventoryResult:
  collect.if(slots, item, U32.from_nat(amount),
    Bool.and(pickup_item(item), Nat.is_gt(amount, 0n)))

def remove_items(slots: List<&2, Slot>, +item: U32, +amount: U32) -> RemoveResult:
  match slots:
    case Nil{}:
      RemoveResult{Nil{}, amount}
    case Con{+head, tail}:
      +matching = U32.is_eq(slot_item(head), item)
      +removed = Bool.pick(U32, matching, U32.min(amount, slot_count_value(head)), 0)
      +left = U32.sub(slot_count_value(head), removed)
      +new_item = Bool.pick(U32, U32.is_eq(left, 0), 0, slot_item(head))
      +new_durability = Bool.pick(U32, U32.is_eq(left, 0), 0, slot_durability(head))
      +updated = make_slot(new_item, left, new_durability)
      +rest = remove_items(tail, item, U32.sub(amount, removed))
      RemoveResult{cons_slot(updated, remove_slots(rest)), remove_remaining(rest)}

def trade(
  +slots: List<&2, Slot>, +cost_item: U32, +cost_amount: U32,
  +reward_item: U32, +reward_amount: U32
) -> TradeResult:
  +removed = remove_items(slots, cost_item, cost_amount)
  +paid = U32.is_eq(remove_remaining(removed), 0)
  +added = add_items(remove_slots(removed), reward_item, reward_amount)
  +room = U32.is_eq(add_remaining(added), 0)
  +ok = Bool.and(paid, room)
  +next_slots = Bool.pick(List<&2, Slot>, ok, add_slots(added), slots)
  TradeResult{next_slots, ok}

def consume.head(
  original: List<&2, Slot>, tail: List<&2, Slot>, +slot: Slot, +amount: U32, valid: Bool
) -> InventoryResult:
  match valid:
    case False{}:
      result(original, False{})
    case True{}:
      +left = U32.sub(slot_count_value(slot), amount)
      +new_item = Bool.pick(U32, U32.is_eq(left, 0), 0, slot_item(slot))
      +new_durability = Bool.pick(U32, U32.is_eq(left, 0), 0, slot_durability(slot))
      +updated = make_slot(new_item, left, new_durability)
      result(cons_slot(updated, tail), True{})

def consume.at(slots: List<&2, Slot>, +index: Nat, +amount: U32) -> InventoryResult:
  match slots:
    case Nil{}:
      result(Nil{}, False{})
    case Con{+head, +tail}:
      match index:
        case 0n:
          consume.head(slots, tail, head, amount,
            Bool.and(U32.is_ne(slot_item(head), 0), U32.is_le(amount, slot_count_value(head))))
        case 1n+p:
          +rest = consume.at(tail, p, amount)
          result(cons_slot(head, inventory_slots(rest)), inventory_ok(rest))

def consume.if(slots: List<&2, Slot>, +index: Nat, +amount: U32, valid: Bool) -> InventoryResult:
  match valid:
    case False{}:
      result(slots, False{})
    case True{}:
      consume.at(slots, index, amount)

def consume(slots: List<&2, Slot>, +index: Nat, +amount: Nat) -> InventoryResult:
  consume.if(slots, index, U32.from_nat(amount),
    Bool.and(Nat.is_lt(index, slot_count()), Nat.is_gt(amount, 0n)))

def lookup(slots: List<&2, Slot>, +index: Nat) -> Lookup:
  match slots:
    case Nil{}:
      Missing{}
    case Con{+head, tail}:
      match index:
        case 0n:
          Found{head}
        case 1n+p:
          lookup(tail, p)

def replace_at(slots: List<&2, Slot>, +index: Nat, replacement: Slot) -> List<&2, Slot>:
  match slots:
    case Nil{}:
      Nil{}
    case Con{+head, tail}:
      match index:
        case 0n:
          cons_slot(replacement, tail)
        case 1n+p:
          cons_slot(head, replace_at(tail, p, replacement))

def move.finalize(
  original: List<&2, Slot>, +from: Nat, +to: Nat, +source: Slot, +target: Slot,
  +moving: U32, valid: Bool
) -> InventoryResult:
  match valid:
    case False{}:
      result(original, False{})
    case True{}:
      +source_left = U32.sub(slot_count_value(source), moving)
      +source_item = Bool.pick(U32, U32.is_eq(source_left, 0), 0, slot_item(source))
      +source_durability = Bool.pick(U32, U32.is_eq(source_left, 0), 0, slot_durability(source))
      +source_slot = make_slot(source_item, source_left, source_durability)
      +target_durability = Bool.pick(U32, U32.is_eq(slot_item(target), 0), slot_durability(source), slot_durability(target))
      +target_slot = make_slot(slot_item(source), U32.add(slot_count_value(target), moving), target_durability)
      +after_source = replace_at(original, from, source_slot)
      result(replace_at(after_source, to, target_slot), True{})

def move.found(
  original: List<&2, Slot>, +from: Nat, +to: Nat, +amount: U32,
  +source: Slot, +target: Slot
) -> InventoryResult:
  +compatible = Bool.or(U32.is_eq(slot_item(target), 0), U32.is_eq(slot_item(target), slot_item(source)))
  +space = Bool.pick(U32, U32.is_eq(slot_item(target), 0), max_stack(), U32.sub(max_stack(), slot_count_value(target)))
  +moving = U32.min(U32.min(amount, slot_count_value(source)), space)
  +valid = Bool.and(Bool.and(U32.is_ne(slot_item(source), 0), compatible), U32.is_ne(moving, 0))
  move.finalize(original, from, to, source, target, moving, valid)

def move.target(
  +original: List<&2, Slot>, +from: Nat, +to: Nat, +amount: U32,
  source: Slot, lookup_result: Lookup
) -> InventoryResult:
  match lookup_result:
    case Missing{}:
      result(original, False{})
    case Found{target}:
      move.found(original, from, to, amount, source, target)

def move.source(
  +original: List<&2, Slot>, +from: Nat, +to: Nat, amount: U32, lookup_result: Lookup
) -> InventoryResult:
  match lookup_result:
    case Missing{}:
      result(original, False{})
    case Found{source}:
      move.target(original, from, to, amount, source, lookup(original, to))

def move.if(
  +slots: List<&2, Slot>, +from: Nat, +to: Nat, amount: U32, valid: Bool
) -> InventoryResult:
  match valid:
    case False{}:
      result(slots, False{})
    case True{}:
      move.source(slots, from, to, amount, lookup(slots, from))

def move(slots: List<&2, Slot>, +from: Nat, +to: Nat, +amount: Nat) -> InventoryResult:
  +valid = Bool.and(Bool.and(Nat.is_lt(from, slot_count()), Nat.is_lt(to, slot_count())), Nat.is_ne(from, to))
  move.if(slots, from, to, U32.from_nat(amount), valid)

def recipe(index: Nat) -> Recipe:
  match index:
    case 0n:
      Recipe{5, 1, 0, 0, 8, 4}
    case 1n:
      Recipe{8, 2, 0, 0, 9, 4}
    case 2n:
      Recipe{8, 4, 0, 0, 10, 1}
    case 3n:
      Recipe{8, 3, 9, 2, 11, 1}
    case 4n:
      Recipe{1, 3, 9, 2, 17, 1}
    case 5n:
      Recipe{20, 3, 9, 2, 18, 1}
    case 6n:
      Recipe{16, 3, 9, 2, 19, 1}
    case 7n:
      Recipe{1, 8, 0, 0, 21, 1}
    case 8n:
      Recipe{14, 1, 9, 1, 22, 4}
    case 9n:
      Recipe{12, 3, 8, 3, 23, 1}
    case 10n:
      Recipe{8, 6, 0, 0, 24, 1}
    case 11n:
      Recipe{8, 2, 9, 2, 27, 1}
    case 12n:
      Recipe{20, 3, 0, 0, 28, 1}
    case 9n+p:
      Recipe{0, 0, 0, 0, 0, 0}

def recipe_data() -> List<U32>:
  5 <> 1 <> 0 <> 0 <> 8 <> 4 <> 0 <> 0 <>
  8 <> 2 <> 0 <> 0 <> 9 <> 4 <> 0 <> 0 <>
  8 <> 4 <> 0 <> 0 <> 10 <> 1 <> 0 <> 0 <>
  8 <> 3 <> 9 <> 2 <> 11 <> 1 <> 0 <> 0 <>
  1 <> 3 <> 9 <> 2 <> 17 <> 1 <> 0 <> 0 <>
  20 <> 3 <> 9 <> 2 <> 18 <> 1 <> 0 <> 0 <>
  16 <> 3 <> 9 <> 2 <> 19 <> 1 <> 0 <> 0 <>
  1 <> 8 <> 0 <> 0 <> 21 <> 1 <> 0 <> 0 <>
  14 <> 1 <> 9 <> 1 <> 22 <> 4 <> 0 <> 0 <>
  12 <> 3 <> 8 <> 3 <> 23 <> 1 <> 0 <> 0 <>
  8 <> 6 <> 0 <> 0 <> 24 <> 1 <> 0 <> 0 <>
  8 <> 2 <> 9 <> 2 <> 27 <> 1 <> 0 <> 0 <>
  20 <> 3 <> 0 <> 0 <> 28 <> 1 <> 0 <> 0 <> Nil{}

def craft.finalize.if(
  original: List<&2, Slot>, slots: List<&2, Slot>, remaining: U32, valid: Bool
) -> InventoryResult:
  match valid:
    case True{}:
      result(slots, True{})
    case False{}:
      result(original, False{})

def craft.finalize(original: List<&2, Slot>, slots: List<&2, Slot>, +remaining: U32) -> InventoryResult:
  craft.finalize.if(original, slots, remaining, U32.is_eq(remaining, 0))

def craft.after(
  original: List<&2, Slot>, slots: List<&2, Slot>, output: U32, output_count: U32,
  ingredients_ok: Bool
) -> InventoryResult:
  match ingredients_ok:
    case False{}:
      result(original, False{})
    case True{}:
      +added = add_items(slots, output, output_count)
      craft.finalize(original, add_slots(added), add_remaining(added))

def craft.spec(+slots: List<&2, Slot>, spec: Recipe) -> InventoryResult:
  Recipe{item_a, count_a, item_b, count_b, output, output_count} = spec
  +first = remove_items(slots, item_a, count_a)
  +second = remove_items(remove_slots(first), item_b, count_b)
  +ingredients_ok = Bool.and(U32.is_eq(remove_remaining(first), 0), U32.is_eq(remove_remaining(second), 0))
  craft.after(slots, remove_slots(second), output, output_count, ingredients_ok)

def craft.if(slots: List<&2, Slot>, +index: Nat, valid: Bool) -> InventoryResult:
  match valid:
    case False{}:
      result(slots, False{})
    case True{}:
      +spec = recipe(index)
      craft.spec(slots, spec)

def craft(slots: List<&2, Slot>, +index: Nat) -> InventoryResult:
  craft.if(slots, index, Nat.is_lt(index, 13n))

def can_collect_block(+block: U32, +y: Nat) -> Bool:
  Bool.and(Bool.or(Bool.or(Bool.or(is_block_item(block), U32.is_eq(block, 11)), U32.is_eq(block, 13)), Bool.or(Bool.or(U32.is_eq(block, 14), U32.is_eq(block, 15)), Bool.or(U32.is_eq(block, 22), U32.is_eq(block, 23)))), Nat.is_gt(y, 0n))

def is_placeable(+item: U32) -> Bool:
  Bool.or(Bool.or(Bool.or(Bool.or(is_block_item(item), U32.is_eq(item, 21)), U32.is_eq(item, 22)), U32.is_eq(item, 23)), U32.is_eq(item, 24))

def can_place(
  +item: U32, target_empty: Bool, inside: Bool, overlaps_player: Bool
) -> Bool:
  Bool.and(Bool.and(Bool.and(is_placeable(item), target_empty), inside), Bool.not(overlaps_player))

def use_tool.if(item: U32, durability: U32, valid: Bool) -> ToolResult:
  match valid:
    case False{}:
      ToolResult{0, False{}, False{}}
    case True{}:
      +next = U32.sub(durability, 1)
      ToolResult{next, U32.is_eq(next, 0), True{}}

def use_tool(+item: U32, +durability: U32) -> ToolResult:
  +max = tool_max_durability(item)
  use_tool.if(item, durability,
    Bool.and(Bool.and(U32.is_ne(max, 0), U32.is_gt(durability, 0)), U32.is_le(durability, max)))

def use_tool_at.updated(
  tail: List<&2, Slot>, slot: Slot, +durability: U32, +broken: Bool
) -> InventoryResult:
  Slot{item, count, old_durability} = slot
  +replacement = Bool.pick(Slot, broken, make_slot(0, 0, 0), make_slot(item, count, durability))
  result(cons_slot(replacement, tail), True{})

def use_tool_at.finalize(
  original: List<&2, Slot>, tail: List<&2, Slot>, slot: Slot, used: ToolResult
) -> InventoryResult:
  ToolResult{durability, broken, valid} = used
  +updated = use_tool_at.updated(tail, slot, durability, broken)
  Bool.pick(InventoryResult, valid, updated, result(original, False{}))

def use_tool_at.at(slots: List<&2, Slot>, +index: Nat) -> InventoryResult:
  match slots:
    case Nil{}:
      result(Nil{}, False{})
    case Con{+head, +tail}:
      match index:
        case 0n:
          use_tool_at.finalize(slots, tail, head,
            use_tool(slot_item(head), slot_durability(head)))
        case 1n+p:
          +rest = use_tool_at.at(tail, p)
          result(cons_slot(head, inventory_slots(rest)), inventory_ok(rest))

def use_tool_at(slots: List<&2, Slot>, +index: Nat) -> InventoryResult:
  use_tool_at.at(slots, index)

def tool_level(+item: U32) -> U32:
  Bool.pick(U32, U32.is_eq(item, 19), 4,
    Bool.pick(U32, U32.is_eq(item, 18), 3,
      Bool.pick(U32, U32.is_eq(item, 17), 2,
        Bool.pick(U32, U32.is_eq(item, 11), 1, 0))))

def mining_block(+block: U32) -> Bool:
  +basic = Bool.or(Bool.or(U32.is_eq(block, 1), U32.is_eq(block, 2)),
    Bool.or(U32.is_eq(block, 3), U32.is_eq(block, 4)))
  +ores = Bool.or(Bool.or(U32.is_eq(block, 5), U32.is_eq(block, 6)),
    Bool.or(U32.is_eq(block, 8), U32.is_eq(block, 9)))
  +special = Bool.or(Bool.or(U32.is_eq(block, 10), U32.is_eq(block, 11)),
    Bool.or(Bool.or(U32.is_eq(block, 12), U32.is_eq(block, 13)), Bool.or(Bool.or(U32.is_eq(block, 14), U32.is_eq(block, 15)), Bool.or(Bool.or(U32.is_eq(block, 16), U32.is_eq(block, 17)), Bool.or(U32.is_eq(block, 18), Bool.or(U32.is_eq(block, 19), U32.is_eq(block, 20)))))))
  Bool.or(Bool.or(Bool.or(basic, ores), special), Bool.or(U32.is_eq(block, 22), U32.is_eq(block, 23)))

def mining_level(+block: U32) -> U32:
  Bool.pick(U32, U32.is_eq(block, 23), 4,
    Bool.pick(U32, U32.is_eq(block, 10), 3,
      Bool.pick(U32, U32.is_eq(block, 9), 2,
        Bool.pick(U32, Bool.or(Bool.or(U32.is_eq(block, 1), U32.is_eq(block, 8)), U32.is_eq(block, 22)), 1, 0))))

def can_mine(+item: U32, +block: U32) -> Bool:
  Bool.and(mining_block(block), U32.is_ge(tool_level(item), mining_level(block)))

def mining_duration.tool(
  +item: U32, hand: F32, wooden: F32, stone: F32, iron: F32, diamond: F32
) -> F32:
  Bool.pick(F32, U32.is_eq(item, 19), diamond,
    Bool.pick(F32, U32.is_eq(item, 18), iron,
      Bool.pick(F32, U32.is_eq(item, 17), stone,
        Bool.pick(F32, U32.is_eq(item, 11), wooden, hand))))

def mining_duration.material(+item: U32, +block: U32) -> F32:
  +obsidian = U32.is_eq(block, 23)
  +diamond_ore = U32.is_eq(block, 10)
  +iron_ore = U32.is_eq(block, 9)
  +stone = Bool.or(Bool.or(U32.is_eq(block, 1), U32.is_eq(block, 8)),
    Bool.or(U32.is_eq(block, 11), U32.is_eq(block, 22)))
  +wood = U32.is_eq(block, 5)
  Bool.pick(F32, obsidian,
    mining_duration.tool(item, 0.0, 0.0, 0.0, 0.0, 9.0),
    Bool.pick(F32, diamond_ore,
      mining_duration.tool(item, 0.0, 0.0, 0.0, 1.1, 0.7),
      Bool.pick(F32, iron_ore,
        mining_duration.tool(item, 0.0, 0.0, 2.0, 0.8, 0.6),
        Bool.pick(F32, stone,
          mining_duration.tool(item, 0.45, 1.5, 0.8, 0.55, 0.4),
          Bool.pick(F32, wood,
            mining_duration.tool(item, 1.2, 1.0, 0.75, 0.55, 0.4),
            mining_duration.tool(item, 0.35, 0.3, 0.25, 0.2, 0.15))))))

def mining_duration(+item: U32, +block: U32) -> F32:
  Bool.pick(F32, can_mine(item, block), mining_duration.material(item, block), 0.0)

def mining_item.base(+block: U32) -> U32:
  Bool.pick(U32, U32.is_eq(block, 20), 2,
    Bool.pick(U32, U32.is_eq(block, 14), 24,
    Bool.pick(U32, U32.is_eq(block, 13), 23,
      Bool.pick(U32, U32.is_eq(block, 12), 22,
        Bool.pick(U32, U32.is_eq(block, 11), 21,
          Bool.pick(U32, U32.is_eq(block, 23), 32,
            Bool.pick(U32, U32.is_eq(block, 22), 31,
              Bool.pick(U32, U32.is_eq(block, 10), 16,
            Bool.pick(U32, U32.is_eq(block, 9), 15,
              Bool.pick(U32, U32.is_eq(block, 8), 14, block))))))))))

def mining_item(+block: U32) -> U32:
  +seeds = Bool.or(Bool.or(U32.is_eq(block, 16), U32.is_eq(block, 17)), U32.is_eq(block, 18))
  +wheat = U32.is_eq(block, 19)
  Bool.pick(U32, seeds, 25, Bool.pick(U32, wheat, 26, mining_item.base(block)))

def mine_drop(+item: U32, +block: U32, +y: Nat) -> MiningResult:
  MiningResult{mining_item(block), 1,
    Bool.and(Nat.is_gt(y, 0n), can_mine(item, block))}

def mine_collect.if(
  original: List<&2, Slot>, mining: MiningResult
) -> InventoryResult:
  MiningResult{item, amount, valid} = mining
  match valid:
    case False{}:
      result(original, False{})
    case True{}:
      pickup(original, item, U32.to_nat(amount))

def mine_collect(
  slots: List<&2, Slot>, +item: U32, +block: U32, +y: Nat
) -> InventoryResult:
  mine_collect.if(slots, mine_drop(item, block, y))

def place.valid(+original: List<&2, Slot>, +index: Nat, valid: Bool) -> InventoryResult:
  match valid:
    case False{}:
      result(original, False{})
    case True{}:
      consume(original, index, 1n)

def place.found(
  +original: List<&2, Slot>, +index: Nat, +item: U32,
  target_empty: Bool, inside: Bool, overlaps_player: Bool, slot: Slot
) -> InventoryResult:
  +valid = Bool.and(
    U32.is_eq(slot_item(slot), item),
    can_place(item, target_empty, inside, overlaps_player)
  )
  place.valid(original, index, valid)

def place.lookup(
  +original: List<&2, Slot>, +index: Nat, +item: U32,
  target_empty: Bool, inside: Bool, overlaps_player: Bool,
  lookup_result: Lookup
) -> InventoryResult:
  match lookup_result:
    case Missing{}:
      result(original, False{})
    case Found{slot}:
      place.found(original, index, item, target_empty, inside, overlaps_player, slot)

def place(
  +slots: List<&2, Slot>, +index: Nat, +item: U32,
  target_empty: Bool, inside: Bool, overlaps_player: Bool
) -> InventoryResult:
  place.lookup(slots, index, item, target_empty, inside, overlaps_player, lookup(slots, index))

def interaction.finish(
  +edit: WorldState.Edit, original: List<&2, Slot>, state: InventoryResult
) -> InteractionResult:
  InventoryResult{slots, ok} = state
  Bool.pick(
    InteractionResult,
    ok,
    InteractionResult{edit, slots, True{}},
    InteractionResult{edit, original, False{}}
  )

def mine_interaction(
  +slots: List<&2, Slot>, +tool: U32, +block: U32,
  +x: Nat, +y: Nat, +z: Nat
) -> InteractionResult:
  +edit = WorldState.make_edit(x, y, z, 0)
  interaction.finish(edit, slots, mine_collect(slots, tool, block, y))

def mine_interaction_at_finish_used(
  +edit: WorldState.Edit, original: List<&2, Slot>, collected_ok: Bool,
  state: InventoryResult
) -> InteractionResult:
  InventoryResult{used_slots, used_ok} = state
  +valid = Bool.and(collected_ok, used_ok)
  Bool.pick(
    InteractionResult,
    valid,
    InteractionResult{edit, used_slots, True{}},
    InteractionResult{edit, original, False{}}
  )

def mine_interaction_at_finish_hand(
  +edit: WorldState.Edit, original: List<&2, Slot>, slots: List<&2, Slot>,
  collected_ok: Bool
) -> InteractionResult:
  Bool.pick(
    InteractionResult,
    collected_ok,
    InteractionResult{edit, slots, True{}},
    InteractionResult{edit, original, False{}}
  )

def mine_interaction_at_finish_tool(
  +edit: WorldState.Edit, original: List<&2, Slot>, +index: Nat,
  slots: List<&2, Slot>, collected_ok: Bool
) -> InteractionResult:
  +used = use_tool_at(slots, index)
  mine_interaction_at_finish_used(edit, original, collected_ok, used)

def mine_interaction_at_finish_mode(
  +edit: WorldState.Edit, original: List<&2, Slot>, +index: Nat,
  slots: List<&2, Slot>, collected_ok: Bool, tool_empty: Bool
) -> InteractionResult:
  match tool_empty:
    case True{}:
      mine_interaction_at_finish_hand(edit, original, slots, collected_ok)
    case False{}:
      mine_interaction_at_finish_tool(edit, original, index, slots, collected_ok)

def mine_interaction_at_finish_collected(
  +edit: WorldState.Edit, original: List<&2, Slot>, +index: Nat, +tool: U32,
  state: InventoryResult
) -> InteractionResult:
  InventoryResult{slots, collected_ok} = state
  mine_interaction_at_finish_mode(
    edit,
    original,
    index,
    slots,
    collected_ok,
    U32.is_eq(tool_max_durability(tool), 0)
  )

def mine_interaction_at.finish(
  +edit: WorldState.Edit, original: List<&2, Slot>, +index: Nat, +tool: U32,
  collected: InventoryResult
) -> InteractionResult:
  mine_interaction_at_finish_collected(edit, original, index, tool, collected)

def mine_interaction_at(
  +slots: List<&2, Slot>, +index: Nat, +tool: U32, +block: U32,
  +x: Nat, +y: Nat, +z: Nat
) -> InteractionResult:
  +edit = WorldState.make_edit(x, y, z, 0)
  mine_interaction_at.finish(edit, slots, index, tool, mine_collect(slots, tool, block, y))

def place_interaction(
  +slots: List<&2, Slot>, +index: Nat, +item: U32, +block: U32,
  +x: Nat, +y: Nat, +z: Nat,
  target_empty: Bool, inside: Bool, overlaps_player: Bool
) -> InteractionResult:
  +edit = WorldState.make_edit(x, y, z, block)
  interaction.finish(
    edit,
    slots,
    place(slots, index, item, target_empty, inside, overlaps_player)
  )

def bucket.finalize(
  +original: List<&2, Slot>, +index: Nat, replacement: Slot, valid: Bool
) -> InventoryResult:
  match valid:
    case False{}:
      result(original, False{})
    case True{}:
      result(replace_at(original, index, replacement), True{})

def bucket.lookup(
  +original: List<&2, Slot>, +index: Nat, +from_item: U32, +to_item: U32,
  lookup_result: Lookup
) -> InventoryResult:
  match lookup_result:
    case Missing{}:
      result(original, False{})
    case Found{slot}:
      Slot{+item, +count, +durability} = slot
      bucket.finalize(
        original,
        index,
        make_slot(to_item, count, durability),
        U32.is_eq(item, from_item)
      )

def fill_bucket_at(+slots: List<&2, Slot>, +index: Nat) -> InventoryResult:
  bucket.lookup(slots, index, 28, 29, lookup(slots, index))

def empty_bucket_at(+slots: List<&2, Slot>, +index: Nat) -> InventoryResult:
  bucket.lookup(slots, index, 29, 28, lookup(slots, index))

def fill_lava_bucket_at(+slots: List<&2, Slot>, +index: Nat) -> InventoryResult:
  bucket.lookup(slots, index, 28, 30, lookup(slots, index))

def empty_lava_bucket_at(+slots: List<&2, Slot>, +index: Nat) -> InventoryResult:
  bucket.lookup(slots, index, 30, 28, lookup(slots, index))

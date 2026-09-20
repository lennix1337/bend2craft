import Base
import ./world.bend as World

type Mob is Data:
  Mob{id: Nat, kind: U32, x: F32, y: F32, z: F32, health: F32, alive: Bool, dir: U32}

type Drop is Data:
  Drop{id: Nat, item: U32, x: F32, y: F32, z: F32, amount: U32, velocity_y: F32, settled: Bool}

type Ground is Data:
  Ground{x: F32, z: F32, y: F32}

type CombatResult is Data:
  CombatResult{mobs: List<&2, Mob>, drops: List<&2, Drop>, hit: Bool}

type DropTarget is Data:
  DropFound{id: Nat, item: U32, amount: U32}
  DropMissing{}

def fraction(+numerator: U32, +denominator: U32) -> F32:
  F32.div(U32.to_f32(numerator), U32.to_f32(denominator))

def make_mob(
  id: Nat, kind: U32, x: F32, y: F32, z: F32, health: F32, alive: Bool, dir: U32
) -> Mob:
  Mob{id, kind, x, y, z, health, alive, dir}

def cons_mob(mob: Mob, tail: List<&2, Mob>) -> List<&2, Mob>:
  Con{mob, tail}

def cons_drop(drop: Drop, tail: List<&2, Drop>) -> List<&2, Drop>:
  Con{drop, tail}

def empty_drops() -> List<&2, Drop>:
  Nil{}

def combat_mobs(state: CombatResult) -> List<&2, Mob>:
  CombatResult{mobs, drops, hit} = state
  mobs

def combat_drops(state: CombatResult) -> List<&2, Drop>:
  CombatResult{mobs, drops, hit} = state
  drops

def combat_hit(state: CombatResult) -> Bool:
  CombatResult{mobs, drops, hit} = state
  hit

def drop_for(mob: Mob) -> Drop:
  Mob{id, kind, x, y, z, health, alive, dir} = mob
  +item = Bool.pick(U32, U32.is_eq(kind, 1), 12, 13)
  Drop{id, item, x, y, z, 1, 0.0, False{}}

def spawn_x(
  +seed: Nat, +remaining: Nat, +x: Nat, +z: Nat, +next_id: Nat,
  +mobs: List<&2, Mob>
) -> List<&2, Mob>:
  match remaining:
    case 0n:
      mobs
    case 1n+p:
      +height = World.column_height(seed, x, z)
      +hash = World.mix(seed, x, z)
      +selected = Nat.is_eq(Nat.mod(hash, 23n), 0n)
      +kind = U32.add(U32.from_nat(Nat.mod(World.mix(seed, z, x), 2n)), 1)
      +mob = make_mob(
        next_id,
        kind,
        F32.add(U32.to_f32(U32.from_nat(x)), fraction(1, 2)),
        U32.to_f32(U32.from_nat(height)),
        F32.add(U32.to_f32(U32.from_nat(z)), fraction(1, 2)),
        20.0,
        True{},
        0
      )
      +updated = Bool.pick(List<&2, Mob>, selected, cons_mob(mob, mobs), mobs)
      spawn_x(seed, p, Nat.add(x, 8n), z, Nat.add(next_id, 1n), updated)

def spawn_z(
  +seed: Nat, +remaining: Nat, +x: Nat, +z: Nat, +x_count: Nat,
  +next_id: Nat, +mobs: List<&2, Mob>
) -> List<&2, Mob>:
  match remaining:
    case 0n:
      mobs
    case 1n+p:
      +row = spawn_x(seed, x_count, x, z, next_id, mobs)
      spawn_z(seed, p, x, Nat.add(z, 8n), x_count, Nat.add(next_id, x_count), row)

def spawn(
  +seed: Nat, +origin_x: Nat, +origin_z: Nat, +width: Nat, +depth: Nat
) -> List<&2, Mob>:
  spawn_z(seed, Nat.div(depth, 8n), origin_x, origin_z, Nat.div(width, 8n), 0n, Nil{})

# Passive mobs wander: every 24 ticks they pick one of 8 compass headings
# derived from their id, so grazing needs no stored state or RNG.
def wander_dir(+id: Nat, +tick: Nat) -> U32:
  U32.from_nat(Nat.mod(Nat.add(Nat.mul(id, 7n), Nat.div(tick, 24n)), 8n))

def wander_sx(+dir: U32) -> F32:
  +neg = Bool.or(U32.is_eq(dir, 5), Bool.or(U32.is_eq(dir, 6), U32.is_eq(dir, 7)))
  +pos = Bool.or(U32.is_eq(dir, 1), Bool.or(U32.is_eq(dir, 2), U32.is_eq(dir, 3)))
  Bool.pick(F32, neg, F32.neg(1.0), Bool.pick(F32, pos, 1.0, 0.0))

def wander_sz(+dir: U32) -> F32:
  +neg = Bool.or(U32.is_eq(dir, 0), Bool.or(U32.is_eq(dir, 1), U32.is_eq(dir, 7)))
  +pos = Bool.or(U32.is_eq(dir, 3), Bool.or(U32.is_eq(dir, 4), U32.is_eq(dir, 5)))
  Bool.pick(F32, neg, F32.neg(1.0), Bool.pick(F32, pos, 1.0, 0.0))

def step_mob(mob: Mob, player_x: F32, player_z: F32, +dt: F32, +tick: Nat) -> Mob:
  Mob{+id, +kind, +x, +y, +z, +health, +alive, +old_dir} = mob
  +hostile = U32.is_eq(kind, 2)
  +active = Bool.and(hostile, alive)
  +dx = F32.sub(player_x, x)
  +dz = F32.sub(player_z, z)
  +distance = F32.sqrt(F32.add(F32.mul(dx, dx), F32.mul(dz, dz)))
  +safe_distance = Bool.pick(F32, F32.is_eq(distance, 0.0), 1.0, distance)
  +speed = F32.mul(fraction(8, 10), dt)
  +chase_x = F32.add(x, F32.mul(F32.div(dx, safe_distance), speed))
  +chase_z = F32.add(z, F32.mul(F32.div(dz, safe_distance), speed))
  +passive = Bool.and(Bool.not(hostile), alive)
  +dir = Bool.pick(U32, passive, wander_dir(id, tick), old_dir)
  +graze = F32.mul(fraction(1, 2), dt)
  +graze_x = F32.add(x, F32.mul(wander_sx(dir), graze))
  +graze_z = F32.add(z, F32.mul(wander_sz(dir), graze))
  +next_x = Bool.pick(F32, active, chase_x, Bool.pick(F32, passive, graze_x, x))
  +next_z = Bool.pick(F32, active, chase_z, Bool.pick(F32, passive, graze_z, z))
  make_mob(id, kind, next_x, y, next_z, health, alive, dir)

def step(+mobs: List<&2, Mob>, +player_x: F32, +player_z: F32, +dt: F32, +tick: Nat) -> List<&2, Mob>:
  match mobs:
    case Nil{}:
      Nil{}
    case Con{+head, tail}:
      cons_mob(step_mob(head, player_x, player_z, dt, tick), step(tail, player_x, player_z, dt, tick))

def step_mob_budgeted(
  +mob: Mob, player_x: F32, player_z: F32, +dt: F32, +active_radius: F32, +tick: Nat
) -> Mob:
  Mob{+id, +kind, +x, +y, +z, +health, +alive, +old_dir} = mob
  +dx = F32.sub(player_x, x)
  +dz = F32.sub(player_z, z)
  +distance = F32.sqrt(F32.add(F32.mul(dx, dx), F32.mul(dz, dz)))
  +near = F32.is_lt(distance, active_radius)
  +far_dt = F32.div(dt, 5.0)
  +effective_dt = Bool.pick(F32, near, dt, far_dt)
  +hostile = U32.is_eq(kind, 2)
  +active = Bool.and(hostile, alive)
  +safe_distance = Bool.pick(F32, F32.is_eq(distance, 0.0), 1.0, distance)
  +speed = F32.mul(fraction(8, 10), effective_dt)
  +chase_x = F32.add(x, F32.mul(F32.div(dx, safe_distance), speed))
  +chase_z = F32.add(z, F32.mul(F32.div(dz, safe_distance), speed))
  +passive = Bool.and(Bool.not(hostile), alive)
  +dir = Bool.pick(U32, passive, wander_dir(id, tick), old_dir)
  +graze = F32.mul(fraction(1, 2), effective_dt)
  +graze_x = F32.add(x, F32.mul(wander_sx(dir), graze))
  +graze_z = F32.add(z, F32.mul(wander_sz(dir), graze))
  +next_x = Bool.pick(F32, active, chase_x, Bool.pick(F32, passive, graze_x, x))
  +next_z = Bool.pick(F32, active, chase_z, Bool.pick(F32, passive, graze_z, z))
  make_mob(id, kind, next_x, y, next_z, health, alive, dir)

def step_budgeted(
  +mobs: List<&2, Mob>, +player_x: F32, +player_z: F32,
  +dt: F32, +active_radius: F32, +tick: Nat
) -> List<&2, Mob>:
  match mobs:
    case Nil{}:
      Nil{}
    case Con{+head, tail}:
      cons_mob(
        step_mob_budgeted(head, player_x, player_z, dt, active_radius, tick),
        step_budgeted(tail, player_x, player_z, dt, active_radius, tick)
      )

def threat_damage(mobs: List<&2, Mob>, +player_x: F32, +player_z: F32) -> F32:
  match mobs:
    case Nil{}:
      0.0
    case Con{+head, tail}:
      Mob{+id, +kind, +x, +y, +z, +health, +alive, +dir} = head
      +dx = F32.sub(player_x, x)
      +dz = F32.sub(player_z, z)
      +distance = F32.sqrt(F32.add(F32.mul(dx, dx), F32.mul(dz, dz)))
      +danger = Bool.and(Bool.and(U32.is_eq(kind, 2), alive), F32.is_lt(distance, fraction(3, 2)))
      Bool.pick(F32, danger, 2.0, threat_damage(tail, player_x, player_z))

def attack.go(
  mobs: List<&2, Mob>, +target_id: Nat, +damage: F32, +drops: List<&2, Drop>
) -> CombatResult:
  match mobs:
    case Nil{}:
      CombatResult{Nil{}, drops, False{}}
    case Con{+head, tail}:
      Mob{+id, +kind, +x, +y, +z, +health, +alive, +dir} = head
      +target = Bool.and(Nat.is_eq(id, target_id), alive)
      +next_health = Bool.pick(F32, target, F32.sub(health, damage), health)
      +next_alive = Bool.pick(Bool, target, F32.is_gt(next_health, 0.0), alive)
      +killed = Bool.and(target, Bool.not(next_alive))
      +next_drops = Bool.pick(List<&2, Drop>, killed, cons_drop(drop_for(head), drops), drops)
      +updated = make_mob(id, kind, x, y, z, next_health, next_alive, dir)
      +rest = attack.go(tail, target_id, damage, next_drops)
      CombatResult{cons_mob(updated, combat_mobs(rest)), combat_drops(rest), Bool.or(target, combat_hit(rest))}

def attack(+mobs: List<&2, Mob>, +target_id: Nat, +damage: F32) -> CombatResult:
  attack.go(mobs, target_id, damage, Nil{})

def make_drop_target(id: Nat, item: U32, amount: U32) -> DropTarget:
  DropFound{id, item, amount}

def ground_y(grounds: List<&2, Ground>, +x: F32, +z: F32) -> F32:
  match grounds:
    case Nil{}:
      F32.neg(100.0)
    case Con{+head, +tail}:
      Ground{+gx, +gz, +gy} = head
      Bool.pick(F32, Bool.and(F32.is_eq(gx, x), F32.is_eq(gz, z)), gy, ground_y(tail, x, z))

def step_drop(drop: Drop, +dt: F32, +grounds: List<&2, Ground>) -> Drop:
  Drop{+id, +item, +x, +y, +z, +amount, +velocity_y, +settled} = drop
  +floor = ground_y(grounds, x, z)
  +next_velocity = F32.sub(velocity_y, F32.mul(20.0, dt))
  +next_y = F32.add(y, F32.mul(next_velocity, dt))
  +landed = F32.is_le(next_y, floor)
  +resolved_y = Bool.pick(F32, landed, floor, next_y)
  +resolved_velocity = Bool.pick(F32, landed, 0.0, next_velocity)
  +resolved_settled = Bool.or(settled, landed)
  Bool.pick(Drop, settled, drop, Drop{id, item, x, resolved_y, z, amount, resolved_velocity, resolved_settled})

def step_drops(
  +drops: List<&2, Drop>, +dt: F32, +grounds: List<&2, Ground>
) -> List<&2, Drop>:
  match drops:
    case Nil{}:
      Nil{}
    case Con{+head, tail}:
      cons_drop(step_drop(head, dt, grounds), step_drops(tail, dt, grounds))

def nearest_drop(
  drops: List<&2, Drop>, +player_x: F32, +player_y: F32, +player_z: F32
) -> DropTarget:
  match drops:
    case Nil{}:
      DropMissing{}
    case Con{+head, tail}:
      Drop{id, item, x, y, z, amount, velocity_y, settled} = head
      +dx = F32.sub(player_x, x)
      +dy = F32.sub(player_y, y)
      +dz = F32.sub(player_z, z)
      +distance = F32.sqrt(F32.add(F32.add(F32.mul(dx, dx), F32.mul(dy, dy)), F32.mul(dz, dz)))
      Bool.pick(DropTarget, F32.is_lt(distance, fraction(15, 10)), make_drop_target(id, item, amount), nearest_drop(tail, player_x, player_y, player_z))

def remove_drop(drops: List<&2, Drop>, +target_id: Nat) -> List<&2, Drop>:
  match drops:
    case Nil{}:
      Nil{}
    case Con{+head, +tail}:
      Drop{id, item, x, y, z, amount, velocity_y, settled} = head
      +rest = remove_drop(tail, target_id)
      Bool.pick(List<&2, Drop>, Nat.is_eq(id, target_id), tail, cons_drop(head, rest))

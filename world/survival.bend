import Base

# Survival rules are the Bend 2 source of truth for damage and hunger.
# The browser adapter in web/survival.js mirrors these definitions.

def max_health() -> Nat:
  20n

def max_hunger() -> Nat:
  20n

def fall_safe_blocks() -> Nat:
  3n

def survival_mode() -> Nat:
  0n

def creative_mode() -> Nat:
  1n

def hardcore_mode() -> Nat:
  2n

# No damage within 3 blocks, then 1 health per extra block.
def fall_damage(+dist: Nat) -> Nat:
  Nat.sub(dist, fall_safe_blocks())

def apply_damage(+health: Nat, +amount: Nat) -> Nat:
  Nat.sub(health, amount)

def heal(+health: Nat, +amount: Nat) -> Nat:
  +healed = Nat.add(health, amount)
  +over = Nat.is_gt(healed, max_health())
  Bool.pick(Nat, over, max_health(), healed)

def drain_hunger(+hunger: Nat, +amount: Nat) -> Nat:
  Nat.sub(hunger, amount)

def eat(+hunger: Nat, +amount: Nat) -> Nat:
  +fed = Nat.add(hunger, amount)
  +over = Nat.is_gt(fed, max_hunger())
  Bool.pick(Nat, over, max_hunger(), fed)

def is_dead(+health: Nat) -> Bool:
  Nat.is_eq(health, 0n)

def is_creative(+mode: Nat) -> Bool:
  Nat.is_eq(mode, creative_mode())

def is_hardcore(+mode: Nat) -> Bool:
  Nat.is_eq(mode, hardcore_mode())

def takes_damage(+mode: Nat) -> Bool:
  Nat.is_eq(mode, survival_mode()) || Nat.is_eq(mode, hardcore_mode())

def drains_hunger(+mode: Nat) -> Bool:
  takes_damage(mode)

# Health regenerates only with a nearly full hunger bar.
def should_regen(+hunger: Nat, +health: Nat, +mode: Nat) -> Bool:
  +fed = Nat.is_gt(hunger, 17n)
  +hurt = Nat.is_gt(health, 0n) && Nat.is_lt(health, max_health())
  fed && hurt && takes_damage(mode)

# An empty hunger bar starves the player in survival-like modes.
def should_starve(+hunger: Nat, +mode: Nat) -> Bool:
  Nat.is_eq(hunger, 0n) && takes_damage(mode)

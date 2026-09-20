import Base

# Mob rules are the Bend 2 source of truth for creature stats.
# Kind IDs: 0 pig (passive), 1 zombie (hostile).
# The browser adapter in web/mobs.js mirrors these definitions.

def pig_kind() -> Nat:
  0n

def zombie_kind() -> Nat:
  1n

def mob_health(+kind: Nat) -> Nat:
  +hostile = Nat.is_eq(kind, zombie_kind())
  Bool.pick(Nat, hostile, 20n, 10n)

def mob_damage(+kind: Nat) -> Nat:
  +hostile = Nat.is_eq(kind, zombie_kind())
  Bool.pick(Nat, hostile, 3n, 0n)

def is_hostile(+kind: Nat) -> Bool:
  Nat.is_eq(kind, zombie_kind())

def zombie_burns_in_day() -> Bool:
  True{}

def pig_cap() -> Nat:
  6n

def zombie_cap() -> Nat:
  5n

def pork_hunger() -> Nat:
  3n

def flesh_hunger() -> Nat:
  2n

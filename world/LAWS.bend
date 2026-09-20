import Base
import ./world.bend as World
import ./survival.bend as Survival
import ./mobs.bend as Mobs

law air_above_surface:
  {World.block(1337n, 0n, 11n, 0n) == 0 : U32}

law surface_is_grass:
  {World.block(1337n, 0n, 8n, 0n) == 3 : U32}

law known_tree_wood:
  {World.block(1337n, 4n, 6n, 2n) == 5 : U32}

law known_tree_leaf:
  {World.block(1337n, 3n, 8n, 1n) == 4 : U32}

law fall_is_safe_within_three_blocks:
  {Survival.fall_damage(3n) == 0n : Nat}

law fall_costs_one_per_extra_block:
  {Survival.fall_damage(10n) == 7n : Nat}

law damage_saturates_at_zero:
  {Survival.apply_damage(5n, 99n) == 0n : Nat}

law heal_caps_at_max_health:
  {Survival.heal(18n, 99n) == 20n : Nat}

law hunger_caps_at_max:
  {Survival.eat(19n, 99n) == 20n : Nat}

law zero_health_is_dead:
  {Survival.is_dead(0n) == True{} : Bool}

law hardcore_takes_damage:
  {Survival.takes_damage(2n) == True{} : Bool}

law creative_takes_no_damage:
  {Survival.takes_damage(1n) == False{} : Bool}

law pig_is_weak:
  {Mobs.mob_health(0n) == 10n : Nat}

law zombie_is_tough:
  {Mobs.mob_health(1n) == 20n : Nat}

law zombie_hurts_pig_does_not:
  {Mobs.mob_damage(1n) == 3n : Nat}

law pig_is_passive:
  {Mobs.is_hostile(0n) == False{} : Bool}

law zombie_is_hostile:
  {Mobs.is_hostile(1n) == True{} : Bool}

law zombies_burn_in_daylight:
  {Mobs.zombie_burns_in_day() == True{} : Bool}

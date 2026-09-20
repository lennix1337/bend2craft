import Base
import ./world.bend as World
import ./entities.bend as Entities

law air_above_surface:
  {World.block(1337n, 40n, 15n, 40n) == 0 : U32}

law surface_is_grass:
  {World.block(1337n, 8n, 7n, 8n) == 3 : U32}

law known_tree_wood:
  {World.block(1337n, 38n, 9n, 3n) == 5 : U32}

law known_tree_leaf:
  {World.block(1337n, 37n, 11n, 3n) == 4 : U32}

law beach_is_sand:
  {World.block(1337n, 3n, 5n, 3n) == 6 : U32}

law sea_surface_is_water:
  {World.block(1337n, 3n, 7n, 3n) == 7 : U32}

law cave_is_air:
  {World.block(1337n, 35n, 5n, 35n) == 0 : U32}

law known_coal_ore:
  {World.block(1337n, 1n, 1n, 0n) == 8 : U32}

law known_iron_ore:
  {World.block(1337n, 7n, 1n, 0n) == 9 : U32}

law known_diamond_ore:
  {World.block(1337n, 19n, 1n, 0n) == 10 : U32}

law known_village_furnace:
  {World.block(1337n, 25n, 9n, 27n) == 11 : U32}

law wander_dir_pins_heading:
  {Entities.wander_dir(3n, 48n) == 7 : U32}

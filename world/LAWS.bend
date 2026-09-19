import Base
import ./world.bend as World

law air_above_surface:
  {World.block(0n, 11n, 0n) == 0 : U32}

law surface_is_grass:
  {World.block(0n, 3n, 0n) == 3 : U32}

law known_tree_wood:
  {World.block(38n, 5n, 6n) == 5 : U32}

law known_tree_leaf:
  {World.block(37n, 7n, 5n) == 4 : U32}

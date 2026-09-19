import Base
import ./world.bend as World

law air_above_surface:
  {World.block(1337n, 0n, 11n, 0n) == 0 : U32}

law surface_is_grass:
  {World.block(1337n, 0n, 8n, 0n) == 3 : U32}

law known_tree_wood:
  {World.block(1337n, 4n, 6n, 2n) == 5 : U32}

law known_tree_leaf:
  {World.block(1337n, 3n, 8n, 1n) == 4 : U32}

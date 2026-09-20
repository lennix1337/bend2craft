import Base
import ./crops.bend as Crops
import ./farmland.bend as Farmland

type Chunk is Data:
  Chunk{x: Nat, z: Nat, ticks: Nat}

type Simulation is Data:
  Simulation{time: Nat, chunks: List<&2, Chunk>, crops: Crops.State, farmland: Farmland.State}

def empty() -> Simulation:
  Simulation{0n, Nil{}, Crops.empty(), Farmland.empty()}

def same_chunk(chunk: Chunk, +x: Nat, +z: Nat) -> Bool:
  Chunk{+cx, +cz, ticks} = chunk
  Bool.and(Nat.is_eq(cx, x), Nat.is_eq(cz, z))

def contains(chunks: List<&2, Chunk>, +x: Nat, +z: Nat) -> Bool:
  match chunks:
    case Nil{}:
      False{}
    case Con{+head, +tail}:
      Bool.or(same_chunk(head, x, z), contains(tail, x, z))

def sim_time(state: Simulation) -> Nat:
  Simulation{time, chunks, crops, farmland} = state
  time

def sim_chunks(state: Simulation) -> List<&2, Chunk>:
  Simulation{time, chunks, crops, farmland} = state
  chunks

def sim_crops(state: Simulation) -> Crops.State:
  Simulation{time, chunks, crops, farmland} = state
  crops

def sim_farmland(state: Simulation) -> Farmland.State:
  Simulation{time, chunks, crops, farmland} = state
  farmland

def with_crops(+state: Simulation, +crops: Crops.State) -> Simulation:
  Simulation{+time, +chunks, old_crops, +farmland} = state
  Simulation{time, chunks, crops, farmland}

def with_farmland(+state: Simulation, +farmland: Farmland.State) -> Simulation:
  Simulation{+time, +chunks, +crops, old_farmland} = state
  Simulation{time, chunks, crops, farmland}

def pinned_count_entries(chunks: List<&2, Chunk>, +total: Nat) -> Nat:
  match chunks:
    case Nil{}:
      total
    case Con{+head, +tail}:
      pinned_count_entries(tail, Nat.add(total, 1n))

def pinned_count(state: Simulation) -> Nat:
  pinned_count_entries(sim_chunks(state), 0n)

def pin(+state: Simulation, +x: Nat, +z: Nat) -> Simulation:
  +chunks = sim_chunks(state)
  +time = sim_time(state)
  +crops = sim_crops(state)
  +farmland = sim_farmland(state)
  Bool.pick(Simulation, contains(chunks, x, z), state, Simulation{time, Con{Chunk{x, z, 0n}, chunks}, crops, farmland})

def remove_entries(chunks: List<&2, Chunk>, +x: Nat, +z: Nat) -> List<&2, Chunk>:
  match chunks:
    case Nil{}:
      Nil{}
    case Con{+head, +tail}:
      Chunk{+cx, +cz, ticks} = head
      Bool.pick(List<&2, Chunk>, Bool.and(Nat.is_eq(cx, x), Nat.is_eq(cz, z)), tail,
        Con{head, remove_entries(tail, x, z)})

def unpin(+state: Simulation, +x: Nat, +z: Nat) -> Simulation:
  Simulation{+time, +chunks, +crops, +farmland} = state
  Simulation{time, remove_entries(chunks, x, z), crops, farmland}

def tick_entries(+chunks: List<&2, Chunk>, +steps: Nat) -> List<&2, Chunk>:
  match chunks:
    case Nil{}:
      Nil{}
    case Con{+head, +tail}:
      Chunk{+x, +z, +ticks} = head
      Con{Chunk{x, z, Nat.add(ticks, steps)}, tick_entries(tail, steps)}

def tick_with_water(+state: Simulation, +steps: Nat, +waters: List<&2, Farmland.Water>) -> Simulation:
  Simulation{+time, +chunks, +crops, +farmland} = state
  +next_farmland = Farmland.tick(farmland, waters)
  Simulation{Nat.add(time, steps), tick_entries(chunks, steps), Crops.tick_with_farmland(crops, steps, next_farmland), next_farmland}

def tick(+state: Simulation, +steps: Nat) -> Simulation:
  tick_with_water(state, steps, Nil{})

def chunk_ticks.entries(chunks: List<&2, Chunk>, +x: Nat, +z: Nat) -> Nat:
  match chunks:
    case Nil{}:
      0n
    case Con{+head, +tail}:
      Chunk{+cx, +cz, +ticks} = head
      Bool.pick(Nat, Bool.and(Nat.is_eq(cx, x), Nat.is_eq(cz, z)), ticks, chunk_ticks.entries(tail, x, z))

def chunk_ticks(state: Simulation, +x: Nat, +z: Nat) -> Nat:
  chunk_ticks.entries(sim_chunks(state), x, z)

def time(state: Simulation) -> Nat:
  sim_time(state)

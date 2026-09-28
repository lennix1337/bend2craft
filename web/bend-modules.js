// The one place that knows how the Bend JS lane names a datatype.
//
// A value leaves the module that owns its type with the bare tag (`Edit`,
// `State`, `Mob`). A module that *imported* that type wants `owner.Type` on the
// way in, and the same module wants the bare tag for a type it defines itself.
// So one value has two valid spellings, decided by the callee, and the loader
// rejects the wrong one instead of coercing it. Upstream tracks the
// inconsistency as bend-lang/bend#1105 and says a later version will make the
// tag the same everywhere, at which point this file collapses to a passthrough.
//
// Rather than spread that over every call site, each module is wrapped once
// here: the declared foreign parameters are qualified on the way in, and a
// result that carries a qualified tag is stripped on the way out. Everything
// above this file therefore sees one naming, the bare tag, exactly as it did
// before Bend 2.0.27.
//
// FOREIGN is derived from the `Alias.Type` annotations in the world signatures
// and `tests/bend-bridge.test.mjs` fails if the two ever disagree, so the table
// cannot drift from the contracts it describes.

import rawChest from "../world/chest.bend";
import rawChests from "../world/chests.bend";
import rawCrops from "../world/crops.bend";
import rawEntities from "../world/entities.bend";
import rawEquipment from "../world/equipment.bend";
import rawExperience from "../world/experience.bend";
import rawFarmland from "../world/farmland.bend";
import rawFire from "../world/fire.bend";
import rawFlood from "../world/light-flood.bend";
import rawFlood2 from "../world/lightflood.bend";
import rawFluids from "../world/fluids.bend";
import rawFurnace from "../world/furnace.bend";
import rawFurnaces from "../world/furnaces.bend";
import rawHorizon from "../world/horizon.bend";
import rawInventory from "../world/inventory.bend";
import rawLight from "../world/light.bend";
import rawLightDirty from "../world/light-dirty.bend";
import rawPlayer from "../world/player.bend";
import rawSimulation from "../world/simulation.bend";
import rawStructures from "../world/structures.bend";
import rawPath from "../world/village_path.bend";
import rawVillagers from "../world/villagers.bend";
import rawWorld from "../world/world.bend";
import rawWorldState from "../world/world_state.bend";

// Per def: `{ <parameter index>: <owning file> }` for the parameters whose type
// the callee imported, plus `out: true` when the declared result is itself a
// foreign type and so reaches the adapter spelled `owner.Type`.
//
// `out` is deliberately *not* set on a def that returns its own type, even when
// that type holds foreign fields (`Simulation`, `Tick`): the adapter never
// takes those apart, it hands the whole composite back, and a normalised nested
// field would then be rejected by the very module that produced it.
export const FOREIGN = {
  chests: {
    lookup_slots: { out: true },
    make_entry: { 3: "chest" },
    set: { 4: "chest" },
  },
  crops: {
    tick_entries_farmland: { 2: "farmland" },
    tick_with_farmland: { 2: "farmland" },
  },
  entities: {
    edit_opaque_above: { 0: "world_state" },
    sun_burning: { 3: "world_state" },
    sun_exposed: { 0: "world_state" },
    sunlight_damage: { 1: "world_state" },
  },
  furnaces: {
    make_entry: { 3: "furnace" },
    replace_entries: { 4: "furnace" },
    set: { 4: "furnace" },
  },
  inventory: {
    mine_interaction_at_finish_collected: { 0: "world_state" },
    mine_interaction_at_finish_hand: { 0: "world_state" },
    mine_interaction_at_finish_mode: { 0: "world_state" },
    mine_interaction_at_finish_tool: { 0: "world_state" },
    mine_interaction_at_finish_used: { 0: "world_state" },
  },
  light: {
    fields_from_cells: { 0: "lightflood" },
    window_walls: { 6: "lightflood", out: true },
  },
  simulation: {
    sim_crops: { out: true },
    sim_farmland: { out: true },
    tick_fire: { out: true },
    tick_fluids: { out: true },
    tick_with_fluids: { 2: "farmland", 3: "fluids", 4: "fluids" },
    tick_with_fluids_and_fire: { 2: "farmland", 3: "fluids", 4: "fluids", 5: "fire", 6: "fire" },
    tick_with_water: { 2: "farmland" },
    with_crops: { 1: "crops" },
    with_farmland: { 1: "farmland" },
  },
  villagers: {
    close_door_result: { 0: "world_state", 5: "world_state" },
    cons_door_edit: { 0: "world_state", 1: "world_state", out: true },
    door_edits: { out: true },
    open_door: { 0: "world_state", out: true },
    open_doors: { 2: "world_state", out: true },
    open_for: { 2: "world_state", out: true },
    path_grid: { 1: "world_state" },
    sleep: { 2: "world_state" },
    update_doors: { 2: "world_state", out: true },
    update_doors_result: { 2: "world_state" },
  },
};

// Base's own list constructors keep the bare tag in every module.
const LIST_TAGS = new Set(["Con", "Nil"]);
// An owner qualifier: a lowercase file name in front of a capitalised type.
const QUALIFIED = /^[a-z][a-z0-9_-]*\./;

export const bare = (tag) => tag.replace(QUALIFIED, "");

// The bare constructor name of a tag, for a value that crossed the boundary
// and may still carry its owner's qualifier. A restore path that compares a tag
// it read out of a save against a literal has to compare bare names, because
// which spelling a value carries depends on the module it last passed through.
export const bareTag = (tag) => (typeof tag === "string" ? bare(tag) : tag);

// Rebuilds a value with a new spelling of every tag, sharing untouched
// structure so a call that needs no rewrite allocates nothing.
function rewrite(value, spell) {
  if (Array.isArray(value)) {
    // A Bend `Array<U32>` is a dense JS array with no tag to spell; the hot
    // chunk path must not pay for a walk it cannot benefit from.
    if (value.length === 0 || typeof value[0] !== "object" || value[0] === null) return value;
    let out = value;
    for (let index = 0; index < value.length; index += 1) {
      const next = rewrite(value[index], spell);
      if (next !== value[index]) {
        if (out === value) out = value.slice();
        out[index] = next;
      }
    }
    return out;
  }
  if (value === null || typeof value !== "object") return value;
  let out = value;
  const tag = typeof value.$ === "string" ? value.$ : null;
  if (tag !== null) {
    const spelled = spell(tag);
    if (spelled !== tag) {
      out = { ...value };
      out.$ = spelled;
    }
  }
  for (const key of Object.keys(value)) {
    if (key === "$") continue;
    const next = rewrite(value[key], spell);
    if (next !== value[key]) {
      if (out === value) out = { ...value };
      out[key] = next;
    }
  }
  return out;
}

// `Edit` -> `world_state.Edit`, for a parameter the callee imported.
export const qualify = (value, owner) => rewrite(value, (tag) =>
  (LIST_TAGS.has(tag) ? tag : `${owner}.${bare(tag)}`));

// `world_state.Edit` -> `Edit`, so callers keep comparing against the bare tag.
export const simplify = (value) => rewrite(value, (tag) =>
  (LIST_TAGS.has(tag) ? tag : bare(tag)));

// A curried def called with fewer arguments than its arity comes back as a
// closure; the table has nothing to say about that.
const isClosure = (value) => typeof value === "function";

// A result that declares a foreign type comes back in the callee's spelling,
// `owner.Type`, and the adapter only ever compares against the bare tag, so a
// flagged result is normalised on the way out. A result that declares its own
// type is left exactly as the loader built it.
export function wrap(name, module) {
  const table = FOREIGN[name] ?? {};
  const wrapped = {};
  for (const key of Object.keys(module)) {
    const def = module[key];
    const spec = table[key];
    if (typeof def !== "function" || spec === undefined) {
      wrapped[key] = def;
      continue;
    }
    const indexes = Object.keys(spec)
      .filter((entry) => entry !== "out")
      .map(Number);
    wrapped[key] = (...args) => {
      let call = args;
      if (indexes.length > 0) {
        call = args.slice();
        for (const index of indexes) {
          if (index < call.length) call[index] = qualify(call[index], spec[index]);
        }
      }
      const result = def(...call);
      return spec.out === true && !isClosure(result) ? simplify(result) : result;
    };
  }
  return wrapped;
}

export const bend = {
  chest: wrap("chest", rawChest),
  chests: wrap("chests", rawChests),
  crops: wrap("crops", rawCrops),
  entities: wrap("entities", rawEntities),
  equipment: wrap("equipment", rawEquipment),
  experience: wrap("experience", rawExperience),
  farmland: wrap("farmland", rawFarmland),
  fire: wrap("fire", rawFire),
  fluids: wrap("fluids", rawFluids),
  furnace: wrap("furnace", rawFurnace),
  furnaces: wrap("furnaces", rawFurnaces),
  horizon: wrap("horizon", rawHorizon),
  inventory: wrap("inventory", rawInventory),
  light: wrap("light", rawLight),
  "light-dirty": wrap("light-dirty", rawLightDirty),
  "light-flood": wrap("light-flood", rawFlood),
  lightflood: wrap("lightflood", rawFlood2),
  player: wrap("player", rawPlayer),
  simulation: wrap("simulation", rawSimulation),
  structures: wrap("structures", rawStructures),
  village_path: wrap("village_path", rawPath),
  villagers: wrap("villagers", rawVillagers),
  world: wrap("world", rawWorld),
  world_state: wrap("world_state", rawWorldState),
};

export const Chest = bend.chest;
export const Chests = bend.chests;
export const Crops = bend.crops;
export const Entities = bend.entities;
export const Equipment = bend.equipment;
export const Experience = bend.experience;
export const Farmland = bend.farmland;
export const Fire = bend.fire;
export const Flood = bend["light-flood"];
export const Flood2 = bend.lightflood;
export const Fluids = bend.fluids;
export const Furnace = bend.furnace;
export const Furnaces = bend.furnaces;
export const Horizon = bend.horizon;
export const Inventory = bend.inventory;
export const Light = bend.light;
export const Dirty = bend["light-dirty"];
export const Player = bend.player;
export const Simulation = bend.simulation;
export const Structures = bend.structures;
export const Path = bend.village_path;
export const Villagers = bend.villagers;
export const World = bend.world;
export const WorldState = bend.world_state;

// The unwrapped modules, for the test that pins the loader's own contract.
export const raw = {
  Chest: rawChest,
  Chests: rawChests,
  Crops: rawCrops,
  Entities: rawEntities,
  Equipment: rawEquipment,
  Experience: rawExperience,
  Farmland: rawFarmland,
  Fire: rawFire,
  Flood: rawFlood,
  Flood2: rawFlood2,
  Fluids: rawFluids,
  Furnace: rawFurnace,
  Furnaces: rawFurnaces,
  Horizon: rawHorizon,
  Inventory: rawInventory,
  Light: rawLight,
  Dirty: rawLightDirty,
  Player: rawPlayer,
  Simulation: rawSimulation,
  Structures: rawStructures,
  Path: rawPath,
  Villagers: rawVillagers,
  World: rawWorld,
  WorldState: rawWorldState,
};

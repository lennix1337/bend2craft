// Main-menu controller: profiles, worlds, options and help screens.
// Runs instead of the game when the page loads without ?play=1. Starting a
// session navigates (full reload), so the engine always boots clean and no
// teardown is needed when quitting back to the title.
import {
  createProfile,
  createWorld,
  deleteProfile,
  deleteWorld,
  getActiveProfile,
  getProfile,
  getWorld,
  loadProfilesDoc,
  saveKeyFor,
  saveProfilesDoc,
  touchProfile,
  touchWorld,
} from "./profiles.js";
import {
  createDefaultOptions,
  createWorldConfig,
  DEFAULT_RENDER_DISTANCE,
  MAX_RENDER_DISTANCE,
  MIN_RENDER_DISTANCE,
  loadOptions,
  randomSeedText,
  saveOptions,
  validateWorldConfig,
  worldModeLabel,
} from "./settings.js";
import { clearTransactional } from "./persistent-save.js";

function element(id) {
  const node = document.getElementById(id);
  if (node === null) throw new Error(`Menu element is missing: ${id}.`);
  return node;
}

function formatDate(timestamp) {
  if (!timestamp) return "never played";
  return new Date(timestamp).toLocaleString();
}

function playUrl(profileId, worldId) {
  return `${window.location.pathname}?play=1&profile=${encodeURIComponent(profileId)}&world=${encodeURIComponent(worldId)}`;
}

export function runMenu() {
  const menu = element("menu");
  menu.hidden = false;
  // The game HUD belongs to playing sessions only.
  for (const id of [
    "hud",
    "hotbar",
    "held-item-view",
    "help",
    "crosshair",
    "mining-progress",
    "vitals",
    "inventory-toggle",
    "furnace-toggle",
    "inventory-panel",
    "furnace-panel",
  ]) {
    const node = document.getElementById(id);
    if (node !== null) node.hidden = true;
  }
  const screens = [...menu.querySelectorAll("[data-screen]")];
  const showScreen = (id) => {
    for (const screen of screens) screen.hidden = screen.id !== id;
  };

  let doc = loadProfilesDoc(window.localStorage);
  let options = loadOptions(window.localStorage);
  let selectedProfileId = doc.activeProfileId;
  let selectedWorldId = null;
  let optionsReturn = "screen-title";

  const persistProfiles = () => saveProfilesDoc(window.localStorage, doc);
  const persistOptions = () => {
    options = loadOptions(window.localStorage);
    return saveOptions(window.localStorage, options);
  };

  function renderProfiles() {
    const list = element("profile-list");
    list.innerHTML = "";
    if (doc.profiles.length === 0) {
      const empty = document.createElement("p");
      empty.className = "world-empty";
      empty.textContent = "No players yet. Create one to keep a personal save.";
      list.append(empty);
      selectedProfileId = null;
      return;
    }
    if (selectedProfileId === null || getProfile(doc, selectedProfileId) === null) {
      selectedProfileId = doc.profiles[0].id;
    }
    for (const profile of doc.profiles) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `world-entry${profile.id === selectedProfileId ? " selected" : ""}`;
      button.dataset.profile = profile.id;
      const name = document.createElement("strong");
      name.textContent = profile.name;
      const meta = document.createElement("span");
      meta.textContent = `${profile.worlds.length} worlds · last played ${formatDate(profile.lastPlayed)}`;
      button.append(name, meta);
      button.addEventListener("click", () => {
        selectedProfileId = profile.id;
        renderProfiles();
      });
      list.append(button);
    }
  }

  function renderWorlds() {
    const profile = getProfile(doc, selectedProfileId);
    element("worlds-title").textContent = profile === null ? "Select World" : `${profile.name}'s Worlds`;
    const list = element("world-list");
    list.innerHTML = "";
    const worlds = profile?.worlds ?? [];
    if (worlds.length === 0) {
      const empty = document.createElement("p");
      empty.className = "world-empty";
      empty.textContent = "No worlds yet. Create one to start playing.";
      list.append(empty);
      selectedWorldId = null;
      return;
    }
    if (selectedWorldId === null || getWorld(doc, selectedProfileId, selectedWorldId) === null) {
      selectedWorldId = worlds[0].id;
    }
    for (const world of worlds) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `world-entry${world.id === selectedWorldId ? " selected" : ""}`;
      button.dataset.world = world.id;
      const name = document.createElement("strong");
      name.textContent = world.name;
      const meta = document.createElement("span");
      meta.textContent = `${worldModeLabel(world.mode)} · seed ${world.seed} · last played ${formatDate(world.lastPlayed)}`;
      button.append(name, meta);
      button.addEventListener("click", () => {
        selectedWorldId = world.id;
        renderWorlds();
      });
      button.addEventListener("dblclick", () => playSelectedWorld());
      list.append(button);
    }
  }

  function showError(id, message) {
    const node = element(id);
    if (message === null) {
      node.hidden = true;
      node.textContent = "";
    } else {
      node.hidden = false;
      node.textContent = message;
    }
  }

  function playSelectedWorld() {
    const world = getWorld(doc, selectedProfileId, selectedWorldId);
    if (world === null) {
      showScreen("screen-worlds");
      return;
    }
    doc = touchWorld(doc, selectedProfileId, selectedWorldId);
    doc = touchProfile(doc, selectedProfileId);
    persistProfiles();
    showScreen("screen-loading");
    window.location.href = playUrl(selectedProfileId, selectedWorldId);
  }

  function renderOptions() {
    const fresh = loadOptions(window.localStorage);
    element("input-fov").value = String(fresh.fov);
    element("fov-value").textContent = String(fresh.fov);
    element("input-sensitivity").value = String(fresh.sensitivity);
    element("sensitivity-value").textContent = Number(fresh.sensitivity).toFixed(1);
    const renderDistance = element("input-render-distance");
    renderDistance.min = String(MIN_RENDER_DISTANCE);
    renderDistance.max = String(MAX_RENDER_DISTANCE);
    renderDistance.value = String(fresh.renderDistance ?? DEFAULT_RENDER_DISTANCE);
    element("render-distance-value").textContent = String(fresh.renderDistance ?? DEFAULT_RENDER_DISTANCE);
    const coords = menu.querySelector('[data-action="toggle-coords"]');
    if (coords !== null) coords.textContent = `Coordinates: ${fresh.showCoords ? "ON" : "OFF"}`;
  }

  menu.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (button === null) return;
    const action = button.dataset.action;
    if (action === "goto-profiles") {
      renderProfiles();
      showScreen("screen-profiles");
    } else if (action === "goto-options") {
      optionsReturn = "screen-title";
      renderOptions();
      showScreen("screen-options");
    } else if (action === "goto-help") {
      showScreen("screen-help");
    } else if (action === "back-title" || action === "back-title-help") {
      showScreen("screen-title");
    } else if (action === "back-profiles") {
      renderProfiles();
      showScreen("screen-profiles");
    } else if (action === "back-worlds") {
      renderWorlds();
      showScreen("screen-worlds");
    } else if (action === "play-profile") {
      if (selectedProfileId === null) return;
      doc = touchProfile(doc, selectedProfileId);
      persistProfiles();
      selectedWorldId = null;
      renderWorlds();
      showScreen("screen-worlds");
    } else if (action === "goto-create-profile") {
      element("input-profile-name").value = "";
      showError("profile-error", null);
      showScreen("screen-create-profile");
    } else if (action === "confirm-profile") {
      const created = createProfile(doc, element("input-profile-name").value);
      if (!created.ok) {
        showError("profile-error", created.error);
        return;
      }
      doc = created.doc;
      persistProfiles();
      selectedProfileId = created.profile.id;
      selectedWorldId = null;
      renderWorlds();
      showScreen("screen-worlds");
    } else if (action === "delete-profile") {
      if (selectedProfileId === null) return;
      const profile = getProfile(doc, selectedProfileId);
      if (profile !== null) {
        for (const world of profile.worlds) {
          try {
            clearTransactional(window.localStorage, saveKeyFor(profile.id, world.seed));
          } catch {
            // Deleting saves is best-effort.
          }
        }
      }
      doc = deleteProfile(doc, selectedProfileId);
      persistProfiles();
      selectedProfileId = doc.activeProfileId;
      renderProfiles();
    } else if (action === "goto-create-world") {
      if (selectedProfileId === null) return;
      element("input-world-name").value = "";
      element("input-seed").value = "";
      element("input-world-mode").value = "survival";
      showError("create-error", null);
      showScreen("screen-create-world");
    } else if (action === "random-seed") {
      element("input-seed").value = randomSeedText();
    } else if (action === "confirm-world") {
      if (selectedProfileId === null) return;
      const config = createWorldConfig({
        name: element("input-world-name").value,
        seedText: element("input-seed").value,
        mode: element("input-world-mode").value,
      });
      const errors = validateWorldConfig(config);
      if (errors.length > 0) {
        showError("create-error", errors[0]);
        return;
      }
      const created = createWorld(doc, selectedProfileId, config);
      if (!created.ok) {
        showError("create-error", created.error);
        return;
      }
      doc = touchProfile(touchWorld(created.doc, selectedProfileId, created.world.id), selectedProfileId);
      persistProfiles();
      selectedWorldId = created.world.id;
      showScreen("screen-loading");
      window.location.href = playUrl(selectedProfileId, selectedWorldId);
    } else if (action === "play-world") {
      playSelectedWorld();
    } else if (action === "delete-world") {
      if (selectedProfileId === null || selectedWorldId === null) return;
      const world = getWorld(doc, selectedProfileId, selectedWorldId);
      if (world !== null) {
        try {
          clearTransactional(window.localStorage, saveKeyFor(selectedProfileId, world.seed));
        } catch {
          // Deleting saves is best-effort.
        }
      }
      doc = deleteWorld(doc, selectedProfileId, selectedWorldId);
      persistProfiles();
      selectedWorldId = null;
      renderWorlds();
    } else if (action === "toggle-coords") {
      const fresh = { ...loadOptions(window.localStorage), showCoords: !loadOptions(window.localStorage).showCoords };
      saveOptions(window.localStorage, fresh);
      renderOptions();
    } else if (action === "options-done") {
      showScreen(optionsReturn);
    }
  });

  menu.addEventListener("input", (event) => {
    if (event.target.id === "input-fov") {
      const value = Number(event.target.value);
      element("fov-value").textContent = String(value);
      saveOptions(window.localStorage, { ...loadOptions(window.localStorage), fov: value });
    } else if (event.target.id === "input-sensitivity") {
      const value = Number(event.target.value);
      element("sensitivity-value").textContent = value.toFixed(1);
      saveOptions(window.localStorage, { ...loadOptions(window.localStorage), sensitivity: value });
    } else if (event.target.id === "input-render-distance") {
      const value = Number(event.target.value);
      element("render-distance-value").textContent = String(value);
      saveOptions(window.localStorage, { ...loadOptions(window.localStorage), renderDistance: value });
    }
  });

  const active = getActiveProfile(doc);
  if (active !== null) selectedProfileId = active.id;
  element("input-seed").value = "";
  showScreen("screen-title");
}

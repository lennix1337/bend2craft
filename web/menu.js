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
  audioVolumesFromOptions,
  createDefaultOptions,
  createWorldConfig,
  DEFAULT_GRAPHICS_QUALITY,
  DEFAULT_RENDER_DISTANCE,
  GRAPHICS_QUALITY_CHOICES,
  MAX_RENDER_DISTANCE,
  MAX_VOLUME,
  MIN_RENDER_DISTANCE,
  MIN_VOLUME,
  loadOptions,
  randomSeedText,
  saveOptions,
  validateWorldConfig,
  worldModeLabel,
} from "./settings.js";
import { VISUAL_QUALITY_TIERS } from "./visual-quality.js";
import { getAudioMixer } from "./audio.js";
import { probeWebGpu } from "./webgpu-capabilities.js";
import { describeBackendNotice, takeBackendNotice } from "./backend-notice.js";
import { clearTransactional } from "./persistent-save.js";
import { continueTarget } from "./menu-navigation.js";
import { nextFocusTarget, setShellInert } from "./modal-focus.js";

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
  const test = new URLSearchParams(window.location.search).get("test") === "1" ? "&test=1" : "";
  return `${window.location.pathname}?play=1&profile=${encodeURIComponent(profileId)}&world=${encodeURIComponent(worldId)}${test}`;
}

export function runMenu() {
  document.body.dataset.mode = "menu";
  const menu = element("menu");
  const gameShell = document.getElementById("game-shell");
  menu.hidden = false;
  const syncMenuIsolation = () => {
    if (gameShell !== null) setShellInert(gameShell, menu);
  };
  const trapMenuFocus = (event) => {
    if (event.key !== "Tab") return;
    const screen = [...menu.querySelectorAll("[data-screen]")].find((node) => !node.hidden);
    if (screen === undefined) return;
    const target = nextFocusTarget(screen, document.activeElement, event.shiftKey);
    event.preventDefault();
    target?.focus({ preventScroll: true });
  };
  document.addEventListener("keydown", trapMenuFocus, true);
  syncMenuIsolation();
  // The game HUD belongs to playing sessions only.
  for (const id of [
    "hud",
    "hotbar",
    "held-item-view",
    "selected",
    "help",
    "crosshair",
    "mining-progress",
    "vitals",
    "inventory-toggle",
    "furnace-toggle",
    "chest-toggle",
    "inventory-panel",
    "furnace-panel",
    "chest-panel",
    "world-loading",
  ]) {
    const node = document.getElementById(id);
    if (node !== null) node.hidden = true;
  }
  const screens = [...menu.querySelectorAll("[data-screen]")];
  const showScreen = (id, focus = true) => {
    let activeScreen = null;
    for (const screen of screens) {
      const active = screen.id === id;
      screen.hidden = !active;
      screen.setAttribute("aria-hidden", String(!active));
      if (active) activeScreen = screen;
    }
    syncMenuIsolation();
    menu.setAttribute("aria-busy", String(id === "screen-loading"));
    if (focus && activeScreen !== null) {
      window.requestAnimationFrame(() => {
        const target = activeScreen.querySelector("input:not([hidden]), select:not([hidden]), button:not([hidden])");
        target?.focus({ preventScroll: true });
      });
    }
  };

  let doc = loadProfilesDoc(window.localStorage);
  let selectedProfileId = doc.activeProfileId;
  let selectedWorldId = null;
  let optionsReturn = "screen-title";
  let navigatingToWorld = false;

  const persistProfiles = () => saveProfilesDoc(window.localStorage, doc);

  function updateTitle() {
    const target = continueTarget(doc);
    const button = element("continue-world-button");
    const startButton = element("title-start-button");
    if (target === null) {
      button.hidden = true;
      startButton.textContent = "Create Your First World";
      startButton.classList.add("primary");
      element("title-world-name").textContent = "Start a new world";
      element("title-world-meta").textContent = "Create a player, choose a seed, and begin exploring.";
      return;
    }
    const profile = getProfile(doc, target.profileId);
    const world = getWorld(doc, target.profileId, target.worldId);
    if (profile === null || world === null) return;
    button.hidden = false;
    button.setAttribute("aria-label", `Enter ${world.name} as ${profile.name}`);
    startButton.textContent = "Choose Another World";
    startButton.classList.remove("primary");
    element("title-world-name").textContent = world.name;
    element("title-world-meta").textContent = `${profile.name} · ${worldModeLabel(world.mode)} · seed ${world.seed}`;
  }

  function beginWorldNavigation(profileId, worldId, worldName) {
    if (navigatingToWorld) return;
    navigatingToWorld = true;
    element("menu-loading-world-name").textContent = worldName;
    const progress = element("menu-loading-progress");
    const setProgress = (label) => {
      progress.setAttribute("aria-valuetext", label);
    };
    setProgress("Opening world");
    showScreen("screen-loading", false);
    element("screen-loading").focus({ preventScroll: true });
    window.setTimeout(() => setProgress("Generating terrain"), 90);
    window.setTimeout(() => setProgress("Preparing play space"), 210);
    window.setTimeout(() => {
      window.location.href = playUrl(profileId, worldId);
    }, 320);
  }

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
    updateTitle();
    beginWorldNavigation(selectedProfileId, selectedWorldId, world.name);
  }

  // The tier list is built from the same table the runtime walks, so adding a tier
  // cannot leave the menu offering a name the controller does not have, and a
  // rename cannot leave a stale option behind. Each entry carries what it costs,
  // because "Ultra" on its own tells a player nothing about the trade.
  const TIER_SUMMARY = Object.freeze({
    minimal: "Lowest cost: reduced render resolution, no god rays, small shadow map.",
    low: "Adds water detail and foliage wind at a reduced render resolution.",
    medium: "Adds god rays and a deeper bloom chain.",
    high: "Full detail at native resolution with a large shadow map.",
    ultra: "Highest cost: densest cloud march, widest shadow filter, full resolution.",
  });

  function buildGraphicsQualityOptions(select) {
    if (select === null || select.dataset.built === "true") return;
    const labels = {
      auto: "Auto (match frame rate)",
      minimal: "Minimal",
      low: "Low",
      medium: "Medium",
      high: "High",
      ultra: "Ultra",
    };
    for (const choice of GRAPHICS_QUALITY_CHOICES) {
      // `document`, not `doc`: in this module `doc` is the saved profiles data,
      // and reaching for it here throws inside the click handler, which then
      // never reaches the screen switch at all.
      const option = document.createElement("option");
      option.value = choice;
      option.textContent = labels[choice] ?? choice;
      select.append(option);
    }
    select.dataset.built = "true";
  }

  // A WebGPU option the player can select but cannot run is worse than no option:
  // it looks like the browser is supported and the failure only shows up as a hang
  // at boot. So the menu probes the same way the runtime does and disables the
  // choice when it is not actually there, with the reason visible.
  const backendProbe = { webgpu: { supported: false, adapterName: null, reason: "not probed" } };

  async function probeBackends() {
    backendProbe.webgpu = await probeWebGpu(globalThis.navigator, null);
    applyRendererAvailability();
    return backendProbe.webgpu;
  }

  function applyRendererAvailability() {
    const select = element("input-renderer");
    if (select === null) return;
    const option = select.querySelector('option[value="webgpu"]');
    if (option === null) return;
    const probe = backendProbe.webgpu;
    option.disabled = !probe.supported;
    option.textContent = probe.supported
      ? `WebGPU${probe.adapterName ? ` (${probe.adapterName})` : ""}`
      : `WebGPU (unavailable: ${probe.reason})`;
    const hint = select.parentElement?.querySelector(".field-hint");
    if (hint !== null && hint !== undefined && !probe.supported) {
      hint.textContent = `This browser reports no usable WebGPU adapter (${probe.reason}), so the option is disabled. Auto already selects the verified WebGL path.`;
    }
    releaseUnusablePin();
  }

  /**
   * A stored WebGPU pin that cannot run would bounce the player between the world
   * and this menu on every attempt, because the pin survives the recovery unless
   * something here clears it. Two independent reasons release it, and they are
   * not the same question: the probe answers "is there a usable adapter", while a
   * failure notice answers "did it actually run here", which is the only evidence
   * that matters for this machine.
   */
  function releaseUnusablePin() {
    const current = loadOptions(window.localStorage);
    if (current.renderer !== "webgpu") return;
    const probeUnavailable = backendProbe.webgpu.reason !== "not probed" && !backendProbe.webgpu.supported;
    if (!probeUnavailable && !failedBackendNotice) return;
    saveOptions(window.localStorage, { ...current, renderer: "auto" });
    const select = element("input-renderer");
    if (select !== null && select.value === "webgpu") select.value = "auto";
  }



  function applyStoredVolumes() {
    getAudioMixer().setVolumes(audioVolumesFromOptions(loadOptions(window.localStorage)));
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
    element("input-renderer").value = fresh.renderer;
    const quality = element("input-graphics-quality");
    buildGraphicsQualityOptions(quality);
    quality.value = fresh.graphicsQuality ?? DEFAULT_GRAPHICS_QUALITY;
    // The hint follows the selection, so the panel explains the tier in hand
    // rather than describing the ladder in the abstract.
    const summary = quality.parentElement?.querySelector(".field-hint");
    if (summary !== null && summary !== undefined) {
      const chosen = VISUAL_QUALITY_TIERS.find((tier) => tier.name === quality.value);
      summary.textContent = chosen === undefined
        ? "Auto scales shadows, volumetric clouds, water detail, cascade resolution and internal render resolution to hold the frame rate. Pinning a tier turns that off."
        : TIER_SUMMARY[chosen.name] ?? "";
    }
    for (const [key, option] of [["master", "volumeMaster"], ["music", "volumeMusic"], ["effects", "volumeEffects"]]) {
      const value = fresh[option];
      element(`input-volume-${key}`).value = String(Math.round(value * 100));
      element(`volume-${key}-value`).textContent = String(Math.round(value * 100));
    }
    element("input-show-coords").value = fresh.showCoords ? "on" : "off";
    for (const key of ["sneak", "sprint", "inventory", "drop", "attack"]) {
      const input = document.getElementById(`input-control-${key}`);
      if (input !== null) input.value = fresh.controls[key];
    }
    applyStoredVolumes();
  }

  menu.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (button === null) return;
    const action = button.dataset.action;
    if (action === "continue-world") {
      const target = continueTarget(doc);
      if (target === null) return;
      const world = getWorld(doc, target.profileId, target.worldId);
      if (world === null) return;
      selectedProfileId = target.profileId;
      selectedWorldId = target.worldId;
      doc = touchWorld(doc, selectedProfileId, selectedWorldId);
      doc = touchProfile(doc, selectedProfileId);
      persistProfiles();
      updateTitle();
      beginWorldNavigation(selectedProfileId, selectedWorldId, world.name);
    } else if (action === "goto-profiles") {
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
      updateTitle();
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
      updateTitle();
      beginWorldNavigation(selectedProfileId, selectedWorldId, created.world.name);
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
      updateTitle();
      renderWorlds();
    } else if (action === "options-reset") {
      // Reset writes the whole default document rather than clearing the key, so
      // a stored option this build no longer knows about cannot survive the reset.
      saveOptions(window.localStorage, createDefaultOptions());
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
    } else if (event.target.id === "input-renderer") {
      saveOptions(window.localStorage, { ...loadOptions(window.localStorage), renderer: event.target.value });
    } else if (event.target.id === "input-graphics-quality") {
      saveOptions(window.localStorage, { ...loadOptions(window.localStorage), graphicsQuality: event.target.value });
      renderOptions();
    } else if (event.target.id === "input-show-coords") {
      saveOptions(window.localStorage, { ...loadOptions(window.localStorage), showCoords: event.target.value === "on" });
    } else if (event.target.id.startsWith("input-volume-")) {
      const bus = event.target.id.replace("input-volume-", "");
      const option = bus === "master" ? "volumeMaster" : bus === "music" ? "volumeMusic" : "volumeEffects";
      if (option === "volumeEffects" && bus !== "effects") return;
      const value = Math.max(MIN_VOLUME, Math.min(MAX_VOLUME, Number(event.target.value) / 100));
      element(`volume-${bus}-value`).textContent = String(Math.round(value * 100));
      const fresh = { ...loadOptions(window.localStorage), [option]: value };
      saveOptions(window.localStorage, fresh);
      // Applied immediately and previewed, so the level can be judged from the
      // menu rather than only after entering the world.
      const mixer = getAudioMixer();
      mixer.setVolumes(audioVolumesFromOptions(fresh));
      mixer.play(bus === "music" ? "ambient" : "click");
    } else if (event.target.id?.startsWith("input-control-")) {
      const key = event.target.id.replace("input-control-", "");
      saveOptions(window.localStorage, {
        ...loadOptions(window.localStorage),
        controls: { ...loadOptions(window.localStorage).controls, [key]: event.target.value },
      });
    }
  });

  const active = getActiveProfile(doc);
  if (active !== null) selectedProfileId = active.id;
  element("input-seed").value = "";
  updateTitle();
  showScreen("screen-title");

  // Surface a backend that failed during the last attempt, before anything else
  // draws attention, and start the capability probe. The probe resolves on its
  // own; the menu is usable while it is in flight, because the default is already
  // the verified path.
  showBackendNotice();
  probeBackends();
}

// Whether the last session reported a backend failure. The pin check below needs
// it and the notice reader produces it, so it lives beside the reader rather than
// inside the menu closure - a flag the reader cannot see is a flag that never gets
// set, and the pin is then never released.
let failedBackendNotice = false;

/** A one-shot banner explaining why the previous session ended up back here. */
function showBackendNotice() {
  const banner = document.getElementById("backend-notice");
  const notice = takeBackendNotice();
  failedBackendNotice = notice !== null && notice.renderer === "webgpu";
  if (banner === null) return;
  if (notice === null) {
    banner.hidden = true;
    return;
  }
  banner.textContent = describeBackendNotice(notice);
  banner.hidden = false;
}

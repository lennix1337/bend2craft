#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TESTS=(
  tests/world-bridge.test.mjs
  tests/world-state-bend.test.mjs
  tests/chunk-world.test.mjs
  tests/worker-scheduler.test.mjs
  tests/structures-bend.test.mjs
  tests/village-path-bend.test.mjs
  tests/villagers-bend.test.mjs
  tests/horizon-bend.test.mjs
  tests/horizon-grid.test.mjs
  tests/simulation-bend.test.mjs
  tests/fluids-bend.test.mjs
  tests/fire-bend.test.mjs
  tests/simulation-ticker.test.mjs
  tests/crops-bend.test.mjs
  tests/farmland-bend.test.mjs
  tests/save-state.test.mjs
  tests/persistent-save.test.mjs
  tests/entity-save.test.mjs
  tests/entity-chunks.test.mjs
  tests/drop-ground-cache.test.mjs
  tests/async-mesh-cache.test.mjs
  tests/greedy-mesh.test.mjs
  tests/mesh-merge.test.mjs
  tests/terrain-edit-visibility.test.mjs
  tests/mesh-cache.test.mjs
  tests/mesh-rebuild-scheduler.test.mjs
  tests/villager-terrain.test.mjs
  tests/mesh-worker.test.mjs
  tests/terrain-vertex-builder.test.mjs
  tests/material-textures.test.mjs
  tests/visual-quality.test.mjs
  tests/gl-render-target.test.mjs
  tests/sun-shadow.test.mjs
  tests/sun-shadow-wiring.test.mjs
  tests/vertex-buffer-compose.test.mjs
  tests/chunk-frustum.test.mjs
  tests/webgpu-capabilities.test.mjs
  tests/webgpu-chunk-buffers.test.mjs
  tests/webgpu-chunk-updates.test.mjs
  tests/webgpu-frame-readback.test.mjs
  tests/webgpu-terrain-presentation.test.mjs
  tests/surface-materials.test.mjs
  tests/mob-models.test.mjs
  tests/visual-motion.test.mjs
  tests/frame-metrics.test.mjs
  tests/hud-visibility.test.mjs
  tests/mining-controller.test.mjs
  tests/mining-progress.test.mjs
  tests/entity-shadow.test.mjs
  tests/vfx.test.mjs
  tests/vfx-wiring.test.mjs
  tests/first-person-hand.test.mjs
  tests/material-lighting.test.mjs
  tests/sky-palette.test.mjs
  tests/texture-atlas.test.mjs
  tests/atlas-mipmap-safety.test.mjs
  tests/item-atlas.test.mjs
  tests/character-view.test.mjs
  tests/aim.test.mjs
  tests/daynight.test.mjs
  tests/mob-mesh.test.mjs
  tests/sfx.test.mjs
  tests/sky-mesh.test.mjs
  tests/light-bend.test.mjs
  tests/light-dirty-bend.test.mjs
  tests/light-flood-bend.test.mjs
  tests/inventory-bend.test.mjs
  tests/chest-bend.test.mjs
  tests/chests-bend.test.mjs
  tests/equipment-bend.test.mjs
  tests/experience-bend.test.mjs
  tests/interactions-bend.test.mjs
  tests/furnace-bend.test.mjs
  tests/furnaces-bend.test.mjs
  tests/player-bend.test.mjs
  tests/entities-bend.test.mjs
  tests/inventory.test.mjs
  tests/inventory-ux.test.mjs
  tests/game-state.test.mjs
  tests/camera.test.mjs
  tests/audio.test.mjs
  tests/pointer-lock.test.mjs
  tests/seed-input.test.mjs
  tests/seed-world.test.mjs
  tests/profiles.test.mjs
  tests/menu-navigation.test.mjs
  tests/modal-focus.test.mjs
  tests/settings.test.mjs
  tests/options-panel.test.mjs
  tests/backend-fallback.test.mjs
  tests/ui-shell.test.mjs
  tests/startup-contract.test.mjs
  tests/boot-resilience.test.mjs
)

# A newline-delimited set keeps this membership check working on the bash 3.2
# that ships with macOS, which has no associative arrays.
LISTED_TESTS=$'\n'
for test_file in "${TESTS[@]}"; do
  LISTED_TESTS+="$test_file"$'\n'
  if [[ ! -f "$ROOT/$test_file" ]]; then
    printf 'Listed test does not exist: %s\n' "$test_file" >&2
    exit 1
  fi
done

while IFS= read -r discovered; do
  [[ -z "$discovered" ]] && continue
  case "$LISTED_TESTS" in
    *$'\n'"$discovered"$'\n'*) ;;
    *)
      printf 'Test file is not registered in scripts/test-suite.sh: %s\n' "$discovered" >&2
      exit 1
      ;;
  esac
done < <(cd "$ROOT" && printf '%s\n' tests/*.test.mjs | sort)

printf 'Running %d tests\n' "${#TESTS[@]}"
for index in "${!TESTS[@]}"; do
  test_file="${TESTS[$index]}"
  printf '[%02d/%02d] %s\n' "$((index + 1))" "${#TESTS[@]}" "$test_file"
  bash "$ROOT/scripts/run-bun.sh" "$ROOT/$test_file"
done
printf 'All %d tests passed.\n' "${#TESTS[@]}"

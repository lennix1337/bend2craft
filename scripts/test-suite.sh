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
  tests/mesh-cache.test.mjs
  tests/mesh-rebuild-scheduler.test.mjs
  tests/mesh-worker.test.mjs
  tests/terrain-vertex-builder.test.mjs
  tests/vertex-buffer-compose.test.mjs
  tests/surface-materials.test.mjs
  tests/mob-models.test.mjs
  tests/visual-motion.test.mjs
  tests/frame-metrics.test.mjs
  tests/hud-visibility.test.mjs
  tests/mining-controller.test.mjs
  tests/mining-progress.test.mjs
  tests/entity-shadow.test.mjs
  tests/first-person-hand.test.mjs
  tests/material-lighting.test.mjs
  tests/sky-palette.test.mjs
  tests/texture-atlas.test.mjs
  tests/item-atlas.test.mjs
  tests/character-view.test.mjs
  tests/light-bend.test.mjs
  tests/light-dirty-bend.test.mjs
  tests/light-flood-bend.test.mjs
  tests/inventory-bend.test.mjs
  tests/interactions-bend.test.mjs
  tests/furnace-bend.test.mjs
  tests/furnaces-bend.test.mjs
  tests/player-bend.test.mjs
  tests/entities-bend.test.mjs
  tests/inventory.test.mjs
  tests/game-state.test.mjs
  tests/pointer-lock.test.mjs
  tests/seed-input.test.mjs
  tests/seed-world.test.mjs
  tests/profiles.test.mjs
  tests/settings.test.mjs
)

declare -A LISTED_TESTS=()
for test_file in "${TESTS[@]}"; do
  LISTED_TESTS["$test_file"]=1
  if [[ ! -f "$ROOT/$test_file" ]]; then
    printf 'Listed test does not exist: %s\n' "$test_file" >&2
    exit 1
  fi
done

while IFS= read -r discovered; do
  [[ -z "$discovered" ]] && continue
  if [[ -z "${LISTED_TESTS[$discovered]+x}" ]]; then
    printf 'Test file is not registered in scripts/test-suite.sh: %s\n' "$discovered" >&2
    exit 1
  fi
done < <(cd "$ROOT" && printf '%s\n' tests/*.test.mjs | sort)

printf 'Running %d tests\n' "${#TESTS[@]}"
for index in "${!TESTS[@]}"; do
  test_file="${TESTS[$index]}"
  printf '[%02d/%02d] %s\n' "$((index + 1))" "${#TESTS[@]}" "$test_file"
  bash "$ROOT/scripts/run-bun.sh" "$ROOT/$test_file"
done
printf 'All %d tests passed.\n' "${#TESTS[@]}"

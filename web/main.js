import World from "../world/world.bend";
import {
  BLOCK_INFO,
  collect,
  consume,
  createInventory,
  selectedItem,
} from "./inventory.js";
import {
  EYE_HEIGHT,
  JUMP_SPEED,
  cameraDirection,
  createPlayer,
  createWorldState,
  movePlayer,
  overlapsPlayer,
  raycast,
} from "./game-state.js";
import { seedFromSearch, seedLabel } from "./seed.js";
import { createPointerLockController } from "./pointer-lock.js";

const canvas = document.getElementById("game");
const coordsEl = document.getElementById("coords");
const seedEl = document.getElementById("seed");
const selectedEl = document.getElementById("selected");
const statsEl = document.getElementById("stats");
const hotbarEl = document.getElementById("hotbar-slots");
const lockHintEl = document.getElementById("lock-hint");
const errorEl = document.getElementById("error");
const SEED = seedFromSearch(window.location.search, World.default_seed());
const pointerLock = createPointerLockController(
  () => document.pointerLockElement === canvas,
  () => canvas.requestPointerLock(),
);

const BLOCK_NAMES = Object.fromEntries(
  Object.entries(BLOCK_INFO).map(([id, info]) => [id, info.name]),
);
const BLOCK_COLORS = {
  1: [0.34, 0.38, 0.42],
  2: [0.53, 0.34, 0.2],
  3: [0.35, 0.72, 0.28],
  4: [0.18, 0.55, 0.26],
  5: [0.55, 0.34, 0.18],
};
const FACE_SHADES = [1.0, 0.52, 0.82, 0.7, 0.92, 0.62];

const FACES = [
  { dir: [0, 1, 0], corners: [[0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1]] },
  { dir: [0, -1, 0], corners: [[0, 0, 1], [1, 0, 1], [1, 0, 0], [0, 0, 0]] },
  { dir: [1, 0, 0], corners: [[1, 0, 0], [1, 0, 1], [1, 1, 1], [1, 1, 0]] },
  { dir: [-1, 0, 0], corners: [[0, 0, 1], [0, 0, 0], [0, 1, 0], [0, 1, 1]] },
  { dir: [0, 0, 1], corners: [[1, 0, 1], [0, 0, 1], [0, 1, 1], [1, 1, 1]] },
  { dir: [0, 0, -1], corners: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]] },
];

function asNumber(value) {
  return Number(value);
}

function showError(error) {
  const message = error instanceof Error ? error.message : String(error);
  errorEl.textContent = `Could not start the world.\n${message}`;
  errorEl.hidden = false;
  throw error;
}

let gl;
let program;
let positionBuffer;
let colorBuffer;
let positionLocation;
let colorLocation;
let viewProjectionLocation;
let meshVertexCount = 0;
let visibleFaceCount = 0;

try {
  gl = canvas.getContext("webgl", { antialias: false, alpha: false });
  if (!gl) throw new Error("WebGL is not available in this browser.");

  const WIDTH = asNumber(World.width());
  const DEPTH = asNumber(World.depth());
  const MAX_Y = asNumber(World.max_y());
  const world = createWorldState(WIDTH, DEPTH, MAX_Y);
  const { inside, blockAt, setBlock } = world;

  let blockCount = 0;
  for (let y = 0; y < MAX_Y; y += 1) {
    for (let z = 0; z < DEPTH; z += 1) {
      for (let x = 0; x < WIDTH; x += 1) {
        const value = asNumber(World.block(SEED, BigInt(x), BigInt(y), BigInt(z)));
        setBlock(x, y, z, value);
        if (value !== 0) blockCount += 1;
      }
    }
  }

  const vertexSource = `
    attribute vec3 aPosition;
    attribute vec3 aColor;
    uniform mat4 uViewProjection;
    varying vec3 vColor;
    void main() {
      vColor = aColor;
      gl_Position = uViewProjection * vec4(aPosition, 1.0);
    }
  `;
  const fragmentSource = `
    precision mediump float;
    varying vec3 vColor;
    void main() {
      gl_FragColor = vec4(vColor, 1.0);
    }
  `;

  function compileShader(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`WebGL shader compilation failed: ${info}`);
    }
    return shader;
  }

  const vertexShader = compileShader(gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = compileShader(gl.FRAGMENT_SHADER, fragmentSource);
  program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`Failed to link the WebGL program: ${gl.getProgramInfoLog(program)}`);
  }
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  positionBuffer = gl.createBuffer();
  colorBuffer = gl.createBuffer();
  positionLocation = gl.getAttribLocation(program, "aPosition");
  colorLocation = gl.getAttribLocation(program, "aColor");
  viewProjectionLocation = gl.getUniformLocation(program, "uViewProjection");

  function blockColor(block, faceIndex, x, z) {
    const base = BLOCK_COLORS[block] ?? [1, 0, 1];
    const variation = ((x * 17 + z * 31) % 5) * 0.012;
    const top = block === 3 && faceIndex === 0;
    const shade = FACE_SHADES[faceIndex] + (top ? variation : variation * 0.5);
    return base.map((channel) => Math.min(1, channel * shade));
  }

  function rebuildMesh() {
    const positions = [];
    const colors = [];
    visibleFaceCount = 0;

    for (let y = 0; y < MAX_Y; y += 1) {
      for (let z = 0; z < DEPTH; z += 1) {
        for (let x = 0; x < WIDTH; x += 1) {
          const block = blockAt(x, y, z);
          if (block === 0) continue;

          for (let faceIndex = 0; faceIndex < FACES.length; faceIndex += 1) {
            const face = FACES[faceIndex];
            const [dx, dy, dz] = face.dir;
            if (blockAt(x + dx, y + dy, z + dz) !== 0) continue;
            visibleFaceCount += 1;
            const color = blockColor(block, faceIndex, x, z);
            const corners = face.corners;
            const triangles = [0, 1, 2, 0, 2, 3];
            for (const cornerIndex of triangles) {
              const corner = corners[cornerIndex];
              positions.push(x + corner[0], y + corner[1], z + corner[2]);
              colors.push(color[0], color[1], color[2]);
            }
          }
        }
      }
    }

    meshVertexCount = positions.length / 3;
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colors), gl.DYNAMIC_DRAW);
    statsEl.textContent = `${blockCount} blocks · ${visibleFaceCount} faces`;
  }

  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) {
    return [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0],
    ];
  }
  function normalize(v) {
    const length = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / length, v[1] / length, v[2] / length];
  }
  function multiply4(a, b) {
    const out = new Float32Array(16);
    for (let column = 0; column < 4; column += 1) {
      for (let row = 0; row < 4; row += 1) {
        out[column * 4 + row] =
          a[row] * b[column * 4] +
          a[4 + row] * b[column * 4 + 1] +
          a[8 + row] * b[column * 4 + 2] +
          a[12 + row] * b[column * 4 + 3];
      }
    }
    return out;
  }
  function perspective(fov, aspect, near, far) {
    const f = 1 / Math.tan(fov / 2);
    const range = 1 / (near - far);
    return new Float32Array([
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (far + near) * range, -1,
      0, 0, 2 * far * near * range, 0,
    ]);
  }
  function lookAt(eye, center, up) {
    const z = normalize([eye[0] - center[0], eye[1] - center[1], eye[2] - center[2]]);
    const x = normalize(cross(up, z));
    const y = cross(z, x);
    return new Float32Array([
      x[0], y[0], z[0], 0,
      x[1], y[1], z[1], 0,
      x[2], y[2], z[2], 0,
      -dot(x, eye), -dot(y, eye), -dot(z, eye), 1,
    ]);
  }
  function resizeCanvas() {
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.floor(canvas.clientWidth * scale);
    const height = Math.floor(canvas.clientHeight * scale);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  const spawnCell = [Math.floor(WIDTH / 2) + 1, Math.floor(DEPTH / 2)];
  const spawnHeight = asNumber(World.column_height(SEED, BigInt(spawnCell[0]), BigInt(spawnCell[1])));
  const player = createPlayer(spawnCell, spawnHeight);
  const inventory = createInventory();
  let selectedSlot = 0;
  const held = new Set();

  function renderHotbar() {
    hotbarEl.innerHTML = inventory.map((item, slot) => {
      const info = BLOCK_INFO[item.block] ?? BLOCK_INFO[0];
      const empty = item.block === 0 || item.count === 0;
      const selected = slot === selectedSlot;
      return `<button class="hotbar-slot${selected ? " selected" : ""}${empty ? " empty" : ""}"
        type="button" data-slot="${slot}" aria-label="Slot ${slot + 1}: ${info.name}, ${item.count}"
        title="${slot + 1}: ${info.name}">
        <span class="slot-key">${slot + 1}</span>
        <span class="slot-swatch" style="--slot-color: ${info.color}"></span>
        <span class="slot-name">${info.name}</span>
        <span class="slot-count">${item.count || ""}</span>
      </button>`;
    }).join("");
  }

  function selectSlot(slot) {
    if (slot < 0 || slot >= inventory.length) return;
    selectedSlot = slot;
    renderHotbar();
    updateHud();
  }

  function interact(button) {
    const target = raycast(world, player);
    if (!target) return;
    const [x, y, z] = target.hit;
    if (button === 0) {
      const removedBlock = blockAt(x, y, z);
      if (y === 0 || !collect(inventory, removedBlock)) return;
      setBlock(x, y, z, 0);
      blockCount -= 1;
    } else if (button === 2 && target.place) {
      const [px, py, pz] = target.place;
      const item = selectedItem(inventory, selectedSlot);
      if (!inside(px, py, pz) || blockAt(px, py, pz) !== 0 || overlapsPlayer(player, px, py, pz)) return;
      if (item === null || item.block === 0 || !consume(inventory, selectedSlot)) return;
      setBlock(px, py, pz, item.block);
      blockCount += 1;
    } else {
      return;
    }
    renderHotbar();
    updateHud();
    rebuildMesh();
  }

  function updateHud() {
    const item = selectedItem(inventory, selectedSlot);
    const name = item === null || item.block === 0 ? "empty" : BLOCK_NAMES[item.block];
    const count = item === null ? 0 : item.count;
    coordsEl.textContent = `x ${player.x.toFixed(1)} · y ${player.y.toFixed(1)} · z ${player.z.toFixed(1)}`;
    seedEl.textContent = `seed: ${seedLabel(SEED)}`;
    selectedEl.textContent = `selected: ${name} · ${count}`;
  }

  function render() {
    resizeCanvas();
    gl.clearColor(0.44, 0.68, 0.82, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.useProgram(program);

    const eye = [player.x, player.y + EYE_HEIGHT, player.z];
    const direction = cameraDirection(player);
    const center = [eye[0] + direction[0], eye[1] + direction[1], eye[2] + direction[2]];
    const view = lookAt(eye, center, [0, 1, 0]);
    const projection = perspective(Math.PI / 2.6, canvas.width / canvas.height, 0.05, 120);
    gl.uniformMatrix4fv(viewProjectionLocation, false, multiply4(projection, view));

    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
    gl.enableVertexAttribArray(colorLocation);
    gl.vertexAttribPointer(colorLocation, 3, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, meshVertexCount);
  }

  function updateLockHint() {
    lockHintEl.textContent = document.pointerLockElement === canvas
      ? "Press Esc to release the mouse"
      : "Click to capture the mouse";
  }

  hotbarEl.addEventListener("click", (event) => {
    const button = event.target.closest("[data-slot]");
    if (button !== null) selectSlot(Number(button.dataset.slot));
  });
  canvas.addEventListener("click", () => {
    pointerLock.request();
  });
  canvas.addEventListener("mousedown", (event) => {
    event.preventDefault();
    if (document.pointerLockElement !== canvas) {
      pointerLock.request();
      return;
    }
    interact(event.button);
  });
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  document.addEventListener("pointerlockchange", () => {
    pointerLock.handleChange();
    updateLockHint();
  });
  document.addEventListener("mousemove", (event) => {
    if (document.pointerLockElement !== canvas) return;
    player.yaw += event.movementX * 0.0022;
    player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch - event.movementY * 0.0022));
  });
  window.addEventListener("keydown", (event) => {
    if (["KeyW", "KeyA", "KeyS", "KeyD", "Space"].includes(event.code)) {
      event.preventDefault();
      held.add(event.code);
    }
    if (event.code === "Space" && player.grounded) {
      player.velocityY = JUMP_SPEED;
      player.grounded = false;
    }
    const slot = ["Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6", "Digit7", "Digit8", "Digit9"].indexOf(event.code);
    if (slot !== -1) selectSlot(slot);
  });
  window.addEventListener("keyup", (event) => held.delete(event.code));
  window.addEventListener("resize", resizeCanvas);

  rebuildMesh();
  renderHotbar();
  updateLockHint();
  updateHud();
  window.__bend2craft = {
    world: {
      seed: seedLabel(SEED),
      width: WIDTH,
      depth: DEPTH,
      maxY: MAX_Y,
      get blockCount() { return blockCount; },
    },
    getBlock: (x, y, z) => blockAt(x, y, z),
    getInventory: () => inventory.map((item) => ({ ...item })),
    getPlayer: () => ({ ...player }),
  };

  let previousTime = performance.now();
  function frame(now) {
    const dt = Math.min((now - previousTime) / 1000, 0.05);
    previousTime = now;
    movePlayer(world, player, held, dt, spawnCell, spawnHeight);
    updateHud();
    render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
} catch (error) {
  showError(error);
}

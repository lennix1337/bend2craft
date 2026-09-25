import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  AERIAL_FOG_HEIGHT_FALLOFF,
  AERIAL_FOG_MIN_DENSITY,
  MATERIAL_DETAIL_NEUTRAL,
  MATERIAL_DETAIL_STAGE,
  MATERIAL_DETAIL_STRENGTH,
  MATERIAL_LIGHTING_STAGE,
  MATERIAL_ALBEDO_STAGE,
  MATERIAL_ROUGHNESS_MAX,
  MATERIAL_ROUGHNESS_MIN,
  MATERIAL_SPECULAR_POWER,
  MATERIAL_SPECULAR_STRENGTH,
  MATERIAL_STAGE_ORDER,
  WATER_DEPTH_FLOOR_R,
  WATER_DEPTH_MAX,
  WATER_DEPTH_TINT_STRENGTH,
  detailShade,
  materialRoughness,
  materialSpecular,
  waterDepthColor,
  waterDepthTint,
  FIRE_ALPHA,
  FIRE_PULSE_AMPLITUDE,
  FIRE_PULSE_SPEED,
  LAVA_ALPHA,
  LAVA_PULSE_AMPLITUDE,
  LAVA_PULSE_SPEED,
  MINING_FRACTURE_PROGRESS,
  MOON_FILL_STRENGTH,
  NIGHT_AMBIENT_G,
  NIGHT_AMBIENT_R,
  NIGHT_AMBIENT_STRENGTH,
  TERRAIN_FOG_START,
  TERRAIN_MATERIAL_VARIATION_MAX,
  TERRAIN_MATERIAL_VARIATION_MIN,
  WATER_CAUSTIC_STRENGTH,
  WATER_CAUSTIC_THRESHOLD_END,
  WATER_CAUSTIC_THRESHOLD_START,
  WATER_DARK_R,
  WATER_DARK_G,
  WATER_DARK_B,
  WATER_LIGHT_R,
  WATER_LIGHT_G,
  WATER_LIGHT_B,
  WATER_FRESNEL_POWER,
  WATER_SPECULAR_POWER,
  WATER_FOAM_THRESHOLD,
  WATER_NORMAL_STRENGTH,
  WATER_FOAM_STRENGTH,
  aerialPerspective,
  fireAlpha,
  firePulse,
  fractureVisibility,
  lavaAlpha,
  lavaPulse,
  materialVariationMultiplier,
  terrainFog,
  waterCaustic,
} from "../web/terrain-presentation.js";
import {
  CLOUD_TEXTURE_SIZE,
  createCloudTextureData,
} from "../web/cloud-texture.js";
import {
  WEBGL_SKY_FALLBACK_FRAGMENT_SHADER,
  WEBGL_SKY_FRAGMENT_SHADER,
  WEBGL_SKY_VERTEX_SHADER,
  createWebglTerrainShaderSources,
  isSoftwareRenderer,
} from "../web/webgl-shaders.js";
import {
  WEBGPU_SKY_SHADER,
  WEBGPU_TERRAIN_SHADER,
} from "../web/webgpu-terrain-renderer.js";
const rendererSource = await readFile(new URL("../web/webgpu-terrain-renderer.js", import.meta.url), "utf8");
const gameSource = await readFile(new URL("../web/game.js", import.meta.url), "utf8");

assert.equal(TERRAIN_FOG_START, 24);
assert.equal(TERRAIN_MATERIAL_VARIATION_MIN, 0.985);
assert.equal(TERRAIN_MATERIAL_VARIATION_MAX, 1.015);
assert.equal(MINING_FRACTURE_PROGRESS, 0.02);
assert.equal(MOON_FILL_STRENGTH, 0.72);
assert.equal(NIGHT_AMBIENT_R, 0.035);
assert.equal(NIGHT_AMBIENT_G, 0.055);
assert.equal(NIGHT_AMBIENT_STRENGTH, 0.7);
assert.equal(LAVA_PULSE_AMPLITUDE, 0.16);
assert.equal(LAVA_PULSE_SPEED, 2.4);
assert.equal(LAVA_ALPHA, 0.86);
assert.equal(FIRE_PULSE_AMPLITUDE, 0.25);
assert.equal(FIRE_PULSE_SPEED, 8);
assert.equal(FIRE_ALPHA, 0.9);
assert.equal(WATER_DARK_R, 0.025);
assert.equal(WATER_DARK_G, 0.22);
assert.equal(WATER_DARK_B, 0.34);
assert.equal(WATER_LIGHT_R, 0.12);
assert.equal(WATER_LIGHT_G, 0.62);
assert.equal(WATER_LIGHT_B, 0.72);
assert.equal(WATER_FRESNEL_POWER, 3);
assert.equal(WATER_SPECULAR_POWER, 48);
assert.equal(WATER_FOAM_THRESHOLD, 0.94);
assert.equal(WATER_NORMAL_STRENGTH, 6);
assert.equal(WATER_FOAM_STRENGTH, 0.035);
assert.equal(WATER_CAUSTIC_STRENGTH, 0.18);
assert.equal(WATER_CAUSTIC_THRESHOLD_START, 0.54);
assert.equal(WATER_CAUSTIC_THRESHOLD_END, 0.72);
assert.equal(AERIAL_FOG_MIN_DENSITY, 0.42);
assert.equal(AERIAL_FOG_HEIGHT_FALLOFF, 0.028);

// The material contract is split into albedo, lighting and material response so
// the two backends can be held to one contract instead of two implementations.
assert.equal(MATERIAL_ALBEDO_STAGE, 1);
assert.equal(MATERIAL_LIGHTING_STAGE, 2);
assert.equal(MATERIAL_DETAIL_STAGE, 3);
assert.deepEqual(MATERIAL_STAGE_ORDER, [1, 2, 3]);
assert.ok(Object.isFrozen(MATERIAL_STAGE_ORDER));
assert.ok(MATERIAL_DETAIL_STRENGTH > 0 && MATERIAL_DETAIL_STRENGTH < 0.2);
assert.ok(MATERIAL_ROUGHNESS_MIN > 0 && MATERIAL_ROUGHNESS_MIN < 1);
assert.ok(MATERIAL_ROUGHNESS_MAX > MATERIAL_ROUGHNESS_MIN);
assert.ok(MATERIAL_ROUGHNESS_MAX <= 1);
assert.equal(MATERIAL_SPECULAR_POWER, 24);
assert.equal(MATERIAL_SPECULAR_STRENGTH, 0.18);
assert.equal(WATER_DEPTH_MAX, 5);
assert.ok(WATER_DEPTH_TINT_STRENGTH > 0 && WATER_DEPTH_TINT_STRENGTH < 0.5);
assert.ok(WATER_DEPTH_FLOOR_R < 1);

// A rougher surface must respond less to the specular lobe, and detail must be
// a bounded multiplier on the albedo rather than a replacement for it.
assert.equal(detailShade(0.5, 0.0), MATERIAL_DETAIL_NEUTRAL, "a mid sample is the neutral detail");
assert.equal(detailShade(0.5, MATERIAL_ROUGHNESS_MAX), MATERIAL_DETAIL_NEUTRAL);
const smoothDetail = detailShade(1.0, MATERIAL_ROUGHNESS_MIN);
const roughDetail = detailShade(1.0, MATERIAL_ROUGHNESS_MAX);
assert.ok(roughDetail > smoothDetail, "a rougher surface must show more relief contrast");
assert.ok(detailShade(1.0, 0.5) - MATERIAL_DETAIL_NEUTRAL <= MATERIAL_DETAIL_STRENGTH);
assert.ok(detailShade(0.0, 0.5) - MATERIAL_DETAIL_NEUTRAL >= -MATERIAL_DETAIL_STRENGTH);
// The facing bias is a 0..1 term, so it clamps instead of going negative.
assert.equal(detailShade(0.75, 0.5, -1), detailShade(0.75, 0.5, 0), "a negative bias must clamp to zero");
assert.equal(detailShade(0.75, 0.5, 2), detailShade(0.75, 0.5, 1), "a bias past one must clamp");
assert.ok(detailShade(0.75, 0.5, 1) > detailShade(0.75, 0.5, 0), "a lit bias must lift the detail");

assert.equal(materialRoughness(0), MATERIAL_ROUGHNESS_MIN);
assert.ok(materialRoughness(1) > materialRoughness(0.5));
assert.ok(materialRoughness(1) <= MATERIAL_ROUGHNESS_MAX);
assert.equal(materialSpecular(0, MATERIAL_ROUGHNESS_MIN), 0, "a matte surface has no lobe");
assert.ok(materialSpecular(1, MATERIAL_ROUGHNESS_MIN) > 0);
assert.ok(materialSpecular(1, MATERIAL_ROUGHNESS_MAX) < materialSpecular(1, MATERIAL_ROUGHNESS_MIN));

// Water depth must darken and cool the surface without ever reaching the floor
// tint before the documented maximum depth.
assert.equal(waterDepthTint(0), 0);
assert.ok(waterDepthTint(0.5) > 0);
assert.equal(waterDepthTint(WATER_DEPTH_MAX), 1);
assert.ok(waterDepthTint(WATER_DEPTH_MAX * 2) === 1, "depth tint must saturate at the documented maximum");
assert.ok(waterDepthTint(1) < waterDepthTint(3), "deeper water must tint more");
const shallow = waterDepthColor(0.5);
const deep = waterDepthColor(4.0);
for (let channel = 0; channel < 3; channel += 1) {
  assert.ok(deep[channel] < shallow[channel], "deeper water must be darker");
  assert.ok(deep[channel] >= 0, "the depth floor must keep every channel non-negative");
}
assert.equal(waterDepthColor(0)[0], WATER_LIGHT_R, "no depth must leave the water albedo untouched");
assert.ok(waterDepthColor(0)[0] > WATER_DARK_R, "shallow water must stay lighter than deep water");
const deepestRed = waterDepthColor(WATER_DEPTH_MAX)[0];
assert.ok(
  Math.abs(
    deepestRed - (WATER_LIGHT_R + (WATER_DEPTH_FLOOR_R - WATER_LIGHT_R) * WATER_DEPTH_TINT_STRENGTH),
  ) < 1e-9,
  "the deepest water must be the strength-weighted blend toward the floor",
);
assert.ok(deepestRed > WATER_DEPTH_FLOOR_R, "the tint strength must keep deep water above its floor");
assert.ok(
  WATER_DEPTH_TINT_STRENGTH < 1,
  "a bounded tint is what stops a deep ocean from losing its silhouette",
);

const cellScale = materialVariationMultiplier(1.25, 2.75);
assert.equal(cellScale, materialVariationMultiplier(1.9, 2.1));
assert.ok(cellScale >= TERRAIN_MATERIAL_VARIATION_MIN);
assert.ok(cellScale <= TERRAIN_MATERIAL_VARIATION_MAX);
assert.notEqual(cellScale, materialVariationMultiplier(1.25, 3.75));

assert.equal(terrainFog(23, 120), 0);
assert.equal(terrainFog(24, 120), 0);
assert.equal(terrainFog(84, 120), 0.5);
assert.equal(terrainFog(145, 120), 1);
assert.equal(terrainFog(200, 120), 1);

assert.equal(aerialPerspective(20, 120, 12, 12), 0);
const valleyFog = aerialPerspective(80, 120, 12, 12);
const ridgeFog = aerialPerspective(80, 120, 12, 36);
assert.ok(valleyFog > 0.4);
assert.ok(ridgeFog < valleyFog);
assert.ok(ridgeFog >= 0);
assert.ok(valleyFog <= 1);

assert.equal(fractureVisibility(0, 1), 0);
assert.equal(fractureVisibility(0.019, 1), 0);
assert.equal(fractureVisibility(0.02, 1), 1);
assert.equal(fractureVisibility(0.5, 0.4), 0.4);
assert.equal(lavaAlpha(0.2), LAVA_ALPHA);
assert.equal(lavaAlpha(0.95), 0.95);
assert.equal(fireAlpha(0.2), FIRE_ALPHA);
assert.equal(fireAlpha(0.95), 0.95);

assert.ok(Math.abs(lavaPulse(Math.PI / (2 * LAVA_PULSE_SPEED), 0) - (1 + LAVA_PULSE_AMPLITUDE)) < 1e-12);
assert.ok(Math.abs(firePulse(Math.PI / (2 * FIRE_PULSE_SPEED), 0) - (1 + FIRE_PULSE_AMPLITUDE)) < 1e-12);
assert.ok(lavaPulse(1.25, 2.5) >= 1 - LAVA_PULSE_AMPLITUDE);
assert.ok(lavaPulse(1.25, 2.5) <= 1 + LAVA_PULSE_AMPLITUDE);
assert.ok(firePulse(1.25, 2.5) >= 1 - FIRE_PULSE_AMPLITUDE);
assert.ok(firePulse(1.25, 2.5) <= 1 + FIRE_PULSE_AMPLITUDE);

assert.equal(CLOUD_TEXTURE_SIZE, 64);
const cloudTexture = createCloudTextureData();
assert.equal(cloudTexture.length, CLOUD_TEXTURE_SIZE * CLOUD_TEXTURE_SIZE * 4);
assert.deepEqual(createCloudTextureData(), cloudTexture);
let cloudMinimum = 255;
let cloudMaximum = 0;
for (let index = 0; index < cloudTexture.length; index += 4) {
  assert.equal(cloudTexture[index], cloudTexture[index + 1]);
  assert.equal(cloudTexture[index], cloudTexture[index + 2]);
  assert.equal(cloudTexture[index + 3], 255);
  cloudMinimum = Math.min(cloudMinimum, cloudTexture[index]);
  cloudMaximum = Math.max(cloudMaximum, cloudTexture[index]);
}
assert.ok(cloudMinimum < 96);
assert.ok(cloudMaximum > 160);
const strongestCaustic = waterCaustic(cloudMaximum / 255, 1);
assert.ok(strongestCaustic >= WATER_CAUSTIC_STRENGTH * 0.95);
assert.equal(waterCaustic(0, 1), 0);
assert.equal(isSoftwareRenderer("ANGLE (Google, Vulkan SwiftShader Device)"), true);
assert.equal(isSoftwareRenderer("llvmpipe (LLVM 20.1.0, 256 bits)"), true);
assert.equal(isSoftwareRenderer("Microsoft Basic Render Driver"), true);
assert.equal(isSoftwareRenderer("NVIDIA GeForce RTX 4070"), false);

assert.equal(typeof WEBGPU_TERRAIN_SHADER, "string");
assert.match(gameSource, /createPermutedProgram/);
assert.match(gameSource, /fallbackTerrainSources/);
assert.match(gameSource, /configureWebglQuality\(\)/);
assert.match(rendererSource, /createRenderPipelineAsync/);
assert.match(rendererSource, /validateDevicePresentation/);
assert.match(rendererSource, /RENDER_ATTACHMENT/);
// Culling must happen while the pass is being encoded, and the metrics must be
// the ones the frame readback and the smoke report.
assert.match(rendererSource, /selectVisibleChunks\(terrain\.values\(\), planes\)/);
const renderBody = rendererSource.slice(rendererSource.indexOf("function render(frame)"));
assert.ok(
  renderBody.indexOf("const planes = extractClipPlanes(frame.viewProjection);")
    < renderBody.indexOf("device.createCommandEncoder()"),
  "clip planes must be extracted before the command encoder is created",
);
for (const field of ["visibleChunks", "culledChunks", "drawCalls", "submittedVertexBytes"]) {
  assert.ok(rendererSource.includes(field), `renderer stats must expose ${field}`);
}
assert.ok(
  renderBody.indexOf("for (const chunk of visible) drawLayer(pass, opaquePipeline")
    < renderBody.indexOf("pass.setPipeline(skyPipeline)"),
  "culled chunks must not reach the opaque pass",
);
// A block edit must reach the per-chunk edit path, and the WebGPU mesh cache
// must not compose a whole-world vertex array for it.
assert.match(rendererSource, /function updateChunks\(chunks\)/);
assert.match(rendererSource, /classifyChunkUpdate/);
assert.match(gameSource, /perChunkOnly: rendererKind === "webgpu"/);
assert.match(gameSource, /gpuRenderer\.updateChunks\(chunks\)/);
assert.doesNotMatch(gameSource, /gpuRenderer\.uploadTerrain\(chunks\)/);
assert.ok(
  rendererSource.indexOf("const shadowPipeline = await createPipeline")
    < rendererSource.indexOf("const canvasContext = context ?? canvas.getContext"),
  "WebGPU pipelines must validate before the game canvas context is claimed",
);
const vertexStart = WEBGPU_TERRAIN_SHADER.indexOf("fn vs_main");
const fragmentStart = WEBGPU_TERRAIN_SHADER.indexOf("@fragment");
assert.ok(vertexStart >= 0);
assert.ok(fragmentStart > vertexStart);
const vertexSource = WEBGPU_TERRAIN_SHADER.slice(vertexStart, fragmentStart);
const fragmentSource = WEBGPU_TERRAIN_SHADER.slice(fragmentStart);

assert.match(WEBGPU_TERRAIN_SHADER, /@location\(4\) fog: f32/);
assert.match(WEBGPU_TERRAIN_SHADER, /@location\(5\) material: f32/);
assert.doesNotMatch(WEBGPU_TERRAIN_SHADER, /\bpass\b/);
assert.match(WEBGPU_TERRAIN_SHADER, /output\.material = input\.material/);
assert.match(vertexSource, /output\.fog\s*=\s*clamp\(\(distance\(position, frame\.camera\.xyz\) - 24/);
assert.doesNotMatch(fragmentSource, /distance\(input\.worldPosition/);
assert.match(fragmentSource, /input\.aerialFog/);
assert.match(fragmentSource, /mix\(clamp\(color, vec3<f32>\(0\.0\), vec3<f32>\(1\.0\)\), fogColor, input\.aerialFog\)/);
assert.match(vertexSource, /output\.aerialFog/);
assert.match(fragmentSource, /floor\(input\.worldPosition\.xz\)/);
assert.match(fragmentSource, /0\.985, 1\.015/);
assert.match(fragmentSource, /step\(0\.02, frame\.params\.w\)/);
assert.match(fragmentSource, /1\.0 \+ 0\.16 \* sin\(frame\.params\.y \* 2\.4 \+ input\.worldPosition\.x \* 0\.5\)/);
assert.match(fragmentSource, /max\(alpha, 0\.86\)/);
assert.match(fragmentSource, /1\.0 \+ 0\.25 \* sin\(frame\.params\.y \* 8 \+ input\.worldPosition\.y \* 4\)/);
assert.match(fragmentSource, /max\(alpha, 0\.9\)/);
assert.match(fragmentSource, /0\.28 \* \(1\.0 - smoothstep\(0\.38, 1\.0, length\(shadowUv\)\)\) \* \(1\.0 - input\.fog \* 0\.65\)/);
const sampleIndex = fragmentSource.indexOf("textureSample");
const firstBranchIndex = fragmentSource.indexOf("if (");
assert.ok(sampleIndex >= 0 && sampleIndex < firstBranchIndex, "texture sampling must be in uniform control flow");
assert.match(fragmentSource, /rippleC/);
assert.match(fragmentSource, /waterNormal/);
assert.match(fragmentSource, /fresnel/);
assert.match(fragmentSource, /specular/);
assert.match(fragmentSource, /foam/);
assert.doesNotMatch(fragmentSource, /depthTint/);
assert.match(fragmentSource, /waterTone/);
assert.equal((WEBGPU_TERRAIN_SHADER.match(/@group\(0\)/g) ?? []).length, 5);
assert.doesNotMatch(WEBGPU_TERRAIN_SHADER, /@group\([1-9]/);
assert.match(fragmentSource, /aerialFog/);
assert.match(fragmentSource, /frame\.skyHorizon\.rgb/);
assert.match(fragmentSource, /moonFill/);
assert.match(fragmentSource, /frame\.sunDirection\.xyz/);
assert.match(fragmentSource, /caustic/);
assert.match(fragmentSource, /textureSampleLevel\(cloudTexture, cloudSampler/);
assert.match(fragmentSource, /smoothstep\(0\.54, 0\.72, causticPattern\)/);
assert.doesNotMatch(fragmentSource, /filmicToneMap/);

// Phase 6: the WebGPU path must be able to hand a real frame back, and must
// say so explicitly when it cannot. A readback path that only proves the
// pipeline compiles is not a visible-validation gate.
assert.match(rendererSource, /async function readFramePixels\(/, "the WebGPU path must expose a real frame readback");
assert.match(rendererSource, /copyTextureToBuffer/, "the readback must copy the presented texture");
assert.match(rendererSource, /mapAsync/, "the readback must map the copied buffer");
assert.match(rendererSource, /bytesPerRow/, "the readback must respect the 256-byte row alignment");
assert.match(rendererSource, /COPY_SRC/, "the swap chain must be configured for copying");
assert.match(rendererSource, /MAP_READ/, "the readback buffer must be mappable");
assert.match(rendererSource, /lastPresentedTexture = presented/, "the readback must target the frame just submitted");
assert.match(gameSource, /readFramePixelsAsync/, "the bridge must expose the async readback");
assert.match(gameSource, /getFrameReadbackSupport/, "the bridge must report readback support");
assert.doesNotMatch(
  gameSource,
  /WebGPU frame readback is not enabled in this diagnostic path/,
  "the old readback stub must be gone",
);
const webglSources = createWebglTerrainShaderSources(96);
const fallbackWebglSources = createWebglTerrainShaderSources(96, { advancedWater: false });
// WebGL and WGSL must grade a pixel through the same three ordered stages, and
// must agree on the material band bounds and the water depth tint.
const webglFragment = webglSources.fragmentSource;
const wgslFragment = fragmentSource;
for (const [name, source] of [["webgl", webglFragment], ["wgsl", wgslFragment]]) {
  const albedo = source.search(/(?:vec3<)?(?:vec3<f32>\()? ?albedo/);
  const lighting = source.search(/litColor/);
  const material = source.search(/materialSpecular/);
  assert.ok(albedo >= 0, `${name} must build an albedo stage`);
  assert.ok(lighting > albedo, `${name} must apply lighting after albedo`);
  assert.ok(material > lighting, `${name} must apply the material lobe after lighting`);
  assert.match(source, /surfaceRoughness/, `${name} must derive a roughness`);
  assert.match(source, /detailAmplitude/, `${name} must derive detail shading`);
  assert.match(source, /waterDepth/, `${name} must tint water by depth`);
  assert.match(
    source,
    new RegExp(`0\\.55 \\+ \\(0\\.95 - 0\\.55\\)`),
    `${name} must use the documented roughness range`,
  );
  assert.match(
    source,
    /clamp\((?:vMaterial|input\.material) - 1\.0, 0\.0, 1\.0\)/,
    `${name} must decode the water depth from the material band`,
  );
  assert.match(
    source,
    /deepWater/,
    `${name} must tint toward a bounded deep-water color`,
  );
  // The material bands must not overlap, or a lava or fire quad would be graded
  // as water. The exact bounds are asserted below; here we only reject a
  // material comparison that still uses the old half-open bands.
  assert.doesNotMatch(
    source,
    /(?:vMaterial|input\.material) [<>=]+ 1\.5/,
    `${name} must not use the old half-open water band`,
  );
  assert.doesNotMatch(
    source,
    /(?:vMaterial|input\.material) [<>=]+ 2\.5/,
    `${name} must not use the old half-open lava band`,
  );
  // Opaque terrain encodes `10 + block`, so an unbounded fire band would grade
  // stone and dirt as fire.
  assert.doesNotMatch(
    source,
    /(?:vMaterial|input\.material) >= 3\)/,
    `${name} must bound the fire band so opaque terrain cannot match it`,
  );
}
assert.match(webglFragment, /vMaterial >= 1\.0 && vMaterial < 2\.0/, "the WebGL water band must be [water, lava)");
assert.match(wgslFragment, /input\.material >= 1 && input\.material < 2/, "the WGSL water band must match WebGL");
assert.match(webglFragment, /vMaterial >= 2\.0 && vMaterial < 3\.0/, "the WebGL lava band must be [lava, fire)");
assert.match(wgslFragment, /input\.material >= 2 && input\.material < 3/, "the WGSL lava band must match WebGL");
assert.match(webglFragment, /vMaterial >= 3\.0 && vMaterial < 4\.0/, "the WebGL fire band must be [fire, fire+1)");
assert.match(wgslFragment, /input\.material >= 3 && input\.material < 4/, "the WGSL fire band must match WebGL");
// GLSL ES 1.00 has no implicit int-to-float promotion, so a band bound emitted
// as an int literal fails to compile on a real context.
for (const [name, source] of [["webgl", webglFragment]]) {
  assert.doesNotMatch(
    source,
    /[aA]Material >= \d[^.0-9]/,
    `${name} must emit float band bounds, not int literals`,
  );
}
assert.doesNotMatch(fragmentSource, /depthTint/);
assert.match(webglSources.vertexSource, /vViewDirection/);
assert.match(webglSources.vertexSource, /vAerialFog/);
assert.match(webglSources.fragmentSource, /vAerialFog/);
assert.match(webglSources.fragmentSource, /uSkyHorizonColor/);
assert.match(webglSources.fragmentSource, /moonFill/);
assert.match(webglSources.fragmentSource, /uSunDirection/);
assert.match(webglSources.fragmentSource, /caustic/);
assert.match(webglSources.fragmentSource, /uniform sampler2D uCloudMap/);
assert.match(webglSources.fragmentSource, /texture2D\(uCloudMap, causticUv\)/);
assert.match(webglSources.fragmentSource, /smoothstep\(0\.54, 0\.72, causticPattern\)/);
assert.doesNotMatch(webglSources.fragmentSource, /fallbackWater/);
assert.match(fallbackWebglSources.fragmentSource, /fallbackWater/);
// The software fallback drops the expensive water terms but keeps the cheap
// three-stage material contract, so land materials grade identically on both
// quality tiers.
assert.doesNotMatch(fallbackWebglSources.fragmentSource, /causticUv|waterNormal/);
assert.doesNotMatch(fallbackWebglSources.fragmentSource, /float specular\b/);
for (const [name, source] of [["webgl", webglSources.fragmentSource], ["fallback", fallbackWebglSources.fragmentSource]]) {
  assert.match(source, /albedo/, `${name} must keep the albedo stage`);
  assert.match(source, /litColor/, `${name} must keep the lighting stage`);
  assert.match(source, /materialSpecular/, `${name} must keep the material lobe`);
  assert.match(source, /surfaceRoughness/, `${name} must keep the roughness term`);
  assert.match(source, /detailAmplitude/, `${name} must keep the detail term`);
}
assert.doesNotMatch(fallbackWebglSources.vertexSource, /position\.y \+=|position\.x \+=/);
assert.doesNotMatch(webglSources.fragmentSource, /filmicToneMap/);
assert.match(WEBGL_SKY_VERTEX_SHADER, /gl_Position = vec4\(aPosition, 1\.0, 1\.0\)/);
assert.match(WEBGL_SKY_FRAGMENT_SHADER, /skyRay/);
assert.match(WEBGL_SKY_FRAGMENT_SHADER, /cloudNoise/);
assert.match(WEBGL_SKY_FRAGMENT_SHADER, /uniform sampler2D uCloudMap/);
assert.doesNotMatch(WEBGL_SKY_FRAGMENT_SHADER, /float valueNoise/);
assert.match(WEBGL_SKY_FRAGMENT_SHADER, /texture2D\(uCloudMap/);
assert.match(WEBGL_SKY_FRAGMENT_SHADER, /sunDisk/);
assert.match(WEBGL_SKY_FRAGMENT_SHADER, /starField/);
assert.match(WEBGL_SKY_FRAGMENT_SHADER, /starLocal = fract\(skyRay \* 460\.0\)\.xy - vec2\(0\.5\)/);
assert.match(WEBGPU_SKY_SHADER, /starLocal = fract\(skyRay \* 460\.0\)\.xy - vec2<f32>\(0\.5\)/);
assert.match(WEBGL_SKY_FRAGMENT_SHADER, /horizonHaze/);
assert.match(WEBGL_SKY_FALLBACK_FRAGMENT_SHADER, /skyRay/);
assert.match(WEBGL_SKY_FALLBACK_FRAGMENT_SHADER, /horizonHaze/);
assert.doesNotMatch(WEBGL_SKY_FALLBACK_FRAGMENT_SHADER, /cloudNoise|starField|sunDisk/);

assert.equal(typeof WEBGPU_SKY_SHADER, "string");
assert.match(WEBGPU_SKY_SHADER, /fn sky_vs/);
assert.match(WEBGPU_SKY_SHADER, /fn sky_fs/);
assert.match(WEBGPU_SKY_SHADER, /cloudNoise/);
assert.match(WEBGPU_SKY_SHADER, /@binding\(3\) var cloudSampler/);
assert.match(WEBGPU_SKY_SHADER, /@binding\(4\) var cloudTexture/);
assert.match(WEBGPU_SKY_SHADER, /textureSample\(cloudTexture, cloudSampler/);
assert.match(WEBGPU_SKY_SHADER, /sunDisk/);
assert.match(WEBGPU_SKY_SHADER, /starField/);
assert.match(WEBGPU_SKY_SHADER, /horizonHaze/);
assert.match(WEBGPU_SKY_SHADER, /frame\.sunDirection\.xyz/);

console.log("webgpu terrain presentation ok");

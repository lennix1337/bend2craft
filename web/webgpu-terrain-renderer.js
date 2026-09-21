import {
  TERRAIN_VERTEX_STRIDE_BYTES,
  packTerrainLayer,
} from "./webgpu-chunk-buffers.js";

const BUFFER_USAGE = {
  COPY_DST: 0x0008,
  VERTEX: 0x0020,
  UNIFORM: 0x0040,
};
const TEXTURE_USAGE = {
  COPY_DST: 0x0002,
  TEXTURE_BINDING: 0x0004,
  RENDER_ATTACHMENT: 0x0010,
};
const SHADER_STAGE = { VERTEX: 0x1, FRAGMENT: 0x2 };
const FRAME_UNIFORM_BYTES = 128;

const SHADER = `
struct Frame {
  viewProjection: mat4x4<f32>,
  camera: vec4<f32>,
  skyColor: vec4<f32>,
  params: vec4<f32>,
  fog: vec4<f32>,
};

@group(0) @binding(0) var<uniform> frame: Frame;
@group(0) @binding(1) var atlasSampler: sampler;
@group(0) @binding(2) var atlasTexture: texture_2d<f32>;

struct VertexInput {
  @location(0) position: vec3<f32>,
  @location(1) color: vec3<f32>,
  @location(2) uv: vec2<f32>,
  @location(3) material: f32,
  @location(4) tileRect: vec4<f32>,
};

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) color: vec3<f32>,
  @location(1) uv: vec2<f32>,
  @location(2) worldPosition: vec3<f32>,
  @location(3) tileRect: vec4<f32>,
};

@vertex
fn vs_main(input: VertexInput) -> VertexOutput {
  var position = input.position;
  let pass = frame.params.z;
  if (pass > 0.5 && pass < 1.5 && input.material < 1.5) {
    position.y += 0.028 * sin(frame.params.y * 1.6 + position.x * 0.38 + position.z * 0.27)
      + 0.012 * sin(frame.params.y * 2.7 - position.z * 0.19 + position.x * 0.11);
  }
  var output: VertexOutput;
  output.position = frame.viewProjection * vec4<f32>(position, 1.0);
  output.color = input.color;
  output.uv = input.uv;
  output.worldPosition = position;
  output.tileRect = input.tileRect;
  return output;
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
  let pass = frame.params.z;
  let miningPass = input.tileRect.x < -0.5;
  var color = input.color * frame.params.x;
  var alpha = 1.0;
  if (miningPass) {
    let fractureUv = input.uv * 4.0 + floor(frame.params.w * 6.0);
    let fractureA = 1.0 - smoothstep(0.0, 0.045, abs(fractureUv.x + fractureUv.y) - 0.5);
    let fractureB = 1.0 - smoothstep(0.0, 0.045, abs(fractureUv.x - fractureUv.y) - 0.5);
    color = vec3<f32>(0.04, 0.045, 0.04);
    alpha = 0.14 + max(fractureA, fractureB) * 0.72;
  } else if (pass > 1.5 && pass < 2.5) {
    color = vec3<f32>(0.015, 0.02, 0.018);
    let shadowUv = input.uv * 2.0 - 1.0;
    alpha = 0.28 * (1.0 - smoothstep(0.38, 1.0, length(shadowUv)));
  } else {
    let localUv = fract(input.uv);
    let atlasUv = mix(input.tileRect.xy, input.tileRect.zw, localUv);
    let textureColor = textureSample(atlasTexture, atlasSampler, atlasUv);
    color *= textureColor.rgb;
    alpha = textureColor.a;
    if (pass > 0.5 && pass < 1.5 && input.material < 1.5) {
      let rippleA = 0.5 + 0.5 * sin(frame.params.y * 1.8 + input.worldPosition.x * 0.42 + input.worldPosition.z * 0.28);
      let rippleB = 0.5 + 0.5 * sin(frame.params.y * 2.7 - input.worldPosition.z * 0.19 + input.worldPosition.x * 0.11);
      let shimmer = 0.65 * rippleA + 0.35 * rippleB;
      color = mix(vec3<f32>(0.035, 0.23, 0.42), vec3<f32>(0.18, 0.68, 0.78), shimmer) * frame.params.x;
      alpha = 0.76;
    }
  }
  let fog = clamp((distance(input.worldPosition, frame.camera.xyz) - 24.0) / frame.fog.x, 0.0, 1.0);
  return vec4<f32>(mix(color, frame.skyColor.rgb, fog), alpha * (1.0 - fog));
}
`;

function align(value, alignment) {
  return Math.ceil(value / alignment) * alignment;
}

function bufferUsage(name) {
  return globalThis.GPUBufferUsage?.[name] ?? BUFFER_USAGE[name];
}

function textureUsage(name) {
  return globalThis.GPUTextureUsage?.[name] ?? TEXTURE_USAGE[name];
}

function shaderStage(name) {
  return globalThis.GPUShaderStage?.[name] ?? SHADER_STAGE[name];
}

function createVertexBuffer(device, packed) {
  if (packed.vertexCount === 0) return null;
  const buffer = device.createBuffer({
    size: align(packed.data.byteLength, 4),
    usage: bufferUsage("VERTEX") | bufferUsage("COPY_DST"),
  });
  device.queue.writeBuffer(buffer, 0, packed.data);
  return buffer;
}

function createPackedDynamicLayer(layer) {
  if (layer === null || layer === undefined) return packTerrainLayer(null);
  const materials = layer.materials ?? new Float32Array(layer.positions.length / 3);
  const tiles = layer.tiles ?? new Float32Array((layer.positions.length / 3) * 4);
  return packTerrainLayer({ ...layer, materials, tiles });
}

function createDefaultAtlas(device) {
  const texture = device.createTexture({
    size: [1, 1, 1],
    format: "rgba8unorm",
    usage: textureUsage("TEXTURE_BINDING") | textureUsage("COPY_DST"),
  });
  device.queue.writeTexture(
    { texture },
    Uint8Array.of(255, 255, 255, 255),
    { bytesPerRow: 4 },
    { width: 1, height: 1, depthOrArrayLayers: 1 },
  );
  return texture;
}

function createAtlasTexture(device, canvas) {
  if (canvas === null || canvas === undefined) return createDefaultAtlas(device);
  const texture = device.createTexture({
    size: [canvas.width, canvas.height, 1],
    format: "rgba8unorm",
    usage: textureUsage("TEXTURE_BINDING") | textureUsage("COPY_DST"),
  });
  device.queue.copyExternalImageToTexture(
    { source: canvas },
    { texture },
    { width: canvas.width, height: canvas.height, depthOrArrayLayers: 1 },
  );
  return texture;
}

async function validateCanvasPresentation(canvas, canvasContext, device) {
  if (typeof globalThis.createImageBitmap !== "function" || typeof document === "undefined") return true;
  const encoder = device.createCommandEncoder();
  const pass = encoder.beginRenderPass({
    colorAttachments: [{
      view: canvasContext.getCurrentTexture().createView(),
      clearValue: { r: 1, g: 0, b: 0, a: 1 },
      loadOp: "clear",
      storeOp: "store",
    }],
  });
  pass.end();
  device.queue.submit([encoder.finish()]);
  await new Promise((resolve) => requestAnimationFrame(resolve));
  try {
    const bitmap = await createImageBitmap(canvas);
    const probe = document.createElement("canvas");
    probe.width = 1;
    probe.height = 1;
    const context = probe.getContext("2d", { willReadFrequently: true });
    context.drawImage(bitmap, 0, 0, 1, 1);
    bitmap.close();
    const pixel = context.getImageData(0, 0, 1, 1).data;
    return pixel[0] > 180 && pixel[1] < 100 && pixel[2] < 100 && pixel[3] > 180;
  } catch {
    return false;
  }
}

function createPipeline(device, layout, module, format, depthFormat, blend, depthWriteEnabled) {
  return device.createRenderPipeline({
    layout,
    vertex: {
      module,
      entryPoint: "vs_main",
      buffers: [{
        arrayStride: TERRAIN_VERTEX_STRIDE_BYTES,
        attributes: [
          { shaderLocation: 0, offset: 0, format: "float32x3" },
          { shaderLocation: 1, offset: 12, format: "float32x3" },
          { shaderLocation: 2, offset: 24, format: "float32x2" },
          { shaderLocation: 3, offset: 32, format: "float32" },
          { shaderLocation: 4, offset: 36, format: "float32x4" },
        ],
      }],
    },
    fragment: {
      module,
      entryPoint: "fs_main",
      targets: [{
        format,
        blend: blend ? {
          color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha", operation: "add" },
          alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
        } : undefined,
      }],
    },
    primitive: { topology: "triangle-list", cullMode: "back" },
    depthStencil: {
      format: depthFormat,
      depthWriteEnabled,
      depthCompare: "less",
    },
  });
}

export async function createWebGpuTerrainRenderer({
  canvas,
  atlasCanvas = null,
  navigatorLike = globalThis.navigator,
  context = null,
} = {}) {
  if (canvas === null || canvas === undefined) throw new TypeError("WebGPU renderer requires a canvas");
  const gpu = navigatorLike?.gpu;
  if (gpu === undefined || typeof gpu.requestAdapter !== "function") {
    throw new Error("WebGPU is not available in this browser.");
  }
  const adapter = await gpu.requestAdapter();
  if (adapter === null) throw new Error("No WebGPU adapter was returned.");
  const device = await adapter.requestDevice();
  const canvasContext = context ?? canvas.getContext("webgpu");
  if (canvasContext === null) throw new Error("WebGPU canvas context is unavailable.");
  const format = gpu.getPreferredCanvasFormat?.() ?? "bgra8unorm";
  canvasContext.configure({ device, format, alphaMode: "opaque" });
  if (!await validateCanvasPresentation(canvas, canvasContext, device)) {
    throw new Error("WebGPU presentation is unavailable; refusing a blank canvas.");
  }
  const depthFormat = "depth24plus";
  let depthTexture = null;
  let depthSize = "";
  const shaderModule = device.createShaderModule({ code: SHADER });
  const bindGroupLayout = device.createBindGroupLayout({ entries: [
    { binding: 0, visibility: shaderStage("VERTEX") | shaderStage("FRAGMENT"), buffer: { type: "uniform" } },
    { binding: 1, visibility: shaderStage("FRAGMENT"), sampler: { type: "filtering" } },
    { binding: 2, visibility: shaderStage("FRAGMENT"), texture: { sampleType: "float" } },
  ] });
  const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] });
  const opaquePipeline = createPipeline(device, pipelineLayout, shaderModule, format, depthFormat, false, true);
  const alphaPipeline = createPipeline(device, pipelineLayout, shaderModule, format, depthFormat, true, false);
  const dynamicPipeline = createPipeline(device, pipelineLayout, shaderModule, format, depthFormat, true, true);
  const shadowPipeline = createPipeline(device, pipelineLayout, shaderModule, format, depthFormat, true, false);
  const frameBuffers = Array.from({ length: 4 }, () => device.createBuffer({
    size: FRAME_UNIFORM_BYTES,
    usage: bufferUsage("UNIFORM") | bufferUsage("COPY_DST"),
  }));
  const atlasTexture = createAtlasTexture(device, atlasCanvas);
  const atlasSampler = device.createSampler({ magFilter: "nearest", minFilter: "nearest", mipmapFilter: "nearest" });
  const bindGroups = frameBuffers.map((frameBuffer) => device.createBindGroup({
    layout: bindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: frameBuffer } },
      { binding: 1, resource: atlasSampler },
      { binding: 2, resource: atlasTexture.createView() },
    ],
  }));
  const terrain = new Map();
  let dynamic = null;
  let shadow = null;
  let uploadedOpaqueVertices = 0;
  let uploadedWaterVertices = 0;
  let terrainBufferUploads = 0;
  let terrainBufferReuses = 0;

  function ensureDepthTexture() {
    const key = `${canvas.width}x${canvas.height}`;
    if (key === depthSize && depthTexture !== null) return;
    depthTexture?.destroy();
    depthTexture = device.createTexture({
      size: [Math.max(1, canvas.width), Math.max(1, canvas.height), 1],
      format: depthFormat,
      usage: textureUsage("RENDER_ATTACHMENT"),
    });
    depthSize = key;
  }

  function replaceBuffer(previous, packed) {
    previous?.destroy();
    return createVertexBuffer(device, packed);
  }

  function uploadTerrain(chunks) {
    const incoming = new Set(chunks.map((chunk) => String(chunk.key)));
    for (const [key, buffers] of terrain) {
      if (!incoming.has(key)) {
        buffers.opaque?.destroy();
        buffers.water?.destroy();
        terrain.delete(key);
      }
    }
    uploadedOpaqueVertices = 0;
    uploadedWaterVertices = 0;
    for (const chunk of chunks) {
      const key = String(chunk.key);
      const opaqueSource = chunk.vertexData?.opaque ?? null;
      const waterSource = chunk.vertexData?.water ?? null;
      const previous = terrain.get(key);
      if (previous !== undefined
        && previous.opaqueSource === opaqueSource
        && previous.waterSource === waterSource) {
        terrainBufferReuses += 1;
        uploadedOpaqueVertices += previous.opaqueVertices;
        uploadedWaterVertices += previous.waterVertices;
        continue;
      }
      const opaque = packTerrainLayer(opaqueSource);
      const water = packTerrainLayer(waterSource);
      const buffers = {
        opaque: replaceBuffer(previous?.opaque, opaque),
        water: replaceBuffer(previous?.water, water),
        opaqueSource,
        waterSource,
        opaqueVertices: opaque.vertexCount,
        waterVertices: water.vertexCount,
      };
      terrain.set(key, buffers);
      terrainBufferUploads += 1;
      uploadedOpaqueVertices += buffers.opaqueVertices;
      uploadedWaterVertices += buffers.waterVertices;
    }
  }

  function uploadDynamic({ dynamic: dynamicLayer = null, shadow: shadowLayer = null } = {}) {
    const packedDynamic = createPackedDynamicLayer(dynamicLayer);
    const packedShadow = createPackedDynamicLayer(shadowLayer);
    dynamic?.buffer?.destroy();
    shadow?.buffer?.destroy();
    dynamic = { buffer: createVertexBuffer(device, packedDynamic), vertexCount: packedDynamic.vertexCount };
    shadow = { buffer: createVertexBuffer(device, packedShadow), vertexCount: packedShadow.vertexCount };
  }

  function writeFrame(frame, mode) {
    const values = new Float32Array(FRAME_UNIFORM_BYTES / 4);
    values.set(frame.viewProjection, 0);
    values.set([frame.camera[0], frame.camera[1], frame.camera[2], 1], 16);
    values.set([frame.skyColor[0], frame.skyColor[1], frame.skyColor[2], 1], 20);
    values.set([frame.daylight ?? 1, frame.time ?? 0, mode, frame.miningProgress ?? 0], 24);
    values.set([frame.fogDistance ?? 120, 0, 0, 0], 28);
    device.queue.writeBuffer(frameBuffers[mode], 0, values);
  }

  function drawLayer(pass, pipeline, buffer, vertexCount, mode) {
    if (buffer === null || vertexCount === 0) return;
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroups[mode]);
    pass.setVertexBuffer(0, buffer);
    pass.draw(vertexCount, 1, 0, 0);
  }

  function render(frame) {
    ensureDepthTexture();
    writeFrame(frame, 0);
    writeFrame(frame, 1);
    writeFrame(frame, 2);
    writeFrame(frame, 3);
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: canvasContext.getCurrentTexture().createView(),
        clearValue: {
          r: frame.skyColor[0],
          g: frame.skyColor[1],
          b: frame.skyColor[2],
          a: 1,
        },
        loadOp: "clear",
        storeOp: "store",
      }],
      depthStencilAttachment: {
        view: depthTexture.createView(),
        depthClearValue: 1,
        depthLoadOp: "clear",
        depthStoreOp: "store",
      },
    });
    for (const buffers of terrain.values()) drawLayer(pass, opaquePipeline, buffers.opaque, buffers.opaqueVertices, 0);
    for (const buffers of terrain.values()) drawLayer(pass, alphaPipeline, buffers.water, buffers.waterVertices, 1);
    drawLayer(pass, shadowPipeline, shadow?.buffer ?? null, shadow?.vertexCount ?? 0, 2);
    drawLayer(pass, dynamicPipeline, dynamic?.buffer ?? null, dynamic?.vertexCount ?? 0, 3);
    pass.end();
    device.queue.submit([encoder.finish()]);
  }

  function destroy() {
    for (const buffers of terrain.values()) {
      buffers.opaque?.destroy();
      buffers.water?.destroy();
    }
    dynamic?.buffer?.destroy();
    shadow?.buffer?.destroy();
    depthTexture?.destroy();
    atlasTexture.destroy();
    for (const frameBuffer of frameBuffers) frameBuffer.destroy();
    device.destroy?.();
  }

  return {
    kind: "webgpu",
    adapterName: adapter.name ?? null,
    uploadTerrain,
    uploadDynamic,
    render,
    destroy,
    getStats: () => ({
      backend: "webgpu",
      chunks: terrain.size,
      opaqueVertices: uploadedOpaqueVertices,
      waterVertices: uploadedWaterVertices,
      terrainBufferUploads,
      terrainBufferReuses,
      dynamicVertices: dynamic?.vertexCount ?? 0,
      shadowVertices: shadow?.vertexCount ?? 0,
      vertexStrideBytes: TERRAIN_VERTEX_STRIDE_BYTES,
    }),
  };
}

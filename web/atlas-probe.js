import { atlasUV } from "./texture-atlas.js";

const RESOURCES = new WeakMap();

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(`Atlas probe shader compilation failed: ${gl.getShaderInfoLog(shader)}`);
  }
  return shader;
}

function resourcesFor(gl) {
  let resources = RESOURCES.get(gl);
  if (resources !== undefined) return resources;
  const vertex = compileShader(gl, gl.VERTEX_SHADER, `
    attribute vec2 aPosition;
    attribute vec2 aUv;
    varying vec2 vUv;
    void main() {
      vUv = aUv;
      gl_Position = vec4(aPosition, 0.0, 1.0);
    }
  `);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, `
    precision mediump float;
    uniform sampler2D uAtlas;
    varying vec2 vUv;
    void main() {
      gl_FragColor = texture2D(uAtlas, vUv);
    }
  `);
  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`Atlas probe program link failed: ${gl.getProgramInfoLog(program)}`);
  }
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  resources = {
    program,
    positionBuffer: gl.createBuffer(),
    uvBuffer: gl.createBuffer(),
    framebuffer: gl.createFramebuffer(),
    targetTexture: gl.createTexture(),
    positionLocation: gl.getAttribLocation(program, "aPosition"),
    uvLocation: gl.getAttribLocation(program, "aUv"),
    atlasLocation: gl.getUniformLocation(program, "uAtlas"),
  };
  RESOURCES.set(gl, resources);
  return resources;
}

export function readAtlasTilePixels(gl, atlasTexture, tile, size = 16) {
  if (!Number.isInteger(tile) || tile < 0 || !Number.isInteger(size) || size < 1) {
    throw new RangeError("atlas probe tile and size must be positive integers");
  }
  const resources = resourcesFor(gl);
  const uv = atlasUV(tile);
  const positions = new Float32Array([
    -1, -1, 1, -1, 1, 1,
    -1, -1, 1, 1, -1, 1,
  ]);
  const uvs = new Float32Array([
    uv[0], uv[1], uv[2], uv[3], uv[4], uv[5],
    uv[0], uv[1], uv[4], uv[5], uv[6], uv[7],
  ]);
  const pixels = new Uint8Array(size * size * 4);

  gl.bindTexture(gl.TEXTURE_2D, resources.targetTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindFramebuffer(gl.FRAMEBUFFER, resources.framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, resources.targetTexture, 0);
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
    throw new Error("Atlas probe framebuffer is incomplete");
  }
  gl.viewport(0, 0, size, size);
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.BLEND);
  gl.useProgram(resources.program);
  gl.bindBuffer(gl.ARRAY_BUFFER, resources.positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STREAM_DRAW);
  gl.enableVertexAttribArray(resources.positionLocation);
  gl.vertexAttribPointer(resources.positionLocation, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, resources.uvBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, uvs, gl.STREAM_DRAW);
  gl.enableVertexAttribArray(resources.uvLocation);
  gl.vertexAttribPointer(resources.uvLocation, 2, gl.FLOAT, false, 0, 0);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, atlasTexture);
  gl.uniform1i(resources.atlasLocation, 0);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
  gl.readPixels(0, 0, size, size, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
  gl.enable(gl.DEPTH_TEST);
  gl.depthMask(true);
  return Array.from(pixels);
}

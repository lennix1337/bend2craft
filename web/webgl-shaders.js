import {
  SURFACE_MATERIAL_FIRE,
  SURFACE_MATERIAL_LAVA,
  SURFACE_MATERIAL_WATER,
} from "./surface-materials.js";
import {
  AERIAL_FOG_HEIGHT_FALLOFF,
  AERIAL_FOG_MIN_DENSITY,
  FIRE_ALPHA,
  FIRE_PULSE_AMPLITUDE,
  FIRE_PULSE_SPEED,
  FIRE_PULSE_SPATIAL_FREQUENCY,
  LAVA_ALPHA,
  LAVA_PULSE_AMPLITUDE,
  LAVA_PULSE_SPEED,
  LAVA_PULSE_SPATIAL_FREQUENCY,
  MINING_FRACTURE_PROGRESS,
  MATERIAL_DETAIL_STRENGTH,
  MATERIAL_ROUGHNESS_MAX,
  MATERIAL_ROUGHNESS_MIN,
  MATERIAL_SPECULAR_POWER,
  MATERIAL_SPECULAR_STRENGTH,
  MOON_FILL_STRENGTH,
  NIGHT_AMBIENT_G,
  NIGHT_AMBIENT_R,
  NIGHT_AMBIENT_STRENGTH,
  TERRAIN_FOG_START,
  TERRAIN_MATERIAL_VARIATION_MAX,
  TERRAIN_MATERIAL_VARIATION_MIN,
  TERRAIN_VARIATION_SEED,
  TERRAIN_VARIATION_X,
  TERRAIN_VARIATION_Z,
  WATER_CAUSTIC_STRENGTH,
  WATER_CAUSTIC_THRESHOLD_END,
  WATER_CAUSTIC_THRESHOLD_START,
  WATER_DARK_R,
  WATER_DARK_G,
  WATER_DARK_B,
  WATER_DEPTH_FLOOR_R,
  WATER_DEPTH_MAX,
  WATER_DEPTH_TINT_STRENGTH,
  WATER_FOAM_STRENGTH,
  WATER_FOAM_THRESHOLD,
  WATER_FRESNEL_POWER,
  WATER_LIGHT_R,
  WATER_LIGHT_G,
  WATER_LIGHT_B,
  WATER_NORMAL_STRENGTH,
  WATER_SPECULAR_POWER,
} from "./terrain-presentation.js";

export function isSoftwareRenderer(rendererName) {
  return /swiftshader|llvmpipe|software|basic render/i.test(String(rendererName ?? ""));
}

export const WEBGL_SKY_VERTEX_SHADER = `
  precision highp float;
  attribute vec2 aPosition;
  varying vec2 vNdc;
  void main() {
    vNdc = aPosition;
    gl_Position = vec4(aPosition, 1.0, 1.0);
  }
`;

export const WEBGL_SKY_FRAGMENT_SHADER = `
  #ifdef GL_FRAGMENT_PRECISION_HIGH
  precision highp float;
  #else
  precision mediump float;
  #endif
  varying vec2 vNdc;
  uniform vec3 uCameraForward;
  uniform vec3 uCameraRight;
  uniform vec3 uCameraUp;
  uniform vec3 uSkyColor;
  uniform vec3 uSkyHorizonColor;
  uniform vec3 uSunDirection;
  uniform vec3 uSunColor;
  uniform float uAspect;
  uniform float uTanHalfFov;
  uniform float uDaylight;
  uniform float uTime;
  uniform sampler2D uCloudMap;

  float hash31(vec3 point) {
    return fract(sin(dot(point, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
  }

  vec3 filmicToneMap(vec3 color) {
    return clamp(max(color, vec3(0.0)) * 1.08, 0.0, 1.0);
  }

  void main() {
    vec3 skyRay = normalize(
      uCameraForward
      + uCameraRight * vNdc.x * uAspect * uTanHalfFov
      + uCameraUp * vNdc.y * uTanHalfFov
    );
    float vertical = clamp(skyRay.y * 0.5 + 0.5, 0.0, 1.0);
    vec3 skyColor = mix(uSkyHorizonColor, uSkyColor, smoothstep(0.0, 0.86, vertical));
    float horizonBase = 1.0 - clamp(abs(skyRay.y), 0.0, 1.0);
    float horizonHaze = horizonBase * horizonBase * horizonBase;
    skyColor = mix(skyColor, uSkyHorizonColor, horizonHaze * 0.36);

    float night = 1.0 - smoothstep(0.18, 0.62, uDaylight);
    float starField = 0.0;
    if (night > 0.01) {
      vec3 starCell = floor(skyRay * 460.0);
      vec2 starLocal = fract(skyRay * 460.0).xy - vec2(0.5);
      float starPoint = 1.0 - smoothstep(0.025, 0.14, length(starLocal));
      starField = step(0.9962, hash31(starCell)) * starPoint * night;
    }

    vec2 cloudPlane = skyRay.xz * 0.72 + vec2(skyRay.y * 0.11, -skyRay.y * 0.08);
    vec2 wind = vec2(uTime * 0.004, uTime * 0.0016);
    float broadCloud = texture2D(uCloudMap, cloudPlane * 1.35 + wind).r;
    float cloudDetail = texture2D(uCloudMap, cloudPlane * 2.4 - wind * 1.7 + vec2(0.17, 0.31)).r;
    float cloudNoise = smoothstep(0.54, 0.72, broadCloud * 0.78 + cloudDetail * 0.22);
    cloudNoise *= smoothstep(0.0, 0.1, skyRay.y);

    float sunDot = max(dot(skyRay, uSunDirection), 0.0);
    float sunVisibility = smoothstep(-0.08, 0.06, uSunDirection.y);
    float sunDisk = smoothstep(0.99925, 0.99982, sunDot) * sunVisibility;
    float sunHalo = pow(sunDot, 24.0) * 0.16;
    skyColor += uSunColor * (sunDisk * 1.55 + sunHalo) * sunVisibility;

    if (night > 0.01) {
      float moonDot = max(dot(skyRay, -uSunDirection), 0.0);
      float moonDisk = smoothstep(0.9986, 0.99945, moonDot) * night;
      float moonHalo = pow(moonDot, 48.0) * 0.12 * night;
      skyColor += vec3(0.72, 0.82, 1.0) * (moonDisk * 0.9 + moonHalo);
    }

    if (cloudNoise > 0.001) {
      float twilight = 1.0 - smoothstep(0.08, 0.48, abs(uSunDirection.y));
      vec3 cloudShadow = mix(vec3(0.055, 0.075, 0.13), vec3(0.44, 0.53, 0.6), uDaylight);
      vec3 cloudLight = mix(vec3(0.12, 0.15, 0.24), vec3(1.0, 0.95, 0.84), uDaylight);
      cloudLight = mix(cloudLight, vec3(1.0, 0.5, 0.27), twilight * 0.34);
      float cloudLightMix = smoothstep(0.48, 0.74, broadCloud);
      vec3 cloudColor = mix(cloudShadow, cloudLight, cloudLightMix);
      skyColor = mix(skyColor, cloudColor, cloudNoise * 0.62);
    }
    skyColor += starField * (1.0 - cloudNoise);

    float belowHorizon = 1.0 - smoothstep(-0.2, 0.0, skyRay.y);
    skyColor = mix(skyColor, uSkyHorizonColor * 0.72, belowHorizon * 0.48);
    gl_FragColor = vec4(filmicToneMap(skyColor), 1.0);
  }
`;

export const WEBGL_SKY_FALLBACK_FRAGMENT_SHADER = `
  #ifdef GL_FRAGMENT_PRECISION_HIGH
  precision highp float;
  #else
  precision mediump float;
  #endif
  varying vec2 vNdc;
  uniform vec3 uCameraForward;
  uniform vec3 uCameraRight;
  uniform vec3 uCameraUp;
  uniform vec3 uSkyColor;
  uniform vec3 uSkyHorizonColor;
  uniform float uAspect;
  uniform float uTanHalfFov;

  void main() {
    vec3 skyRay = normalize(
      uCameraForward
      + uCameraRight * vNdc.x * uAspect * uTanHalfFov
      + uCameraUp * vNdc.y * uTanHalfFov
    );
    float vertical = clamp(skyRay.y * 0.5 + 0.5, 0.0, 1.0);
    vec3 skyColor = mix(uSkyHorizonColor, uSkyColor, smoothstep(0.0, 0.86, vertical));
    float horizonBase = 1.0 - clamp(abs(skyRay.y), 0.0, 1.0);
    float horizonHaze = horizonBase * horizonBase * horizonBase;
    skyColor = mix(skyColor, uSkyHorizonColor, horizonHaze * 0.36);
    gl_FragColor = vec4(clamp(skyColor * 1.08, 0.0, 1.0), 1.0);
  }
`;

export function createWebglTerrainShaderSources(fogDistance, { advancedWater = true } = {}) {
  const waterFragment = advancedWater ? `
        float phaseA = uTime * 1.8 + vWorldPosition.x * 0.42 + vWorldPosition.z * 0.28;
        float phaseB = uTime * 2.7 - vWorldPosition.z * 0.19 + vWorldPosition.x * 0.11;
        float phaseC = uTime * 1.15 + vWorldPosition.x * 0.31 - vWorldPosition.z * 0.23;
        float rippleA = 0.5 + 0.5 * sin(phaseA);
        float rippleB = 0.5 + 0.5 * sin(phaseB);
        float rippleC = 0.5 + 0.5 * sin(phaseC);
        float shimmer = rippleA * 0.5 + rippleB * 0.3 + rippleC * 0.2;
        vec2 waterSlope = vec2(
          cos(phaseA) * 0.42 * 0.028 + cos(phaseB) * 0.11 * 0.012 + cos(phaseC) * 0.07,
          cos(phaseA) * 0.28 * 0.028 - cos(phaseB) * 0.19 * 0.012 - cos(phaseC) * 0.05
        );
        vec3 waterNormal = normalize(vec3(-waterSlope.x * ${WATER_NORMAL_STRENGTH.toFixed(1)}, 1.0, -waterSlope.y * ${WATER_NORMAL_STRENGTH.toFixed(1)}));
        vec3 viewDirection = normalize(-vViewDirection);
        float facing = max(dot(waterNormal, viewDirection), 0.0);
        float fresnel = pow(1.0 - facing, ${WATER_FRESNEL_POWER.toFixed(1)});
        float sunVisibility = smoothstep(-0.08, 0.08, uSunDirection.y);
        float specular = pow(max(dot(reflect(-uSunDirection, waterNormal), viewDirection), 0.0), ${WATER_SPECULAR_POWER.toFixed(1)});
        float waveHeight = (shimmer - 0.5) * 0.5;
        float foam = smoothstep(${WATER_FOAM_THRESHOLD.toFixed(2)}, 0.98, shimmer) * (0.25 + fresnel * 0.75);
        vec2 causticUv = vWorldPosition.xz * 0.055 + vec2(uTime * 0.006, -uTime * 0.004);
        float causticPattern = texture2D(uCloudMap, causticUv).r;
        float caustic = smoothstep(${WATER_CAUSTIC_THRESHOLD_START.toFixed(2)}, ${WATER_CAUSTIC_THRESHOLD_END.toFixed(2)}, causticPattern)
          * ${WATER_CAUSTIC_STRENGTH.toFixed(2)}
          * (0.35 + facing * 0.65);
        vec3 darkWater = vec3(${WATER_DARK_R}, ${WATER_DARK_G}, ${WATER_DARK_B});
        vec3 lightWater = vec3(${WATER_LIGHT_R}, ${WATER_LIGHT_G}, ${WATER_LIGHT_B});
        // The material band carries the sampled column depth, so a deep ocean
        // darkens toward a bounded floor without a second vertex attribute.
        float waterDepth = clamp(vMaterial - ${SURFACE_MATERIAL_WATER.toFixed(1)}, 0.0, 1.0);
        vec3 deepWater = vec3(${WATER_DEPTH_FLOOR_R.toFixed(3)}, ${(WATER_DARK_G * 0.5).toFixed(3)}, ${(WATER_DARK_B * 0.6).toFixed(3)});
        vec3 depthAlbedo = mix(textureColor.rgb * lightWater, deepWater, waterDepth * ${WATER_DEPTH_TINT_STRENGTH.toFixed(2)});
        vec3 shallowWater = mix(darkWater, depthAlbedo, 0.24);
        float waterTone = clamp(0.18 + facing * 0.48 + waveHeight * 0.38, 0.0, 1.0);
        vec3 waterColor = mix(darkWater, shallowWater, waterTone);
        waterColor = mix(waterColor, uSkyHorizonColor, 0.08 + fresnel * 0.34);
        waterColor += uSunColor * specular * 0.96 * sunVisibility;
        waterColor += vec3(0.16, 0.72, 0.64) * caustic;
        float foamFade = 1.0 - smoothstep(28.0, 72.0, length(vViewDirection));
        waterColor += vec3(0.32, 0.78, 0.78) * foam * foamFade * ${WATER_FOAM_STRENGTH.toFixed(2)};
        texturedColor = waterColor * mix(vec3(0.72, 0.84, 1.0), vec3(1.0), uDaylight);
        alpha = 0.7 + fresnel * 0.12 + foam * 0.1;
` : `
        vec3 fallbackWater = mix(
          vec3(${WATER_DARK_R}, ${WATER_DARK_G}, ${WATER_DARK_B}),
          vec3(${WATER_LIGHT_R}, ${WATER_LIGHT_G}, ${WATER_LIGHT_B}),
          0.5 + textureColor.r * 0.18
        );
        fallbackWater = mix(fallbackWater, uSkyHorizonColor, 0.12);
        texturedColor = fallbackWater * mix(vec3(0.72, 0.84, 1.0), vec3(1.0), uDaylight);
        alpha = 0.72;
`;
  // The material channel is a band: water is [WATER, LAVA) and carries its
  // depth inside the band, so the branches test band bounds, not equality.
  // GLSL ES 1.00 has no implicit int-to-float promotion, so the bounds are
  // emitted as float literals.
  const waterLow = SURFACE_MATERIAL_WATER.toFixed(1);
  const lavaLow = SURFACE_MATERIAL_LAVA.toFixed(1);
  const fireLow = SURFACE_MATERIAL_FIRE.toFixed(1);
  const fireHigh = (SURFACE_MATERIAL_FIRE + 1).toFixed(1);
  const surfaceVertexAnimation = advancedWater ? `
      if (uSurfacePass > 0.5 && aMaterial >= ${waterLow} && aMaterial < ${lavaLow}) {
        position.y += 0.028 * sin(uTime * 1.6 + position.x * 0.38 + position.z * 0.27)
          + 0.012 * sin(uTime * 2.7 - position.z * 0.19 + position.x * 0.11);
      }
      if (uSurfacePass < 0.5 && aMaterial >= ${fireLow} && aMaterial < ${fireHigh}) {
        position.x += 0.025 * sin(uTime * 1.2 + position.x * 0.4 + position.z * 0.27);
        position.z += 0.018 * cos(uTime * 1.05 + position.z * 0.32 + position.x * 0.18);
      }
` : "";

  const vertexSource = `
    precision highp float;
    attribute vec3 aPosition;
    attribute vec3 aColor;
    attribute vec2 aUV;
    attribute float aMaterial;
    attribute vec4 aTileRect;
    uniform mat4 uViewProjection;
    uniform vec3 uCamera;
    uniform float uTime;
    uniform float uSurfacePass;
    varying vec3 vColor;
    varying vec2 vUV;
    varying vec3 vWorldPosition;
    varying vec3 vViewDirection;
    varying float vMaterial;
    varying vec4 vTileRect;
    varying float vFog;
    varying float vAerialFog;
    void main() {
      vec3 position = aPosition;
${surfaceVertexAnimation}
      vColor = aColor;
      vUV = aUV;
      vWorldPosition = position;
      vViewDirection = position - uCamera;
      vMaterial = aMaterial;
      vTileRect = aTileRect;
      vFog = clamp((distance(position, uCamera) - ${TERRAIN_FOG_START.toFixed(1)}) / ${Number(fogDistance).toFixed(1)}, 0.0, 1.0);
      float heightAttenuation = exp(-max(position.y - uCamera.y, 0.0) * ${AERIAL_FOG_HEIGHT_FALLOFF.toFixed(3)});
      vAerialFog = clamp(vFog * (${AERIAL_FOG_MIN_DENSITY.toFixed(2)} + ${(1 - AERIAL_FOG_MIN_DENSITY).toFixed(2)} * heightAttenuation), 0.0, 1.0);
      gl_Position = uViewProjection * vec4(position, 1.0);
    }
  `;
  const fragmentSource = `
    #ifdef GL_FRAGMENT_PRECISION_HIGH
    precision highp float;
    #else
    precision mediump float;
    #endif
    varying vec3 vColor;
    varying vec2 vUV;
    varying vec3 vWorldPosition;
    varying vec3 vViewDirection;
    varying float vMaterial;
    varying vec4 vTileRect;
    varying float vFog;
    varying float vAerialFog;
    uniform float uDaylight;
    uniform vec3 uSkyColor;
    uniform vec3 uSkyHorizonColor;
    uniform vec3 uSunDirection;
    uniform vec3 uSunColor;
    uniform sampler2D uAtlas;
    uniform sampler2D uCloudMap;
    uniform float uTime;
    uniform float uSurfacePass;
    uniform float uShadowPass;
    uniform float uMiningProgress;

    void main() {
      vec2 localUv = fract(vUV);
      bool miningPass = vTileRect.x < -0.5;
      vec2 tileUv = mix(vTileRect.xy, vTileRect.zw, localUv);
      vec4 textureColor = miningPass ? vec4(1.0) : texture2D(uAtlas, tileUv);
      float materialVariation = fract(sin(dot(floor(vWorldPosition.xz), vec2(${TERRAIN_VARIATION_X}, ${TERRAIN_VARIATION_Z}))) * ${TERRAIN_VARIATION_SEED});

      // Stage 1 - albedo: the material sample plus its authored variation, with
      // no lighting folded in yet.
      float surfaceRoughness = ${MATERIAL_ROUGHNESS_MIN} + (${MATERIAL_ROUGHNESS_MAX} - ${MATERIAL_ROUGHNESS_MIN}) * materialVariation;
      float detailAmount = textureColor.r;
      float detailAmplitude = ${MATERIAL_DETAIL_STRENGTH} * (0.5 + 0.5 * surfaceRoughness);
      float detail = 1.0 + detailAmplitude * (clamp(detailAmount, 0.0, 1.0) * 2.0 - 1.0);
      vec3 albedo = vColor * textureColor.rgb * mix(${TERRAIN_MATERIAL_VARIATION_MIN}, ${TERRAIN_MATERIAL_VARIATION_MAX}, materialVariation) * detail;

      // Stage 2 - lighting: the day/ambient model over the albedo.
      vec3 coolLight = vec3(0.95, 0.99, 1.06);
      vec3 warmLight = vec3(1.05, 1.01, 0.94);
      vec3 litColor = albedo * mix(coolLight, warmLight, uDaylight) * uDaylight;
      litColor += uSkyHorizonColor * 0.012 * (0.35 + uDaylight * 0.65);
      vec3 moonFill = vec3(0.1, 0.14, 0.23) * (1.0 - uDaylight) * ${MOON_FILL_STRENGTH.toFixed(2)};
      litColor += moonFill * albedo;
      float nightAmbient = (1.0 - smoothstep(0.18, 0.55, uDaylight)) * ${NIGHT_AMBIENT_STRENGTH.toFixed(2)};
      litColor += vec3(${NIGHT_AMBIENT_R}, ${NIGHT_AMBIENT_G}, 0.09) * nightAmbient;

      // Stage 3 - material lobe: a roughness-controlled specular highlight.
      vec3 materialView = normalize(-vViewDirection);
      float materialFacing = max(dot(vec3(0.0, 1.0, 0.0), materialView), 0.0);
      float materialSpecular = ${MATERIAL_SPECULAR_STRENGTH.toFixed(3)} * pow(materialFacing, ${MATERIAL_SPECULAR_POWER.toFixed(1)}) * (1.0 - surfaceRoughness);
      vec3 texturedColor = litColor + uSunColor * materialSpecular * smoothstep(-0.08, 0.08, uSunDirection.y);
      float alpha = textureColor.a;
      if (uShadowPass > 0.5) {
        texturedColor = vec3(0.015, 0.02, 0.018);
        vec2 shadowUv = vUV * 2.0 - 1.0;
        float shadowDistance = length(shadowUv);
        float softness = 1.0 - smoothstep(0.38, 1.0, shadowDistance);
        alpha = 0.28 * softness * (1.0 - vFog * 0.65);
      } else if (miningPass) {
        vec2 fractureUv = vUV * 4.0 + floor(uMiningProgress * 6.0);
        float fractureA = 1.0 - smoothstep(0.0, 0.045, abs(fractureUv.x + fractureUv.y) - 0.5);
        float fractureB = 1.0 - smoothstep(0.0, 0.045, abs(fractureUv.x - fractureUv.y) - 0.5);
        float fracture = max(fractureA, fractureB) * step(${MINING_FRACTURE_PROGRESS}, uMiningProgress);
        texturedColor = vec3(0.04, 0.045, 0.04);
        alpha = 0.14 + fracture * 0.72;
      } else if (uSurfacePass > 0.5 && vMaterial >= ${waterLow} && vMaterial < ${lavaLow}) {
${waterFragment}
      } else if (uSurfacePass > 0.5 && vMaterial >= ${lavaLow} && vMaterial < ${fireLow}) {
        texturedColor *= 1.0 + ${LAVA_PULSE_AMPLITUDE} * sin(uTime * ${LAVA_PULSE_SPEED} + vWorldPosition.x * ${LAVA_PULSE_SPATIAL_FREQUENCY});
        alpha = max(alpha, ${LAVA_ALPHA});
      } else if (uSurfacePass > 0.5 && vMaterial >= ${fireLow} && vMaterial < ${fireHigh}) {
        texturedColor *= 1.0 + ${FIRE_PULSE_AMPLITUDE} * sin(uTime * ${FIRE_PULSE_SPEED.toFixed(1)} + vWorldPosition.y * ${FIRE_PULSE_SPATIAL_FREQUENCY.toFixed(1)});
        alpha = max(alpha, ${FIRE_ALPHA});
      }

      vec3 fogColor = mix(uSkyHorizonColor, uSkyColor, 0.58);
      vec3 gradedColor = clamp(texturedColor, 0.0, 1.0);
      gl_FragColor = vec4(mix(gradedColor, fogColor, vAerialFog), mix(alpha, 0.0, vAerialFog));
    }
  `;
  return { vertexSource, fragmentSource };
}

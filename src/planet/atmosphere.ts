import * as THREE from 'three'
import { CONFIG } from '../config'

const VERT = /* glsl */ `
out vec3 vWorldPos;
void main() {
  vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

/**
 * Single-scattering Rayleigh + Mie, ray-marched through the atmosphere shell
 * with a nested optical-depth march toward the star. Renders additively on a
 * back-side sphere so it works from space AND with the camera inside the
 * atmosphere. Sample points shadowed by the planet body contribute nothing,
 * so the night side and the terminator sunset band come out of the physics.
 */
const FRAG = /* glsl */ `
precision highp float;
in vec3 vWorldPos;
out vec4 fragColor;

uniform vec3 uCenter;
uniform vec3 uSunPos;
uniform float uPlanetR;
uniform float uAtmoR;
uniform vec3 uBetaR;
uniform float uBetaM;
uniform float uHr;
uniform float uHm;
uniform float uG;
uniform float uIntensity;
uniform float uExposure;
uniform int uSamples;
uniform int uLightSamples;

const float PI = 3.141592653589793;
const float INF = 1e12;

/** Ray/sphere: returns (tNear, tFar), tNear > tFar when there is no hit. */
vec2 raySphere(vec3 ro, vec3 rd, vec3 c, float r) {
  vec3 oc = ro - c;
  float b = dot(oc, rd);
  float disc = b * b - (dot(oc, oc) - r * r);
  if (disc < 0.0) return vec2(INF, -INF);
  float s = sqrt(disc);
  return vec2(-b - s, -b + s);
}

void main() {
  vec3 ro = cameraPosition;
  vec3 rd = normalize(vWorldPos - cameraPosition);

  vec2 hit = raySphere(ro, rd, uCenter, uAtmoR);
  float t0 = max(hit.x, 0.0);
  float t1 = hit.y;
  // Stop at the ground: the planet body occludes the far half of the shell.
  vec2 ground = raySphere(ro, rd, uCenter, uPlanetR);
  if (ground.x > 0.0) t1 = min(t1, ground.x);
  if (t1 <= t0) { fragColor = vec4(0.0); return; }

  float ds = (t1 - t0) / float(uSamples);
  vec3 p = ro + rd * (t0 + 0.5 * ds);
  vec3 sumR = vec3(0.0);
  vec3 sumM = vec3(0.0);
  float odR = 0.0;
  float odM = 0.0;

  for (int i = 0; i < uSamples; i++) {
    float h = length(p - uCenter) - uPlanetR;
    float dR = exp(-h / uHr) * ds;
    float dM = exp(-h / uHm) * ds;
    odR += dR;
    odM += dM;

    vec3 sunDir = normalize(uSunPos - p);
    // In the planet's shadow: no in-scattered sunlight at this sample.
    vec2 sg = raySphere(p, sunDir, uCenter, uPlanetR);
    if (sg.x > 0.0 && sg.y > 0.0) { p += rd * ds; continue; }

    float lFar = raySphere(p, sunDir, uCenter, uAtmoR).y;
    float lds = lFar / float(uLightSamples);
    vec3 lp = p + sunDir * 0.5 * lds;
    float lodR = 0.0;
    float lodM = 0.0;
    for (int j = 0; j < uLightSamples; j++) {
      float lh = length(lp - uCenter) - uPlanetR;
      lodR += exp(-lh / uHr) * lds;
      lodM += exp(-lh / uHm) * lds;
      lp += sunDir * lds;
    }

    vec3 attn = exp(-(uBetaR * (odR + lodR) + vec3(uBetaM) * 1.1 * (odM + lodM)));
    sumR += dR * attn;
    sumM += dM * attn;
    p += rd * ds;
  }

  float mu = dot(rd, normalize(uSunPos - uCenter));
  float mu2 = mu * mu;
  float g2 = uG * uG;
  float phaseR = 3.0 / (16.0 * PI) * (1.0 + mu2);
  float phaseM = 3.0 / (8.0 * PI) * ((1.0 - g2) * (1.0 + mu2)) /
    ((2.0 + g2) * pow(1.0 + g2 - 2.0 * uG * mu, 1.5));

  vec3 col = uIntensity * (phaseR * uBetaR * sumR + phaseM * uBetaM * sumM);
  col = 1.0 - exp(-col * uExposure);
  fragColor = vec4(col, 1.0);
}
`

export class Atmosphere {
  readonly mesh: THREE.Mesh
  private material: THREE.ShaderMaterial

  constructor(planetCenter: THREE.Vector3) {
    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uCenter: { value: planetCenter },
        uSunPos: { value: new THREE.Vector3(0, 0, 0) },
        uPlanetR: { value: 1 },
        uAtmoR: { value: 1 },
        uBetaR: { value: new THREE.Vector3() },
        uBetaM: { value: 0 },
        uHr: { value: 1 },
        uHm: { value: 1 },
        uG: { value: 0.76 },
        uIntensity: { value: 20 },
        uExposure: { value: 1 },
        uSamples: { value: 12 },
        uLightSamples: { value: 6 },
      },
      side: THREE.BackSide,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      // The shell is drawn behind the planet body; occlusion is handled by
      // clamping the ray march at the ground instead of the depth buffer.
      depthTest: false,
    })
    // Shell is oversized; the real atmosphere boundary is the uAtmoR uniform,
    // so the height slider works without rebuilding geometry.
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(CONFIG.radius * 1.4, 96, 64), this.material)
    this.mesh.renderOrder = 10
    this.mesh.frustumCulled = false
    this.mesh.name = 'atmosphere'
    this.update()
  }

  /** Sync uniforms from CONFIG.atmosphere — every parameter is live. */
  update() {
    const a = CONFIG.atmosphere
    const R = CONFIG.radius
    const u = this.material.uniforms
    this.mesh.visible = a.enabled
    u.uPlanetR.value = R
    u.uAtmoR.value = R * (1 + Math.min(a.height, 0.35))
    ;(u.uBetaR.value as THREE.Vector3).set(
      a.rayleighStrength * Math.pow(a.wavelengthB / a.wavelengthR, 4),
      a.rayleighStrength * Math.pow(a.wavelengthB / a.wavelengthG, 4),
      a.rayleighStrength,
    )
    u.uBetaM.value = a.mieStrength
    u.uHr.value = R * a.rayleighScaleHeight
    u.uHm.value = R * a.mieScaleHeight
    u.uG.value = a.mieG
    u.uIntensity.value = a.sunIntensity
    u.uExposure.value = a.exposure
    u.uSamples.value = Math.round(a.samples)
    u.uLightSamples.value = Math.round(a.lightSamples)
  }
}

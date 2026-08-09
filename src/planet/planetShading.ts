import * as THREE from 'three'

export interface PlanetShadingUniforms {
  uPlanetCenter: { value: THREE.Vector3 }
  uSunPos: { value: THREE.Vector3 }
}

/**
 * Analytic self-shadowing for the planet sphere: there is no shadow mapping,
 * so without this the star's point light reaches night-side cliff walls and
 * decorations (their normals are horizontal, and only the planet body — which
 * the light can't see — occludes them). Scales the point light's direct
 * contribution by a smooth terminator mask on the radial direction instead.
 */
export function applyPlanetDayMask(material: THREE.Material, u: PlanetShadingUniforms) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uPlanetCenter = u.uPlanetCenter
    shader.uniforms.uSunPos = u.uSunPos

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vUtopiaWorldPos;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
vec4 utopiaWP = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
	utopiaWP = instanceMatrix * utopiaWP;
#endif
vUtopiaWorldPos = ( modelMatrix * utopiaWP ).xyz;`,
      )

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vUtopiaWorldPos;
uniform vec3 uPlanetCenter;
uniform vec3 uSunPos;
float utopiaDayMask() {
	vec3 up = normalize( vUtopiaWorldPos - uPlanetCenter );
	vec3 toSun = normalize( uSunPos - uPlanetCenter );
	return smoothstep( -0.08, 0.18, dot( up, toSun ) );
}`,
      )
      .replace(
        '#include <lights_fragment_begin>',
        THREE.ShaderChunk.lights_fragment_begin.replace(
          'getPointLightInfo( pointLight, geometryPosition, directLight );',
          'getPointLightInfo( pointLight, geometryPosition, directLight );\n\t\tdirectLight.color *= utopiaDayMask();',
        ),
      )
  }
}

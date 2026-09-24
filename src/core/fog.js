// Replaces three.js' fog chunks with height-aware atmospheric fog that also
// glows warmer toward the sun. Must run before any material is compiled.
import * as THREE from 'three';

export function installAtmosphericFog(sunDir, sunTint) {
  const sd = `vec3(${sunDir.x.toFixed(5)}, ${sunDir.y.toFixed(5)}, ${sunDir.z.toFixed(5)})`;
  const st = `vec3(${sunTint.r.toFixed(4)}, ${sunTint.g.toFixed(4)}, ${sunTint.b.toFixed(4)})`;

  THREE.ShaderChunk.fog_pars_vertex = /* glsl */ `
#ifdef USE_FOG
  varying vec3 vFogWorldPos;
#endif
`;
  THREE.ShaderChunk.fog_vertex = /* glsl */ `
#ifdef USE_FOG
  vFogWorldPos = transpose( mat3( viewMatrix ) ) * ( mvPosition.xyz - viewMatrix[ 3 ].xyz );
#endif
`;
  THREE.ShaderChunk.fog_pars_fragment = /* glsl */ `
#ifdef USE_FOG
  uniform vec3 fogColor;
  varying vec3 vFogWorldPos;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
#endif
`;
  THREE.ShaderChunk.fog_fragment = /* glsl */ `
#ifdef USE_FOG
  vec3 fgRay = vFogWorldPos - cameraPosition;
  float fgDist = length( fgRay );
  vec3 fgDirN = fgRay / max( fgDist, 1e-3 );
  #ifdef FOG_EXP2
    // exponential height fog: density decays with altitude
    float fgK = 0.018;
    float fgCamY = max( cameraPosition.y, -20.0 );
    float fgDY = fgRay.y;
    float fgInt = abs( fgDY ) > 0.01 ? ( 1.0 - exp( -fgK * fgDY ) ) / ( fgK * fgDY ) : 1.0;
    float fgAmount = fogDensity * fgDist * exp( -fgK * fgCamY ) * fgInt;
    float fogFactor = 1.0 - exp( - fgAmount * fgAmount * 0.6 - fgAmount * 0.4 );
    fogFactor = clamp( fogFactor, 0.0, 0.92 );
  #else
    float fogFactor = smoothstep( fogNear, fogFar, fgDist );
  #endif
  float fgSun = pow( max( dot( fgDirN, ${sd} ), 0.0 ), 6.0 );
  // no sun glow in dark fog (indoors / labyrinth)
  vec3 fgCol = mix( fogColor, ${st}, fgSun * 0.4 * smoothstep( 0.12, 0.45, dot( fogColor, vec3( 0.3333 ) ) ) );
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fgCol, fogFactor );
#endif
`;
}

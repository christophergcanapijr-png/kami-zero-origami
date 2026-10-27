// Custom GLSL Shaders for KAMI // ZERO
// 1. Origami Facet Vertex & Fragment Shaders (Helical Shatter, Articulated Wing Kinematics, Iridescent Pearl & Seam Glow)
// 2. Volumetric Studio Background Shader (Obsidian + God-Rays + Core Halo)
// 3. Fullscreen Post-Processing Pass (Shockwave Refraction, Chromatic Aberration, Boom Flash)

export const origamiVertexShader = /* glsl */ `
  attribute vec3 aCentroid;
  attribute vec3 aShatterOffset;
  attribute vec4 aShatterRot; // xyz = axis, w = total rotation angle
  attribute vec3 aBarycentric;
  attribute vec4 aPartData;   // x = wingSide (-1,0,1), y = wingSpan (0..1), z = delay (0..1), w = partId (0=core, 1=wings, 2=tail/head)

  uniform float uTime;
  uniform float uProgress;     // 0.0 = shattered, 1.0 = folded
  uniform float uAssembled;    // 0.0 = stage 1, 1.0 = stage 2 revealed
  uniform float uWingImpulse;  // Extra gust impulse
  uniform float uFlapPhase;    // Advances ONLY while Wind Gust is active
  uniform float uFlapAmp;      // > 0 ONLY while Wind Gust is active (0 = wings stopped)
  uniform vec2 uPointer;       // Normalized pointer (-1..1)
  uniform float uHoldTension;  // 0..1 while user holds

  varying vec3 vNormal;
  varying vec3 vWorldPos;
  varying vec3 vViewDir;
  varying vec3 vBary;
  varying float vLocalProgress;
  varying float vSeamEnergy;
  varying float vPartId;
  varying vec2 vPaperUv;

  // Rodrigues' rotation formula around an arbitrary unit axis
  vec3 rotateAxis(vec3 p, vec3 axis, float angle) {
    float s = sin(angle);
    float c = cos(angle);
    return p * c + cross(axis, p) * s + axis * dot(axis, p) * (1.0 - c);
  }

  // Continuous, watertight 3-joint avian/origami flight kinematics evaluated at any 3D point p
  vec3 deformCraneFlight(vec3 p, float flapStrength, float cycle) {
    if (flapStrength <= 0.0001) return p;

    // Asymmetric avian stroke: powerful sweeping downstroke + feathered wrist-led recovery upstroke
    float primaryStroke = sin(cycle) + 0.18 * sin(2.0 * cycle - 0.7);
    float strokeVelocity = cos(cycle) + 0.36 * cos(2.0 * cycle - 0.7);

    vec3 pos = p;
    float side = sign(pos.x);
    float lx = abs(pos.x);

    // 1. Hierarchical 3-Joint Wing Articulation (Shoulder -> Mid-Wing Elbow -> Outer Feather Tip)
    if (lx > 0.20) {
      float spanNorm = clamp((lx - 0.22) / 3.06, 0.0, 1.0);

      // A. Shoulder Hinge (x = 0.22, y = 0.12): Primary vertical arc + subtle forward power sweep
      vec3 shoulderPivot = vec3(side * 0.22, 0.12, 0.04);
      float shoulderFlap = primaryStroke * 0.36 * flapStrength;
      float shoulderSweep = -strokeVelocity * 0.075 * flapStrength;

      vec3 relShoulder = pos - shoulderPivot;
      // Flap around longitudinal Z axis
      relShoulder = rotateAxis(relShoulder, vec3(0.0, 0.0, 1.0), shoulderFlap * side);
      // Forward/aft sweep around vertical Y axis
      relShoulder = rotateAxis(relShoulder, vec3(0.0, 1.0, 0.0), shoulderSweep * side);
      pos = shoulderPivot + relShoulder;

      // B. Mid-Wing Elbow Crease (lx > 1.10): Phase-delayed + folds downward on the recovery upstroke!
      float elbowWeight = smoothstep(0.22, 0.92, spanNorm);
      if (elbowWeight > 0.001) {
        vec3 elbowPivot = shoulderPivot + rotateAxis(vec3(side * 1.05, 0.28, 0.0), vec3(0.0, 0.0, 1.0), shoulderFlap * side);
        float elbowLagWave = sin(cycle - 0.78) + 0.15 * sin(2.0 * (cycle - 0.78));
        // Real birds tuck/fold the outer wing downward during the upstroke (when strokeVelocity > 0) to reduce drag
        float upstrokeFold = -max(0.0, strokeVelocity) * 0.26;
        float elbowAngle = (elbowLagWave * 0.32 + upstrokeFold) * elbowWeight * flapStrength;

        vec3 relElbow = pos - elbowPivot;
        relElbow = rotateAxis(relElbow, vec3(0.0, 0.0, 1.0), elbowAngle * side);
        pos = elbowPivot + relElbow;
      }

      // C. Outer Wingtip Whip (spanNorm > 0.55): Deep phase lag for fluid ribbon wave at the tips
      float tipWeight = smoothstep(0.52, 1.0, spanNorm);
      if (tipWeight > 0.001) {
        float tipWhipWave = sin(cycle - 1.48);
        float tipDeltaY = tipWhipWave * 0.24 * tipWeight * flapStrength;
        pos.y += tipDeltaY;
        pos.x -= abs(tipDeltaY) * 0.18 * side;
      }

      // D. Aerodynamic Chord Twist (Supination / Pronation along Z)
      // Trailing edge (-Z) pitches up during downstroke and feathers down during upstroke
      float aeroPitch = -strokeVelocity * (0.18 + spanNorm * 0.22) * spanNorm * flapStrength;
      float chordOffset = pos.z - 0.04;
      pos.y += sin(aeroPitch) * chordOffset;
      pos.z = 0.04 + cos(aeroPitch) * chordOffset;
    }

    // 2. Neck, Head & Tail Spire Secondary Aerodynamic Follow-Through
    if (lx <= 0.35) {
      // Forward neck & beak (+Z): counter-stabilizes the head in flight like a real crane
      float neckWeight = smoothstep(0.42, 1.98, p.z);
      if (neckWeight > 0.001) {
        float headNod = sin(cycle - 0.55) * 0.085 * neckWeight * flapStrength;
        pos.y += headNod;
        pos.z += cos(cycle - 0.55) * 0.03 * neckWeight * flapStrength;
      }

      // Swept-up tail spire (-Z): trails with a gentle vertical wave
      float tailWeight = smoothstep(0.42, 1.78, -p.z);
      if (tailWeight > 0.001) {
        float tailWave = sin(cycle - 1.05) * 0.11 * tailWeight * flapStrength;
        pos.y += tailWave;
      }
    }

    // 3. Newton's Third Law Body Lift & Subtle Flight Pitch
    // Body rises on the power downstroke (-sin(cycle - 0.45)) and dips gently on the recovery upstroke
    float bodyLift = -sin(cycle - 0.45) * 0.11 * flapStrength;
    float bodyPitch = cos(cycle - 0.35) * 0.038 * flapStrength;
    pos = rotateAxis(pos, vec3(1.0, 0.0, 0.0), bodyPitch);
    pos.y += bodyLift;

    return pos;
  }

  void main() {
    vBary = aBarycentric;
    vPartId = aPartData.w;

    // Staggered per-facet progress: core facets arrive slightly earlier, wingtips snap shut at the climax
    float delay = aPartData.z * 0.28;
    float localP = clamp((uProgress - delay) / (1.0 - delay), 0.0, 1.0);
    // Smooth quintic easing for buttery fold snap
    float easeP = localP * localP * localP * (localP * (localP * 6.0 - 15.0) + 10.0);
    vLocalProgress = easeP;

    float invP = 1.0 - easeP;
    vec3 localVert = position - aCentroid;

    // 1. Watertight Multi-Joint Avian Flight Kinematics (active ONLY while Wind Gust is active)
    float flapStrength = smoothstep(0.72, 1.0, uProgress) * uFlapAmp;

    vec3 animatedVert = deformCraneFlight(position, flapStrength, uFlapPhase);
    vec3 foldedCentroid = deformCraneFlight(aCentroid, flapStrength, uFlapPhase);
    vec3 foldedVert = animatedVert - foldedCentroid;

    // Recompute accurate dynamic surface normal along the flexing wing so light ripples across the folds
    vec3 animatedNormal = normal;
    if (flapStrength > 0.001) {
      vec3 tangent1 = normalize(localVert + vec3(0.0001, 0.0002, 0.0));
      vec3 bitangent = normalize(cross(normal, tangent1));
      tangent1 = normalize(cross(bitangent, normal));

      float eps = 0.04;
      vec3 p1 = deformCraneFlight(position + tangent1 * eps, flapStrength, uFlapPhase);
      vec3 p2 = deformCraneFlight(position + bitangent * eps, flapStrength, uFlapPhase);
      vec3 d1 = p1 - animatedVert;
      vec3 d2 = p2 - animatedVert;
      vec3 recomputedN = cross(d1, d2);
      if (length(recomputedN) > 0.00001) {
        recomputedN = normalize(recomputedN);
        if (dot(recomputedN, normal) < 0.0) {
          recomputedN = -recomputedN;
        }
        animatedNormal = recomputedN;
      }
    }

    // 2. Shattered Zero-G State & Helical Convergence Trajectory
    float idleFloatAngle = (uTime * (0.35 + aPartData.z * 0.45) + aShatterRot.w) * invP;
    float foldSpinAngle = invP * aShatterRot.w * 2.4;
    float totalAngle = idleFloatAngle + foldSpinAngle;

    // Slight scale down when shattered so facets read as distinct floating origami shards
    float facetScale = mix(0.82, 1.0, easeP);
    vec3 spunVert = rotateAxis(foldedVert * facetScale, normalize(aShatterRot.xyz), totalAngle);
    vec3 spunNormal = rotateAxis(animatedNormal, normalize(aShatterRot.xyz), totalAngle);

    // Helical swirl around the Y/Z axis as pieces pull inward
    float swirlTheta = invP * (2.2 + aPartData.z * 1.8);
    vec3 swirlOffset = aShatterOffset;
    float cosS = cos(swirlTheta);
    float sinS = sin(swirlTheta);
    swirlOffset.xz = mat2(cosS, -sinS, sinS, cosS) * swirlOffset.xz;

    // Idle zero-G bobbing + cursor magnetic ripple when shattered
    vec3 zeroGBob = vec3(
      sin(uTime * 0.9 + aPartData.z * 6.28) * 0.14,
      cos(uTime * 1.15 + aPartData.z * 9.42) * 0.18,
      sin(uTime * 0.75 + aPartData.y * 5.1) * 0.14
    ) * invP;

    // Cursor magnetic push/pull on shattered shards
    vec2 pointerWorld = uPointer * 2.4;
    vec2 toShard = (foldedCentroid.xy + swirlOffset.xy * invP) - pointerWorld;
    float distPointer = length(toShard);
    vec3 cursorPush = vec3(normalize(toShard + vec2(0.0001)) * ((1.0 - smoothstep(0.0, 2.2, distPointer)) * 0.35 * invP), 0.0);

    // Pre-boom high-frequency kinetic vibration when progress is 0.75 -> 0.99
    float preBoomTension = smoothstep(0.65, 0.98, uProgress) * (1.0 - smoothstep(0.985, 1.0, uProgress));
    vec3 vibration = vec3(
      sin(uTime * 55.0 + aPartData.z * 30.0),
      cos(uTime * 62.0 + aPartData.y * 40.0),
      sin(uTime * 48.0 + aPartData.x * 25.0)
    ) * (preBoomTension * 0.025);

    // Final vertex position in model space
    vec3 currentCentroid = foldedCentroid + swirlOffset * (invP * invP * 1.15) + zeroGBob + cursorPush + vibration;
    vec3 finalPos = currentCentroid + spunVert;

    vec4 worldPosition = modelMatrix * vec4(finalPos, 1.0);
    vWorldPos = worldPosition.xyz;
    vNormal = normalize(mat3(modelMatrix) * spunNormal);
    vViewDir = normalize(cameraPosition - worldPosition.xyz);
    vPaperUv = aCentroid.xz * 1.5 + localVert.xy * 3.0;

    // Seam light leakage peaks as the origami facets close in (0.55 -> 0.995)
    vSeamEnergy = smoothstep(0.35, 0.94, uProgress) * (1.0 - smoothstep(0.98, 1.0, uProgress) * 0.65) + uHoldTension * 0.25;

    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

export const origamiFragmentShader = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uProgress;
  uniform float uAssembled;
  uniform float uFocusPart; // -1 = none, 0 = core, 1 = wings, 2 = tail
  uniform float uDustStorm; // 0.0 = calm dusk, 1.0 = golden desert sandstorm

  varying vec3 vNormal;
  varying vec3 vWorldPos;
  varying vec3 vViewDir;
  varying vec3 vBary;
  varying float vLocalProgress;
  varying float vSeamEnergy;
  varying float vPartId;
  varying vec2 vPaperUv;

  // Procedural hash & 2D noise for handcrafted Japanese Kozo Washi paper fibers
  float hash21(vec2 p) {
    p = fract(p * vec2(234.34, 435.345));
    p += dot(p, p + 34.23);
    return fract(p.x * p.y);
  }

  float noise2D(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  // Multi-directional interlaced mulberry (Kozo) long-fiber paper texture
  float washiFiberPattern(vec2 uv) {
    // Stretched anisotropic noise along two intersecting fiber weave angles
    vec2 uvA = mat2(0.86, -0.5, 0.5, 0.86) * uv;
    vec2 uvB = mat2(0.5, 0.86, -0.86, 0.5) * uv;
    float strandA = noise2D(vec2(uvA.x * 55.0, uvA.y * 6.5));
    float strandB = noise2D(vec2(uvB.x * 48.0, uvB.y * 7.2) + vec2(17.3, 9.1));
    float finePulp = noise2D(uv * 38.0);
    return strandA * 0.42 + strandB * 0.38 + finePulp * 0.20;
  }

  void main() {
    // Handle double-sided origami paper normals
    vec3 N = normalize(vNormal);
    if (!gl_FrontFacing) {
      N = -N;
    }
    vec3 V = normalize(vViewDir);

    // Authentic handcrafted Japanese Kozo Washi fiber micro-relief & normal perturbation
    float fiberWeave = washiFiberPattern(vPaperUv);
    float fineGrain  = noise2D(vPaperUv * 95.0) - 0.5;
    float paperBump  = (fiberWeave - 0.5) * 0.85 + fineGrain * 0.35;
    N = normalize(N + vec3(paperBump * 0.11, paperBump * 0.09, fineGrain * 0.05));

    // Warm Golden-Hour / Desert Sun 3-Point Lighting + Subsurface Paper Translucency
    vec3 sunLightDir  = normalize(vec3(2.6, 3.6, 2.8));
    vec3 fillLightDir = normalize(vec3(-3.2, -1.0, 2.2));
    vec3 backLightDir = normalize(vec3(-0.8, 1.8, -3.2));

    // Soft wrap-around diffuse lighting characteristic of fibrous matte paper (Oren-Nayar approximation)
    float rawNdotL = dot(N, sunLightDir);
    float diffSun  = clamp((rawNdotL + 0.18) / 1.18, 0.0, 1.0);
    float diffFill = max(dot(N, fillLightDir), 0.0);
    float diffRim  = pow(max(dot(N, backLightDir), 0.0), 1.8);

    // Subsurface light transmission (SSS) when thin origami paper is backlit by the sun
    float backTranslucency = pow( clamp(dot(-N, sunLightDir) * 0.65 + 0.35, 0.0, 1.0), 2.2 );

    // Soft satin paper sheen (low-exponent broad highlight on pressed paper fibers)
    vec3 H = normalize(sunLightDir + V);
    float paperSheen = pow(max(dot(N, H), 0.0), 14.0) * (0.35 + fiberWeave * 0.65);

    float NdotV = max(dot(N, V), 0.0);
    float fresnel = pow(1.0 - NdotV, 2.8);

    // Two-Tone Authentic Origami Paper Palette:
    // Exterior (Front-Facing): Unbleached Natural Kozo Washi Ivory / Warm Cream Parchment
    vec3 washiSunlit  = vec3(0.965, 0.922, 0.835);
    vec3 washiMid     = vec3(0.875, 0.805, 0.695);
    vec3 washiShadow  = vec3(0.435, 0.345, 0.255);

    // Interior (Back-Facing): Traditional Kyoto Terracotta / Cinnabar Ochre Reverse Side
    vec3 terraSunlit  = vec3(0.845, 0.415, 0.255);
    vec3 terraMid     = vec3(0.685, 0.285, 0.165);
    vec3 terraShadow  = vec3(0.325, 0.125, 0.075);

    vec3 paperLight = gl_FrontFacing ? washiSunlit : terraSunlit;
    vec3 paperMid   = gl_FrontFacing ? washiMid    : terraMid;
    vec3 paperDark  = gl_FrontFacing ? washiShadow : terraShadow;

    // Valley fold ambient occlusion (facets deeper near core have richer warm crease shadows)
    float valleyAO = clamp(0.76 + 0.24 * length(vWorldPos.xy), 0.72, 1.05);

    vec3 basePaper = mix(paperDark, paperMid, smoothstep(0.0, 0.55, diffSun));
    basePaper = mix(basePaper, paperLight, smoothstep(0.35, 1.0, diffSun));
    basePaper *= valleyAO;

    // Add warm sky-bounce fill, subsurface paper glow, and organic fiber mottling
    vec3 sssColor = gl_FrontFacing ? vec3(1.0, 0.78, 0.42) : vec3(0.95, 0.48, 0.22);
    vec3 surfaceColor = basePaper;
    surfaceColor += vec3(0.88, 0.72, 0.54) * diffFill * 0.18;
    surfaceColor += sssColor * backTranslucency * 0.22;
    surfaceColor += vec3(1.0, 0.92, 0.76) * paperSheen * 0.18;
    surfaceColor += vec3(1.0, 0.84, 0.58) * (diffRim * 0.24 + fresnel * 0.16);
    surfaceColor += (fiberWeave - 0.5) * 0.065 + fineGrain * 0.035;

    // Barycentric distance to triangle crease/edge for realistic pressed Bone-Folder crease emboss
    float minBary = min(vBary.x, min(vBary.y, vBary.z));

    // Crisp scored paper ridge + recessed crease shadow trough
    float sharpCreaseRidge = 1.0 - smoothstep(0.002, 0.022, minBary);
    float creaseTrough     = smoothstep(0.015, 0.045, minBary) * (1.0 - smoothstep(0.045, 0.095, minBary));
    float wideSeamGlow     = 1.0 - smoothstep(0.0, 0.15, minBary);

    // Darken the recessed paper crease trough slightly, and brighten the burnished paper ridge
    surfaceColor *= (1.0 - creaseTrough * 0.14);
    vec3 burnishedEdge = mix(vec3(0.99, 0.95, 0.86), vec3(0.88, 0.68, 0.34), 0.45 + 0.35 * fiberWeave);
    surfaceColor = mix(surfaceColor, burnishedEdge, sharpCreaseRidge * 0.55);

    // Warm Kinpaku (24k Gold Leaf) & Amber Ember Seam Glow as folds lock together
    vec3 seamLightCol = mix(vec3(1.0, 0.76, 0.32), vec3(1.0, 0.92, 0.68), sin(uTime * 3.0 + vWorldPos.x * 2.0) * 0.5 + 0.5);
    float activeSeam = vSeamEnergy * (sharpCreaseRidge * 1.85 + wideSeamGlow * 0.65);
    surfaceColor += seamLightCol * activeSeam;

    // Interactive Spatial Card Hover Highlight
    if (uFocusPart >= 0.0 && abs(vPartId - uFocusPart) < 0.35) {
      float pulse = 0.55 + 0.45 * sin(uTime * 5.0);
      vec3 focusCol = mix(vec3(1.0, 0.78, 0.36), vec3(1.0, 0.94, 0.78), pulse);
      surfaceColor += focusCol * (0.18 + sharpCreaseRidge * 0.75);
    }

    // Realistic Desert Ochre Silt & Fine Sand Dusting on the Paper during Wind Gust
    if (uDustStorm > 0.001) {
      float siltNoise = noise2D(vPaperUv * 65.0 + vec2(uTime * 0.5, 0.0));
      float upwardCatch = clamp(N.y * 0.5 + 0.5, 0.0, 1.0);
      vec3 desertSilt = vec3(0.84, 0.62, 0.35);
      float dustCoat = (upwardCatch * 0.38 + sharpCreaseRidge * 0.45 + siltNoise * 0.25) * uDustStorm;
      surfaceColor = mix(surfaceColor, desertSilt, clamp(dustCoat * 0.48, 0.0, 0.55));
      surfaceColor += vec3(1.0, 0.80, 0.44) * diffRim * 0.32 * uDustStorm;
    }

    gl_FragColor = vec4(surfaceColor, 1.0);
  }
`;

// Fullscreen Desert Horizon, Rolling Dunes & Domain-Warped Volumetric Sandstorm Shader
export const bgVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.9999, 1.0);
  }
`;

export const bgFragmentShader = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uProgress;
  uniform float uAssembled;
  uniform float uDustStorm;
  uniform float uWindForce;
  uniform vec2 uPointer;
  uniform vec2 uResolution;

  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
      f.y
    );
  }

  // 5-octave FBM for realistic rolling desert dunes and turbulent haboob dust clouds
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    mat2 rot = mat2(0.80, 0.60, -0.60, 0.80);
    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p = rot * p * 2.03 + vec2(13.7, 29.3);
      a *= 0.5;
    }
    return v;
  }

  // Sharp wind-carved sand dune ridge function
  float duneRidge(float x, float freq, float phase) {
    float w = sin(x * freq + phase) + 0.35 * sin(x * freq * 2.1 - phase * 0.7);
    return 1.0 - abs(w) * 0.45;
  }

  void main() {
    vec2 aspect = vec2(uResolution.x / max(uResolution.y, 1.0), 1.0);
    vec2 centered = (vUv - 0.5) * aspect;
    vec2 pointerShift = uPointer * 0.08;

    // 1. Atmospheric Sky Gradient: Warm Craftsman Amber-Umber Dusk -> Sun-Bleached Sahara Sandstorm Sky
    float skyY = clamp(vUv.y, 0.0, 1.0);

    vec3 duskZenith  = vec3(0.09, 0.07, 0.06);
    vec3 duskMid     = vec3(0.22, 0.15, 0.10);
    vec3 duskHorizon = vec3(0.48, 0.31, 0.18);
    vec3 calmSky = mix(duskHorizon, duskMid, smoothstep(0.0, 0.52, skyY));
    calmSky = mix(calmSky, duskZenith, smoothstep(0.45, 1.0, skyY));

    vec3 stormZenith  = vec3(0.42, 0.27, 0.14);
    vec3 stormMid     = vec3(0.76, 0.53, 0.28);
    vec3 stormHorizon = vec3(0.96, 0.76, 0.46);
    vec3 stormSky = mix(stormHorizon, stormMid, smoothstep(0.0, 0.58, skyY));
    stormSky = mix(stormSky, stormZenith, smoothstep(0.48, 1.0, skyY));

    float stormBlend = clamp(uDustStorm * 0.85 + uWindForce * 0.35, 0.0, 1.0);
    vec3 col = mix(calmSky, stormSky, stormBlend);

    // 2. Saharan Sun Disc & Mie-Scattering Dust Halo
    vec2 sunPos = vec2(0.28 * aspect.x, 0.14) + pointerShift * 0.35;
    float sunDist = length(centered - sunPos);
    float sunDisc = exp(-sunDist * (6.5 + stormBlend * 2.5));
    float sunHalo = exp(-sunDist * (1.85 - stormBlend * 0.45));
    col += vec3(1.0, 0.88, 0.62) * sunDisc * (0.45 + 0.55 * stormBlend);
    col += vec3(0.96, 0.68, 0.34) * sunHalo * (0.28 + 0.45 * stormBlend);

    // 3. Multi-Layered Rolling Sahara Sand Dunes on the Horizon
    float px = centered.x - pointerShift.x * 0.6;

    // Far horizon dune range
    float farDuneH = 0.28 + 0.055 * duneRidge(px, 1.35, 0.4) + 0.02 * noise(vec2(px * 4.0, 1.0));
    float farDuneMask = 1.0 - smoothstep(farDuneH - 0.008, farDuneH + 0.008, vUv.y);
    vec3 farDuneCol = mix(vec3(0.28, 0.18, 0.11), vec3(0.68, 0.45, 0.23), stormBlend);
    // Wind-rippled sand micro-texture on the dunes
    float sandRipples = sin((px * 28.0 + vUv.y * 90.0) + sin(px * 8.0) * 3.0) * 0.5 + 0.5;
    farDuneCol *= 0.94 + 0.08 * sandRipples;
    col = mix(col, farDuneCol, farDuneMask * 0.88);

    // Mid-ground sweeping barchan dune with sunlit crest and shadowed leeward slope
    float midDuneH = 0.20 + 0.065 * duneRidge(px - 0.55, 1.85, 2.1) + 0.015 * noise(vec2(px * 6.0, 3.2));
    float midDuneMask = 1.0 - smoothstep(midDuneH - 0.006, midDuneH + 0.006, vUv.y);
    float crestSlope = cos((px - 0.55) * 1.85 + 2.1);
    vec3 midLitCol  = mix(vec3(0.38, 0.24, 0.14), vec3(0.84, 0.58, 0.30), stormBlend);
    vec3 midShadCol = mix(vec3(0.18, 0.11, 0.07), vec3(0.48, 0.30, 0.15), stormBlend);
    vec3 midDuneCol = mix(midShadCol, midLitCol, smoothstep(-0.35, 0.45, crestSlope));
    midDuneCol *= 0.93 + 0.09 * sandRipples;
    col = mix(col, midDuneCol, midDuneMask * 0.95);

    // Foreground low dune ridge
    float nearDuneH = 0.11 + 0.045 * duneRidge(px + 0.8, 2.4, 4.2);
    float nearDuneMask = 1.0 - smoothstep(nearDuneH - 0.005, nearDuneH + 0.005, vUv.y);
    vec3 nearDuneCol = mix(vec3(0.14, 0.09, 0.05), vec3(0.56, 0.36, 0.18), stormBlend);
    col = mix(col, nearDuneCol, nearDuneMask);

    // 4. Domain-Warped Photorealistic Volumetric Haboob Dust Clouds & Blowing Silt
    float activeDust = clamp(0.12 + uDustStorm * 0.88 + uWindForce * 0.65, 0.0, 1.0);
    float windScroll = uTime * (0.45 + uWindForce * 2.6 + uDustStorm * 0.85);

    // Domain warping for authentic billowing turbulent sandstorm clouds
    vec2 dustUv = vec2(centered.x * 1.35 + windScroll, centered.y * 2.4 - 0.15 * sin(uTime * 0.4));
    vec2 q = vec2(
      fbm(dustUv + vec2(0.0, 0.0)),
      fbm(dustUv + vec2(5.2, 1.3))
    );
    vec2 r = vec2(
      fbm(dustUv + 2.8 * q + vec2(1.7 + windScroll * 0.45, 9.2)),
      fbm(dustUv + 2.8 * q + vec2(8.3 + windScroll * 0.35, 2.8))
    );
    float billowCloud = fbm(dustUv + 2.2 * r);

    // Fast high-velocity horizontal sand sheets whipping across the screen during Wind Gust
    vec2 streakUv = vec2(centered.x * 0.65 + windScroll * 2.8, centered.y * 16.0 + q.y * 2.2);
    float sandSheet = fbm(streakUv);

    // Height-graded dust density (thickest near the dunes and mid-air, sunlit at the top)
    float heightFalloff = 1.0 - smoothstep(0.05, 0.92, vUv.y);
    float cloudAlpha = smoothstep(0.22, 0.82, billowCloud) * (0.45 + 0.55 * heightFalloff) * activeDust;

    vec3 darkDustTone = vec3(0.52, 0.33, 0.16);
    vec3 litDustTone  = vec3(0.97, 0.78, 0.48);
    vec3 dustColor    = mix(darkDustTone, litDustTone, clamp(billowCloud * 0.85 + sunHalo * 0.45, 0.0, 1.0));

    col = mix(col, dustColor, clamp(cloudAlpha * 0.82, 0.0, 0.88));
    col += vec3(0.98, 0.82, 0.52) * pow(sandSheet, 2.0) * (uWindForce * 0.42 + uDustStorm * 0.16);

    // 5. Warm Sun-Ray Shafts behind the Origami Crane
    float distCenter = length(centered - pointerShift * 0.3);
    float radialMask = exp(-distCenter * 2.1);
    float angle = atan(centered.y, centered.x);
    float rays = (sin(angle * 7.0 + uTime * 0.25) * 0.5 + 0.5) * (sin(angle * 13.0 - uTime * 0.18) * 0.5 + 0.5);
    col += vec3(1.0, 0.82, 0.48) * radialMask * rays * (0.14 + 0.22 * uProgress);

    gl_FragColor = vec4(col, 1.0);
  }
`;

// Fullscreen Post-Processing Pass: Shockwave Refraction + Realistic Desert Silt & Heat Haze + Boom Flash
export const postVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

export const postFragmentShader = /* glsl */ `
  precision highp float;

  uniform sampler2D tDiffuse;
  uniform float uTime;
  uniform float uProgress;
  uniform float uShockwave; // 0 -> 1 expanding shockwave ring on BOOM
  uniform float uFlash;     // 0 -> 1 warm gold-ivory bloom flash on BOOM
  uniform float uDustStorm; // 0 -> 1 desert sandstorm mode
  uniform float uWindForce; // 0 -> 1 active wind gust surge
  uniform vec2 uResolution;

  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
      f.y
    );
  }

  void main() {
    vec2 aspect = vec2(uResolution.x / max(uResolution.y, 1.0), 1.0);
    vec2 center = vec2(0.5, 0.5);
    vec2 dir = (vUv - center) * aspect;
    float dist = length(dir);
    vec2 normDir = dist > 0.0001 ? dir / dist : vec2(0.0);

    vec2 sampleUv = vUv;

    // 1. Realistic Desert Thermal Shimmer (Heat Haze) & Wind-Shear Distortion
    if (uDustStorm > 0.001 || uWindForce > 0.001) {
      float thermal = noise(vec2(vUv.x * 18.0 + uTime * 8.0, vUv.y * 28.0 - uTime * 5.0)) - 0.5;
      sampleUv.x += thermal * (uDustStorm * 0.0022 + uWindForce * 0.0055);
      sampleUv.y += thermal * (uDustStorm * 0.0014 + uWindForce * 0.0025);
    }

    // 2. Expanding radial shockwave refraction ring when BOOM triggers
    float waveRing = 0.0;
    if (uShockwave > 0.001 && uShockwave < 0.999) {
      float radius = uShockwave * 1.35;
      float ringWidth = 0.14;
      float diff = dist - radius;
      waveRing = exp(-(diff * diff) / (ringWidth * ringWidth)) * (1.0 - uShockwave);
      sampleUv -= (normDir / aspect) * waveRing * 0.055;
    }

    // 3. Subtle Optical Lens Dispersion + Directional Wind-Streak Blur
    float tensionChroma = smoothstep(0.45, 0.99, uProgress) * (1.0 - smoothstep(0.99, 1.0, uProgress)) * 0.007;
    float shockChroma = waveRing * 0.018 + uFlash * 0.01 + uWindForce * 0.005;
    float chromaAmount = (0.0008 + tensionChroma + shockChroma) * (0.4 + dist * 1.3);

    vec2 chromaOffset = (normDir / aspect) * chromaAmount + vec2(uWindForce * 0.006, 0.0);
    float r = texture2D(tDiffuse, sampleUv + chromaOffset).r;
    float g = texture2D(tDiffuse, sampleUv).g;
    float b = texture2D(tDiffuse, sampleUv - chromaOffset).b;
    vec3 color = vec3(r, g, b);

    // Anisotropic wind-driven sand motion blur during active gust
    if (uWindForce > 0.01) {
      vec3 gustBlur =
        texture2D(tDiffuse, sampleUv + vec2(0.011 * uWindForce, 0.0015 * uWindForce)).rgb * 0.35 +
        texture2D(tDiffuse, sampleUv + vec2(0.022 * uWindForce, 0.003 * uWindForce)).rgb * 0.20;
      color = mix(color, color * 0.52 + gustBlur, uWindForce * 0.58);
    }

    if (waveRing > 0.001) {
      color += vec3(1.0, 0.84, 0.50) * waveRing * 0.65;
    }

    // 4. Realistic Atmospheric Desert Silt Fog & Organic Film/Sand Grain
    float filmGrain = (hash(vUv * uResolution + vec2(uTime * 137.0, uTime * 59.0)) - 0.5);
    color += vec3(0.96, 0.86, 0.68) * filmGrain * 0.024;

    if (uDustStorm > 0.001 || uWindForce > 0.001) {
      float siltCloud = noise(vec2(vUv.x * 4.5 + uTime * (1.8 + uWindForce * 3.5), vUv.y * 7.5));
      float edgeDust = smoothstep(0.24, 1.22, dist) * (0.55 + 0.45 * siltCloud) * clamp(uDustStorm * 0.48 + uWindForce * 0.42, 0.0, 0.72);
      vec3 ochreHaze = vec3(0.84, 0.59, 0.31);
      color = mix(color, ochreHaze, edgeDust);
      color += vec3(0.98, 0.80, 0.48) * filmGrain * (uDustStorm * 0.045 + uWindForce * 0.085);
    }

    // 5. The "BOOM" Warm Gold-Parchment Flash Bloom
    if (uFlash > 0.001) {
      float centerBurst = exp(-dist * 1.65);
      vec3 flashTint = mix(vec3(1.0, 0.95, 0.84), vec3(0.98, 0.82, 0.52), dist * 0.7);
      color = mix(color, flashTint, clamp(uFlash * (0.65 + 0.55 * centerBurst), 0.0, 1.0));
    }

    // 6. Warm cinematic vignette
    float vignette = 1.0 - smoothstep(0.38, 1.42, dist);
    color *= mix(0.58, 1.0, vignette);

    gl_FragColor = vec4(color, 1.0);
  }
`;

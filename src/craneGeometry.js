import * as THREE from 'three';

/**
 * Generates a multi-faceted 3D Origami Crane (Orizuru / Phoenix) BufferGeometry
 * with per-facet shatter trajectories, barycentric coordinates, and wing articulation weights,
 * plus a secondary cloud of ambient 2.5D/3D depth paper shards.
 */
export function createOrigamiCraneGeometry() {
  const rawTriangles = [];

  // Deterministic pseudo-random helper for consistent art-directed shatter cloud
  let seed = 42;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };

  /**
   * Helper to add a triangle with optional subdivision so larger origami plates
   * split into multiple crisp interlocking triangular facets when shattered.
   * partId: 0 = core/body, 1 = wings, 2 = head/neck/tail
   */
  function addOrigamiPlate(pA, pB, pC, wingSide = 0, partId = 0, subdivide = 1) {
    if (subdivide === 2) {
      // Split into 4 watertight interlocking sub-triangles along exact edge midpoints
      const mAB = new THREE.Vector3().addVectors(pA, pB).multiplyScalar(0.5);
      const mBC = new THREE.Vector3().addVectors(pB, pC).multiplyScalar(0.5);
      const mCA = new THREE.Vector3().addVectors(pC, pA).multiplyScalar(0.5);

      addOrigamiPlate(pA, mAB, mCA, wingSide, partId, 0);
      addOrigamiPlate(mAB, pB, mBC, wingSide, partId, 0);
      addOrigamiPlate(mCA, mBC, pC, wingSide, partId, 0);
      addOrigamiPlate(mAB, mBC, mCA, wingSide, partId, 0);
      return;
    }

    if (subdivide === 1) {
      // Split into 2 crisp origami crease triangles along midpoint of BC
      const mBC = new THREE.Vector3().addVectors(pB, pC).multiplyScalar(0.5);
      addOrigamiPlate(pA, pB, mBC, wingSide, partId, 0);
      addOrigamiPlate(pA, mBC, pC, wingSide, partId, 0);
      return;
    }

    rawTriangles.push({
      a: pA.clone(),
      b: pB.clone(),
      c: pC.clone(),
      wingSide,
      partId,
    });
  }

  // Helper to add a symmetric pair (Right +X and Left -X) with identical subdivision topology
  function addSymmetricPlate(vA, vB, vC, isWing = false, partId = 0, subdivide = 1) {
    const pA = new THREE.Vector3(...vA);
    const pB = new THREE.Vector3(...vB);
    const pC = new THREE.Vector3(...vC);
    const startIdx = rawTriangles.length;
    addOrigamiPlate(pA, pB, pC, isWing ? 1 : 0, partId, subdivide);
    const endIdx = rawTriangles.length;

    // Mirror each generated sub-triangle across X=0 (swapping B and C to preserve outward winding)
    for (let i = startIdx; i < endIdx; i++) {
      const t = rawTriangles[i];
      rawTriangles.push({
        a: new THREE.Vector3(-t.a.x, t.a.y, t.a.z),
        b: new THREE.Vector3(-t.c.x, t.c.y, t.c.z),
        c: new THREE.Vector3(-t.b.x, t.b.y, t.b.z),
        wingSide: isWing ? -1 : 0,
        partId,
      });
    }
  }

  // ============================================================================
  // 1. CENTRAL DIAMOND BODY / BACK (PartId = 0: Core)
  // ============================================================================
  const topCrown = [0.0, 0.56, 0.05];
  const bellyKeel = [0.0, -0.34, 0.02];
  const frontChest = [0.0, 0.06, 0.78];
  const backHip = [0.0, 0.08, -0.78];
  const shoulderR = [0.34, 0.16, 0.04];
  const lowerFlankR = [0.28, -0.08, 0.04];
  const frontCreaseR = [0.22, 0.12, 0.44];
  const backCreaseR = [0.22, 0.12, -0.42];

  // Upper dorsal diamond facets
  addSymmetricPlate(topCrown, frontChest, frontCreaseR, false, 0, 1);
  addSymmetricPlate(topCrown, frontCreaseR, shoulderR, false, 0, 1);
  addSymmetricPlate(topCrown, shoulderR, backCreaseR, false, 0, 1);
  addSymmetricPlate(topCrown, backCreaseR, backHip, false, 0, 1);

  // Lower ventral origami body folds
  addSymmetricPlate(bellyKeel, frontCreaseR, frontChest, false, 0, 1);
  addSymmetricPlate(bellyKeel, lowerFlankR, frontCreaseR, false, 0, 0);
  addSymmetricPlate(bellyKeel, shoulderR, lowerFlankR, false, 0, 0);
  addSymmetricPlate(bellyKeel, backCreaseR, shoulderR, false, 0, 0);
  addSymmetricPlate(bellyKeel, backHip, backCreaseR, false, 0, 1);

  // ============================================================================
  // 2. ARTICULATED MULTI-FOLD WINGS (PartId = 1: Wings)
  // ============================================================================
  const wingMidLeadR = [1.32, 0.44, 0.42];
  const wingMidRidgeR = [1.45, 0.52, 0.04];
  const wingMidTrailR = [1.28, 0.36, -0.38];

  const wingOuterLeadR = [2.35, 0.72, 0.32];
  const wingOuterRidgeR = [2.52, 0.78, -0.06];
  const wingOuterTrailR = [2.15, 0.54, -0.46];

  const wingTipR = [3.28, 0.96, -0.22];

  // Inner shoulder-to-mid wing origami plates (uniform 4-way subdivision for smooth wing curvature)
  addSymmetricPlate(shoulderR, frontCreaseR, wingMidLeadR, true, 1, 2);
  addSymmetricPlate(shoulderR, wingMidLeadR, wingMidRidgeR, true, 1, 2);
  addSymmetricPlate(shoulderR, wingMidRidgeR, wingMidTrailR, true, 1, 2);
  addSymmetricPlate(shoulderR, wingMidTrailR, backCreaseR, true, 1, 2);

  // Mid-to-outer pleated wing foil
  addSymmetricPlate(wingMidLeadR, wingOuterLeadR, wingMidRidgeR, true, 1, 2);
  addSymmetricPlate(wingMidRidgeR, wingOuterLeadR, wingOuterRidgeR, true, 1, 2);
  addSymmetricPlate(wingMidRidgeR, wingOuterRidgeR, wingMidTrailR, true, 1, 2);
  addSymmetricPlate(wingMidTrailR, wingOuterRidgeR, wingOuterTrailR, true, 1, 2);

  // Swept razor-sharp outer wingtip feathers
  addSymmetricPlate(wingOuterLeadR, wingTipR, wingOuterRidgeR, true, 1, 2);
  addSymmetricPlate(wingOuterRidgeR, wingTipR, wingOuterTrailR, true, 1, 2);

  // ============================================================================
  // 3. SLENDER FOLDED NECK & REVERSE-FOLD HEAD / BEAK (PartId = 2)
  // ============================================================================
  const neckBaseTop = [0.0, 0.24, 0.55];
  const neckBaseSideR = [0.16, 0.04, 0.66];
  const neckMidFront = [0.0, 0.78, 1.15];
  const neckMidBack = [0.0, 0.88, 0.92];
  const neckMidSideR = [0.11, 0.82, 1.04];

  const headCrown = [0.0, 1.42, 1.24];
  const headCheekR = [0.08, 1.26, 1.32];
  const headThroat = [0.0, 1.16, 1.36];
  const beakTip = [0.0, 1.08, 1.98];

  // Lower neck spire
  addSymmetricPlate(neckBaseTop, neckBaseSideR, neckMidBack, false, 2, 1);
  addSymmetricPlate(neckBaseSideR, frontChest, neckMidFront, false, 2, 1);
  addSymmetricPlate(neckBaseSideR, neckMidFront, neckMidSideR, false, 2, 1);
  addSymmetricPlate(neckBaseSideR, neckMidSideR, neckMidBack, false, 2, 1);

  // Upper neck to crown
  addSymmetricPlate(neckMidBack, neckMidSideR, headCrown, false, 2, 1);
  addSymmetricPlate(neckMidSideR, neckMidFront, headCheekR, false, 2, 0);
  addSymmetricPlate(neckMidSideR, headCheekR, headCrown, false, 2, 1);
  addSymmetricPlate(neckMidFront, headThroat, headCheekR, false, 2, 0);

  // Pointed Origami Beak (reverse fold)
  addSymmetricPlate(headCrown, headCheekR, beakTip, false, 2, 1);
  addSymmetricPlate(headCheekR, headThroat, beakTip, false, 2, 1);

  // ============================================================================
  // 4. SWEPT-UP ORIGAMI TAIL SPIRE (PartId = 2)
  // ============================================================================
  const tailBaseTop = [0.0, 0.24, -0.54];
  const tailBaseSideR = [0.15, 0.04, -0.68];
  const tailMidFront = [0.0, 0.78, -1.06];
  const tailMidBack = [0.0, 0.68, -1.26];
  const tailMidSideR = [0.09, 0.72, -1.15];
  const tailTip = [0.0, 1.48, -1.78];

  addSymmetricPlate(tailBaseTop, tailMidFront, tailBaseSideR, false, 2, 1);
  addSymmetricPlate(tailBaseSideR, tailMidFront, tailMidSideR, false, 2, 1);
  addSymmetricPlate(tailBaseSideR, tailMidSideR, tailMidBack, false, 2, 1);
  addSymmetricPlate(tailBaseSideR, tailMidBack, backHip, false, 2, 1);

  addSymmetricPlate(tailMidFront, tailTip, tailMidSideR, false, 2, 1);
  addSymmetricPlate(tailMidSideR, tailTip, tailMidBack, false, 2, 1);

  // ============================================================================
  // BUILD NON-INDEXED BUFFER GEOMETRY WITH SHATTER & KINEMATIC ATTRIBUTES
  // ============================================================================
  const triCount = rawTriangles.length;
  const vertCount = triCount * 3;

  const positions = new Float32Array(vertCount * 3);
  const normals = new Float32Array(vertCount * 3);
  const centroids = new Float32Array(vertCount * 3);
  const shatterOffsets = new Float32Array(vertCount * 3);
  const shatterRots = new Float32Array(vertCount * 4);
  const barycentrics = new Float32Array(vertCount * 3);
  const partData = new Float32Array(vertCount * 4);

  const baryCoords = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];

  for (let i = 0; i < triCount; i++) {
    const tri = rawTriangles[i];
    const verts = [tri.a, tri.b, tri.c];

    // Triangle centroid
    const centroid = new THREE.Vector3()
      .add(tri.a)
      .add(tri.b)
      .add(tri.c)
      .divideScalar(3);

    // Face normal
    const edge1 = new THREE.Vector3().subVectors(tri.b, tri.a);
    const edge2 = new THREE.Vector3().subVectors(tri.c, tri.a);
    const faceNormal = new THREE.Vector3().crossVectors(edge1, edge2).normalize();

    // Art-directed outward explosion vector so the shattered state forms a balanced 3D spherical/elliptical cloud
    const radialDir = centroid.clone();
    if (radialDir.lengthSq() < 0.01) {
      radialDir.set(rand() - 0.5, rand() - 0.5, rand() - 0.5);
    }
    radialDir.normalize();

    const randomSpread = new THREE.Vector3(
      (rand() - 0.5) * 1.4,
      (rand() - 0.5) * 1.4,
      (rand() - 0.5) * 1.4
    );

    const explodeDir = radialDir
      .multiplyScalar(0.65)
      .addScaledVector(faceNormal, 0.35)
      .add(randomSpread)
      .normalize();

    const explodeDist = 1.65 + rand() * 2.55;
    const shatterOffset = explodeDir.multiplyScalar(explodeDist);

    // Random rotation axis & spin magnitude
    const rotAxis = new THREE.Vector3(
      rand() - 0.5,
      rand() - 0.5,
      rand() - 0.5
    ).normalize();
    const rotAngle = (rand() * 1.8 + 0.8) * Math.PI * (rand() > 0.5 ? 1 : -1);

    // Wing span weight (0 at shoulder, 1 at wingtip)
    const wingSpan = tri.wingSide !== 0 ? Math.min(Math.abs(centroid.x) / 3.28, 1.0) : 0.0;

    // Stagger delay: core folds first (low delay), wingtips & beak fold last (high delay)
    const distFromCenter = Math.min(centroid.length() / 3.4, 1.0);
    const staggerDelay = distFromCenter * 0.75 + rand() * 0.25;

    for (let v = 0; v < 3; v++) {
      const idx3 = (i * 3 + v) * 3;
      const idx4 = (i * 3 + v) * 4;
      const p = verts[v];

      positions[idx3] = p.x;
      positions[idx3 + 1] = p.y;
      positions[idx3 + 2] = p.z;

      normals[idx3] = faceNormal.x;
      normals[idx3 + 1] = faceNormal.y;
      normals[idx3 + 2] = faceNormal.z;

      centroids[idx3] = centroid.x;
      centroids[idx3 + 1] = centroid.y;
      centroids[idx3 + 2] = centroid.z;

      shatterOffsets[idx3] = shatterOffset.x;
      shatterOffsets[idx3 + 1] = shatterOffset.y;
      shatterOffsets[idx3 + 2] = shatterOffset.z;

      shatterRots[idx4] = rotAxis.x;
      shatterRots[idx4 + 1] = rotAxis.y;
      shatterRots[idx4 + 2] = rotAxis.z;
      shatterRots[idx4 + 3] = rotAngle;

      barycentrics[idx3] = baryCoords[v][0];
      barycentrics[idx3 + 1] = baryCoords[v][1];
      barycentrics[idx3 + 2] = baryCoords[v][2];

      partData[idx4] = tri.wingSide;
      partData[idx4 + 1] = wingSpan;
      partData[idx4 + 2] = staggerDelay;
      partData[idx4 + 3] = tri.partId;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute('aCentroid', new THREE.BufferAttribute(centroids, 3));
  geometry.setAttribute('aShatterOffset', new THREE.BufferAttribute(shatterOffsets, 3));
  geometry.setAttribute('aShatterRot', new THREE.BufferAttribute(shatterRots, 4));
  geometry.setAttribute('aBarycentric', new THREE.BufferAttribute(barycentrics, 3));
  geometry.setAttribute('aPartData', new THREE.BufferAttribute(partData, 4));

  return { geometry, facetCount: triCount };
}

/**
 * Creates an instanced cloud of secondary floating micro-origami paper shards
 * in foreground and background depth layers for 2.5D/3D parallax.
 */
export function createAmbientPaperShards(count = 110) {
  const shardGeo = new THREE.BufferGeometry();
  const vertices = new Float32Array([
    0.0, 0.08, 0.0,
    -0.065, -0.05, 0.01,
    0.075, -0.04, -0.01,
  ]);
  shardGeo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  shardGeo.computeVertexNormals();

  const shardMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#f3e6ce'),
    emissive: new THREE.Color('#4a2c14'),
    emissiveIntensity: 0.28,
    roughness: 0.68,
    metalness: 0.04,
    clearcoat: 0.08,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.86,
  });

  const mesh = new THREE.InstancedMesh(shardGeo, shardMat, count);
  const shardMeta = [];
  const dummy = new THREE.Object3D();

  for (let i = 0; i < count; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const radius = 2.6 + Math.random() * 5.8;

    const basePos = new THREE.Vector3(
      radius * Math.sin(phi) * Math.cos(theta) * 1.35,
      radius * Math.sin(phi) * Math.sin(theta) * 0.95,
      radius * Math.cos(phi) * 0.85
    );

    const scale = 0.45 + Math.random() * 1.55;
    const rotSpeed = new THREE.Vector3(
      (Math.random() - 0.5) * 1.5,
      (Math.random() - 0.5) * 1.5,
      (Math.random() - 0.5) * 1.5
    );

    dummy.position.copy(basePos);
    dummy.scale.setScalar(scale);
    dummy.rotation.set(
      Math.random() * Math.PI,
      Math.random() * Math.PI,
      Math.random() * Math.PI
    );
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);

    shardMeta.push({
      basePos,
      scale,
      rotSpeed,
      phase: Math.random() * Math.PI * 2,
      depthFactor: (basePos.z + 5.0) / 10.0,
    });
  }

  return { mesh, shardMeta, dummy };
}

/**
 * Creates a realistic 3D Desert Sand & Volumetric Dust Storm particle system (3,600 particles):
 * - 72% Fine Quartz & Ochre Mineral Sand Grains with wind-velocity motion-streak elongation
 * - 28% Large Volumetric Procedural FBM Dust-Cloud Billows that roll around the 3D crane
 */
export function createDesertSandstorm(count = 3600) {
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const randoms = new Float32Array(count * 4); // x = speed, y = size, z = phase, w = type/seed (<0.72 grain, >=0.72 volumetric dust cloud)

  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    const i4 = i * 4;

    positions[i3] = (Math.random() - 0.5) * 20.0;
    positions[i3 + 1] = (Math.random() - 0.5) * 11.0;
    positions[i3 + 2] = (Math.random() - 0.5) * 12.0;

    randoms[i4] = 0.65 + Math.random() * 1.85;    // wind speed multiplier
    randoms[i4 + 1] = 0.4 + Math.random() * 2.2;  // base size
    randoms[i4 + 2] = Math.random() * Math.PI * 2; // turbulence phase
    randoms[i4 + 3] = Math.random();              // < 0.72 = mineral sand grain, >= 0.72 = volumetric dust billow
  }

  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aSandData', new THREE.BufferAttribute(randoms, 4));

  const uniforms = {
    uTime: { value: 0 },
    uDustStorm: { value: 0 },   // 0 = calm dusk, 1 = desert dust storm
    uWindForce: { value: 0 },   // active wind gust intensity
    uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    vertexShader: /* glsl */ `
      attribute vec4 aSandData;

      uniform float uTime;
      uniform float uDustStorm;
      uniform float uWindForce;
      uniform float uPixelRatio;

      varying float vAlpha;
      varying float vSeed;
      varying float vPhase;
      varying float vWindStreak;

      void main() {
        vSeed = aSandData.w;
        vPhase = aSandData.z;
        vec3 p = position;

        bool isDustCloud = (vSeed >= 0.72);

        // Horizontal desert gale velocity (whips from right to left & slightly toward camera)
        float speedMult = isDustCloud ? 0.55 : 1.15;
        float stormSpeed = (0.85 + uDustStorm * 5.8 + uWindForce * 11.5) * aSandData.x * speedMult;
        float travelX = mod(p.x - uTime * stormSpeed + 10.0, 20.0) - 10.0;

        // Turbulent swirling vortex eddies & saltation bounce for sand grains
        float eddyY = sin(uTime * 2.8 * aSandData.x + travelX * 0.55 + aSandData.z) * (0.12 + uDustStorm * 0.55 + uWindForce * 0.75);
        float eddyZ = cos(uTime * 2.2 * aSandData.x + travelX * 0.42 + aSandData.z) * (0.12 + uDustStorm * 0.45);

        vec3 finalPos = vec3(travelX, p.y + eddyY, p.z + eddyZ);

        vec4 mvPosition = modelViewMatrix * vec4(finalPos, 1.0);
        gl_Position = projectionMatrix * mvPosition;

        vWindStreak = clamp(uWindForce * 0.85 + uDustStorm * 0.35, 0.0, 1.0);

        // Volumetric dust clouds are large soft billows; sand grains are fine mineral specks/streaks
        float baseSize = isDustCloud
          ? (48.0 + aSandData.y * 58.0) * (0.45 + uDustStorm * 0.65 + uWindForce * 0.45)
          : (4.5 + aSandData.y * 8.5) * (0.55 + uDustStorm * 0.55 + uWindForce * 0.85);

        gl_PointSize = baseSize * uPixelRatio * (1.0 / max(-mvPosition.z, 0.6));

        // Fade softly at domain edges
        float edgeFade = 1.0 - smoothstep(6.0, 10.0, abs(travelX));
        float stormVisibility = clamp(0.08 + uDustStorm * 0.85 + uWindForce * 0.55, 0.0, 1.0);
        vAlpha = edgeFade * stormVisibility * (isDustCloud ? 0.34 : 0.82);
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;

      uniform float uTime;

      varying float vAlpha;
      varying float vSeed;
      varying float vPhase;
      varying float vWindStreak;

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

      void main() {
        vec2 uv = gl_PointCoord - 0.5;

        if (vSeed >= 0.72) {
          // LAYER B: Realistic Volumetric Procedural Dust-Cloud Billow
          float dist = length(uv);
          if (dist > 0.5) discard;

          float radialMask = smoothstep(0.0, 0.5, 0.5 - dist);
          vec2 noiseUv = uv * 3.6 + vec2(vPhase, vSeed * 11.0 + uTime * 0.25);
          float n1 = noise2D(noiseUv);
          float n2 = noise2D(noiseUv * 2.2 + vec2(4.1, 7.3));
          float cloudShape = (n1 * 0.65 + n2 * 0.35) * radialMask;

          // Lit top-right edge from desert sun, shaded bottom-left ochre underbelly
          float sunGrad = clamp((uv.x - uv.y) * 1.4 + 0.55, 0.0, 1.0);
          vec3 shadowSilt = vec3(0.58, 0.38, 0.20);
          vec3 sunlitSilt = vec3(0.94, 0.76, 0.48);
          vec3 cloudCol = mix(shadowSilt, sunlitSilt, sunGrad * 0.75 + n2 * 0.25);

          gl_FragColor = vec4(cloudCol, cloudShape * vAlpha);
        } else {
          // LAYER A: Fine Mineral Quartz & Ochre Sand Grain with Wind-Velocity Streak
          // Slight tilt along wind direction (-8 deg) and horizontal motion-blur compression of Y
          float c = 0.99;
          float s = -0.14;
          vec2 rotUv = mat2(c, -s, s, c) * uv;
          rotUv.y *= (1.0 + vWindStreak * 2.4);

          float d = length(rotUv);
          if (d > 0.48) discard;

          // Crisp mineral sand speck with irregular edge
          float grainCore = 1.0 - smoothstep(0.08, 0.46, d);

          vec3 darkOchre   = vec3(0.66, 0.42, 0.21);
          vec3 goldenSand  = vec3(0.92, 0.71, 0.41);
          vec3 quartzGlint = vec3(1.0, 0.93, 0.78);

          vec3 col = mix(darkOchre, goldenSand, fract(vSeed * 3.7));
          col = mix(col, quartzGlint, smoothstep(0.5, 0.72, vSeed) * 0.65);

          gl_FragColor = vec4(col, grainCore * vAlpha);
        }
      }
    `,
  });

  const points = new THREE.Points(geo, material);
  return { points, uniforms };
}


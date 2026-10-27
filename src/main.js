import * as THREE from 'three';
import gsap from 'gsap';
import {
  origamiVertexShader,
  origamiFragmentShader,
  bgVertexShader,
  bgFragmentShader,
  postVertexShader,
  postFragmentShader,
} from './shaders/origamiShaders.js';
import {
  createOrigamiCraneGeometry,
  createAmbientPaperShards,
  createDesertSandstorm,
} from './craneGeometry.js';
import { AudioController } from './audioController.js';

// ============================================================================
// APPLICATION STATE
// ============================================================================
const state = {
  progress: 0.0,            // 0.0 = shattered, 1.0 = folded
  targetProgress: 0.0,
  inputMode: 'scroll',      // 'scroll' | 'hold' | 'scrub'
  isHolding: false,
  isRevealed: false,        // Stage 1 (false) -> Stage 2 after BOOM (true)
  isWindActive: false,      // True ONLY while Wind Gust is active; false when stopped
  windGustCompleted: false, // True once the one-time Wind Gust reaches 100% and buries the button in sand
  windPressStartMs: 0,
  gustRevealProgress: 0.0,  // 0.0 -> 1.0 slowly while Wind Gust is active; freezes when stopped
  flapPhase: 0.0,           // Advances ONLY while Wind Gust is active
  flapAmp: 0.0,             // > 0 ONLY while Wind Gust is active (0 = wings stopped)
  isScrubbing: false,
  rearmedBoom: false,       // Fires mini-boom if user scrolls down below 40% in Stage 2 and reassembles to 100%
  lastScrollSoundStep: 0,
  scrollPolarity: 1,
  lastWheelTimeMs: 0,
  holdTension: 0.0,
  dustStorm: 0.0,           // 0.0 = obsidian studio, 1.0 = desert sandstorm active
  windForce: 0.0,           // 0.0 = calm, 1.0 = roaring desert gale
  pointer: new THREE.Vector2(0, 0),
  targetPointer: new THREE.Vector2(0, 0),
  cursorPx: { x: window.innerWidth * 0.5, y: window.innerHeight * 0.5 },
  targetCursorPx: { x: window.innerWidth * 0.5, y: window.innerHeight * 0.5 },
  cameraBasePos: new THREE.Vector3(0.0, 0.35, 6.2),
  cameraLookAt: new THREE.Vector3(0.0, 0.25, 0.0),
  targetLookAt: new THREE.Vector3(0.0, 0.25, 0.0),
  baseFov: 45,
};

const audio = new AudioController();

// ============================================================================
// DOM ELEMENTS
// ============================================================================
const canvas = document.getElementById('webgl');
const customCursor = document.getElementById('custom-cursor');
const cursorProgressCircle = document.getElementById('cursor-progress-circle');
const cursorLabel = document.getElementById('cursor-label');

const stageBadge = document.getElementById('stage-badge');
const audioToggleBtn = document.getElementById('audio-toggle');
const audioBars = document.getElementById('audio-bars');
const audioLabel = document.getElementById('audio-label');

const stageShatteredEl = document.getElementById('stage-shattered');
const stageRevealedEl = document.getElementById('stage-revealed');
const desertDustVeilEl = document.getElementById('desert-dust-veil');
const foldCounterEl = document.getElementById('fold-counter');
const counterStatusEl = document.getElementById('counter-status');
const shatterTitleEl = document.getElementById('shatter-title');
const titleCracksSvgEl = document.getElementById('title-cracks-svg');
const titleSplintersLayerEl = document.getElementById('title-splinters-layer');

const btnShatterReplay = document.getElementById('btn-shatter-replay');
const btnImpulseWing = document.getElementById('btn-impulse-wing');
const windGustBtnFill = document.getElementById('wind-gust-btn-fill');
const windGustSandVeil = document.getElementById('wind-gust-sand-veil');
const windGustBtnLabel = document.getElementById('wind-gust-btn-label');
const windGustHintEl = document.getElementById('wind-gust-hint');
const dustProgressiveEls = document.querySelectorAll('.dust-progressive');
const timelineScrubber = document.getElementById('timeline-scrubber');
const scrubberReadout = document.getElementById('scrubber-readout');
const spatialCards = document.querySelectorAll('.spatial-card');
const presetButtons = document.querySelectorAll('.preset-btn');

// ============================================================================
// THREE.JS RENDERER & 2-PASS POST-PROCESSING PIPELINE
// ============================================================================
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
  alpha: false,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

// Offscreen RenderTarget for 2-pass shockwave/bloom post-processing
let renderTarget = new THREE.WebGLRenderTarget(
  window.innerWidth * Math.min(window.devicePixelRatio, 2),
  window.innerHeight * Math.min(window.devicePixelRatio, 2),
  {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
  }
);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  state.baseFov,
  window.innerWidth / window.innerHeight,
  0.1,
  100
);
camera.position.copy(state.cameraBasePos);

// ============================================================================
// 1. STUDIO BACKGROUND, GOD-RAYS & DESERT SANDSTORM SHADER PASS
// ============================================================================
const bgUniforms = {
  uTime: { value: 0 },
  uProgress: { value: 0 },
  uAssembled: { value: 0 },
  uDustStorm: { value: 0 },
  uWindForce: { value: 0 },
  uPointer: { value: new THREE.Vector2(0, 0) },
  uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
};

const bgMaterial = new THREE.ShaderMaterial({
  vertexShader: bgVertexShader,
  fragmentShader: bgFragmentShader,
  uniforms: bgUniforms,
  depthWrite: false,
  depthTest: false,
});

const bgMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bgMaterial);
bgMesh.frustumCulled = false;
bgMesh.renderOrder = -10;
scene.add(bgMesh);

// ============================================================================
// 2. SHATTERED ORIGAMI CRANE MESH + INNER GLOWING CORE
// ============================================================================
const craneGroup = new THREE.Group();
scene.add(craneGroup);

const { geometry: craneGeo } = createOrigamiCraneGeometry();

const origamiUniforms = {
  uTime: { value: 0 },
  uProgress: { value: 0 },
  uAssembled: { value: 0 },
  uWingImpulse: { value: 0 },
  uFlapPhase: { value: 0 },
  uFlapAmp: { value: 0 },
  uPointer: { value: new THREE.Vector2(0, 0) },
  uHoldTension: { value: 0 },
  uFocusPart: { value: -1.0 },
  uDustStorm: { value: 0 },
};

const origamiMaterial = new THREE.ShaderMaterial({
  vertexShader: origamiVertexShader,
  fragmentShader: origamiFragmentShader,
  uniforms: origamiUniforms,
  side: THREE.DoubleSide,
});

const craneMesh = new THREE.Mesh(craneGeo, origamiMaterial);
craneGroup.add(craneMesh);

// Inner golden-amber core that glows softly inside the origami folds
const coreGeo = new THREE.OctahedronGeometry(0.26, 1);
const coreMat = new THREE.MeshBasicMaterial({
  color: new THREE.Color('#ffcf70'),
  wireframe: true,
  transparent: true,
  opacity: 0.14,
});
const coreMesh = new THREE.Mesh(coreGeo, coreMat);
coreMesh.position.set(0, 0.12, 0.05);
craneGroup.add(coreMesh);

// Warm golden-hour sunlight for the secondary instanced washi paper shards
const ambientLight = new THREE.AmbientLight('#ffe4ba', 1.35);
scene.add(ambientLight);

const dirLight1 = new THREE.DirectionalLight('#fff5e0', 2.5);
dirLight1.position.set(4, 6, 5);
scene.add(dirLight1);

const dirLight2 = new THREE.DirectionalLight('#e88a3a', 1.7);
dirLight2.position.set(-5, -3, 3);
scene.add(dirLight2);

// ============================================================================
// 3. SECONDARY AMBIENT 2.5D/3D DEPTH PAPER SHARDS & 3D DESERT SANDSTORM
// ============================================================================
const {
  mesh: shardInstancedMesh,
  shardMeta,
  dummy: shardDummy,
} = createAmbientPaperShards(110);
scene.add(shardInstancedMesh);

const {
  points: sandstormPoints,
  uniforms: sandstormUniforms,
} = createDesertSandstorm(3600);
scene.add(sandstormPoints);

// ============================================================================
// 4. FULLSCREEN SHOCKWAVE, FLASH & DESERT HEAT-HAZE POST-PROCESSING PASS
// ============================================================================
const postScene = new THREE.Scene();
const postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

const postUniforms = {
  tDiffuse: { value: renderTarget.texture },
  uTime: { value: 0 },
  uProgress: { value: 0 },
  uShockwave: { value: 0 },
  uFlash: { value: 0 },
  uDustStorm: { value: 0 },
  uWindForce: { value: 0 },
  uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
};

const postMaterial = new THREE.ShaderMaterial({
  vertexShader: postVertexShader,
  fragmentShader: postFragmentShader,
  uniforms: postUniforms,
  depthWrite: false,
  depthTest: false,
});

const postMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMaterial);
postScene.add(postMesh);

// ============================================================================
// CAMERA PRESETS & FOCUS TRANSITIONS (STAGE 2)
// ============================================================================
const CAMERA_PRESETS = {
  default: {
    pos: new THREE.Vector3(1.85, 1.15, 4.95),
    lookAt: new THREE.Vector3(-0.55, 0.22, 0.0),
    focusPart: -1.0,
  },
  wings: {
    pos: new THREE.Vector3(2.85, 1.65, 3.35),
    lookAt: new THREE.Vector3(0.75, 0.52, 0.05),
    focusPart: 1.0,
  },
  core: {
    pos: new THREE.Vector3(0.45, 0.85, 3.15),
    lookAt: new THREE.Vector3(-0.15, 0.25, 0.15),
    focusPart: 0.0,
  },
  tail: {
    pos: new THREE.Vector3(-2.15, 1.55, 3.75),
    lookAt: new THREE.Vector3(-0.15, 0.85, -0.35),
    focusPart: 2.0,
  },
};

function moveToCameraPreset(presetKey, highlightCard = true) {
  const preset = CAMERA_PRESETS[presetKey] || CAMERA_PRESETS.default;

  gsap.to(state.cameraBasePos, {
    x: preset.pos.x,
    y: preset.pos.y,
    z: preset.pos.z,
    duration: 1.35,
    ease: 'power3.out',
  });

  gsap.to(state.targetLookAt, {
    x: preset.lookAt.x,
    y: preset.lookAt.y,
    z: preset.lookAt.z,
    duration: 1.35,
    ease: 'power3.out',
  });

  origamiUniforms.uFocusPart.value = preset.focusPart;

  presetButtons.forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.cam === presetKey);
  });

  if (highlightCard) {
    spatialCards.forEach((card) => {
      card.classList.toggle('is-focused', card.dataset.focus === presetKey);
    });
  }
}

// ============================================================================
// PROGRESSIVE DESERT DUST TEXT & CARD REVEAL (PAUSES IMMEDIATELY WHEN STOPPED)
// ============================================================================
function updateProgressiveDustReveal(revealProgress) {
  const clampedProg = Math.max(0.0, Math.min(1.0, revealProgress));
  const pct = Math.round(clampedProg * 100);
  if (windGustBtnFill) {
    windGustBtnFill.style.width = `${(clampedProg * 100).toFixed(1)}%`;
  }

  // Slowly bury the "Trigger Wind Gust" button & hint in blowing desert sand as you press it (0% -> 100%)
  const sandBurial = clampedProg;
  const btnRemain = Math.pow(1.0 - sandBurial, 1.35);
  const btnBlur = (sandBurial * 16.0).toFixed(1);
  const btnSepia = (sandBurial * 0.95).toFixed(2);
  const btnDriftX = (sandBurial * 30.0).toFixed(1);
  const btnSinkY = (sandBurial * 10.0).toFixed(1);
  const isBuried = sandBurial >= 0.995 || state.windGustCompleted;

  if (windGustSandVeil) {
    windGustSandVeil.style.opacity = Math.min(1.0, sandBurial * 1.3).toFixed(3);
  }

  if (btnImpulseWing) {
    btnImpulseWing.style.opacity = isBuried ? '0' : btnRemain.toFixed(3);
    btnImpulseWing.style.filter =
      sandBurial <= 0.005
        ? 'none'
        : `blur(${btnBlur}px) sepia(${btnSepia})`;
    btnImpulseWing.style.transform =
      sandBurial <= 0.005
        ? 'none'
        : `translate3d(${btnDriftX}px, ${btnSinkY}px, 0px) scale(${(1.0 - sandBurial * 0.06).toFixed(3)})`;
    btnImpulseWing.classList.toggle('is-buried', isBuried);
    btnImpulseWing.disabled = isBuried;
  }

  if (windGustHintEl) {
    windGustHintEl.style.opacity = isBuried ? '0' : btnRemain.toFixed(3);
    windGustHintEl.style.filter =
      sandBurial <= 0.005
        ? 'none'
        : `blur(${(sandBurial * 12.0).toFixed(1)}px) sepia(${btnSepia})`;
    windGustHintEl.style.transform =
      sandBurial <= 0.005
        ? 'none'
        : `translate3d(${(sandBurial * 22.0).toFixed(1)}px, ${(sandBurial * 8.0).toFixed(1)}px, 0px)`;
    windGustHintEl.classList.toggle('is-buried', isBuried);
  }

  if (windGustBtnLabel) {
    if (isBuried) {
      windGustBtnLabel.textContent = 'Buried in the Sands';
    } else if (state.isWindActive) {
      windGustBtnLabel.textContent = `Uncovering in Sand... ${pct}%`;
    } else {
      windGustBtnLabel.textContent =
        pct === 0
          ? 'Trigger Wind Gust (Hold)'
          : `Resume Wind Gust (${pct}%)`;
    }
  }

  if (windGustHintEl && !isBuried) {
    if (state.isWindActive) {
      windGustHintEl.innerHTML =
        '<strong>Desert Gale Active:</strong> Uncovering Origami shards while burying this trigger in sand... Release to pause';
    } else if (pct > 0 && pct < 100) {
      windGustHintEl.innerHTML =
        `<strong>Wind Paused (${pct}%):</strong> Wings stopped · Hold <strong>Trigger Wind Gust</strong> to finish uncovering`;
    } else {
      windGustHintEl.innerHTML =
        'Hold (or click) <strong>Trigger Wind Gust</strong> to flap wings &amp; slowly uncover Origami facts from the desert dust';
    }
  }

  // Update each progressive text block & spatial card directly from revealProgress
  dustProgressiveEls.forEach((el) => {
    const start = parseFloat(el.dataset.revealStart || '0');
    const end = parseFloat(el.dataset.revealEnd || '1');
    const rawT = (clampedProg - start) / Math.max(0.0001, end - start);
    const clampedT = Math.max(0.0, Math.min(1.0, rawT));
    // Smooth cubic ease-out
    const easeT = 1.0 - Math.pow(1.0 - clampedT, 3);
    const invT = 1.0 - easeT;

    const blurPx = (invT * 18.0).toFixed(1);
    const sepiaAmt = (invT * 0.85).toFixed(2);
    const brightAmt = (1.0 + invT * 0.55).toFixed(2);
    const shiftX = (invT * 68.0).toFixed(1);
    const shiftY = (invT * 14.0).toFixed(1);
    const skewDeg = (-invT * 9.0).toFixed(1);

    el.style.opacity = easeT.toFixed(3);
    el.style.filter =
      easeT >= 0.995
        ? 'none'
        : `blur(${blurPx}px) sepia(${sepiaAmt}) brightness(${brightAmt})`;
    el.style.transform =
      easeT >= 0.995
        ? 'translate3d(0px, 0px, 0px)'
        : `translate3d(${shiftX}px, ${shiftY}px, 0px) skewX(${skewDeg}deg)`;

    el.classList.toggle('is-interactive', easeT > 0.65);
  });
}

function startWindGust() {
  // Only allow Trigger Wind Gust if Stage 2 is active and the one-time wind gust hasn't finished yet!
  if (!state.isRevealed || state.windGustCompleted || state.gustRevealProgress >= 1.0) return;
  audio.init();
  gsap.killTweensOf('.wind-gust-hint');

  state.isWindActive = true;
  document.body.classList.add('is-holding-wind');

  stageBadge.textContent = 'STAGE 02 · DESERT SANDSTORM GALE';
  cursorLabel.textContent = 'WIND ACTIVE';

  // Warm the scene directional lights to golden Sahara desert sunlight
  gsap.to(ambientLight.color, { r: 1.0, g: 0.84, b: 0.58, duration: 0.45 });
  gsap.to(dirLight1.color, { r: 1.0, g: 0.88, b: 0.65, duration: 0.45 });

  updateProgressiveDustReveal(state.gustRevealProgress);
}

function stopWindGust() {
  if (!state.isWindActive) return;
  state.isWindActive = false;
  document.body.classList.remove('is-holding-wind');

  stageBadge.textContent =
    state.gustRevealProgress >= 0.995
      ? 'STAGE 02 · LIVING ARCHITECTURE'
      : `STAGE 02 · WIND PAUSED (${Math.round(state.gustRevealProgress * 100)}%)`;
  cursorLabel.textContent = state.windGustCompleted ? 'REVEALED' : 'WIND STOPPED';

  // Stop the continuous desert wind audio immediately
  audio.updateWindGust(false, state.gustRevealProgress);
  updateProgressiveDustReveal(state.gustRevealProgress);
}

// ============================================================================
// THE "BOOM" FLASH & STAGE 2 HERO REVEAL CHOREOGRAPHY
// ============================================================================
function triggerBoomReveal() {
  if (state.isRevealed) return;
  state.isRevealed = true;
  state.isWindActive = false;
  state.windGustCompleted = false;
  state.gustRevealProgress = 0.0;
  state.flapAmp = 0.0;
  state.isHolding = false;
  state.progress = 1.0;
  state.targetProgress = 1.0;
  state.rearmedBoom = false;
  document.body.classList.remove('is-holding', 'is-holding-wind');

  // Fire procedural sub-bass BOOM + crystal chord
  audio.playBoom();

  // Update UI badges & cursor
  stageBadge.textContent = 'STAGE 02 · HOLD WIND GUST TO REVEAL';
  cursorLabel.textContent = 'HOLD WIND GUST';
  cursorProgressCircle.style.strokeDashoffset = '0';
  timelineScrubber.value = '1000';
  scrubberReadout.textContent = '100% ASSEMBLED';

  // 1. Shockwave Ring Expansion (0 -> 1)
  postUniforms.uShockwave.value = 0.001;
  gsap.to(postUniforms.uShockwave, {
    value: 1.0,
    duration: 1.45,
    ease: 'power2.out',
    onComplete: () => {
      postUniforms.uShockwave.value = 0.0;
    },
  });

  // 2. Pearl-Gold Bloom Flash ("FLASH LIKE BOOM THEN THE PAGE")
  gsap.killTweensOf(postUniforms.uFlash);
  gsap.fromTo(
    postUniforms.uFlash,
    { value: 1.0 },
    {
      value: 0.0,
      duration: 1.55,
      ease: 'power3.out',
    }
  );

  // 3. Assembled State Uniforms (Wings stay still until user triggers Wind Gust!)
  gsap.to(origamiUniforms.uAssembled, {
    value: 1.0,
    duration: 1.2,
    ease: 'power2.out',
  });
  gsap.to(bgUniforms.uAssembled, {
    value: 1.0,
    duration: 1.2,
    ease: 'power2.out',
  });

  // 4. Switch DOM Overlays at the instant of the flash
  stageShatteredEl.classList.remove('is-active');
  stageShatteredEl.setAttribute('aria-hidden', 'true');

  stageRevealedEl.classList.add('is-active');
  stageRevealedEl.setAttribute('aria-hidden', 'false');

  // Reset all progressive text & cards to 0% (hidden in the desert dust until Wind Gust is held)
  updateProgressiveDustReveal(0.0);

  gsap.fromTo(
    '.hero-cta-row',
    { y: 24, opacity: 0 },
    {
      y: 0,
      opacity: 1,
      duration: 0.85,
      ease: 'power3.out',
      delay: 0.18,
    }
  );

  gsap.fromTo(
    '.bottom-scrubber-dock',
    { y: 30, opacity: 0 },
    {
      y: 0,
      opacity: 1,
      duration: 0.9,
      ease: 'power3.out',
      delay: 0.28,
    }
  );

  // 5. Sweep 3D Camera to Hero Three-Quarter Framing
  moveToCameraPreset('default', false);
}

// ============================================================================
// SHATTER & REPLAY TRANSITION (RETURN TO STAGE 1)
// ============================================================================
function shatterAndReset() {
  stopWindGust();
  audio.playShatter();

  state.isRevealed = false;
  state.isWindActive = false;
  state.windGustCompleted = false;
  state.gustRevealProgress = 0.0;
  state.flapAmp = 0.0;
  state.isHolding = false;
  state.isScrubbing = false;
  state.inputMode = 'scroll';
  state.targetProgress = 0.0;
  origamiUniforms.uFocusPart.value = -1.0;

  stageBadge.textContent = 'STAGE 01 · SUSPENDED SHATTER';
  cursorLabel.textContent = 'SCROLL / HOLD';

  stageRevealedEl.classList.remove('is-active');
  stageRevealedEl.setAttribute('aria-hidden', 'true');
  stageShatteredEl.classList.add('is-active');
  stageShatteredEl.setAttribute('aria-hidden', 'false');

  updateProgressiveDustReveal(0.0);

  // Fade desert sandstorm back to obsidian zero-G studio
  gsap.to(state, {
    dustStorm: 0.0,
    windForce: 0.0,
    duration: 0.8,
    ease: 'power2.out',
  });
  gsap.to(ambientLight.color, { r: 0.72, g: 0.83, b: 1.0, duration: 1.0 });
  gsap.to(dirLight1.color, { r: 1.0, g: 1.0, b: 1.0, duration: 1.0 });

  // Subtle reverse shockwave
  postUniforms.uShockwave.value = 0.001;
  gsap.to(postUniforms.uShockwave, {
    value: 1.0,
    duration: 1.1,
    ease: 'power2.out',
    onComplete: () => {
      postUniforms.uShockwave.value = 0.0;
    },
  });

  gsap.to(origamiUniforms.uAssembled, { value: 0.0, duration: 0.8 });
  gsap.to(bgUniforms.uAssembled, { value: 0.0, duration: 0.8 });

  gsap.to(state, {
    progress: 0.0,
    targetProgress: 0.0,
    duration: 1.25,
    ease: 'expo.out',
    onUpdate: () => {
      updateStage1HUD(state.progress);
    },
  });

  gsap.to(state.cameraBasePos, {
    x: 0.0,
    y: 0.35,
    z: 6.2,
    duration: 1.3,
    ease: 'power3.out',
  });

  gsap.to(state.targetLookAt, {
    x: 0.0,
    y: 0.25,
    z: 0.0,
    duration: 1.3,
    ease: 'power3.out',
  });
}

// ============================================================================
// STAGE 1 CENTERED TITLE SHATTER-INTO-PIECES ENGINE
// ============================================================================
const titleShardPieces = [];
const titleSplinterPieces = [];

function initShatterTitlePieces() {
  if (!shatterTitleEl) return;

  const lines = shatterTitleEl.querySelectorAll('.shatter-line');
  let charIndex = 0;

  lines.forEach((lineEl, lineIdx) => {
    const rawText = lineEl.textContent || '';
    lineEl.textContent = '';

    const words = rawText.split(' ');
    words.forEach((word, wIdx) => {
      const wordWrap = document.createElement('span');
      wordWrap.className = 'title-word-wrap';

      for (let c = 0; c < word.length; c++) {
        const ch = word[c];
        const charWrap = document.createElement('span');
        charWrap.className = 'title-char-wrap';

        const ghost = document.createElement('span');
        ghost.className = 'char-base-ghost';
        ghost.textContent = ch;

        const topHalf = document.createElement('span');
        topHalf.className = 'char-shard-half char-half-top';
        topHalf.textContent = ch;

        const botHalf = document.createElement('span');
        botHalf.className = 'char-shard-half char-half-bot';
        botHalf.textContent = ch;

        charWrap.appendChild(ghost);
        charWrap.appendChild(topHalf);
        charWrap.appendChild(botHalf);
        wordWrap.appendChild(charWrap);

        // Deterministic radial + turbulent 3D shatter vectors for both diagonal halves of the letter
        const seed1 = Math.sin(charIndex * 12.9898 + lineIdx * 78.233) * 43758.5453;
        const r1 = seed1 - Math.floor(seed1);
        const seed2 = Math.sin(charIndex * 45.164 + 19.19) * 19432.17;
        const r2 = seed2 - Math.floor(seed2);
        const seed3 = Math.sin(charIndex * 93.71 + 7.31) * 31749.83;
        const r3 = seed3 - Math.floor(seed3);

        const normX = (charIndex % 24) / 23 - 0.5;
        const normY = lineIdx === 0 ? -0.55 : 0.55;
        const startT = 0.03 + r3 * 0.28; // Staggered crack-open threshold

        // Top-left diagonal piece flies upward/outward
        titleShardPieces.push({
          el: topHalf,
          startT,
          shearX: -3.5 - r1 * 5.0,
          shearY: -4.0 - r2 * 5.5,
          vx: normX * 360 + (r1 - 0.5) * 240,
          vy: normY * 210 - 65 - r2 * 150,
          vz: 90 + r3 * 240,
          rx: (r1 - 0.5) * 520,
          ry: (r2 - 0.5) * 540,
          rz: -45 - r3 * 220,
        });

        // Bottom-right diagonal piece flies downward/outward in opposite spin
        titleShardPieces.push({
          el: botHalf,
          startT: startT + 0.02,
          shearX: 3.5 + r2 * 5.0,
          shearY: 4.0 + r1 * 5.5,
          vx: normX * 380 + (r2 - 0.5) * 250,
          vy: normY * 220 + 70 + r1 * 160,
          vz: -80 + r2 * 260,
          rx: (r2 - 0.5) * 540,
          ry: (r3 - 0.5) * 520,
          rz: 45 + r1 * 230,
        });

        charIndex++;
      }

      lineEl.appendChild(wordWrap);
      if (wIdx < words.length - 1) {
        lineEl.appendChild(document.createTextNode(' '));
      }
    });
  });

  // Create 36 flying triangular origami/crystal splinters that burst from the letters as they shatter
  if (titleSplintersLayerEl) {
    titleSplintersLayerEl.innerHTML = '';
    for (let i = 0; i < 36; i++) {
      const sp = document.createElement('span');
      sp.className = 'title-splinter';
      const s1 = Math.sin(i * 19.31 + 3.7) * 43758.54;
      const u1 = s1 - Math.floor(s1);
      const s2 = Math.sin(i * 71.13 + 11.2) * 23149.91;
      const u2 = s2 - Math.floor(s2);
      const s3 = Math.sin(i * 37.89 + 5.4) * 15823.41;
      const u3 = s3 - Math.floor(s3);

      const leftPct = 10 + u1 * 80;
      const topPct = 15 + u2 * 70;
      const sizePx = 8 + u3 * 14;
      sp.style.left = `${leftPct.toFixed(1)}%`;
      sp.style.top = `${topPct.toFixed(1)}%`;
      sp.style.width = `${sizePx.toFixed(1)}px`;
      sp.style.height = `${sizePx.toFixed(1)}px`;

      titleSplintersLayerEl.appendChild(sp);

      const angle = u1 * Math.PI * 2;
      const speed = 130 + u2 * 280;
      titleSplinterPieces.push({
        el: sp,
        startT: 0.04 + u3 * 0.25,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        vz: (u1 - 0.5) * 320,
        rx: (u2 - 0.5) * 720,
        ry: (u3 - 0.5) * 720,
        rz: (u1 - 0.5) * 540,
      });
    }
  }
}

function updateTitleShatter(progress) {
  const p = Math.max(0.0, Math.min(1.0, progress));

  // 1. Fracture Cracks SVG: ignites along the letters (0.01 -> 0.35), then bursts apart
  if (titleCracksSvgEl) {
    if (p <= 0.005) {
      titleCracksSvgEl.style.opacity = '0';
      titleCracksSvgEl.style.transform = 'translate(-50%, -50%) scale(1)';
    } else {
      const crackAppear = Math.min(1.0, p / 0.22);
      const crackFade = Math.max(0.0, 1.0 - Math.max(0.0, (p - 0.32) / 0.55));
      const crackAlpha = crackAppear * crackFade;
      const crackScale = 1.0 + p * 0.38;
      titleCracksSvgEl.style.opacity = crackAlpha.toFixed(3);
      titleCracksSvgEl.style.transform = `translate(-50%, -50%) scale(${crackScale.toFixed(3)})`;
    }
  }

  // 2. Update every sliced diagonal letter-half shard
  for (let i = 0; i < titleShardPieces.length; i++) {
    const piece = titleShardPieces[i];
    if (p <= 0.002) {
      piece.el.style.transform = 'translate3d(0px, 0px, 0px)';
      piece.el.style.opacity = '1';
      continue;
    }

    // Initial crack-shear phase (starts immediately as soon as user holds > 0%)
    const shearFactor = Math.min(1.0, p / 0.16);
    // Explosive 3D piece-by-piece shatter phase
    const localT = Math.max(0.0, (p - piece.startT) / Math.max(0.001, 1.0 - piece.startT));
    const shatterEase = Math.pow(localT, 1.55);

    // High-tension micro-tremor while cracking apart
    const tremor = Math.sin(p * 95.0 + i * 3.7) * Math.min(1.0, p * 5.0) * (1.0 - shatterEase) * 2.5;

    const tx = piece.shearX * shearFactor + piece.vx * shatterEase + tremor;
    const ty = piece.shearY * shearFactor + piece.vy * shatterEase - tremor * 0.7;
    const tz = piece.vz * shatterEase;

    const rx = piece.rx * shatterEase;
    const ry = piece.ry * shatterEase;
    const rz = (piece.shearX * 1.4 * shearFactor) + piece.rz * shatterEase;
    const scale = Math.max(0.15, 1.0 - shatterEase * 0.45);
    const alpha = Math.max(0.0, 1.0 - Math.pow(localT, 2.1));

    piece.el.style.transform = `translate3d(${tx.toFixed(1)}px, ${ty.toFixed(1)}px, ${tz.toFixed(1)}px) rotateX(${rx.toFixed(1)}deg) rotateY(${ry.toFixed(1)}deg) rotateZ(${rz.toFixed(1)}deg) scale(${scale.toFixed(2)})`;
    piece.el.style.opacity = alpha.toFixed(3);
  }

  // 3. Update flying triangular origami/crystal splinters
  for (let i = 0; i < titleSplinterPieces.length; i++) {
    const sp = titleSplinterPieces[i];
    if (p <= 0.01) {
      sp.el.style.opacity = '0';
      sp.el.style.transform = 'translate3d(0px, 0px, 0px) scale(0.2)';
      continue;
    }

    const localT = Math.max(0.0, (p - sp.startT) / Math.max(0.001, 1.0 - sp.startT));
    const easeOut = 1.0 - Math.pow(1.0 - localT, 2.2);
    const tx = sp.vx * easeOut;
    const ty = sp.vy * easeOut;
    const tz = sp.vz * easeOut;
    const rx = sp.rx * easeOut;
    const ry = sp.ry * easeOut;
    const rz = sp.rz * easeOut;

    const popIn = Math.min(1.0, localT * 5.5);
    const fadeOut = Math.max(0.0, 1.0 - Math.pow(localT, 1.8));
    const alpha = popIn * fadeOut * 0.95;
    const scale = 0.35 + popIn * 0.85 * (1.0 - localT * 0.4);

    sp.el.style.opacity = alpha.toFixed(3);
    sp.el.style.transform = `translate3d(${tx.toFixed(1)}px, ${ty.toFixed(1)}px, ${tz.toFixed(1)}px) rotateX(${rx.toFixed(1)}deg) rotateY(${ry.toFixed(1)}deg) rotateZ(${rz.toFixed(1)}deg) scale(${scale.toFixed(2)})`;
  }
}

initShatterTitlePieces();

function updateStage1HUD(progress) {
  const pct = Math.min(100, Math.round(progress * 100));
  foldCounterEl.textContent = String(pct).padStart(2, '0');

  // SVG cursor progress ring (circumference = 2 * PI * 34 ≈ 213.6)
  const offset = 213.6 * (1.0 - progress);
  cursorProgressCircle.style.strokeDashoffset = offset.toFixed(1);

  // Shatter the centered title into pieces as the user holds or scrolls (0% -> 100%)
  updateTitleShatter(progress);

  if (progress < 0.05) {
    counterStatusEl.textContent = 'SUSPENDED IN ZERO-G · SCROLL OR HOLD';
  } else if (progress < 0.45) {
    counterStatusEl.textContent = 'SHATTERING INTO FRAGMENTS';
  } else if (progress < 0.82) {
    counterStatusEl.textContent = 'FOLDING CREASE GEOMETRY';
  } else {
    counterStatusEl.textContent = 'CRITICAL SEAM RESONANCE';
  }
}

function updateStage2ScrubberHUD(progress) {
  const sliderVal = Math.round(progress * 1000);
  timelineScrubber.value = String(sliderVal);
  const pct = Math.round(progress * 100);
  scrubberReadout.textContent =
    pct >= 99
      ? '100% ASSEMBLED (SCROLL ↑ TO SHATTER)'
      : pct <= 1
      ? '0% SHATTERED (SCROLL ↓ TO ASSEMBLE)'
      : `${pct}% FOLDED (SCROLL ↕)`;

  const offset = 213.6 * (1.0 - progress);
  cursorProgressCircle.style.strokeDashoffset = offset.toFixed(1);
}

// ============================================================================
// INPUT LISTENERS (SCROLL UP/DOWN, LONG PRESS, SPACEBAR, PARALLAX, UI CONTROLS)
// ============================================================================
function onWheelScroll(e) {
  e.preventDefault();
  audio.init();

  const rawDelta = e.deltaY;
  if (Math.abs(rawDelta) < 0.1) return;

  gsap.killTweensOf(state, 'progress,targetProgress');
  state.isScrubbing = false;
  state.inputMode = 'scroll';
  state.isHolding = false;
  document.body.classList.remove('is-holding');

  const now = performance.now();
  const isNewGesture = now - state.lastWheelTimeMs > 320;
  state.lastWheelTimeMs = now;

  // Lock scroll polarity only at the start of a brand-new gesture at 0% or 100%
  // so continuous scrolling never reverses or bounces at 94% / 98%!
  if (isNewGesture) {
    if (state.targetProgress <= 0.02) {
      state.scrollPolarity = rawDelta < 0 ? -1 : 1;
    } else if (state.targetProgress >= 0.98) {
      state.scrollPolarity = rawDelta > 0 ? -1 : 1;
    }
  }

  const clampedDelta = Math.sign(rawDelta) * Math.min(Math.abs(rawDelta), 120);
  const step = ((clampedDelta * state.scrollPolarity) / 100) * 0.085;

  let nextTarget = state.targetProgress + step;

  // Magnetic snap at >= 92% (when assembling) and <= 5% (when shattering)
  // so it never stalls at 94% or 98%
  if (step > 0 && nextTarget >= 0.92) {
    nextTarget = 1.0;
  } else if (step < 0 && nextTarget <= 0.05) {
    nextTarget = 0.0;
  }

  state.targetProgress = Math.max(0.0, Math.min(1.0, nextTarget));
  cursorLabel.textContent = step > 0 ? 'ASSEMBLE' : 'SHATTER';

  // Play tactile paper-crease or scatter sound every ~8% scrolled
  const bucket = Math.floor(state.targetProgress * 14);
  if (bucket !== state.lastScrollSoundStep) {
    state.lastScrollSoundStep = bucket;
    audio.playPaperCrease(0.65 + state.targetProgress * 0.85);
  }
}

window.addEventListener('wheel', onWheelScroll, { passive: false });

function startHold(e) {
  if (state.isRevealed) return;
  // Ignore clicks on the top-right audio toggle button
  if (e && e.target && e.target.closest('#audio-toggle')) return;

  audio.init();
  gsap.killTweensOf(state, 'progress');
  state.inputMode = 'hold';
  state.isHolding = true;
  document.body.classList.add('is-holding');
  cursorLabel.textContent = 'FOLDING';
}

function endHold() {
  if (state.isWindActive && performance.now() - state.windPressStartMs > 180) {
    stopWindGust();
  }
  if (!state.isHolding) return;
  state.isHolding = false;
  document.body.classList.remove('is-holding');

  if (!state.isRevealed) {
    cursorLabel.textContent = 'SCROLL / HOLD';
    if (state.progress > 0.08) {
      audio.playShatter();
    }
  }
}

window.addEventListener('pointerdown', startHold);
window.addEventListener('pointerup', endHold);
window.addEventListener('pointercancel', endHold);
window.addEventListener('blur', () => {
  endHold();
  stopWindGust();
});

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !e.repeat) {
    e.preventDefault();
    if (!state.isRevealed) {
      startHold(e);
    } else {
      state.windPressStartMs = performance.now();
      startWindGust();
    }
  } else if (e.code === 'ArrowDown' || e.code === 'ArrowRight') {
    e.preventDefault();
    audio.init();
    state.inputMode = 'scroll';
    const next = state.targetProgress + 0.09;
    state.targetProgress = next >= 0.92 ? 1.0 : Math.min(1.0, next);
    audio.playPaperCrease(0.7 + state.targetProgress * 0.8);
  } else if (e.code === 'ArrowUp' || e.code === 'ArrowLeft') {
    e.preventDefault();
    audio.init();
    state.inputMode = 'scroll';
    const next = state.targetProgress - 0.09;
    state.targetProgress = next <= 0.05 ? 0.0 : Math.max(0.0, next);
    audio.playPaperCrease(0.7 + state.targetProgress * 0.8);
  }
});

window.addEventListener('keyup', (e) => {
  if (e.code === 'Space') {
    e.preventDefault();
    if (!state.isRevealed) {
      endHold();
    } else {
      stopWindGust();
    }
  }
});

window.addEventListener('pointermove', (e) => {
  state.targetCursorPx.x = e.clientX;
  state.targetCursorPx.y = e.clientY;

  state.targetPointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  state.targetPointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
});

// Audio Mute/Unmute Toggle
audioToggleBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  const muted = audio.toggleMute();
  audioBars.classList.toggle('is-muted', muted);
  audioLabel.textContent = muted ? 'SOUND OFF' : 'SOUND ON';
});

// Stage 2: Shatter & Replay Button
btnShatterReplay.addEventListener('click', (e) => {
  e.stopPropagation();
  shatterAndReset();
});

// Stage 2: Trigger Wind Gust Button (Hold to flap & slowly reveal text; release or click again to stop!)
btnImpulseWing.addEventListener('pointerdown', (e) => {
  e.stopPropagation();
  if (!state.isWindActive) {
    state.windPressStartMs = performance.now();
    startWindGust();
  } else {
    // If it was already active from a quick click toggle, clicking again stops it immediately!
    stopWindGust();
  }
});

btnImpulseWing.addEventListener('pointerup', (e) => {
  e.stopPropagation();
  // If the user held the button down (> 180ms), releasing immediately stops the wings & text reveal!
  if (state.isWindActive && performance.now() - state.windPressStartMs > 180) {
    stopWindGust();
  }
});

btnImpulseWing.addEventListener('pointerleave', () => {
  if (state.isWindActive && performance.now() - state.windPressStartMs > 180) {
    stopWindGust();
  }
});

// Stage 2: Interactive Timeline Scrubber
timelineScrubber.addEventListener('input', (e) => {
  state.isScrubbing = true;
  state.inputMode = 'scrub';
  let val = parseFloat(e.target.value) / 1000;
  if (val >= 0.96) val = 1.0;
  else if (val <= 0.03) val = 0.0;
  state.progress = val;
  state.targetProgress = val;
  updateStage2ScrubberHUD(val);

  if (Math.random() > 0.65) {
    audio.playHoverTick(700 + val * 800);
  }
});

timelineScrubber.addEventListener('change', () => {
  state.isScrubbing = false;
});
timelineScrubber.addEventListener('pointerup', () => {
  state.isScrubbing = false;
});

// Stage 2: 3 Floating Spatial Cards Hover & Click
spatialCards.forEach((card) => {
  card.addEventListener('mouseenter', () => {
    audio.init();
    audio.playHoverTick(1320);
    const focusKey = card.dataset.focus;
    moveToCameraPreset(focusKey, true);
  });

  card.addEventListener('click', (e) => {
    e.stopPropagation();
    const focusKey = card.dataset.focus;
    moveToCameraPreset(focusKey, true);
  });
});

// Stage 2: Camera Preset Pills
presetButtons.forEach((btn) => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    audio.init();
    audio.playHoverTick(1100);
    moveToCameraPreset(btn.dataset.cam, true);
  });
});

// Responsive Resize Handler
window.addEventListener('resize', () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio, 2);

  camera.aspect = w / h;
  camera.updateProjectionMatrix();

  renderer.setPixelRatio(dpr);
  renderer.setSize(w, h);
  renderTarget.setSize(w * dpr, h * dpr);

  bgUniforms.uResolution.value.set(w, h);
  postUniforms.uResolution.value.set(w, h);
  sandstormUniforms.uPixelRatio.value = dpr;
});

// ============================================================================
// MASTER 60FPS RENDER & PHYSICS LOOP
// ============================================================================
const clock = new THREE.Clock();
const spatialCardsLayerEl = document.getElementById('spatial-cards-layer');

function animate() {
  requestAnimationFrame(animate);

  const dt = Math.min(clock.getDelta(), 0.05);
  const elapsed = clock.getElapsedTime();

  // 1. Damped Cursor & Pointer Lerp
  state.pointer.x += (state.targetPointer.x - state.pointer.x) * 0.085;
  state.pointer.y += (state.targetPointer.y - state.pointer.y) * 0.085;

  state.cursorPx.x += (state.targetCursorPx.x - state.cursorPx.x) * 0.22;
  state.cursorPx.y += (state.targetCursorPx.y - state.cursorPx.y) * 0.22;
  if (customCursor) {
    customCursor.style.transform = `translate3d(${state.cursorPx.x}px, ${state.cursorPx.y}px, 0)`;
  }

  // 2. Unified Scroll & Long-Press Fold / Shatter Physics
  if (!state.isRevealed) {
    if (state.inputMode === 'hold') {
      if (state.isHolding) {
        const speed = 0.36 + state.progress * 0.22;
        state.targetProgress = Math.min(1.0, state.targetProgress + dt * speed);
        state.progress = state.targetProgress;
        state.holdTension = Math.min(1.0, state.holdTension + dt * 3.0);
      } else {
        // Spring-unwind back to shattered zero-G state if a hold was released early
        state.targetProgress = Math.max(0.0, state.targetProgress - dt * (0.55 + state.progress * 0.6));
        state.progress = state.targetProgress;
        state.holdTension = Math.max(0.0, state.holdTension - dt * 4.0);
      }
      audio.updateHoldProgress(state.progress, state.isHolding);
    } else {
      // Scroll mode: smoothly lerp toward targetProgress and snap cleanly at endpoints
      state.progress += (state.targetProgress - state.progress) * 0.22;
      if (
        Math.abs(state.targetProgress - state.progress) < 0.008 ||
        (state.targetProgress === 1.0 && state.progress >= 0.94) ||
        (state.targetProgress === 0.0 && state.progress <= 0.04)
      ) {
        state.progress = state.targetProgress;
      }
      state.holdTension = Math.max(0.0, (state.progress - 0.5) * 1.6);
      audio.updateHoldProgress(state.progress, false);
    }

    updateStage1HUD(state.progress);

    if (state.progress >= 0.99) {
      triggerBoomReveal();
    }
  } else {
    // Stage 2 (Revealed Page): Scroll up/down smoothly disassembles or reassembles the crane live!
    if (!state.isScrubbing) {
      state.progress += (state.targetProgress - state.progress) * 0.22;
      if (
        Math.abs(state.targetProgress - state.progress) < 0.008 ||
        (state.targetProgress === 1.0 && state.progress >= 0.94) ||
        (state.targetProgress === 0.0 && state.progress <= 0.04)
      ) {
        state.progress = state.targetProgress;
      }
    }
    state.holdTension = Math.max(0.0, Math.sin(state.progress * Math.PI) * 0.45);
    updateStage2ScrubberHUD(state.progress);

    // 2B. WIND GUST ACTIVE vs STOPPED DYNAMICS:
    // While Wind Gust is active -> Wings flap, sandstorm blows, and text slowly reveals!
    // When stopped -> Wings immediately stop flapping and text immediately stops revealing!
    if (state.isWindActive) {
      state.flapAmp += (1.15 - state.flapAmp) * Math.min(1.0, dt * 9.0);
      state.flapPhase += dt * 7.4;

      state.windForce += (1.0 - state.windForce) * Math.min(1.0, dt * 5.5);
      state.dustStorm += (1.0 - state.dustStorm) * Math.min(1.0, dt * 4.5);

      if (state.gustRevealProgress < 1.0) {
        // Slowly uncover all texts and 3 shards while burying the Trigger Wind Gust button in sand
        state.gustRevealProgress = Math.min(1.0, state.gustRevealProgress + dt * 0.20);
        updateProgressiveDustReveal(state.gustRevealProgress);
        audio.updateWindGust(true, state.gustRevealProgress);

        if (state.gustRevealProgress >= 1.0) {
          state.windGustCompleted = true;
          stopWindGust();
        }
      } else {
        state.windGustCompleted = true;
        stopWindGust();
      }
    } else {
      // Wind Gust stopped: stop flapping wings immediately and freeze text reveal!
      state.flapAmp += (0.0 - state.flapAmp) * Math.min(1.0, dt * 11.0);
      if (state.flapAmp < 0.001) state.flapAmp = 0.0;

      state.windForce += (0.0 - state.windForce) * Math.min(1.0, dt * 6.5);
      if (state.windForce < 0.001) state.windForce = 0.0;

      // Settle the background dust cloud when wind stops
      const settledDust = state.gustRevealProgress * 0.28;
      state.dustStorm += (settledDust - state.dustStorm) * Math.min(1.0, dt * 4.0);

      audio.updateWindGust(false, state.gustRevealProgress);
    }

    if (desertDustVeilEl) {
      desertDustVeilEl.style.opacity = (state.dustStorm * 0.95).toFixed(3);
    }

    // Rearm mini-boom if user scrolls down below 50% and then scrolls back to 100%
    if (state.progress < 0.5) {
      state.rearmedBoom = true;
    } else if (state.rearmedBoom && state.progress >= 0.995) {
      state.rearmedBoom = false;
      audio.playBoom();
      postUniforms.uShockwave.value = 0.001;
      gsap.to(postUniforms.uShockwave, {
        value: 1.0,
        duration: 1.3,
        ease: 'power2.out',
        onComplete: () => {
          postUniforms.uShockwave.value = 0.0;
        },
      });
      gsap.fromTo(postUniforms.uFlash, { value: 0.75 }, { value: 0.0, duration: 1.2, ease: 'power3.out' });
    }
  }

  // 3. Update Shader Uniforms (including Controlled Wing Flapping & Desert Sandstorm)
  origamiUniforms.uTime.value = elapsed;
  origamiUniforms.uProgress.value = state.progress;
  origamiUniforms.uFlapPhase.value = state.flapPhase;
  origamiUniforms.uFlapAmp.value = state.flapAmp;
  origamiUniforms.uPointer.value.copy(state.pointer);
  origamiUniforms.uHoldTension.value = state.holdTension;
  origamiUniforms.uDustStorm.value = state.dustStorm;

  bgUniforms.uTime.value = elapsed;
  bgUniforms.uProgress.value = state.progress;
  bgUniforms.uDustStorm.value = state.dustStorm;
  bgUniforms.uWindForce.value = state.windForce;
  bgUniforms.uPointer.value.copy(state.pointer);

  postUniforms.uTime.value = elapsed;
  postUniforms.uProgress.value = state.progress;
  postUniforms.uDustStorm.value = state.dustStorm;
  postUniforms.uWindForce.value = state.windForce;

  sandstormUniforms.uTime.value = elapsed;
  sandstormUniforms.uDustStorm.value = state.dustStorm;
  sandstormUniforms.uWindForce.value = state.windForce;

  // 4. Inner Glowing Core Crystal Dynamics (synced with controlled wingbeat lift)
  const flapStrength =
    THREE.MathUtils.smoothstep(state.progress, 0.72, 1.0) * state.flapAmp;
  const aeroBodyLift = -Math.sin(state.flapPhase - 0.45) * 0.11 * flapStrength;

  const seamPeak =
    Math.sin(state.progress * Math.PI) * 0.85 +
    (state.isRevealed ? 0.25 : 0.0);
  coreMat.opacity = 0.12 + seamPeak * 0.72;
  const coreScale = 0.65 + seamPeak * 1.1 + Math.sin(elapsed * 4.0) * 0.08;
  coreMesh.scale.setScalar(coreScale);
  coreMesh.position.y = 0.12 + aeroBodyLift;
  coreMesh.rotation.y = elapsed * 1.4;
  coreMesh.rotation.x = elapsed * 0.9;

  // 5. Crane Group Banking & Parallax (banks into the desert gale when windForce > 0)
  const windBankRoll = state.windForce * (0.16 + Math.sin(elapsed * 6.5) * 0.06);
  const windPitchLean = state.windForce * 0.12;
  const targetRotY =
    state.pointer.x * 0.42 +
    (state.isRevealed ? Math.sin(elapsed * 0.45) * 0.12 : elapsed * 0.08 * (1.0 - state.progress)) -
    state.windForce * 0.18;
  const targetRotX =
    -state.pointer.y * 0.26 +
    (state.isRevealed ? Math.cos(elapsed * 0.6) * 0.04 : 0.08) +
    windPitchLean;
  const targetRotZ = -state.pointer.x * 0.14 + windBankRoll;

  craneGroup.rotation.y += (targetRotY - craneGroup.rotation.y) * 0.06;
  craneGroup.rotation.x += (targetRotX - craneGroup.rotation.x) * 0.06;
  craneGroup.rotation.z += (targetRotZ - craneGroup.rotation.z) * 0.06;

  // 6. Update Secondary 2.5D/3D Ambient Depth Shards (swept by wind during sandstorm)
  for (let i = 0; i < shardMeta.length; i++) {
    const meta = shardMeta[i];
    const pullFactor = 1.0 + (1.0 - state.progress) * 0.25 - state.holdTension * 0.32;

    const parallaxX = -state.pointer.x * (0.4 + meta.depthFactor * 0.9);
    const parallaxY = -state.pointer.y * (0.3 + meta.depthFactor * 0.7);
    const windDriftX = -Math.sin(elapsed * 2.8 + meta.phase) * state.windForce * 0.85;

    shardDummy.position.set(
      meta.basePos.x * pullFactor + parallaxX + windDriftX + Math.sin(elapsed * 0.6 + meta.phase) * 0.18,
      meta.basePos.y * pullFactor + parallaxY + Math.cos(elapsed * 0.5 + meta.phase) * 0.22,
      meta.basePos.z * pullFactor
    );

    const windSpinBoost = 1.0 + state.windForce * 2.5;
    shardDummy.rotation.set(
      elapsed * meta.rotSpeed.x * windSpinBoost + meta.phase,
      elapsed * meta.rotSpeed.y * windSpinBoost + meta.phase,
      elapsed * meta.rotSpeed.z * windSpinBoost
    );

    shardDummy.scale.setScalar(meta.scale * (0.75 + 0.25 * (1.0 - state.holdTension)));
    shardDummy.updateMatrix();
    shardInstancedMesh.setMatrixAt(i, shardDummy.matrix);
  }
  shardInstancedMesh.instanceMatrix.needsUpdate = true;

  // 7. Camera FOV Pull, Pre-Boom Tremor, Wind Buffeting & Damped LookAt
  const targetFov = state.isRevealed
    ? 42 + state.windForce * 3.5
    : 46 - state.progress * 10.5;
  camera.fov += (targetFov - camera.fov) * 0.1;
  camera.updateProjectionMatrix();

  // Subtle high-energy camera shake right before the BOOM or during active desert wind gust
  const preBoomShake =
    !state.isRevealed && state.isHolding
      ? Math.max(0, (state.progress - 0.6) * 0.055)
      : 0;
  const windGustShake = Math.max(0, (state.windForce - 0.38) * 0.04);
  const shakeAmt = preBoomShake + windGustShake;
  const shakeX = (Math.random() - 0.5) * shakeAmt;
  const shakeY = (Math.random() - 0.5) * shakeAmt;

  camera.position.x =
    state.cameraBasePos.x + state.pointer.x * 0.45 + shakeX;
  camera.position.y =
    state.cameraBasePos.y + state.pointer.y * 0.32 + shakeY;
  camera.position.z =
    state.cameraBasePos.z - (!state.isRevealed ? state.progress * 1.15 : 0);

  state.cameraLookAt.lerp(state.targetLookAt, 0.08);
  camera.lookAt(state.cameraLookAt);

  // 8. Origami Information Shards Float, Shatter Drift & Projected 3D Crease Tethers
  if (state.isRevealed && spatialCardsLayerEl) {
    const tx = -state.pointer.x * 8;
    const ty = state.pointer.y * 6;
    spatialCardsLayerEl.style.transform = `translate3d(${tx.toFixed(1)}px, ${ty.toFixed(1)}px, 0)`;

    craneGroup.updateMatrixWorld();
    const vw = Math.max(1, window.innerWidth);
    const vh = Math.max(1, window.innerHeight);

    const shardConfigs = [
      {
        focus: 'wings',
        anchor3D: new THREE.Vector3(1.18, 0.56, 0.08),
        shatterVec: { x: 36, y: -24 },
        phase: 0.0,
      },
      {
        focus: 'core',
        anchor3D: new THREE.Vector3(0.08, 0.18, 0.28),
        shatterVec: { x: 48, y: 8 },
        phase: 2.1,
      },
      {
        focus: 'tail',
        anchor3D: new THREE.Vector3(-0.32, 0.78, -0.42),
        shatterVec: { x: 32, y: 28 },
        phase: 4.2,
      },
    ];

    shardConfigs.forEach((cfg, idx) => {
      const cardEl = spatialCards[idx];
      if (!cardEl) return;

      const innerEl = cardEl.querySelector('.shard-paper-inner');
      const cardOpacity = parseFloat(cardEl.style.opacity || '0');
      const disasm = 1.0 - state.progress;

      if (innerEl) {
        const windSwayX =
          Math.sin(elapsed * 8.0 + cfg.phase) * state.windForce * 3.0;
        const idleBobY = Math.sin(elapsed * 1.6 + cfg.phase) * 2.5;

        const driftX = cfg.shatterVec.x * disasm + windSwayX;
        const driftY = cfg.shatterVec.y * disasm + idleBobY;

        innerEl.style.transform = `translate3d(${driftX.toFixed(1)}px, ${driftY.toFixed(1)}px, 0px)`;
      }

      // Project 3D crane facet anchor to 1920x1080 SVG tether coordinates
      const tetherGroup = document.getElementById(`tether-group-${cfg.focus}`);
      const tetherLine = document.getElementById(`tether-line-${cfg.focus}`);
      const tetherNode = document.getElementById(`tether-node-${cfg.focus}`);

      if (tetherGroup && tetherLine && tetherNode && cardOpacity > 0.05) {
        const worldPt = cfg.anchor3D.clone().applyMatrix4(craneGroup.matrixWorld);
        worldPt.multiplyScalar(1.0 + disasm * 0.65);
        const ndc = worldPt.project(camera);

        const x1 = (ndc.x * 0.5 + 0.5) * 1920;
        const y1 = (-ndc.y * 0.5 + 0.5) * 1080;

        const rect = cardEl.getBoundingClientRect();
        const x2 = ((rect.left + 12) / vw) * 1920;
        const y2 = ((rect.top + rect.height * 0.5) / vh) * 1920 * (1080 / 1920);

        tetherLine.setAttribute('x1', x1.toFixed(1));
        tetherLine.setAttribute('y1', y1.toFixed(1));
        tetherLine.setAttribute('x2', x2.toFixed(1));
        tetherLine.setAttribute('y2', y2.toFixed(1));
        tetherNode.setAttribute(
          'transform',
          `translate(${x1.toFixed(1)}, ${y1.toFixed(1)})`
        );

        const tetherAlpha = Math.max(0, Math.min(0.85, cardOpacity * (0.35 + 0.65 * state.progress)));
        tetherGroup.setAttribute('opacity', tetherAlpha.toFixed(2));
      } else if (tetherGroup) {
        tetherGroup.setAttribute('opacity', '0');
      }
    });
  }

  // 9. Execute 2-Pass Render (Scene -> RenderTarget -> Post-Processing Pass)
  renderer.setRenderTarget(renderTarget);
  renderer.clear();
  renderer.render(scene, camera);

  renderer.setRenderTarget(null);
  renderer.render(postScene, postCamera);
}

animate();

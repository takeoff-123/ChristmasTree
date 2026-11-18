import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const TAU = Math.PI * 2;

export const TREE = {
  baseY: -4.35,
  topY: 5.9,
  height: 10.25,
  baseRadius: 3.66,
  starY: 6.48,
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const smoothstep = (min, max, value) => {
  const x = clamp((value - min) / (max - min), 0, 1);
  return x * x * (3 - 2 * x);
};

function mulberry32(seed) {
  return function random() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function treeRadius(h) {
  return (TREE.baseRadius * Math.pow(1 - h, 0.9)) + 0.04;
}

function sampleTreePoint(random, hOverride = null, surface = 1) {
  const h = hOverride ?? Math.pow(random(), 1.32);
  const tier = (h * 9.2) % 1;
  const radius = treeRadius(h);
  const branch = 0.8 + 0.2 * Math.pow(tier, 0.3);
  const shell = 0.68 + 0.34 * Math.pow(random(), 0.45);
  const angle = random() * TAU + h * 6.7;
  const r = radius * branch * shell * surface;
  return {
    h,
    angle,
    radius: r,
    x: Math.cos(angle) * r,
    y: TREE.baseY + h * TREE.height + (random() - 0.5) * 0.14,
    z: Math.sin(angle) * r,
  };
}

function makeScatterTarget(random, options = {}) {
  const inner = options.inner ?? 3.2;
  const outer = options.outer ?? 8.4;
  const ySpread = options.ySpread ?? 6.4;
  const angle = random() * TAU + (options.swirl ?? 0);
  const radius = inner + Math.pow(random(), 1.15) * (outer - inner);
  const y = 0.9 + (random() - 0.5) * ySpread + Math.sin(angle * 1.7) * 0.35;
  return new THREE.Vector3(
    Math.cos(angle) * radius,
    y,
    Math.sin(angle) * radius * (0.68 + random() * 0.22),
  );
}

function makeGlowTexture(stops) {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [offset, color] of stops) gradient.addColorStop(offset, color);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeStripedTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f6ead2';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.strokeStyle = '#a4202d';
  ctx.lineWidth = 48;
  for (let x = -160; x < canvas.width + 180; x += 112) {
    ctx.beginPath();
    ctx.moveTo(x, canvas.height + 30);
    ctx.lineTo(x + 150, -30);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(95, 15, 24, 0.32)';
  ctx.lineWidth = 6;
  for (let x = -160; x < canvas.width + 180; x += 112) {
    ctx.beginPath();
    ctx.moveTo(x + 14, canvas.height + 30);
    ctx.lineTo(x + 164, -30);
    ctx.stroke();
  }
  ctx.restore();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2.5, 1);
  texture.anisotropy = 4;
  return texture;
}

function drawPineTree(ctx, x, baseY, height, width, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, baseY - height);
  for (let i = 1; i <= 3; i += 1) {
    const y = baseY - height + (height * i) / 3;
    ctx.lineTo(x + width * (i / 3), y);
    ctx.lineTo(x + width * (i / 3) * 0.52, y + 1);
  }
  ctx.lineTo(x + width * 0.12, baseY);
  ctx.lineTo(x - width * 0.12, baseY);
  for (let i = 3; i >= 1; i -= 1) {
    const y = baseY - height + (height * i) / 3;
    ctx.lineTo(x - width * (i / 3) * 0.52, y + 1);
    ctx.lineTo(x - width * (i / 3), y);
  }
  ctx.closePath();
  ctx.fill();
}

function createMemoryTexture(seed, variant, caption = 'NOËL · MMXXV') {
  const random = mulberry32(seed);
  const W = 420;
  const H = 520;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  const palettes = [
    { skyTop: '#17281f', skyMid: '#80533f', glow: '#e9b97d', ridge: '#1a2b23', snow: '#d8c6a5', accent: '#b33b3d' },
    { skyTop: '#0c1e1d', skyMid: '#526c60', glow: '#e4c48a', ridge: '#12251d', snow: '#d8d4c1', accent: '#b78642' },
    { skyTop: '#111d29', skyMid: '#4c5f71', glow: '#e8d2a5', ridge: '#17252a', snow: '#d7dddc', accent: '#9f3540' },
    { skyTop: '#24160f', skyMid: '#8e5c31', glow: '#f4d395', ridge: '#241d13', snow: '#e0c9a2', accent: '#962c34' },
  ];
  const palette = palettes[variant % palettes.length];

  // Paper border.
  ctx.fillStyle = '#f0e5d1';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#d8c7a9';
  ctx.fillRect(18, 18, W - 36, H - 36);
  ctx.fillStyle = '#efe3ce';
  ctx.fillRect(20, 20, W - 40, H - 40);

  ctx.save();
  ctx.beginPath();
  ctx.rect(28, 28, W - 56, 412);
  ctx.clip();

  const horizon = 296;
  const sky = ctx.createLinearGradient(0, 28, 0, horizon + 46);
  sky.addColorStop(0, palette.skyTop);
  sky.addColorStop(0.55, palette.skyMid);
  sky.addColorStop(1, palette.glow);
  ctx.fillStyle = sky;
  ctx.fillRect(28, 28, W - 56, 440);

  // Low winter sun and atmospheric bloom.
  const sunX = 90 + random() * 240;
  const sunY = 100 + random() * 80;
  const glow = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, 150);
  glow.addColorStop(0, 'rgba(255, 231, 179, 0.85)');
  glow.addColorStop(0.16, 'rgba(255, 211, 139, 0.44)');
  glow.addColorStop(0.55, 'rgba(222, 151, 82, 0.12)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(28, 28, W - 56, 440);
  ctx.fillStyle = 'rgba(255, 235, 190, 0.82)';
  ctx.beginPath();
  ctx.arc(sunX, sunY, 12 + random() * 5, 0, TAU);
  ctx.fill();

  // Distant ridges.
  for (let layer = 0; layer < 3; layer += 1) {
    const yBase = horizon - 36 + layer * 26;
    ctx.beginPath();
    ctx.moveTo(28, yBase);
    let x = 28;
    while (x < W - 28) {
      x += 12 + random() * 34;
      ctx.lineTo(x, yBase - 9 - random() * (35 + layer * 10));
    }
    ctx.lineTo(W - 28, horizon + 60);
    ctx.lineTo(28, horizon + 60);
    ctx.closePath();
    ctx.fillStyle = `rgba(${20 + layer * 5}, ${32 + layer * 7}, ${27 + layer * 6}, ${0.38 + layer * 0.2})`;
    ctx.fill();
  }

  // Snow field.
  const snow = ctx.createLinearGradient(0, horizon - 8, 0, 440);
  snow.addColorStop(0, palette.snow);
  snow.addColorStop(0.6, '#b9ad95');
  snow.addColorStop(1, '#776f60');
  ctx.fillStyle = snow;
  ctx.fillRect(28, horizon - 8, W - 56, 440 - horizon);

  // A little cabin, warm window light.
  const cabinX = 88 + random() * (W - 250);
  const cabinY = horizon + 24 + random() * 30;
  const cabinW = 54 + random() * 14;
  const cabinH = 30 + random() * 8;
  ctx.fillStyle = '#2a2119';
  ctx.fillRect(cabinX, cabinY, cabinW, cabinH);
  ctx.beginPath();
  ctx.moveTo(cabinX - 8, cabinY);
  ctx.lineTo(cabinX + cabinW / 2, cabinY - 24);
  ctx.lineTo(cabinX + cabinW + 8, cabinY);
  ctx.closePath();
  ctx.fillStyle = '#e0d8c9';
  ctx.fill();
  ctx.fillStyle = 'rgba(249, 192, 102, 0.95)';
  ctx.fillRect(cabinX + 10, cabinY + 12, 11, 10);
  ctx.fillStyle = 'rgba(255, 214, 135, 0.28)';
  ctx.beginPath();
  ctx.arc(cabinX + 16, cabinY + 17, 28, 0, TAU);
  ctx.fill();

  // Pine forest, front dark to back light.
  for (let layer = 0; layer < 3; layer += 1) {
    const count = layer === 2 ? 19 : 12;
    for (let i = 0; i < count; i += 1) {
      const x = 34 + (i / count) * (W - 68) + (random() - 0.5) * 24;
      const baseY = horizon + 44 + layer * 38 + random() * 20;
      const h = (46 + random() * 70) * (1 + layer * 0.2);
      const w = h * (0.34 + random() * 0.12);
      const shade = layer === 0 ? 'rgba(19, 36, 29, 0.42)' : layer === 1 ? 'rgba(12, 28, 21, 0.7)' : 'rgba(5, 17, 12, 0.9)';
      drawPineTree(ctx, x, baseY, h, w, shade);
    }
  }

  // Expressive foreground branches.
  ctx.strokeStyle = 'rgba(11, 24, 17, 0.82)';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  if (random() > 0.35) {
    ctx.beginPath();
    ctx.moveTo(28, 210 + random() * 70);
    ctx.bezierCurveTo(60, 204, 78, 188, 112, 198);
    ctx.stroke();
    for (let i = 0; i < 9; i += 1) {
      const t = i / 9;
      const x = 28 + t * 86;
      const y = 210 - t * 14 + Math.sin(t * 5) * 8;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 9, y - 16 - random() * 9);
      ctx.stroke();
    }
  }

  // Warm specks of snow.
  for (let i = 0; i < 150; i += 1) {
    const x = 28 + random() * (W - 56);
    const y = 28 + random() * 410;
    const size = 0.5 + random() * 1.7;
    ctx.fillStyle = `rgba(255, 242, 213, ${0.2 + random() * 0.55})`;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, TAU);
    ctx.fill();
  }

  // Bokeh halo.
  for (let i = 0; i < 8; i += 1) {
    const x = 34 + random() * (W - 68);
    const y = 32 + random() * 280;
    const radius = 4 + random() * 19;
    const bokeh = ctx.createRadialGradient(x, y, 0, x, y, radius);
    bokeh.addColorStop(0, 'rgba(255, 225, 168, 0.2)');
    bokeh.addColorStop(1, 'rgba(255, 225, 168, 0)');
    ctx.fillStyle = bokeh;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  // Vignette inside the image.
  const vignette = ctx.createRadialGradient(W / 2, 235, 80, W / 2, 235, 300);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(2, 7, 5, 0.54)');
  ctx.fillStyle = vignette;
  ctx.fillRect(28, 28, W - 56, 412);

  // Fine film grain.
  for (let i = 0; i < 950; i += 1) {
    ctx.fillStyle = random() > 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.045)';
    ctx.fillRect(28 + random() * (W - 56), 28 + random() * 412, 1, 1);
  }
  ctx.restore();

  // Hairline frame inside the paper.
  ctx.strokeStyle = 'rgba(61, 55, 40, 0.24)';
  ctx.lineWidth = 1;
  ctx.strokeRect(28, 28, W - 56, 412);

  // Caption.
  ctx.fillStyle = '#313429';
  ctx.font = 'italic 27px "Bodoni MT", "Times New Roman", serif';
  ctx.textAlign = 'left';
  ctx.fillText('Noël', 38, 486);
  ctx.font = '9px "Segoe UI", sans-serif';
  ctx.fillStyle = 'rgba(49, 52, 41, 0.62)';
  ctx.letterSpacing = '2px';
  ctx.fillText(caption, 38, 504);

  // Gold star accent.
  ctx.fillStyle = '#a8813e';
  ctx.save();
  ctx.translate(W - 48, 488);
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const radius = i % 2 ? 3 : 7;
    const angle = (i / 10) * TAU - Math.PI / 2;
    ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function createUserPhotoTexture(image, index) {
  const W = 420;
  const H = 520;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f0e5d1';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#d8c7a9';
  ctx.fillRect(18, 18, W - 36, H - 36);
  ctx.fillStyle = '#efe3ce';
  ctx.fillRect(20, 20, W - 40, H - 40);

  ctx.save();
  ctx.beginPath();
  ctx.rect(28, 28, W - 56, 412);
  ctx.clip();
  const imageAspect = image.width / image.height;
  const targetAspect = (W - 56) / 412;
  let drawWidth = W - 56;
  let drawHeight = 412;
  if (imageAspect > targetAspect) {
    drawWidth = 412 * imageAspect;
  } else {
    drawHeight = (W - 56) / imageAspect;
  }
  ctx.drawImage(image, 28 + (W - 56 - drawWidth) / 2, 28 + (412 - drawHeight) / 2, drawWidth, drawHeight);
  const vignette = ctx.createRadialGradient(W / 2, 235, 90, W / 2, 235, 300);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(2, 7, 5, 0.4)');
  ctx.fillStyle = vignette;
  ctx.fillRect(28, 28, W - 56, 412);
  ctx.restore();

  ctx.strokeStyle = 'rgba(61, 55, 40, 0.24)';
  ctx.lineWidth = 1;
  ctx.strokeRect(28, 28, W - 56, 412);
  ctx.fillStyle = '#313429';
  ctx.font = 'italic 26px "Bodoni MT", "Times New Roman", serif';
  ctx.fillText('Notre mémoire', 38, 486);
  ctx.font = '9px "Segoe UI", sans-serif';
  ctx.fillStyle = 'rgba(49, 52, 41, 0.62)';
  ctx.fillText(`A MEMORY IN LIGHT · ${String(index + 1).padStart(2, '0')}`, 38, 504);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function createParticleField(count) {
  const random = mulberry32(881225);
  const positions = new Float32Array(count * 3);
  const scatter = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const seeds = new Float32Array(count * 4);

  const greenDark = new THREE.Color().setRGB(0.035, 0.16, 0.088);
  const greenMid = new THREE.Color().setRGB(0.062, 0.3, 0.16);
  const greenLight = new THREE.Color().setRGB(0.115, 0.45, 0.265);
  const gold = new THREE.Color().setRGB(0.98, 0.69, 0.28);
  const goldDim = new THREE.Color().setRGB(0.5, 0.34, 0.13);
  const red = new THREE.Color().setRGB(0.62, 0.06, 0.08);

  for (let i = 0; i < count; i += 1) {
    const point = sampleTreePoint(random);
    positions[i * 3] = point.x;
    positions[i * 3 + 1] = point.y;
    positions[i * 3 + 2] = point.z;

    const scatterAngle = random() * TAU;
    const scatterRadius = 1.4 + Math.pow(random(), 1.55) * 8.4;
    const target = new THREE.Vector3(
      Math.cos(scatterAngle) * scatterRadius,
      clamp(0.8 + (random() - 0.5) * 6.5 + Math.sin(scatterAngle * 1.8) * 0.7, -3.7, 5.2),
      Math.sin(scatterAngle) * scatterRadius * (0.68 + random() * 0.2),
    );
    scatter[i * 3] = target.x;
    scatter[i * 3 + 1] = target.y;
    scatter[i * 3 + 2] = target.z;

    const roll = random();
    const color = new THREE.Color();
    if (roll > 0.955) {
      color.copy(gold).lerp(goldDim, random() * 0.55);
    } else if (roll > 0.925) {
      color.copy(red).lerp(goldDim, random() * 0.22);
    } else if (roll > 0.85) {
      color.copy(goldDim).lerp(greenLight, random() * 0.36);
    } else if (roll > 0.6) {
      color.copy(greenMid).lerp(greenLight, random() * 0.55);
    } else {
      color.copy(greenDark).lerp(greenMid, random() * 0.66);
    }
    const brightness = 0.8 + random() * 0.55;
    colors[i * 3] = color.r * brightness;
    colors[i * 3 + 1] = color.g * brightness;
    colors[i * 3 + 2] = color.b * brightness;

    seeds[i * 4] = random();
    seeds[i * 4 + 1] = random();
    seeds[i * 4 + 2] = random();
    seeds[i * 4 + 3] = random();
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aScatter', new THREE.BufferAttribute(scatter, 3));
  geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
  geometry.computeBoundingSphere();

  return geometry;
}

export class ChristmasTree {
  constructor(scene, renderer, camera) {
    this.scene = scene;
    this.renderer = renderer;
    this.camera = camera;
    this.group = new THREE.Group();
    this.group.position.y = 0;
    scene.add(this.group);

    this.morph = 0;
    this.floaters = [];
    this.photos = [];
    this.random = mulberry32(12052025);
    this.isMobile = window.matchMedia('(max-width: 700px)').matches;
    this.particleCount = this.isMobile ? 9800 : 16480;
    this._tempQuat = new THREE.Quaternion();
    this._tempQuat2 = new THREE.Quaternion();
    this._tempEuler = new THREE.Euler();
    this._tempVec = new THREE.Vector3();

    this._createMaterials();
    this._createParticles();
    this._createGarlands();
    this._createBalls();
    this._createCubes();
    this._createCandyCanes();
    this._createPhotos();
    this._createGifts();
    this._createStar();
    this._createBaseDetails();
  }

  _createMaterials() {
    this.goldMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xb88636,
      metalness: 0.92,
      roughness: 0.24,
      clearcoat: 0.9,
      clearcoatRoughness: 0.18,
      envMapIntensity: 1.05,
      emissive: 0x2a1703,
      emissiveIntensity: 0.18,
    });
    this.redMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x6f0d17,
      metalness: 0.38,
      roughness: 0.3,
      clearcoat: 0.9,
      clearcoatRoughness: 0.15,
      envMapIntensity: 0.8,
      emissive: 0x250306,
      emissiveIntensity: 0.18,
    });
    this.pearlMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xe8ddc6,
      metalness: 0.45,
      roughness: 0.18,
      clearcoat: 1,
      clearcoatRoughness: 0.1,
      envMapIntensity: 1.1,
      emissive: 0x2a2114,
      emissiveIntensity: 0.08,
    });
    this.deepGreenMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x0a2b1c,
      metalness: 0.4,
      roughness: 0.32,
      clearcoat: 0.7,
      clearcoatRoughness: 0.22,
      envMapIntensity: 0.8,
      emissive: 0x020905,
      emissiveIntensity: 0.2,
    });
    this.bulbMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      toneMapped: true,
      transparent: true,
      opacity: 1,
    });
    this.stringMaterial = new THREE.LineBasicMaterial({
      color: 0xd8b16c,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
    });
  }

  _createParticles() {
    const geometry = createParticleField(this.particleCount);
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.NormalBlending,
      uniforms: {
        uTime: { value: 0 },
        uMorph: { value: 0 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 1.8) },
        uPointScale: { value: 600 },
      },
      vertexShader: /* glsl */ `
        attribute vec3 aScatter;
        attribute vec3 aColor;
        attribute vec4 aSeed;
        uniform float uTime;
        uniform float uMorph;
        uniform float uPixelRatio;
        uniform float uPointScale;
        varying vec3 vColor;
        varying float vAlpha;

        mat2 rotate2d(float angle) {
          float s = sin(angle);
          float c = cos(angle);
          return mat2(c, -s, s, c);
        }

        void main() {
          float delay = aSeed.x * 0.24;
          float local = clamp((uMorph - delay) / max(0.0001, 1.0 - delay), 0.0, 1.0);
          local = local * local * (3.0 - 2.0 * local);

          vec3 treePosition = position;
          vec3 pos = mix(treePosition, aScatter, local);

          float burst = sin(local * 3.14159265);
          vec3 radial = normalize(vec3(treePosition.x, treePosition.y * 0.45 + 0.2, treePosition.z) + vec3(0.0001));
          pos += radial * burst * (0.45 + aSeed.y * 1.15);
          pos.xz = rotate2d(burst * (aSeed.z - 0.5) * 1.6) * pos.xz;
          pos.y += sin(local * 3.14159265) * (aSeed.w - 0.5) * 0.65;

          float drift = local;
          pos.x += sin(uTime * (0.17 + aSeed.w * 0.15) + aSeed.x * 24.0) * 0.24 * drift;
          pos.y += cos(uTime * (0.14 + aSeed.z * 0.16) + aSeed.y * 21.0) * 0.28 * drift;
          pos.z += sin(uTime * (0.19 + aSeed.y * 0.14) + aSeed.w * 17.0) * 0.22 * drift;

          vec4 mv = modelViewMatrix * vec4(pos, 1.0);
          gl_Position = projectionMatrix * mv;

          float twinkle = 0.76 + 0.24 * sin(uTime * (1.05 + aSeed.w * 2.1) + aSeed.x * 38.0);
          float worldSize = 0.024 + aSeed.w * 0.034 + local * 0.008;
          gl_PointSize = clamp(worldSize * uPointScale * twinkle / max(1.0, -mv.z), 0.8, 5.2) * uPixelRatio;

          float warmth = smoothstep(0.58, 1.0, aSeed.y);
          vColor = aColor * (1.0 + local * 0.28) * (0.82 + twinkle * 0.22);
          vColor += vec3(0.16, 0.11, 0.035) * warmth * 0.22;
          vAlpha = (0.44 + aSeed.z * 0.46) * mix(1.0, 0.62, local) * (0.7 + twinkle * 0.3);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        varying float vAlpha;

        void main() {
          vec2 p = gl_PointCoord - 0.5;
          float d = length(p) * 2.0;
          float halo = smoothstep(1.0, 0.04, d);
          float core = smoothstep(0.48, 0.0, d);
          float alpha = vAlpha * halo * (0.7 + core * 0.45);
          if (alpha < 0.01) discard;
          vec3 color = vColor + core * vec3(0.24, 0.18, 0.08);
          gl_FragColor = vec4(color, alpha);
        }
      `,
    });

    this.needles = new THREE.Points(geometry, material);
    this.needles.frustumCulled = false;
    this.particleMaterial = material;
    this.group.add(this.needles);

    const topMistGeometry = new THREE.BufferGeometry();
    const mistCount = 260;
    const mistPositions = new Float32Array(mistCount * 3);
    const mistSeeds = new Float32Array(mistCount * 4);
    for (let i = 0; i < mistCount; i += 1) {
      const angle = this.random() * TAU;
      const radius = 0.2 + Math.pow(this.random(), 2.2) * 3.2;
      const h = 0.7 + this.random() * 0.28;
      mistPositions[i * 3] = Math.cos(angle) * radius;
      mistPositions[i * 3 + 1] = TREE.baseY + h * TREE.height + (this.random() - 0.5) * 1.1;
      mistPositions[i * 3 + 2] = Math.sin(angle) * radius;
      mistSeeds[i * 4] = this.random();
      mistSeeds[i * 4 + 1] = this.random();
      mistSeeds[i * 4 + 2] = this.random();
      mistSeeds[i * 4 + 3] = this.random();
    }
    topMistGeometry.setAttribute('position', new THREE.BufferAttribute(mistPositions, 3));
    topMistGeometry.setAttribute('aSeed', new THREE.BufferAttribute(mistSeeds, 4));
    const mistMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uMorph: { value: 0 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 1.8) },
      },
      vertexShader: /* glsl */ `
        attribute vec4 aSeed;
        uniform float uTime;
        uniform float uMorph;
        uniform float uPixelRatio;
        varying float vAlpha;
        void main() {
          vec3 pos = position;
          pos.x += sin(uTime * 0.4 + aSeed.x * 18.0) * 0.16;
          pos.y += cos(uTime * 0.3 + aSeed.y * 15.0) * 0.18;
          pos.z += sin(uTime * 0.36 + aSeed.z * 21.0) * 0.16;
          vec4 mv = modelViewMatrix * vec4(pos, 1.0);
          gl_Position = projectionMatrix * mv;
          float size = (0.035 + aSeed.w * 0.06) * 550.0 / max(1.0, -mv.z);
          gl_PointSize = clamp(size, 1.0, 5.0) * uPixelRatio;
          vAlpha = (0.18 + aSeed.z * 0.4) * (1.0 - uMorph * 0.8);
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          float alpha = smoothstep(1.0, 0.0, d) * vAlpha;
          gl_FragColor = vec4(vec3(1.0, 0.82, 0.48), alpha);
        }
      `,
    });
    this.topMist = new THREE.Points(topMistGeometry, mistMaterial);
    this.topMist.frustumCulled = false;
    this.group.add(this.topMist);
  }

  _createGarlands() {
    this.garlandMaterials = [];
    const makeHelix = (phase, turns, radiusScale, yStart, yEnd, radialOffset = 0) => {
      const pts = [];
      const steps = 260;
      for (let i = 0; i <= steps; i += 1) {
        const t = i / steps;
        const h = yStart + t * (yEnd - yStart);
        const radius = treeRadius(h) * radiusScale + radialOffset;
        const angle = phase + t * TAU * turns;
        pts.push(new THREE.Vector3(
          Math.cos(angle) * radius,
          TREE.baseY + h * TREE.height,
          Math.sin(angle) * radius,
        ));
      }
      return new THREE.CatmullRomCurve3(pts);
    };

    this.garlandGroup = new THREE.Group();
    const goldCurve = makeHelix(0.45, 2.4, 1.015, 0.05, 0.94);
    const goldMaterial = new THREE.MeshStandardMaterial({
      color: 0x80551d,
      metalness: 1,
      roughness: 0.28,
      emissive: 0x58380d,
      emissiveIntensity: 0.5,
      transparent: true,
      opacity: 1,
    });
    const goldGarland = new THREE.Mesh(new THREE.TubeGeometry(goldCurve, 420, 0.016, 5, false), goldMaterial);
    this.garlandGroup.add(goldGarland);
    this.garlandMaterials.push(goldMaterial);

    const redCurve = makeHelix(2.6, 1.72, 1.04, 0.12, 0.84);
    const redMaterial = new THREE.MeshStandardMaterial({
      color: 0x6d1119,
      metalness: 0.35,
      roughness: 0.4,
      emissive: 0x44080d,
      emissiveIntensity: 0.5,
      transparent: true,
      opacity: 1,
    });
    const redGarland = new THREE.Mesh(new THREE.TubeGeometry(redCurve, 320, 0.021, 5, false), redMaterial);
    this.garlandGroup.add(redGarland);
    this.garlandMaterials.push(redMaterial);

    const bulbGeometry = new THREE.SphereGeometry(0.065, 10, 8);
    const bulbCount = 74;
    this.bulbs = new THREE.InstancedMesh(bulbGeometry, this.bulbMaterial, bulbCount);
    const dummy = new THREE.Object3D();
    const gold = new THREE.Color().setRGB(1.05, 0.68, 0.2);
    const warmWhite = new THREE.Color().setRGB(1.05, 0.82, 0.42);
    const red = new THREE.Color().setRGB(1.05, 0.1, 0.12);
    for (let i = 0; i < bulbCount; i += 1) {
      const t = (i + 0.5) / bulbCount;
      const point = goldCurve.getPointAt(t);
      dummy.position.copy(point);
      const scale = 0.75 + (Math.sin(i * 7.3) * 0.5 + 0.5) * 0.65;
      dummy.scale.setScalar(scale);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      this.bulbs.setMatrixAt(i, dummy.matrix);
      const color = i % 9 === 0 ? red : i % 7 === 0 ? warmWhite : gold;
      this.bulbs.setColorAt(i, color);
    }
    this.garlandGroup.add(this.bulbs);
    this.group.add(this.garlandGroup);
  }

  _registerFloater(object, {
    collapsedPosition,
    scatterPosition,
    collapsedQuaternion,
    scatterQuaternion,
    baseScale,
    delay = 0.2,
    arc = 0.5,
    spin = 0,
    phase = 0,
    kind = 'ornament',
  }) {
    this.floaters.push({
      object,
      collapsedPosition: collapsedPosition.clone(),
      scatterPosition: scatterPosition.clone(),
      collapsedQuaternion: collapsedQuaternion.clone(),
      scatterQuaternion: scatterQuaternion.clone(),
      baseScale: baseScale ?? 1,
      delay,
      arc,
      spin,
      phase,
      kind,
      position: new THREE.Vector3(),
      quaternion: new THREE.Quaternion(),
    });
  }

  _createBalls() {
    const geometry = new THREE.SphereGeometry(1, 22, 16);
    const capGeometry = new THREE.CylinderGeometry(0.11, 0.15, 0.13, 8);
    const random = this.random;
    const materials = [this.goldMaterial, this.redMaterial, this.pearlMaterial, this.goldMaterial, this.redMaterial];
    const count = this.isMobile ? 28 : 44;

    for (let i = 0; i < count; i += 1) {
      const h = 0.06 + random() * 0.78;
      const point = sampleTreePoint(random, h, 1.06);
      const size = 0.095 + random() * 0.115;
      const material = materials[i % materials.length];
      const group = new THREE.Group();
      const sphere = new THREE.Mesh(geometry, material);
      sphere.rotation.set(random() * TAU, random() * TAU, random() * TAU);
      group.add(sphere);
      const cap = new THREE.Mesh(capGeometry, this.goldMaterial);
      cap.position.y = 1.03;
      cap.rotation.z = (random() - 0.5) * 0.4;
      group.add(cap);
      group.scale.setScalar(size);
      group.position.set(point.x, point.y, point.z);
      this.group.add(group);

      const scatter = makeScatterTarget(random, { inner: 3.4, outer: 8.2, ySpread: 6.4, swirl: random() * 0.7 });
      const collapsedQuaternion = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(0, random() * TAU, 0),
      );
      const scatterQuaternion = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(random() * TAU, random() * TAU, random() * TAU),
      );
      this._registerFloater(group, {
        collapsedPosition: group.position,
        scatterPosition: scatter,
        collapsedQuaternion,
        scatterQuaternion,
        baseScale: size,
        delay: 0.12 + random() * 0.38,
        arc: 0.35 + random() * 0.95,
        spin: (random() - 0.5) * 0.55,
        phase: random() * TAU,
        kind: 'ball',
      });
    }
  }

  _createCubes() {
    const geometry = new RoundedBoxGeometry(1, 1, 1, 3, 0.12);
    const random = this.random;
    const count = this.isMobile ? 12 : 20;
    const materials = [this.goldMaterial, this.redMaterial, this.goldMaterial, this.deepGreenMaterial];

    for (let i = 0; i < count; i += 1) {
      const h = 0.1 + random() * 0.74;
      const point = sampleTreePoint(random, h, 1.1);
      const size = 0.114 + random() * 0.13;
      const material = materials[i % materials.length];
      const mesh = new THREE.Mesh(geometry, material);
      mesh.scale.setScalar(size);
      mesh.position.set(point.x, point.y, point.z);
      const baseQuat = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(random() * TAU, random() * TAU, random() * TAU),
      );
      mesh.quaternion.copy(baseQuat);
      this.group.add(mesh);

      const scatter = makeScatterTarget(random, { inner: 3.2, outer: 8.4, ySpread: 6.8, swirl: random() * 0.9 });
      const scatterQuaternion = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(random() * TAU, random() * TAU, random() * TAU),
      );
      this._registerFloater(mesh, {
        collapsedPosition: mesh.position,
        scatterPosition: scatter,
        collapsedQuaternion: baseQuat,
        scatterQuaternion,
        baseScale: size,
        delay: 0.16 + random() * 0.42,
        arc: 0.55 + random() * 1.2,
        spin: (random() - 0.5) * 0.9,
        phase: random() * TAU,
        kind: 'cube',
      });
    }
  }

  _createCandyCanes() {
    const points = [];
    for (let i = 0; i <= 28; i += 1) {
      const t = i / 28 * 0.68;
      points.push(new THREE.Vector3(0, -0.72 + (t / 0.68) * 1.16, 0));
    }
    for (let i = 1; i <= 14; i += 1) {
      const t = i / 14;
      const angle = t * Math.PI;
      points.push(new THREE.Vector3(0.25 * (1 - Math.cos(angle)), 0.44 + Math.sin(angle) * 0.25, 0));
    }
    const curve = new THREE.CatmullRomCurve3(points);
    const geometry = new THREE.TubeGeometry(curve, 80, 0.055, 9, false);
    const texture = makeStripedTexture();
    const material = new THREE.MeshPhysicalMaterial({
      map: texture,
      color: 0xffffff,
      metalness: 0.08,
      roughness: 0.22,
      clearcoat: 1,
      clearcoatRoughness: 0.12,
      envMapIntensity: 0.75,
    });
    const random = this.random;
    const count = 8;

    for (let i = 0; i < count; i += 1) {
      const h = 0.08 + (i / count) * 0.75 + random() * 0.06;
      const point = sampleTreePoint(random, h, 1.11);
      const group = new THREE.Group();
      const cane = new THREE.Mesh(geometry, material);
      group.add(cane);
      const scale = 0.78 + random() * 0.32;
      group.scale.setScalar(scale);
      group.position.set(point.x, point.y, point.z);
      group.rotation.y = Math.PI / 2 - point.angle + (random() - 0.5) * 0.5;
      group.rotation.z = (random() - 0.5) * 0.55;
      group.rotation.x = (random() - 0.5) * 0.3;
      this.group.add(group);
      const collapsedQuaternion = group.quaternion.clone();
      const scatter = makeScatterTarget(random, { inner: 3.8, outer: 8.6, ySpread: 7.2, swirl: random() * 0.8 });
      const scatterQuaternion = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(random() * TAU, random() * TAU, random() * TAU),
      );
      this._registerFloater(group, {
        collapsedPosition: group.position,
        scatterPosition: scatter,
        collapsedQuaternion,
        scatterQuaternion,
        baseScale: scale,
        delay: 0.1 + random() * 0.4,
        arc: 0.7 + random() * 1.2,
        spin: (random() - 0.5) * 0.8,
        phase: random() * TAU,
        kind: 'candy',
      });
    }
  }

  _createPhotos() {
    const random = this.random;
    const configs = [
      { angle: 0.34, h: 0.18, size: 0.95, variant: 0 },
      { angle: 0.92, h: 0.41, size: 1.08, variant: 1 },
      { angle: 1.48, h: 0.63, size: 0.92, variant: 2 },
      { angle: 2.12, h: 0.32, size: 0.86, variant: 3 },
      { angle: 2.95, h: 0.72, size: 0.94, variant: 0 },
      { angle: 3.74, h: 0.5, size: 1.02, variant: 2 },
      { angle: 4.46, h: 0.24, size: 0.9, variant: 1 },
      { angle: 5.25, h: 0.58, size: 0.88, variant: 3 },
      { angle: 5.92, h: 0.79, size: 0.82, variant: 0 },
    ];
    const photoWidth = 0.72;
    const photoHeight = 0.89;
    const planeGeometry = new THREE.PlaneGeometry(photoWidth, photoHeight);
    const frameGeometry = new THREE.PlaneGeometry(photoWidth + 0.055, photoHeight + 0.055);
    const pinGeometry = new THREE.SphereGeometry(0.022, 8, 6);
    const wireGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, photoHeight / 2 + 0.02, 0),
      new THREE.Vector3(0, photoHeight / 2 + 0.7, 0),
    ]);

    configs.forEach((config, index) => {
      const radius = treeRadius(config.h) * 1.08;
      const point = {
        angle: config.angle,
        x: Math.cos(config.angle) * radius,
        y: TREE.baseY + config.h * TREE.height + (random() - 0.5) * 0.12,
        z: Math.sin(config.angle) * radius,
      };
      const size = config.size;
      const group = new THREE.Group();

      const frame = new THREE.Mesh(frameGeometry, this.goldMaterial);
      frame.position.z = -0.006;
      group.add(frame);

      const texture = createMemoryTexture(4200 + index * 97, config.variant, `A MEMORY · ${String(index + 1).padStart(2, '0')}`);
      const material = new THREE.MeshBasicMaterial({
        map: texture,
        color: 0xffffff,
        side: THREE.DoubleSide,
        toneMapped: false,
      });
      const photo = new THREE.Mesh(planeGeometry, material);
      group.add(photo);

      const pin = new THREE.Mesh(pinGeometry, this.goldMaterial);
      pin.position.set(0, photoHeight / 2 + 0.02, 0.012);
      group.add(pin);

      const wire = new THREE.Line(wireGeometry, this.stringMaterial);
      group.add(wire);

      group.scale.setScalar(size);
      group.position.set(point.x, point.y, point.z);
      group.rotation.y = Math.PI / 2 - point.angle + (random() - 0.5) * 0.18;
      group.rotation.z = (random() - 0.5) * 0.08;
      this.group.add(group);

      const collapsedQuaternion = group.quaternion.clone();
      const scatter = makeScatterTarget(random, { inner: 4.6, outer: 8.8, ySpread: 6.2, swirl: random() * 0.7 });
      const scatterAngle = Math.atan2(scatter.z, scatter.x);
      const scatterQuaternion = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(
          (random() - 0.5) * 0.36,
          Math.PI / 2 - scatterAngle + (random() - 0.5) * 0.3,
          (random() - 0.5) * 0.18,
        ),
      );
      this._registerFloater(group, {
        collapsedPosition: group.position,
        scatterPosition: scatter,
        collapsedQuaternion,
        scatterQuaternion,
        baseScale: size,
        delay: 0.05 + index * 0.025,
        arc: 0.9 + random() * 1.2,
        spin: (random() - 0.5) * 0.3,
        phase: random() * TAU,
        kind: 'photo',
      });
      this.photos.push({ group, photo, frame, texture, index });
    });
  }

  _createGifts() {
    const random = this.random;
    const positions = [
      { x: 2.85, z: 1.35, rotation: -0.38, color: this.redMaterial, size: 1.02 },
      { x: -2.58, z: 1.72, rotation: 0.34, color: this.deepGreenMaterial, size: 0.86 },
      { x: 0.85, z: -2.4, rotation: 0.72, color: this.redMaterial, size: 0.72 },
      { x: -2.1, z: -1.1, rotation: -0.6, color: this.goldMaterial, size: 0.64 },
    ];

    for (const config of positions) {
      const group = new THREE.Group();
      const width = 1.15 * config.size;
      const height = 0.74 * config.size;
      const depth = 1.08 * config.size;

      const box = new THREE.Mesh(new RoundedBoxGeometry(width, height, depth, 3, 0.07), config.color);
      group.add(box);

      const ribbonThickness = 0.11 * config.size;
      const ribbonVertical = new THREE.Mesh(
        new THREE.BoxGeometry(ribbonThickness, height + 0.012, depth + 0.012),
        this.goldMaterial,
      );
      group.add(ribbonVertical);
      const ribbonHorizontal = new THREE.Mesh(
        new THREE.BoxGeometry(width + 0.012, ribbonThickness, depth + 0.012),
        this.goldMaterial,
      );
      group.add(ribbonHorizontal);

      const bowGroup = new THREE.Group();
      const loopGeometry = new THREE.TorusGeometry(0.19, 0.035, 7, 20);
      const loopA = new THREE.Mesh(loopGeometry, this.goldMaterial);
      loopA.scale.set(1.3, 0.72, 1);
      loopA.rotation.z = 0.66;
      loopA.position.x = -0.14;
      const loopB = new THREE.Mesh(loopGeometry, this.goldMaterial);
      loopB.scale.set(1.3, 0.72, 1);
      loopB.rotation.z = -0.66;
      loopB.position.x = 0.14;
      const knot = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), this.goldMaterial);
      bowGroup.add(loopA, loopB, knot);
      bowGroup.position.y = height / 2 + 0.08;
      group.add(bowGroup);

      group.position.set(config.x, -4.52 + height / 2, config.z);
      group.rotation.y = config.rotation;
      this.group.add(group);
      const collapsedQuaternion = group.quaternion.clone();
      const scatter = new THREE.Vector3(
        config.x * 1.34 + (random() - 0.5) * 1.3,
        -1.6 + random() * 4.2,
        config.z * 1.2 + (random() - 0.5) * 1.5,
      );
      const scatterQuaternion = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(random() * TAU, random() * TAU, random() * TAU),
      );
      this._registerFloater(group, {
        collapsedPosition: group.position,
        scatterPosition: scatter,
        collapsedQuaternion,
        scatterQuaternion,
        baseScale: 1,
        delay: 0.18 + random() * 0.3,
        arc: 0.35 + random() * 0.8,
        spin: (random() - 0.5) * 0.45,
        phase: random() * TAU,
        kind: 'gift',
      });
    }
  }

  _createStar() {
    const shape = new THREE.Shape();
    for (let i = 0; i < 10; i += 1) {
      const radius = i % 2 === 0 ? 1 : 0.43;
      const angle = -Math.PI / 2 + (i / 10) * TAU;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      if (i === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    }
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: 0.16,
      bevelEnabled: true,
      bevelSegments: 3,
      bevelSize: 0.05,
      bevelThickness: 0.045,
      steps: 1,
    });
    geometry.center();
    const material = new THREE.MeshPhysicalMaterial({
      color: 0xd9a33f,
      metalness: 0.82,
      roughness: 0.24,
      clearcoat: 0.75,
      clearcoatRoughness: 0.16,
      envMapIntensity: 0.9,
      emissive: 0x5c3709,
      emissiveIntensity: 0.22,
    });
    this.starGroup = new THREE.Group();
    const star = new THREE.Mesh(geometry, material);
    star.scale.setScalar(0.78);
    this.starGroup.add(star);
    this.starMesh = star;

    const haloTexture = makeGlowTexture([
      [0, 'rgba(255, 240, 198, 0.9)'],
      [0.12, 'rgba(255, 216, 139, 0.44)'],
      [0.38, 'rgba(226, 169, 76, 0.12)'],
      [1, 'rgba(0,0,0,0)'],
    ]);
    this.starGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: haloTexture,
        transparent: true,
        opacity: 0.16,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.starGlow.scale.set(1.55, 1.55, 1);
    this.starGroup.add(this.starGlow);

    const haloTorus = new THREE.Mesh(
      new THREE.RingGeometry(1.1, 1.115, 128),
      new THREE.MeshBasicMaterial({
        color: 0xffd284,
        transparent: true,
        opacity: 0.48,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.starRing = haloTorus;
    this.starGroup.add(haloTorus);

    const haloTorus2 = new THREE.Mesh(
      new THREE.RingGeometry(1.42, 1.428, 128),
      new THREE.MeshBasicMaterial({
        color: 0xd8a758,
        transparent: true,
        opacity: 0.18,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.starRing2 = haloTorus2;
    this.starGroup.add(haloTorus2);

    this.starGroup.position.set(0, TREE.starY, 0);
    this.group.add(this.starGroup);

    this.starLight = new THREE.PointLight(0xffd58b, 11, 10, 1.9);
    this.starLight.position.set(0, TREE.starY, 0.5);
    this.group.add(this.starLight);

    const sparkleTexture = makeGlowTexture([
      [0, 'rgba(255, 244, 210, 0.55)'],
      [0.4, 'rgba(226, 175, 86, 0.11)'],
      [1, 'rgba(0,0,0,0)'],
    ]);
    this.starSparkles = [];
    for (let i = 0; i < 5; i += 1) {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: sparkleTexture,
          transparent: true,
          opacity: 0.25 + Math.random() * 0.3,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      sprite.scale.setScalar(0.18 + Math.random() * 0.2);
      sprite.userData.angle = Math.random() * TAU;
      sprite.userData.radius = 1.1 + Math.random() * 0.8;
      sprite.userData.speed = 0.18 + Math.random() * 0.18;
      sprite.userData.yOffset = (Math.random() - 0.5) * 1.1;
      this.starGroup.add(sprite);
      this.starSparkles.push(sprite);
    }
  }

  _createBaseDetails() {
    const random = mulberry32(4401);
    const geometry = new THREE.BufferGeometry();
    const count = 420;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      const angle = random() * TAU;
      const radius = 1.2 + random() * 5.3;
      positions[i * 3] = Math.cos(angle) * radius;
      positions[i * 3 + 1] = -4.46 + random() * 0.16;
      positions[i * 3 + 2] = Math.sin(angle) * radius;
      const gold = random() > 0.45;
      colors[i * 3] = gold ? 1.2 : 0.18;
      colors[i * 3 + 1] = gold ? 0.82 : 0.38;
      colors[i * 3 + 2] = gold ? 0.34 : 0.23;
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const material = new THREE.PointsMaterial({
      size: 0.045,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.baseDust = new THREE.Points(geometry, material);
    this.group.add(this.baseDust);
  }

  async setUserPhotos(files) {
    const imageFiles = [...files].filter((file) => file.type.startsWith('image/')).slice(0, this.photos.length);
    let applied = 0;
    for (const file of imageFiles) {
      const image = await new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
          URL.revokeObjectURL(url);
          resolve(img);
        };
        img.onerror = () => {
          URL.revokeObjectURL(url);
          reject(new Error('image load failed'));
        };
        img.src = url;
      });
      const photo = this.photos[applied];
      const texture = createUserPhotoTexture(image, applied);
      photo.photo.material.map?.dispose();
      photo.photo.material.map = texture;
      photo.photo.material.needsUpdate = true;
      photo.texture = texture;
      applied += 1;
    }
    return applied;
  }

  update(dt, elapsed, morph) {
    this.morph = morph;
    this.particleMaterial.uniforms.uTime.value = elapsed;
    this.particleMaterial.uniforms.uMorph.value = morph;
    this.particleMaterial.uniforms.uPixelRatio.value = Math.min(window.devicePixelRatio || 1, 1.8);
    this.particleMaterial.uniforms.uPointScale.value = (
      window.innerHeight * 0.5 / Math.tan((this.camera.fov * Math.PI) / 360)
    );
    this.topMist.material.uniforms.uTime.value = elapsed;
    this.topMist.material.uniforms.uMorph.value = morph;
    this.topMist.material.uniforms.uPixelRatio.value = Math.min(window.devicePixelRatio || 1, 1.8);

    const scatterFactor = smoothstep(0.05, 0.96, morph);
    this.baseDust.material.opacity = 0.8 * (1 - scatterFactor * 0.85);

    // Gold ribbons dissolve before the ornaments leave.
    const garlandOpacity = 1 - smoothstep(0.06, 0.4, morph);
    this.garlandGroup.visible = garlandOpacity > 0.015;
    for (const material of this.garlandMaterials) material.opacity = garlandOpacity;
    this.bulbs.material.opacity = garlandOpacity;
    this.bulbs.material.transparent = true;
    this.stringMaterial.opacity = 0.3 * (1 - smoothstep(0.08, 0.55, morph));

    for (const floater of this.floaters) {
      const local = smoothstep(floater.delay, Math.min(0.98, floater.delay + 0.62), morph);
      const eased = local * local * (3 - 2 * local);
      const object = floater.object;
      object.position.lerpVectors(floater.collapsedPosition, floater.scatterPosition, eased);

      const arcDir = this._tempVec.copy(floater.scatterPosition).sub(floater.collapsedPosition);
      arcDir.y = 0;
      if (arcDir.lengthSq() > 0.0001) arcDir.normalize();
      object.position.addScaledVector(arcDir, Math.sin(eased * Math.PI) * floater.arc);
      object.position.y += Math.sin(eased * Math.PI) * floater.arc * 0.35;

      const floatStrength = eased;
      object.position.x += Math.sin(elapsed * 0.31 + floater.phase) * 0.13 * floatStrength;
      object.position.y += Math.sin(elapsed * 0.47 + floater.phase * 1.7) * 0.12 * floatStrength;
      object.position.z += Math.cos(elapsed * 0.27 + floater.phase * 0.8) * 0.11 * floatStrength;

      object.quaternion.copy(floater.collapsedQuaternion).slerp(floater.scatterQuaternion, eased);
      if (floater.spin !== 0) object.rotateY(elapsed * floater.spin * floatStrength);
      const breathe = 1 + Math.sin(elapsed * 0.65 + floater.phase) * 0.018 * floatStrength;
      if (floater.kind === 'photo') {
        if (floatStrength > 0.01) {
          this._tempQuat.copy(this.camera.quaternion);
          this._tempEuler.set(
            Math.sin(elapsed * 0.24 + floater.phase) * 0.045,
            Math.sin(elapsed * 0.19 + floater.phase * 0.7) * 0.13,
            Math.sin(elapsed * 0.32 + floater.phase) * 0.045,
          );
          this._tempQuat2.setFromEuler(this._tempEuler);
          this._tempQuat.multiply(this._tempQuat2);
          object.quaternion.slerp(this._tempQuat, floatStrength * 0.82);
        }
        object.rotateZ(Math.sin(elapsed * 0.32 + floater.phase) * 0.025 * floatStrength);
        object.scale.setScalar(floater.baseScale * breathe * (1 + floatStrength * 0.18));
      } else {
        object.scale.setScalar(floater.baseScale * breathe);
      }
    }

    // Star: an anchor of light in both states, with a subtle lift when scattered.
    const starLift = smoothstep(0.1, 0.95, morph);
    this.starGroup.position.y = TREE.starY + starLift * 0.16 + Math.sin(elapsed * 0.55) * 0.045;
    this.starGroup.rotation.y = elapsed * 0.22 + starLift * 0.6;
    this.starGroup.rotation.z = Math.sin(elapsed * 0.36) * 0.045;
    this.starMesh.scale.setScalar(0.78 * (1 + starLift * 0.12));
    this.starGlow.material.opacity = 0.14 + Math.sin(elapsed * 1.1) * 0.025;
    this.starGlow.scale.setScalar((1.55 + Math.sin(elapsed * 0.8) * 0.12) * (1 + starLift * 0.16));
    this.starLight.intensity = 10 + Math.sin(elapsed * 0.9) * 1.8;
    this.starRing.quaternion.copy(this.camera.quaternion);
    this.starRing.rotateZ(elapsed * 0.08);
    this.starRing2.quaternion.copy(this.camera.quaternion);
    this.starRing2.rotateZ(-elapsed * 0.05);
    this.starRing.material.opacity = 0.34 + Math.sin(elapsed * 0.8) * 0.1;
    this.starRing2.material.opacity = 0.14 + Math.sin(elapsed * 0.6 + 1.2) * 0.06;

    for (const sparkle of this.starSparkles) {
      const angle = elapsed * sparkle.userData.speed + sparkle.userData.angle;
      sparkle.position.set(
        Math.cos(angle) * sparkle.userData.radius,
        sparkle.userData.yOffset + Math.sin(angle * 1.7) * 0.22,
        Math.sin(angle) * sparkle.userData.radius,
      );
      sparkle.material.opacity = 0.15 + 0.25 * (0.5 + 0.5 * Math.sin(elapsed * 0.9 + sparkle.userData.angle));
    }
  }
}

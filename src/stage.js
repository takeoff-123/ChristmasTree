import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const TAU = Math.PI * 2;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function mulberry32(seed) {
  return function random() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
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

export class Stage {
  constructor(canvas) {
    this.canvas = canvas;
    this.elapsed = 0;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      alpha: false,
      stencil: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.88;
    this.renderer.setClearColor(0x010302, 1);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x030906, 0.0075);

    this.camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 140);
    this.camera.position.set(0, 1, 20);

    this.orbit = {
      yaw: 0.08,
      pitch: 0.09,
      radius: 20.4,
      targetYaw: 0.08,
      targetPitch: 0.09,
      targetRadius: 20.4,
      target: new THREE.Vector3(0, 0.75, 0),
    };

    this.autoRotate = true;
    this.autoPauseUntil = 0;
    this.handControl = false;
    this.scatterAmount = 0;
    this.isDragging = false;
    this.pointerState = new Map();
    this.lastPointer = { x: 0, y: 0 };
    this.pinchDistance = 0;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    this._setupEnvironment();
    this._setupComposer();
    this._setupBackdrop();
    this._setupLights();
    this._setupGround();
    this._setupAtmosphere();
    this._bindPointer();

    this.onResize = this.onResize.bind(this);
    window.addEventListener('resize', this.onResize);
    this.onResize();
  }

  _setupEnvironment() {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = this.envMap;
    this.scene.environmentIntensity = 0.15;
    pmrem.dispose();
  }

  _setupComposer() {
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.composer = new EffectComposer(this.renderer);
    this.composer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
    this.composer.setSize(window.innerWidth, window.innerHeight);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.bloomPass = new UnrealBloomPass(size, 0.28, 0.5, 0.96);
    this.bloomPass.threshold = 0.96;
    this.bloomPass.strength = 0.28;
    this.bloomPass.radius = 0.5;
    this.outputPass = new OutputPass();
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(this.outputPass);
  }

  _setupBackdrop() {
    const backdropMaterial = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vPosition;
        void main() {
          vPosition = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        varying vec3 vPosition;

        void main() {
          float height = clamp(vPosition.y / 55.0 + 0.52, 0.0, 1.0);
          vec3 low = vec3(0.002, 0.006, 0.004);
          vec3 high = vec3(0.006, 0.019, 0.011);
          vec3 color = mix(low, high, smoothstep(0.0, 0.82, height));

          float auroraA = sin(vPosition.x * 0.095 + uTime * 0.035 + sin(vPosition.z * 0.05) * 1.4);
          float auroraB = sin(vPosition.x * 0.042 - uTime * 0.021 + vPosition.y * 0.13);
          float ribbon = smoothstep(0.18, 1.0, auroraA * 0.5 + 0.5)
            * smoothstep(-0.7, 0.9, auroraB)
            * smoothstep(-14.0, 12.0, vPosition.y);
          color += vec3(0.008, 0.038, 0.020) * ribbon * 0.8;

          float centerDistance = length(vec2(vPosition.x, (vPosition.y - 0.8) * 0.72));
          color += vec3(0.009, 0.006, 0.002) * smoothstep(33.0, 1.0, centerDistance) * 0.48;

          float horizon = exp(-pow((height - 0.47) * 10.0, 2.0));
          color += vec3(0.020, 0.013, 0.004) * horizon;

          gl_FragColor = vec4(color, 1.0);
        }
      `,
    });
    this.backdrop = new THREE.Mesh(new THREE.SphereGeometry(58, 48, 32), backdropMaterial);
    this.scene.add(this.backdrop);

    // Fine star field, with a few warm pinpricks.
    const random = mulberry32(20771224);
    const count = 1100;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const color = new THREE.Color();
    for (let i = 0; i < count; i += 1) {
      const radius = 30 + random() * 23;
      const theta = random() * TAU;
      const phi = Math.acos(2 * random() - 1);
      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = radius * Math.cos(phi) * 0.72 + 3.5;
      positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
      const warm = random() > 0.83;
      color.setRGB(
        warm ? 0.95 : 0.64,
        warm ? 0.78 : 0.76,
        warm ? 0.46 : 0.7,
      );
      const brightness = 0.25 + random() * 0.65;
      colors[i * 3] = color.r * brightness;
      colors[i * 3 + 1] = color.g * brightness;
      colors[i * 3 + 2] = color.b * brightness;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const material = new THREE.PointsMaterial({
      size: 0.075,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.72,
      vertexColors: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.stars = new THREE.Points(geometry, material);
    this.scene.add(this.stars);

    const goldGlow = makeGlowTexture([
      [0, 'rgba(255, 231, 176, 0.7)'],
      [0.18, 'rgba(239, 198, 115, 0.34)'],
      [0.5, 'rgba(178, 124, 50, 0.08)'],
      [1, 'rgba(0,0,0,0)'],
    ]);
    const redGlow = makeGlowTexture([
      [0, 'rgba(236, 92, 91, 0.48)'],
      [0.24, 'rgba(153, 37, 44, 0.2)'],
      [0.65, 'rgba(85, 15, 20, 0.05)'],
      [1, 'rgba(0,0,0,0)'],
    ]);
    const greenGlow = makeGlowTexture([
      [0, 'rgba(123, 176, 139, 0.3)'],
      [0.24, 'rgba(42, 101, 67, 0.17)'],
      [0.6, 'rgba(13, 43, 27, 0.05)'],
      [1, 'rgba(0,0,0,0)'],
    ]);

    this.hazeGroup = new THREE.Group();
    const hazeData = [
      { texture: goldGlow, position: [-10, 4.5, -13], scale: 9, opacity: 0.07 },
      { texture: greenGlow, position: [11, 0, -15], scale: 13, opacity: 0.1 },
      { texture: redGlow, position: [-8, -5, -9], scale: 7, opacity: 0.06 },
      { texture: goldGlow, position: [8, 7, -18], scale: 8, opacity: 0.06 },
      { texture: greenGlow, position: [-13, -2, -20], scale: 16, opacity: 0.07 },
    ];
    for (const item of hazeData) {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: item.texture,
          color: 0xffffff,
          transparent: true,
          opacity: item.opacity,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      sprite.position.set(...item.position);
      sprite.scale.setScalar(item.scale);
      this.hazeGroup.add(sprite);
    }
    this.scene.add(this.hazeGroup);
  }

  _setupLights() {
    this.scene.add(new THREE.HemisphereLight(0x365442, 0x040503, 0.42));

    const key = new THREE.DirectionalLight(0xffd9a5, 1.35);
    key.position.set(-6, 12, 8);
    this.scene.add(key);

    const rim = new THREE.DirectionalLight(0x70a47f, 0.58);
    rim.position.set(8, 5, -9);
    this.scene.add(rim);

    const warmPoint = new THREE.PointLight(0xffc974, 44, 24, 1.8);
    warmPoint.position.set(4.5, 6.5, 5.5);
    this.scene.add(warmPoint);
    this.warmPoint = warmPoint;

    const redPoint = new THREE.PointLight(0xc83f45, 24, 16, 1.9);
    redPoint.position.set(-5.5, -2.2, 4);
    this.scene.add(redPoint);
    this.redPoint = redPoint;

    const greenPoint = new THREE.PointLight(0x4c9b6a, 18, 18, 1.9);
    greenPoint.position.set(4.5, 1.5, -7);
    this.scene.add(greenPoint);
  }

  _setupGround() {
    const groundMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying vec3 vLocal;
        void main() {
          vUv = uv;
          vLocal = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        varying vec2 vUv;
        varying vec3 vLocal;

        void main() {
          vec2 centered = vUv - 0.5;
          float d = length(centered) * 2.0;
          if (d > 1.0) discard;

          float radius = length(vLocal.xy);
          float angle = atan(vLocal.y, vLocal.x);

          vec3 color = mix(vec3(0.007, 0.022, 0.014), vec3(0.001, 0.005, 0.003), smoothstep(0.0, 0.82, d));
          color += vec3(0.018, 0.013, 0.005) * smoothstep(0.5, 0.0, d) * 0.55;

          // Faint concentric inlays on the floor.
          float ring = smoothstep(0.022, 0.0, abs(fract(radius * 0.19) - 0.5) * 2.0 - 0.72);
          color += vec3(0.05, 0.038, 0.016) * ring * smoothstep(0.9, 0.2, d) * 0.18;

          float shimmer = 0.5 + 0.5 * sin(angle * 14.0 + uTime * 0.14 + radius * 1.6);
          color += vec3(0.01, 0.016, 0.009) * shimmer * smoothstep(0.75, 0.3, d) * 0.16;

          float alpha = smoothstep(1.0, 0.18, d) * 0.72;
          gl_FragColor = vec4(color, alpha);
        }
      `,
    });
    const ground = new THREE.Mesh(new THREE.CircleGeometry(26, 128), groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -4.58;
    this.scene.add(ground);
    this.groundMaterial = groundMaterial;

    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0xd5b16b,
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.baseRing = new THREE.Mesh(new THREE.TorusGeometry(3.92, 0.012, 6, 220), ringMaterial);
    this.baseRing.rotation.x = Math.PI / 2;
    this.baseRing.position.y = -4.53;
    this.scene.add(this.baseRing);

    this.baseRingOuter = new THREE.Mesh(
      new THREE.TorusGeometry(5.55, 0.007, 4, 220),
      ringMaterial.clone(),
    );
    this.baseRingOuter.material.opacity = 0.2;
    this.baseRingOuter.rotation.x = Math.PI / 2;
    this.baseRingOuter.position.y = -4.55;
    this.scene.add(this.baseRingOuter);

    const poolTexture = makeGlowTexture([
      [0, 'rgba(238, 201, 127, 0.34)'],
      [0.22, 'rgba(169, 133, 67, 0.16)'],
      [0.58, 'rgba(76, 109, 78, 0.05)'],
      [1, 'rgba(0,0,0,0)'],
    ]);
    const pool = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: poolTexture,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    pool.position.set(0, -4.42, 0.5);
    pool.scale.set(15, 5.4, 1);
    this.scene.add(pool);
  }

  _setupAtmosphere() {
    const random = mulberry32(99172);
    const count = 720;
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count * 4);
    for (let i = 0; i < count; i += 1) {
      positions[i * 3] = (random() - 0.5) * 37;
      positions[i * 3 + 1] = -5 + random() * 17;
      positions[i * 3 + 2] = (random() - 0.5) * 30 - 3;
      seeds[i * 4] = random();
      seeds[i * 4 + 1] = random();
      seeds[i * 4 + 2] = random();
      seeds[i * 4 + 3] = random();
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));

    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 1.8) },
        uHeight: { value: window.innerHeight },
      },
      vertexShader: /* glsl */ `
        attribute vec4 aSeed;
        uniform float uTime;
        uniform float uPixelRatio;
        uniform float uHeight;
        varying float vAlpha;
        varying vec3 vTint;

        void main() {
          vec3 pos = position;
          float drift = uTime * (0.07 + aSeed.x * 0.14);
          pos.y = -5.0 + mod(pos.y + 5.0 + drift, 17.0);
          pos.x += sin(uTime * 0.14 + aSeed.y * 19.0) * 0.9;
          pos.z += cos(uTime * 0.11 + aSeed.z * 17.0) * 0.65;
          vec4 mv = modelViewMatrix * vec4(pos, 1.0);
          gl_Position = projectionMatrix * mv;
          float size = (0.02 + aSeed.w * 0.055) * uHeight * 0.9 / max(-mv.z, 1.0);
          gl_PointSize = clamp(size * uPixelRatio, 0.7, 6.0);
          vAlpha = (0.24 + aSeed.z * 0.52) * smoothstep(0.0, 3.0, -mv.z);
          vTint = mix(vec3(0.82, 0.72, 0.48), vec3(0.78, 0.9, 0.74), step(0.6, aSeed.x));
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vAlpha;
        varying vec3 vTint;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          float alpha = smoothstep(1.0, 0.12, d) * vAlpha;
          float core = smoothstep(0.45, 0.0, d);
          gl_FragColor = vec4(vTint * (0.55 + core * 0.9), alpha);
        }
      `,
    });
    this.snow = new THREE.Points(geometry, material);
    this.scene.add(this.snow);

    const bokehTexture = makeGlowTexture([
      [0, 'rgba(255, 238, 195, 0.32)'],
      [0.28, 'rgba(238, 199, 125, 0.16)'],
      [0.66, 'rgba(238, 199, 125, 0.04)'],
      [1, 'rgba(0,0,0,0)'],
    ]);
    this.bokehGroup = new THREE.Group();
    for (let i = 0; i < 9; i += 1) {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: bokehTexture,
          transparent: true,
          opacity: 0.03 + random() * 0.08,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      const angle = random() * TAU;
      const radius = 7 + random() * 8;
      sprite.position.set(Math.cos(angle) * radius, -2.5 + random() * 11, -4 - random() * 9);
      const scale = 0.25 + random() * 0.95;
      sprite.scale.set(scale, scale, 1);
      sprite.userData.phase = random() * TAU;
      sprite.userData.speed = 0.08 + random() * 0.12;
      sprite.userData.baseY = sprite.position.y;
      this.bokehGroup.add(sprite);
    }
    this.scene.add(this.bokehGroup);
  }

  _bindPointer() {
    const canvas = this.canvas;
    canvas.addEventListener('pointerdown', (event) => {
      if (event.button !== undefined && event.button !== 0) return;
      this.pointerState.set(event.pointerId, { x: event.clientX, y: event.clientY });
      canvas.setPointerCapture?.(event.pointerId);
      this.isDragging = true;
      canvas.classList.add('is-dragging');
      this.lastPointer.x = event.clientX;
      this.lastPointer.y = event.clientY;
      this.autoPauseUntil = this.elapsed + 7;
    });

    canvas.addEventListener('pointermove', (event) => {
      if (!this.pointerState.has(event.pointerId)) return;
      this.pointerState.set(event.pointerId, { x: event.clientX, y: event.clientY });

      if (this.pointerState.size === 2) {
        const points = [...this.pointerState.values()];
        const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
        if (this.pinchDistance > 0) {
          const delta = (distance - this.pinchDistance) * 0.02;
          this.orbit.targetRadius = clamp(this.orbit.targetRadius - delta, 13.5, 27);
        }
        this.pinchDistance = distance;
        return;
      }

      const dx = event.clientX - this.lastPointer.x;
      const dy = event.clientY - this.lastPointer.y;
      this.lastPointer.x = event.clientX;
      this.lastPointer.y = event.clientY;
      this.orbit.targetYaw -= dx * 0.0052;
      this.orbit.targetPitch = clamp(this.orbit.targetPitch + dy * 0.0034, -0.52, 0.92);
    });

    const endPointer = (event) => {
      this.pointerState.delete(event.pointerId);
      if (this.pointerState.size === 0) {
        this.isDragging = false;
        this.pinchDistance = 0;
        canvas.classList.remove('is-dragging');
      }
    };

    canvas.addEventListener('pointerup', endPointer);
    canvas.addEventListener('pointercancel', endPointer);
    canvas.addEventListener('pointerleave', (event) => {
      if (this.pointerState.size === 1) endPointer(event);
    });

    canvas.addEventListener(
      'wheel',
      (event) => {
        event.preventDefault();
        this.orbit.targetRadius = clamp(this.orbit.targetRadius + event.deltaY * 0.012, 13.5, 27);
        this.autoPauseUntil = this.elapsed + 7;
      },
      { passive: false },
    );
  }

  setAutoRotate(enabled) {
    this.autoRotate = enabled;
  }

  setHandControl(active) {
    this.handControl = active;
  }

  setScatterAmount(amount) {
    this.scatterAmount = clamp(amount, 0, 1);
  }

  orbitBy(yaw, pitch) {
    this.orbit.targetYaw += yaw;
    this.orbit.targetPitch = clamp(this.orbit.targetPitch + pitch, -0.52, 0.92);
  }

  resetView() {
    const mobile = window.innerWidth < 760;
    this.orbit.targetYaw = 0.08;
    this.orbit.targetPitch = mobile ? 0.1 : 0.09;
    this.orbit.targetRadius = mobile ? 25.4 : 20.4;
    this.orbit.target.y = mobile ? 2.4 : 0.75;
    this.orbit.yaw = this.orbit.targetYaw;
    this.orbit.pitch = this.orbit.targetPitch;
    this.orbit.radius = this.orbit.targetRadius;
  }

  onResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const mobile = width < 760;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.8);
    this.camera.aspect = width / height;
    this.camera.fov = mobile ? 44 : 38;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(width, height);
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(width, height);
    this.bloomPass.resolution.set(width * dpr, height * dpr);
    this.snow.material.uniforms.uPixelRatio.value = dpr;
    this.snow.material.uniforms.uHeight.value = height;
    this.orbit.target.y = mobile ? 2.4 : 0.75;
    if (mobile) {
      this.orbit.targetRadius = Math.max(this.orbit.targetRadius, 25.4);
      this.orbit.targetPitch = Math.max(this.orbit.targetPitch, 0.1);
      if (this.orbit.radius < 23) {
        this.orbit.radius = 25.4;
        this.orbit.targetRadius = 25.4;
      }
    }
  }

  update(dt) {
    this.elapsed += dt;
    const time = this.elapsed;

    if (
      this.autoRotate
      && !this.handControl
      && !this.isDragging
      && time > this.autoPauseUntil
      && !this.reducedMotion
    ) {
      this.orbit.targetYaw += dt * 0.038;
    }

    const damp = 1 - Math.exp(-dt * 4.6);
    this.orbit.yaw += (this.orbit.targetYaw - this.orbit.yaw) * damp;
    this.orbit.pitch += (this.orbit.targetPitch - this.orbit.pitch) * damp;
    this.orbit.radius += (this.orbit.targetRadius - this.orbit.radius) * damp;

    const cosPitch = Math.cos(this.orbit.pitch);
    const x = this.orbit.target.x + Math.sin(this.orbit.yaw) * cosPitch * this.orbit.radius;
    const y = this.orbit.target.y + Math.sin(this.orbit.pitch) * this.orbit.radius;
    const z = this.orbit.target.z + Math.cos(this.orbit.yaw) * cosPitch * this.orbit.radius;
    this.camera.position.set(x, y, z);
    this.camera.lookAt(this.orbit.target);

    this.backdrop.material.uniforms.uTime.value = time;
    this.snow.material.uniforms.uTime.value = time;
    this.groundMaterial.uniforms.uTime.value = time;
    this.baseRing.rotation.z = time * 0.02;
    this.baseRingOuter.rotation.z = -time * 0.012;
    this.stars.rotation.y = time * 0.0035;
    this.stars.material.opacity = 0.72 - this.scatterAmount * 0.36;
    this.hazeGroup.scale.setScalar(1 - this.scatterAmount * 0.06);

    for (const sprite of this.bokehGroup.children) {
      sprite.position.y = sprite.userData.baseY
        + Math.sin(time * sprite.userData.speed * 2 + sprite.userData.phase) * 0.55;
      sprite.material.opacity = 0.025 + 0.04 * (0.5 + 0.5 * Math.sin(time * 0.3 + sprite.userData.phase));
    }

    this.hazeGroup.rotation.y = Math.sin(time * 0.035) * 0.02;
    this.warmPoint.intensity = 41 + Math.sin(time * 0.6) * 4;
    this.redPoint.intensity = 22 + Math.sin(time * 0.45 + 2) * 3;

    this.composer.render();
  }

  getOrbitReadout() {
    const yawDeg = ((this.orbit.yaw * 180) / Math.PI) % 360;
    const normalized = yawDeg < 0 ? yawDeg + 360 : yawDeg;
    const pitchDeg = (this.orbit.pitch * 180) / Math.PI;
    return {
      yaw: normalized,
      pitch: pitchDeg,
      radius: this.orbit.radius,
    };
  }
}

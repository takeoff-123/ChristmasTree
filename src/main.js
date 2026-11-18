import { Stage } from './stage.js';
import { ChristmasTree } from './tree.js';
import { GestureEngine } from './gestures.js';
import { AppUI } from './ui.js';

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

class Experience {
  constructor(ui, stage, tree) {
    this.ui = ui;
    this.stage = stage;
    this.tree = tree;
    this.mode = 'collapsed';
    this.morph = 0;
    this.transition = null;
    this.elapsed = 0;
    this.lastTime = performance.now();
    this.lastUiUpdate = 0;
    this.fpsAccumulator = 0;
    this.fpsFrames = 0;
    this.fps = 60;
    this.keys = new Set();
    this.handActive = false;
    this.gestureRunning = false;
    this.hasAttemptedGesture = false;
    this.running = false;

    this.gesture = new GestureEngine({
      video: document.querySelector('#camera'),
      overlay: document.querySelector('#cameraOverlay'),
      onStatus: (status) => {
        if (status.type === 'loading' || status.type === 'camera') this.gestureRunning = true;
        if (status.type === 'live') this.gestureRunning = true;
        if (status.type === 'error') this.gestureRunning = false;
        this.ui.setGestureStatus(status);
      },
      onHand: (hand) => {
        this.ui.updateHand(hand);
        const canOrbit = hand.present && this.mode === 'scattered' && hand.gesture !== 'fist';
        this.handActive = canOrbit;
        this.stage.setHandControl(canOrbit);
      },
      onMove: ({ dx, dy, gesture }) => {
        if (this.mode !== 'scattered' || gesture === 'fist') return;
        if (Math.abs(dx) < 0.0012 && Math.abs(dy) < 0.0012) return;
        this.stage.orbitBy(
          clamp(dx * 5.6, -0.16, 0.16),
          clamp(-dy * 3.4, -0.09, 0.09),
        );
      },
      onGesture: ({ name, progress, committed, action }) => {
        this.ui.setGestureProgress(name, progress);
        if (committed && action) this.setMode(action, { source: 'gesture' });
      },
    });

    this._bindKeyboard();
    this._bindWindow();
    this.ui.setMode('collapsed', { instant: true });
    this.ui.setParticleCount(this.tree.particleCount);
    this.ui.setAutoRotate(true);
    this.stage.setAutoRotate(true);
    this.ui.setGestureStatus({ type: 'standby' });

    const params = new URLSearchParams(window.location.search);
    if (params.get('state') === 'scattered') {
      this.mode = 'scattered';
      this.morph = 1;
      this.ui.setMode('scattered', { instant: true });
    }
  }

  _bindKeyboard() {
    window.addEventListener('keydown', (event) => {
      const targetTag = event.target?.tagName;
      if (targetTag === 'INPUT' || targetTag === 'TEXTAREA') return;

      if (event.code === 'Space') {
        event.preventDefault();
        if (!event.repeat) this.toggleMode();
        return;
      }
      if (event.code === 'KeyR') {
        this.stage.resetView();
        this.ui.toast('视角已回到初始方位');
        return;
      }
      if (event.code === 'KeyF') {
        this.toggleFullscreen();
        return;
      }
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) {
        event.preventDefault();
        this.keys.add(event.code);
      }
    });

    window.addEventListener('keyup', (event) => {
      this.keys.delete(event.code);
    });
  }

  _bindWindow() {
    document.addEventListener('visibilitychange', () => {
      this.lastTime = performance.now();
    });
    window.addEventListener('blur', () => this.keys.clear());
  }

  setMode(mode, options = {}) {
    if (mode !== 'collapsed' && mode !== 'scattered') return;
    if (this.mode === mode && !options.force) return;
    this.mode = mode;
    this.transition = {
      from: this.morph,
      to: mode === 'scattered' ? 1 : 0,
      start: performance.now(),
      duration: 2600,
    };
    this.ui.setMode(mode);
    if (mode === 'scattered') {
      const message = options.source === 'gesture'
        ? '手势识别 · 星尘已散开，移动手掌环绕'
        : '星尘已散开 · 移动手掌环绕视角';
      this.ui.toast(message);
    }
  }

  toggleMode() {
    this.setMode(this.mode === 'collapsed' ? 'scattered' : 'collapsed');
  }

  onModeRequest(mode) {
    this.setMode(mode);
  }

  async enableGestures() {
    this.hasAttemptedGesture = true;
    this.ui.hideToast();
    if (this.gesture.running || this.gesture.starting) {
      this.ui.toast('手势引擎已在运行');
      return;
    }
    this.gestureRunning = true;
    await this.gesture.start();
  }

  onOrbitStep(direction) {
    const step = 0.075;
    if (direction === 'left') this.stage.orbitBy(-step, 0);
    if (direction === 'right') this.stage.orbitBy(step, 0);
    if (direction === 'up') this.stage.orbitBy(0, -0.045);
    if (direction === 'down') this.stage.orbitBy(0, 0.045);
  }

  async applyPhotos(files) {
    try {
      const count = await this.tree.setUserPhotos(files);
      if (count > 0) {
        if (this.mode !== 'scattered') this.setMode('scattered');
        this.ui.toast(`已换入 ${count} 张照片 · 星尘正在散开`, 3800);
      } else {
        this.ui.toast('没有找到可读取的图片');
      }
    } catch (error) {
      console.error(error);
      this.ui.toast('照片读取失败，请换一张图片试试');
    }
  }

  toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {
        this.ui.toast('当前浏览器不支持全屏');
      });
    } else {
      document.exitFullscreen?.();
    }
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    requestAnimationFrame((time) => this._frame(time));
  }

  _frame(now) {
    if (!this.running) return;
    const dt = clamp((now - this.lastTime) / 1000, 0, 0.08);
    this.lastTime = now;
    this.elapsed += dt;

    // Time-based easing keeps the morph cinematic even when the frame rate dips.
    if (this.transition) {
      const progress = clamp((now - this.transition.start) / this.transition.duration, 0, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      this.morph = this.transition.from + (this.transition.to - this.transition.from) * eased;
      if (progress >= 1) {
        this.morph = this.transition.to;
        this.transition = null;
      }
    }
    this.morph = clamp(this.morph, 0, 1);

    if (this.keys.size) {
      const yawSpeed = 1.05;
      const pitchSpeed = 0.55;
      if (this.keys.has('ArrowLeft')) this.stage.orbitBy(-yawSpeed * dt, 0);
      if (this.keys.has('ArrowRight')) this.stage.orbitBy(yawSpeed * dt, 0);
      if (this.keys.has('ArrowUp')) this.stage.orbitBy(0, -pitchSpeed * dt);
      if (this.keys.has('ArrowDown')) this.stage.orbitBy(0, pitchSpeed * dt);
    }

    this.stage.setScatterAmount(this.morph);
    this.tree.update(dt, this.elapsed, this.morph);
    this.stage.update(dt);

    this.fpsAccumulator += dt;
    this.fpsFrames += 1;
    if (this.fpsAccumulator >= 0.5) {
      this.fps = this.fpsFrames / this.fpsAccumulator;
      this.fpsAccumulator = 0;
      this.fpsFrames = 0;
      this.ui.setFps(this.fps);
    }

    this.lastUiUpdate += dt;
    if (this.lastUiUpdate > 0.07) {
      this.lastUiUpdate = 0;
      this.ui.setFormProgress(this.morph);
      this.ui.setCameraReadout(this.stage.getOrbitReadout());
    }

    requestAnimationFrame((time) => this._frame(time));
  }

  jumpTo(mode) {
    this.mode = mode;
    this.morph = mode === 'scattered' ? 1 : 0;
    this.transition = null;
    this.ui.setMode(mode, { instant: true });
  }
}

async function boot() {
  const ui = new AppUI({
    onMode: (mode) => app?.onModeRequest(mode),
    onEnableGesture: () => app?.enableGestures(),
    onRetryGesture: () => app?.enableGestures(),
    onAutoRotate: (enabled) => app?.stage.setAutoRotate(enabled),
    onResetView: () => {
      app?.stage.resetView();
      ui.toast('视角已重置');
    },
    onOrbitStep: (direction) => app?.onOrbitStep(direction),
    onPhotos: (files) => app?.applyPhotos(files),
    onFullscreen: () => app?.toggleFullscreen(),
  });

  let app = null;
  try {
    const canvas = document.querySelector('#world');
    ui.setLoading(8, 'IGNITING THE SCENE');
    await nextFrame();

    const stage = new Stage(canvas);
    ui.setLoading(34, 'GROWING THE PINE PARTICLES');
    await nextFrame();

    const tree = new ChristmasTree(stage.scene, stage.renderer, stage.camera);
    ui.setLoading(70, 'HANGING THE ORNAMENTS');
    await nextFrame();

    app = new Experience(ui, stage, tree);
    window.__AURORA__ = app;

    stage.camera.lookAt(stage.orbit.target);
    tree.update(0.016, 0, app.morph);
    stage.update(0.016);
    ui.setLoading(92, 'FOCUSING THE LIGHT');
    await nextFrame();
    await nextFrame();
    ui.setLoading(100, 'READY TO BLOOM');
    ui.finishLoading();
    app.start();

    window.setTimeout(() => {
      if (!app.gestureRunning && !app.hasAttemptedGesture) {
        ui.toast('点击右侧「启用手势」，用手掌控制这场光', 4600);
      }
    }, 2600);
  } catch (error) {
    console.error('Aurora Noël failed to start:', error);
    ui.showFatal('无法创建 3D 场景，请确认浏览器已启用硬件加速');
  }
}

boot();

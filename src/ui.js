const MODE_COPY = {
  collapsed: {
    title: '合拢<span>·</span>松夜',
    en: 'ASSEMBLED',
    scene: '01',
    copy: '一万六千枚松针粒子收束成树，<br />金色饰物在呼吸之间微微发亮。',
    hint: '<span class="hint-key">SPACE</span><span>或 张开手掌，让星尘散开</span>',
    deck: 'TREE · STABLE',
    particle: '16,480',
  },
  scattered: {
    title: '散开<span>·</span>星尘',
    en: 'SCATTERED',
    scene: '02',
    copy: '星尘挣脱枝桠，照片与饰物漂浮成云，<br />移动手掌，让视线环绕这场光。',
    hint: '<span class="hint-key">SPACE</span><span>或 握紧拳头，让松夜重新聚合</span>',
    deck: 'NEBULA · DRIFT',
    particle: '16,480',
  },
};

const GESTURE_LABELS = {
  none: 'NO HAND',
  tracking: 'TRACKING',
  open: 'OPEN PALM',
  fist: 'FIST',
};

export class AppUI {
  constructor(handlers = {}) {
    this.handlers = handlers;
    this.mode = 'collapsed';
    this.autoRotate = true;
    this.toastTimer = 0;
    this.orbitHoldTimer = 0;
    this.particleCountText = '16,480';

    this.$ = (selector) => document.querySelector(selector);
    this.app = this.$('#app');
    this.loadingVeil = this.$('#loadingVeil');
    this.loadingProgress = this.$('#loadingProgress');
    this.loadingStatus = this.$('#loadingStatus');
    this.fpsLabel = this.$('#fpsLabel');
    this.sceneReadout = this.$('.scene-readout');
    this.sceneTitle = this.$('#sceneTitle');
    this.sceneCopy = this.$('#sceneCopy');
    this.sceneModeEn = this.$('#sceneModeEn');
    this.sceneNumber = this.$('#sceneNumber');
    this.sceneHint = this.$('#sceneHint');
    this.particleCount = this.$('#particleCount');
    this.formValue = this.$('#formValue');
    this.deckState = this.$('#deckState');
    this.formPercent = this.$('#formPercent');
    this.deckDot = this.$('#deckDot');
    this.modeSwitch = this.$('#modeSwitch');
    this.modeButtons = [...document.querySelectorAll('.mode-switch__btn')];
    this.autoRotateBtn = this.$('#autoRotateBtn');
    this.photoBtn = this.$('#photoBtn');
    this.photoUpload = this.$('#photoUpload');
    this.resetViewBtn = this.$('#resetViewBtn');
    this.fullscreenBtn = this.$('#fullscreenBtn');
    this.orbitButtons = [...document.querySelectorAll('[data-orbit]')];
    this.gestureCard = this.$('#gestureCard');
    this.gestureRows = [...document.querySelectorAll('.gesture-row')];
    this.gestureLabel = this.$('#gestureLabel');
    this.gestureMeterFill = this.$('#gestureMeterFill');
    this.engineState = this.$('#engineState');
    this.engineStateText = this.$('#engineStateText');
    this.cameraFrame = this.$('#cameraFrame');
    this.cameraStandby = this.$('#cameraStandby');
    this.cameraStandbyText = this.cameraStandby.querySelector('p');
    this.cameraUnavailable = this.$('#cameraUnavailable');
    this.cameraUnavailableText = this.$('#cameraUnavailableText');
    this.cameraHud = this.$('#cameraHud');
    this.cameraHudText = this.$('#cameraHudText');
    this.cameraHudCoord = this.$('#cameraHudCoord');
    this.enableGestureBtn = this.$('#enableGestureBtn');
    this.enableGestureText = this.$('#enableGestureText');
    this.retryGestureBtn = this.$('#retryGestureBtn');
    this.azimuthValue = this.$('#azimuthValue');
    this.altitudeValue = this.$('#altitudeValue');
    this.orbitNeedle = this.$('#orbitNeedle');
    this.toastEl = this.$('#toast');

    this._bind();
  }

  _bind() {
    for (const button of this.modeButtons) {
      button.addEventListener('click', () => {
        const mode = button.dataset.mode;
        if (mode !== this.mode) this.handlers.onMode?.(mode);
      });
    }

    this.autoRotateBtn.addEventListener('click', () => {
      this.autoRotate = !this.autoRotate;
      this.setAutoRotate(this.autoRotate);
      this.handlers.onAutoRotate?.(this.autoRotate);
    });

    this.photoBtn.addEventListener('click', () => this.photoUpload.click());
    this.photoUpload.addEventListener('change', () => {
      const files = [...(this.photoUpload.files || [])];
      if (files.length) this.handlers.onPhotos?.(files);
      this.photoUpload.value = '';
    });

    this.resetViewBtn.addEventListener('click', () => this.handlers.onResetView?.());
    this.fullscreenBtn.addEventListener('click', () => this.handlers.onFullscreen?.());
    this.enableGestureBtn.addEventListener('click', () => this.handlers.onEnableGesture?.());
    this.retryGestureBtn.addEventListener('click', () => this.handlers.onEnableGesture?.());

    for (const button of this.orbitButtons) {
      const start = (event) => {
        event.preventDefault();
        const direction = button.dataset.orbit;
        this.handlers.onOrbitStep?.(direction);
        window.clearInterval(this.orbitHoldTimer);
        this.orbitHoldTimer = window.setInterval(() => {
          this.handlers.onOrbitStep?.(direction);
        }, 45);
      };
      const stop = () => {
        window.clearInterval(this.orbitHoldTimer);
        this.orbitHoldTimer = 0;
      };
      button.addEventListener('pointerdown', start);
      button.addEventListener('pointerup', stop);
      button.addEventListener('pointerleave', stop);
      button.addEventListener('pointercancel', stop);
      button.addEventListener('click', (event) => event.preventDefault());
    }

    const stopOrbit = () => {
      window.clearInterval(this.orbitHoldTimer);
      this.orbitHoldTimer = 0;
    };
    window.addEventListener('pointerup', stopOrbit);
    window.addEventListener('blur', stopOrbit);

    // Allow dropping photographs directly onto the stage.
    window.addEventListener('dragover', (event) => {
      if (event.dataTransfer?.types?.includes('Files')) event.preventDefault();
    });
    window.addEventListener('drop', (event) => {
      const files = [...(event.dataTransfer?.files || [])].filter((file) => file.type.startsWith('image/'));
      if (!files.length) return;
      event.preventDefault();
      this.handlers.onPhotos?.(files);
    });
  }

  setMode(mode, { instant = false } = {}) {
    if (!MODE_COPY[mode]) return;
    this.mode = mode;
    const copy = MODE_COPY[mode];
    this.modeSwitch.dataset.mode = mode;
    for (const button of this.modeButtons) {
      const active = button.dataset.mode === mode;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    }
    this.sceneReadout.classList.toggle('is-scattered', mode === 'scattered');
    this.deckDot?.classList.toggle('is-scattered', mode === 'scattered');
    this.deckState.parentElement?.classList.toggle('is-scattered', mode === 'scattered');
    this.sceneTitle.innerHTML = copy.title;
    this.sceneCopy.innerHTML = copy.copy;
    this.sceneModeEn.textContent = copy.en;
    this.sceneNumber.textContent = copy.scene;
    this.sceneHint.innerHTML = copy.hint;
    this.deckState.textContent = copy.deck;
    this.particleCount.textContent = this.particleCountText;
    this.formValue.textContent = mode === 'scattered' ? 'NEBULA / 02' : 'CONE / 01';
    if (!instant) {
      this.sceneTitle.animate(
        [
          { opacity: 0.3, transform: 'translateY(8px)' },
          { opacity: 1, transform: 'translateY(0)' },
        ],
        { duration: 700, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
      );
      this.sceneCopy.animate(
        [
          { opacity: 0, transform: 'translateY(5px)' },
          { opacity: 1, transform: 'translateY(0)' },
        ],
        { duration: 800, delay: 90, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'backwards' },
      );
    }
    this._updateMoveRow();
  }

  setParticleCount(count) {
    this.particleCountText = Number(count).toLocaleString('en-US');
    this.particleCount.textContent = this.particleCountText;
  }

  setFormProgress(progress) {
    const safe = Math.max(0, Math.min(1, progress));
    this.formPercent.textContent = `${Math.round(safe * 100)}%`;
  }

  setAutoRotate(enabled) {
    this.autoRotate = enabled;
    this.autoRotateBtn.classList.toggle('is-on', enabled);
    this.autoRotateBtn.setAttribute('aria-pressed', String(enabled));
  }

  setGestureStatus({ type, message, detail }) {
    this.engineState.classList.remove('is-live', 'is-error', 'is-standby');
    this.cameraFrame.classList.remove('is-live');
    this.cameraUnavailable.hidden = true;
    this.cameraStandby.hidden = false;
    this.cameraHud.hidden = true;

    if (type === 'loading' || type === 'camera') {
      this.engineState.classList.add('is-standby');
      this.engineStateText.textContent = type === 'loading' ? 'LOADING' : 'CONNECTING';
      this.enableGestureBtn.disabled = true;
      this.enableGestureText.textContent = type === 'loading' ? '载入中…' : '连接中…';
      this.cameraStandbyText.textContent = message || '正在准备手势引擎';
      return;
    }

    if (type === 'live') {
      this.engineState.classList.add('is-live');
      this.cameraFrame.classList.add('is-live');
      this.engineStateText.textContent = 'LIVE';
      this.enableGestureBtn.disabled = false;
      this.enableGestureText.textContent = '已启用';
      this.cameraStandby.hidden = true;
      this.cameraUnavailable.hidden = true;
      this.cameraHud.hidden = false;
      this.cameraHudText.textContent = 'SEARCHING';
      return;
    }

    if (type === 'error') {
      this.engineState.classList.add('is-error');
      this.engineStateText.textContent = 'OFFLINE';
      this.enableGestureBtn.disabled = false;
      this.enableGestureText.textContent = '启用手势';
      this.cameraUnavailable.hidden = false;
      this.cameraStandby.hidden = true;
      this.cameraUnavailableText.textContent = message || '手势引擎启动失败';
      if (detail) this.cameraUnavailable.title = detail;
      return;
    }

    this.engineState.classList.add('is-standby');
    this.engineStateText.textContent = 'STANDBY';
    this.enableGestureBtn.disabled = false;
    this.enableGestureText.textContent = '启用手势';
    this.cameraStandbyText.textContent = '让手成为你的指挥棒';
    this.cameraHud.hidden = true;
    this.gestureLabel.textContent = 'NO HAND';
    this.gestureMeterFill.style.width = '0%';
  }

  updateHand(hand) {
    if (!hand.present) {
      this.cameraHudText.textContent = 'SEARCHING';
      this.cameraHudCoord.textContent = 'X --- · Y ---';
      this.gestureLabel.textContent = 'NO HAND';
      this._setActiveRow(null);
      this.gestureMeterFill.style.width = '0%';
      return;
    }
    this.cameraHud.hidden = false;
    this.cameraHudText.textContent = hand.gesture === 'tracking' ? 'TRACKING' : hand.gesture.toUpperCase();
    this.cameraHudCoord.textContent = `X ${hand.x.toFixed(2)} · Y ${hand.y.toFixed(2)}`;
    const label = GESTURE_LABELS[hand.gesture] || 'TRACKING';
    this.gestureLabel.textContent = label;
    const active = hand.gesture === 'open'
      ? 'open'
      : hand.gesture === 'fist'
        ? 'fist'
        : this.mode === 'scattered'
          ? 'move'
          : null;
    this._setActiveRow(active);
  }

  setGestureProgress(name, progress) {
    this.gestureMeterFill.style.width = `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%`;
    if (name === 'open' || name === 'fist') this._setActiveRow(name);
  }

  _setActiveRow(name) {
    for (const row of this.gestureRows) {
      row.classList.toggle('is-active', row.dataset.gesture === name);
    }
  }

  _updateMoveRow() {
    const row = this.gestureRows.find((item) => item.dataset.gesture === 'move');
    if (row) row.classList.toggle('is-disabled', this.mode !== 'scattered');
  }

  setCameraReadout({ yaw, pitch }) {
    const azimuth = Math.round(yaw) % 360;
    this.azimuthValue.textContent = `${String(azimuth).padStart(3, '0')}°`;
    this.altitudeValue.textContent = `${pitch >= 0 ? '+' : '−'}${String(Math.abs(Math.round(pitch))).padStart(2, '0')}°`;
    this.orbitNeedle.style.transform = `rotate(${azimuth}deg)`;
  }

  setFps(fps) {
    if (!Number.isFinite(fps)) return;
    this.fpsLabel.textContent = `${Math.round(fps)} FPS`;
  }

  toast(message, duration = 3200) {
    window.clearTimeout(this.toastTimer);
    this.toastEl.textContent = message;
    this.toastEl.classList.add('is-visible');
    this.toastTimer = window.setTimeout(() => {
      this.toastEl.classList.remove('is-visible');
    }, duration);
  }

  hideToast() {
    window.clearTimeout(this.toastTimer);
    this.toastEl.classList.remove('is-visible');
  }

  setLoading(progress, status) {
    this.loadingProgress.style.width = `${Math.min(100, progress)}%`;
    if (status) this.loadingStatus.textContent = status;
  }

  finishLoading() {
    this.loadingProgress.style.width = '100%';
    this.loadingStatus.textContent = 'READY TO BLOOM';
    window.setTimeout(() => {
      this.loadingVeil.classList.add('is-done');
      this.app.classList.remove('is-loading');
      window.setTimeout(() => {
        this.loadingVeil.style.display = 'none';
      }, 1500);
    }, 420);
  }

  showFatal(message) {
    this.loadingVeil.classList.remove('is-done');
    this.loadingVeil.style.display = '';
    this.loadingStatus.textContent = message;
    this.loadingProgress.style.width = '100%';
    this.loadingProgress.style.background = 'linear-gradient(90deg, #7f1f28, #d95a5f)';
    const star = this.loadingVeil.querySelector('.loading-star');
    if (star) star.style.opacity = '0.4';
  }
}

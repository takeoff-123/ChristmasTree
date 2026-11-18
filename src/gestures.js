const TAU = Math.PI * 2;

const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

const FINGERS = [
  { mcp: 5, pip: 6, dip: 7, tip: 8 },
  { mcp: 9, pip: 10, dip: 11, tip: 12 },
  { mcp: 13, pip: 14, dip: 15, tip: 16 },
  { mcp: 17, pip: 18, dip: 19, tip: 20 },
];

const HOLD_DURATION = 620;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0));

function jointAngle(a, b, c) {
  const abx = a.x - b.x;
  const aby = a.y - b.y;
  const cbx = c.x - b.x;
  const cby = c.y - b.y;
  const denominator = Math.hypot(abx, aby) * Math.hypot(cbx, cby);
  if (denominator < 0.00001) return 0;
  const cosine = clamp((abx * cbx + aby * cby) / denominator, -1, 1);
  return (Math.acos(cosine) * 180) / Math.PI;
}

export function analyzeHandLandmarks(landmarks) {
  const wrist = landmarks[0];
  const palm = [0, 5, 9, 13, 17].reduce((acc, index) => {
    acc.x += landmarks[index].x / 5;
    acc.y += landmarks[index].y / 5;
    return acc;
  }, { x: 0, y: 0 });
  const scale = Math.max(0.001, distance(wrist, landmarks[9]));

  let extended = 0;
  let angleSum = 0;
  let tipDistanceSum = 0;
  const fingerData = [];

  for (const finger of FINGERS) {
    const mcp = landmarks[finger.mcp];
    const pip = landmarks[finger.pip];
    const dip = landmarks[finger.dip];
    const tip = landmarks[finger.tip];
    const pipAngle = jointAngle(mcp, pip, tip);
    const dipAngle = jointAngle(pip, dip, tip);
    const reach = distance(wrist, tip) / Math.max(0.0001, distance(wrist, pip));
    const tipFromPalm = distance(tip, palm) / scale;
    const isExtended = pipAngle > 146 && dipAngle > 128 && reach > 1.04;
    if (isExtended) extended += 1;
    angleSum += pipAngle;
    tipDistanceSum += tipFromPalm;
    fingerData.push({ pipAngle, dipAngle, reach, tipFromPalm, extended: isExtended });
  }

  const thumbTip = landmarks[4];
  const thumbBase = landmarks[2];
  const thumbExtended = distance(thumbTip, landmarks[17]) > distance(thumbBase, landmarks[17]) * 1.12;

  const averageAngle = angleSum / FINGERS.length;
  const averageTipDistance = tipDistanceSum / FINGERS.length;
  const open = extended >= 4 && averageAngle > 146;
  const fist = extended <= 1 && averageAngle < 132;
  const openAmount = clamp((extended - 2) / 2, 0, 1) * clamp((averageAngle - 130) / 35, 0, 1);
  const fistAmount = clamp((1.45 - extended) / 1.45, 0, 1) * clamp((138 - averageAngle) / 50, 0, 1);

  return {
    palm,
    extended,
    thumbExtended,
    open,
    fist,
    openAmount,
    fistAmount,
    scale,
    averageTipDistance,
    averageAngle,
    fingers: fingerData,
  };
}

function errorMessage(error) {
  const name = error?.name || '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return '摄像头权限被拒绝，请在浏览器地址栏中允许访问';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return '未检测到摄像头，请连接摄像头后重试';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return '摄像头正被其他程序占用，请关闭占用后重试';
  }
  if (name === 'OverconstrainedError') {
    return '当前摄像头不支持所需分辨率';
  }
  return '手势引擎启动失败，请重试';
}

export class GestureEngine {
  constructor(options) {
    this.video = options.video;
    this.canvas = options.overlay;
    this.ctx = this.canvas.getContext('2d');
    this.onStatus = options.onStatus || (() => {});
    this.onHand = options.onHand || (() => {});
    this.onGesture = options.onGesture || (() => {});
    this.onMove = options.onMove || (() => {});

    this.stream = null;
    this.landmarker = null;
    this.running = false;
    this.starting = false;
    this.rafId = 0;
    this.lastVideoTime = -1;
    this.smoothedPalm = null;
    this.lastPalm = null;
    this.motionEnergy = 0;
    this.candidate = null;
    this.candidateStart = 0;
    this.committedGesture = null;
    this.lastGestureName = 'none';
    this.lastDetectionAt = 0;
    this.handPresent = false;
    this.detecting = false;
  }

  async start() {
    if (this.starting || this.running) return;
    this.starting = true;
    this.onStatus({ type: 'loading', message: '正在载入手势引擎' });

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw Object.assign(new Error('mediaDevices unavailable'), { name: 'NotFoundError' });
      }

      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: 'user',
          width: { ideal: 960 },
          height: { ideal: 720 },
          frameRate: { ideal: 30, max: 30 },
        },
      });
      this.video.srcObject = this.stream;
      await this.video.play();
      this.onStatus({ type: 'camera', message: '摄像头已连接，正在载入模型' });

      if (!this.landmarker) {
        const { FilesetResolver, HandLandmarker } = await import('@mediapipe/tasks-vision');
        const fileset = await FilesetResolver.forVisionTasks('/mediapipe/wasm');
        const baseOptions = {
          modelAssetPath: '/models/hand_landmarker.task',
          delegate: 'GPU',
        };
        try {
          this.landmarker = await HandLandmarker.createFromOptions(fileset, {
            baseOptions,
            runningMode: 'VIDEO',
            numHands: 1,
            minHandDetectionConfidence: 0.52,
            minHandPresenceConfidence: 0.52,
            minTrackingConfidence: 0.52,
          });
        } catch (gpuError) {
          console.warn('GPU delegate unavailable, falling back to CPU.', gpuError);
          this.landmarker = await HandLandmarker.createFromOptions(fileset, {
            baseOptions: { ...baseOptions, delegate: 'CPU' },
            runningMode: 'VIDEO',
            numHands: 1,
            minHandDetectionConfidence: 0.52,
            minHandPresenceConfidence: 0.52,
            minTrackingConfidence: 0.52,
          });
        }
      }

      this.running = true;
      this.starting = false;
      this.onStatus({ type: 'live', message: '举起一只手，掌心朝向镜头' });
      this._resizeOverlay();
      this._loop();
    } catch (error) {
      console.error(error);
      this.onStatus({ type: 'error', message: errorMessage(error), detail: error?.message || '' });
      this.stop({ keepStatus: true });
    }
  }

  stop({ keepStatus = false } = {}) {
    this.running = false;
    this.starting = false;
    cancelAnimationFrame(this.rafId);
    this.rafId = 0;
    if (this.stream) {
      for (const track of this.stream.getTracks()) track.stop();
      this.stream = null;
    }
    if (this.video) this.video.srcObject = null;
    this.candidate = null;
    this.candidateStart = 0;
    this.committedGesture = null;
    this.lastPalm = null;
    this.smoothedPalm = null;
    this.handPresent = false;
    this._clearOverlay();
    if (!keepStatus) this.onStatus({ type: 'standby', message: '手势引擎未启用' });
  }

  _resizeOverlay() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(320, Math.round(rect.width * dpr));
    const height = Math.max(240, Math.round(rect.height * dpr));
    if (Math.abs(this.canvas.width - width) > 20 || Math.abs(this.canvas.height - height) > 20) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  _loop() {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(() => this._loop());
    if (document.hidden) return;
    if (this.video.readyState < 2 || this.detecting) return;
    if (this.video.currentTime === this.lastVideoTime) return;
    this.lastVideoTime = this.video.currentTime;

    this._resizeOverlay();
    this.detecting = true;
    try {
      const now = performance.now();
      const result = this.landmarker.detectForVideo(this.video, now);
      this._handleResult(result, now);
    } catch (error) {
      console.warn('Hand detection frame skipped:', error);
    } finally {
      this.detecting = false;
    }
  }

  _handleResult(result, now) {
    const landmarks = result?.landmarks?.[0];
    if (!landmarks || landmarks.length < 21) {
      this._handleLostHand(now);
      return;
    }

    const analysis = this._analyzeHand(landmarks);
    this.lastDetectionAt = now;
    this.handPresent = true;
    this._drawHand(landmarks, analysis);

    if (!this.smoothedPalm) {
      this.smoothedPalm = { x: analysis.palm.x, y: analysis.palm.y };
      this.lastPalm = { x: analysis.palm.x, y: analysis.palm.y };
    } else {
      const smooth = 0.42;
      this.smoothedPalm.x += (analysis.palm.x - this.smoothedPalm.x) * smooth;
      this.smoothedPalm.y += (analysis.palm.y - this.smoothedPalm.y) * smooth;
    }

    const rawDx = this.smoothedPalm.x - (this.lastPalm?.x ?? this.smoothedPalm.x);
    const rawDy = this.smoothedPalm.y - (this.lastPalm?.y ?? this.smoothedPalm.y);
    this.lastPalm.x = this.smoothedPalm.x;
    this.lastPalm.y = this.smoothedPalm.y;
    this.motionEnergy = this.motionEnergy * 0.86 + Math.min(1, Math.hypot(rawDx, rawDy) * 20) * 0.14;

    // The camera preview is mirrored for a selfie view, so control input is
    // mirrored as well: moving the physical hand right turns the view right.
    const controlX = 1 - this.smoothedPalm.x;
    const controlDx = -rawDx;
    const controlDy = rawDy;

    const gestureName = analysis.open ? 'open' : analysis.fist ? 'fist' : 'tracking';
    this._updateGesture(gestureName, analysis, now);
    this.onHand({
      present: true,
      x: controlX,
      y: this.smoothedPalm.y,
      dx: controlDx,
      dy: controlDy,
      energy: this.motionEnergy,
      open: analysis.open,
      fist: analysis.fist,
      openAmount: analysis.openAmount,
      fistAmount: analysis.fistAmount,
      gesture: gestureName,
      extended: analysis.extended,
      now,
    });
    this.onMove({ dx: controlDx, dy: controlDy, x: controlX, y: this.smoothedPalm.y, gesture: gestureName, now });
  }

  _handleLostHand(now) {
    if (!this.handPresent) return;
    if (now - this.lastDetectionAt < 240) return;
    this.handPresent = false;
    this._clearOverlay();
    this.smoothedPalm = null;
    this.lastPalm = null;
    this.candidate = null;
    this.committedGesture = null;
    this.motionEnergy = 0;
    this.lastGestureName = 'none';
    this.onHand({ present: false, gesture: 'none', now });
    this.onGesture({ name: 'none', progress: 0, committed: false });
    this.onStatus({ type: 'live', message: '举起一只手，掌心朝向镜头' });
  }

  _analyzeHand(landmarks) {
    return analyzeHandLandmarks(landmarks);
  }

  _updateGesture(name, analysis, now) {
    const actionName = name === 'open' ? 'open' : name === 'fist' ? 'fist' : 'none';

    if (actionName !== this.candidate) {
      this.candidate = actionName;
      this.candidateStart = now;
      this.committedGesture = null;
    }

    if (actionName === 'none') {
      this.lastGestureName = 'tracking';
      this.onGesture({ name: 'tracking', progress: 0, committed: false, openAmount: analysis.openAmount, fistAmount: analysis.fistAmount });
      return;
    }

    const progress = this.committedGesture
      ? 1
      : clamp((now - this.candidateStart) / HOLD_DURATION, 0, 1);

    if (!this.committedGesture && progress >= 1) {
      this.committedGesture = name;
      this.onGesture({ name, progress: 1, committed: true, action: name === 'open' ? 'scattered' : 'collapsed' });
    } else {
      this.onGesture({ name, progress, committed: false });
    }

    this.lastGestureName = name;
  }

  _drawHand(landmarks, analysis) {
    const ctx = this.ctx;
    const canvas = this.canvas;
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    const toCanvas = (point) => ({
      x: point.x * width,
      y: point.y * height,
    });

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Skeleton glow.
    ctx.save();
    ctx.strokeStyle = analysis.fist ? 'rgba(219, 126, 111, 0.8)' : 'rgba(241, 213, 151, 0.82)';
    ctx.shadowColor = analysis.fist ? 'rgba(219, 90, 95, 0.65)' : 'rgba(245, 223, 166, 0.75)';
    ctx.shadowBlur = 12;
    ctx.lineWidth = Math.max(1.4, width * 0.0026);
    for (const [start, end] of HAND_CONNECTIONS) {
      const a = toCanvas(landmarks[start]);
      const b = toCanvas(landmarks[end]);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.restore();

    // Finger joints.
    for (let i = 0; i < landmarks.length; i += 1) {
      const point = toCanvas(landmarks[i]);
      const tip = [4, 8, 12, 16, 20].includes(i);
      ctx.beginPath();
      ctx.fillStyle = tip ? 'rgba(255, 236, 192, 0.96)' : 'rgba(245, 223, 166, 0.46)';
      ctx.arc(point.x, point.y, tip ? width * 0.008 : width * 0.0042, 0, TAU);
      ctx.fill();
    }

    // Palm reticle.
    const palm = toCanvas(analysis.palm);
    ctx.save();
    ctx.strokeStyle = 'rgba(245, 223, 166, 0.52)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(palm.x, palm.y, width * 0.026, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(palm.x - width * 0.04, palm.y);
    ctx.lineTo(palm.x + width * 0.04, palm.y);
    ctx.moveTo(palm.x, palm.y - width * 0.04);
    ctx.lineTo(palm.x, palm.y + width * 0.04);
    ctx.stroke();
    ctx.restore();

    // Bounding brackets around the hand.
    let minX = 1;
    let minY = 1;
    let maxX = 0;
    let maxY = 0;
    for (const point of landmarks) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
    const pad = 0.025;
    const x1 = (minX - pad) * width;
    const y1 = (minY - pad) * height;
    const x2 = (maxX + pad) * width;
    const y2 = (maxY + pad) * height;
    ctx.strokeStyle = 'rgba(217, 185, 120, 0.38)';
    ctx.lineWidth = 1.2;
    const bracket = Math.min(18, (x2 - x1) * 0.16);
    ctx.beginPath();
    ctx.moveTo(x1, y1 + bracket); ctx.lineTo(x1, y1); ctx.lineTo(x1 + bracket, y1);
    ctx.moveTo(x2 - bracket, y1); ctx.lineTo(x2, y1); ctx.lineTo(x2, y1 + bracket);
    ctx.moveTo(x2, y2 - bracket); ctx.lineTo(x2, y2); ctx.lineTo(x2 - bracket, y2);
    ctx.moveTo(x1 + bracket, y2); ctx.lineTo(x1, y2); ctx.lineTo(x1, y2 - bracket);
    ctx.stroke();
  }

  _clearOverlay() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
}

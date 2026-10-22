import { classifyPose, createDirectionFilter, createGestureGate } from './pose-classifier.js';

const TASKS_VERSION = '1.1.1';
const WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VERSION}/wasm`;
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
const ATTACK_COOLDOWN_MS = 650;

export function createMotionController({ video, overlay, cameraWindow, status, statusLight, actionState, actionLabel, toggleButton, recenterButton, onMove, onAttack }) {
  let stream = null;
  let landmarker = null;
  let animationFrame = 0;
  let running = false;
  let lastVideoTime = -1;
  let referenceX = null;
  let calibrationSamples = [];
  let calibrating = false;
  let currentDirection = 0;
  const directionFilter = createDirectionFilter();
  const gestureGate = createGestureGate();
  let lastActionTimer = 0;
  let lastInferenceAt = 0;

  const setStatus = (message, state = '') => {
    status.textContent = message;
    statusLight.dataset.state = state;
  };

  const setMove = (direction) => {
    if (direction === currentDirection) return;
    currentDirection = direction;
    onMove(direction);
  };

  const setAction = (message) => {
    actionState.textContent = '辨識';
    actionLabel.textContent = message;
    window.clearTimeout(lastActionTimer);
    lastActionTimer = window.setTimeout(() => {
      actionState.textContent = 'READY';
      actionLabel.textContent = '等待動作';
    }, 900);
  };

  const drawPose = (landmarks) => {
    const context = overlay.getContext('2d');
    if (overlay.width !== video.videoWidth || overlay.height !== video.videoHeight) {
      overlay.width = video.videoWidth;
      overlay.height = video.videoHeight;
    }
    context.clearRect(0, 0, overlay.width, overlay.height);
    const visiblePoints = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];
    context.lineWidth = Math.max(2, overlay.width / 240);
    context.strokeStyle = '#e5bb6a';
    context.fillStyle = '#f2e5bf';
    for (const [first, second] of [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28]]) {
      if ((landmarks[first].visibility ?? 0) < 0.35 || (landmarks[second].visibility ?? 0) < 0.35) continue;
      context.beginPath();
      context.moveTo(landmarks[first].x * overlay.width, landmarks[first].y * overlay.height);
      context.lineTo(landmarks[second].x * overlay.width, landmarks[second].y * overlay.height);
      context.stroke();
    }
    for (const index of visiblePoints) {
      if ((landmarks[index].visibility ?? 0) < 0.35) continue;
      context.beginPath();
      context.arc(landmarks[index].x * overlay.width, landmarks[index].y * overlay.height, context.lineWidth * 1.7, 0, Math.PI * 2);
      context.fill();
    }
  };

  const acceptGesture = (active, kind, now) => {
    if (!gestureGate.observe(kind, active, now)) return;
    onAttack(kind);
    setAction(kind === 'punch' ? '拳擊' : '踢擊');
  };

  const loseTracking = () => {
    directionFilter.reset();
    setMove(0);
    gestureGate.resetForTrackingLoss();
    const context = overlay.getContext('2d');
    context.clearRect(0, 0, overlay.width, overlay.height);
    setStatus('未偵測到完整人體，動作輸入已停止');
  };

  const detectFrame = () => {
    if (!running) return;
    animationFrame = window.requestAnimationFrame(detectFrame);
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || video.currentTime === lastVideoTime) return;
    const now = performance.now();
    if (now - lastInferenceAt < 33) return;
    lastInferenceAt = now;
    lastVideoTime = video.currentTime;
    const result = landmarker.detectForVideo(video, now);
    const landmarks = result.landmarks?.[0];
    if (!landmarks) {
      loseTracking();
      return;
    }
    drawPose(landmarks);
    const pose = classifyPose(landmarks, referenceX);
    if (!pose.tracked) {
      loseTracking();
      return;
    }
    if (referenceX === null || calibrating) {
      calibrationSamples.push(pose.centerX);
      directionFilter.reset();
      setMove(0);
      if (calibrationSamples.length >= 24) {
        calibrationSamples.sort((first, second) => first - second);
        referenceX = calibrationSamples[Math.floor(calibrationSamples.length / 2)];
        calibrationSamples = [];
        calibrating = false;
        setStatus('人體追蹤中');
      } else {
        setStatus('請站在畫面中央校正站姿');
      }
      return;
    }
    setStatus('人體追蹤中', 'ready');
    setMove(directionFilter.observe(pose.direction));
    if (now >= lastActionTimer) {
      actionState.textContent = pose.punch || pose.kick ? '姿勢' : 'READY';
      actionLabel.textContent = pose.punch ? '伸臂姿勢' : pose.kick ? '抬腿姿勢' : '等待動作';
    }
    const attack = pose.punch ? 'punch' : pose.kick ? 'kick' : null;
    acceptGesture(attack === 'punch', 'punch', now);
    acceptGesture(attack === 'kick', 'kick', now);
  };

  const stop = () => {
    running = false;
    window.cancelAnimationFrame(animationFrame);
    setMove(0);
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    landmarker?.close();
    landmarker = null;
    video.srcObject = null;
    cameraWindow.dataset.active = 'false';
    document.querySelector('#camera-live').hidden = true;
    recenterButton.disabled = true;
    toggleButton.disabled = false;
    toggleButton.textContent = '啟動動作控制';
    setStatus('相機已停止');
    actionState.textContent = 'READY';
    actionLabel.textContent = '尚無動作';
  };

  const start = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('此瀏覽器或連線環境不支援攝影機', 'error');
      return;
    }
    toggleButton.disabled = true;
    setStatus('正在請求攝影機權限');
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: 'user', width: { ideal: 320 }, height: { ideal: 240 } },
      });
      video.srcObject = stream;
      await video.play();
      overlay.width = video.videoWidth;
      overlay.height = video.videoHeight;
      setStatus('正在載入姿態模型');
      const { FilesetResolver, PoseLandmarker } = await import('@mediapipe/tasks-vision');
      const vision = await FilesetResolver.forVisionTasks(WASM_URL);
      const options = {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numPoses: 1,
        minPoseDetectionConfidence: 0.6,
        minPosePresenceConfidence: 0.6,
        minTrackingConfidence: 0.6,
      };
      try {
        landmarker = await PoseLandmarker.createFromOptions(vision, options);
      } catch {
        landmarker = await PoseLandmarker.createFromOptions(vision, {
          ...options,
          baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' },
        });
      }
      running = true;
      referenceX = null;
      calibrating = true;
      calibrationSamples = [];
      cameraWindow.dataset.active = 'true';
      document.querySelector('#camera-live').hidden = false;
      recenterButton.disabled = false;
      toggleButton.disabled = false;
      toggleButton.textContent = '停止動作控制';
      setStatus('請站在畫面中央校正站姿');
      animationFrame = window.requestAnimationFrame(detectFrame);
    } catch (error) {
      stop();
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        setStatus('攝影機權限遭拒，請允許瀏覽器使用相機', 'error');
      } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        setStatus('找不到可用的攝影機', 'error');
      } else {
        setStatus('無法啟動動作辨識，請檢查相機與網路連線', 'error');
      }
      toggleButton.disabled = false;
    }
  };

  const toggle = () => running ? stop() : start();
  const recenter = () => {
    if (!running) return;
    referenceX = null;
    calibrationSamples = [];
    calibrating = true;
    setMove(0);
    setStatus('請站在畫面中央校正站姿');
  };

  toggleButton.addEventListener('click', toggle);
  recenterButton.addEventListener('click', recenter);
  return { stop };
}
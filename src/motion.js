import { classifyPose, createGestureGate } from './pose-classifier.js';

const TASKS_VERSION = '1.1.1';
const WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VERSION}/wasm`;
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
const ACTION_LABELS = {
  leftPunch: '左直拳',
  rightPunch: '右直拳',
  leftKick: '左腳前踢',
  rightKick: '右腳前踢',
};

export function createMotionController({ video, overlay, cameraWindow, status, statusLight, actionState, actionLabel, toggleButton, onAttack }) {
  let stream = null;
  let landmarker = null;
  let animationFrame = 0;
  let running = false;
  let lastVideoTime = -1;
  const gestureGate = createGestureGate({ confirmationFrames: 4, cooldownMs: 800, releaseFrames: 8 });
  let lastActionTimer = 0;
  let lastInferenceAt = 0;

  const setStatus = (message, state = '') => {
    status.textContent = message;
    statusLight.dataset.state = state;
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
    setAction(ACTION_LABELS[kind]);
  };

  const loseTracking = () => {
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
    const pose = classifyPose(landmarks);
    if (!pose.tracked) {
      loseTracking();
      return;
    }
    if (!pose.facingCamera) {
      gestureGate.resetForTrackingLoss();
      setStatus('請正面面向鏡頭');
      actionState.textContent = 'READY';
      actionLabel.textContent = '面向鏡頭出拳或前踢';
      return;
    }
    setStatus('正面追蹤中', 'ready');
    for (const action of Object.keys(ACTION_LABELS)) {
      acceptGesture(pose[action], action, now);
    }
  };

  const stop = () => {
    running = false;
    window.cancelAnimationFrame(animationFrame);
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    landmarker?.close();
    landmarker = null;
    video.srcObject = null;
    cameraWindow.dataset.active = 'false';
    document.querySelector('#camera-live').hidden = true;
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
      cameraWindow.dataset.active = 'true';
      document.querySelector('#camera-live').hidden = false;
      toggleButton.disabled = false;
      toggleButton.textContent = '停止動作控制';
      setStatus('請正面面向鏡頭');
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
  toggleButton.addEventListener('click', toggle);
  return { stop };
}
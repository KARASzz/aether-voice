let audioCtx = null;
let mediaStream = null;
let scriptNode = null;
let isRecording = false;
let currentState = 'idle';

// 播放队列流控
let nextPlayTime = 0;
const activeSources = [];

const orb = document.getElementById('orb-button');
const closeBtn = document.getElementById('close-btn');
const tooltip = document.getElementById('tooltip');
let tooltipTimer = null;

function showTooltip(text, duration = 3000) {
  if (!text) return;
  tooltip.textContent = text;
  tooltip.classList.add('show');
  clearTimeout(tooltipTimer);
  tooltipTimer = setTimeout(() => {
    tooltip.classList.remove('show');
  }, duration);
}

function updateState(state, message = '') {
  currentState = state;
  orb.className = `orb state-${state}`;

  if (message) {
    showTooltip(message, state === 'error' ? 4500 : 2500);
  }

  if (state === 'connected') {
    startAudioCapture();
  } else if (state === 'disconnected' || state === 'idle' || state === 'error') {
    stopAudioCapture();
    stopAllAudioPlayback();
  }
}

// 接收主进程状态变更
window.electronAPI.onStateChange((data) => {
  if (typeof data === 'string') {
    updateState(data);
  } else if (data && data.state) {
    updateState(data.state, data.message);
  }
});

// 接收下行音频分片
window.electronAPI.onAudioDelta((base64Delta) => {
  playAudioChunk(base64Delta);
});

// 接收打断信号
window.electronAPI.onStopAudio(() => {
  stopAllAudioPlayback();
});

// 单击悬浮球：智能切换（连线 / 挂断 / 错误恢复）
orb.addEventListener('click', async (e) => {
  e.stopPropagation();

  // 确保在主用户手势中激活音频上下文
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
    }
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }
  } catch (err) {}

  if (currentState === 'error') {
    // 错误状态下点击先恢复为待命
    updateState('idle', '已重置待命，再次点击连接');
    await window.electronAPI.toggleSession('error');
    return;
  }
  const newState = await window.electronAPI.toggleSession(currentState);
  if (newState) {
    updateState(newState);
  }
});

// 右键点击：打开上下文操作菜单
orb.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  window.electronAPI.showContextMenu();
});

// 点击右上角 × 退出程序
closeBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  window.electronAPI.quitApp();
});

// 音频流式采集（麦克风 24kHz PCM）
async function startAudioCapture() {
  if (isRecording) return;
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
    }
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }

    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: 24000,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });

    const source = audioCtx.createMediaStreamSource(mediaStream);
    scriptNode = audioCtx.createScriptProcessor(2048, 1, 1);

    scriptNode.onaudioprocess = (e) => {
      if (!isRecording) return;
      const inputData = e.inputBuffer.getChannelData(0);
      const pcm16 = floatTo16BitPCM(inputData);
      const base64 = bufferToBase64(pcm16);
      window.electronAPI.sendAudioChunk(base64);
    };

    source.connect(scriptNode);
    scriptNode.connect(audioCtx.destination);
    isRecording = true;
  } catch (err) {
    console.error('麦克风初始化异常:', err);
    updateState('error', '麦克风权限受限或未找到输入设备');
  }
}

function stopAudioCapture() {
  isRecording = false;
  if (scriptNode) {
    scriptNode.disconnect();
    scriptNode = null;
  }
  if (mediaStream) {
    mediaStream.getTracks().forEach(track => track.stop());
    mediaStream = null;
  }
}

// 下行音频流式排队回放
function playAudioChunk(base64Pcm) {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  const arrayBuffer = base64ToArrayBuffer(base64Pcm);
  const int16Array = new Int16Array(arrayBuffer);
  const float32Array = new Float32Array(int16Array.length);

  for (let i = 0; i < int16Array.length; i++) {
    float32Array[i] = int16Array[i] / 32768.0;
  }

  const audioBuffer = audioCtx.createBuffer(1, float32Array.length, 24000);
  audioBuffer.getChannelData(0).set(float32Array);

  const source = audioCtx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(audioCtx.destination);

  const currentTime = audioCtx.currentTime;
  if (nextPlayTime < currentTime) {
    nextPlayTime = currentTime;
  }
  source.start(nextPlayTime);
  nextPlayTime += audioBuffer.duration;

  activeSources.push(source);
  source.onended = () => {
    const idx = activeSources.indexOf(source);
    if (idx !== -1) activeSources.splice(idx, 1);
  };
}

function stopAllAudioPlayback() {
  while (activeSources.length > 0) {
    const src = activeSources.pop();
    try {
      src.stop();
    } catch (e) {}
  }
  if (audioCtx) {
    nextPlayTime = audioCtx.currentTime;
  }
}

function floatTo16BitPCM(float32) {
  const buffer = new ArrayBuffer(float32.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
  return buffer;
}

function bufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

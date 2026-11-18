(() => {
  const BUILT_IN_API_KEY = '';
  const DEFAULTS = {
    ttsBaseUrl: 'https://edge-tts-weathered-math-d184.zyhmoonzy.workers.dev/v1',
    ttsPath: '/audio/speech',
    ttsVoice: 'zh-CN-XiaoyiNeural',
    ttsSpeed: '1',
    sttBaseUrl: 'https://azure-stt.zyhmoonzy.workers.dev/v1',
    sttPath: '/audio/transcriptions',
    sttLanguage: 'zh-CN'
  };
  const STORE_KEY = 'aether-voice-console-settings-v1';
  const $ = (selector) => document.querySelector(selector);
  const settings = loadSettings();
  let activeAudioUrl = '';
  let sourceAudioUrl = '';
  let selectedAudioFile = null;
  let recorder = null;
  let recorderStream = null;
  let recordStartedAt = 0;
  let recordInterval = null;
  let toastTimeout = null;

  function loadSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
      return { ...DEFAULTS, ...saved };
    } catch {
      return { ...DEFAULTS };
    }
  }

  function saveSettings() {
    const ids = Object.keys(DEFAULTS);
    const next = {};
    for (const id of ids) {
      const field = document.getElementById(id);
      if (field) next[id] = field.value.trim();
    }
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(next));
    } catch {
      showToast('浏览器未能保存设置；当前页面仍可继续使用。');
    }
    Object.assign(settings, next);
    updateEndpointHints();
  }

  function fillSettingsForm() {
    for (const id of Object.keys(DEFAULTS)) {
      const field = document.getElementById(id);
      if (field) field.value = settings[id];
    }
    $('#ttsVoice').value = settings.ttsVoice;
    $('#ttsSpeed').value = settings.ttsSpeed;
    $('#ttsKey').value = BUILT_IN_API_KEY;
    $('#sttKey').value = BUILT_IN_API_KEY;
    updateSpeedReadout();
    updateEndpointHints();
  }

  function updateSpeedReadout() {
    const speed = Number($('#ttsSpeed').value);
    $('#speedValue').textContent = `${speed.toFixed(2)}×`;
  }

  function endpoint(base, path) {
    const cleanBase = base.trim().replace(/\/+$/, '');
    const cleanPath = path.trim();
    if (/^https?:\/\//i.test(cleanPath)) return new URL(cleanPath).toString();
    return `${cleanBase}/${cleanPath.replace(/^\/+/, '')}`;
  }

  function updateEndpointHints() {
    const shortHost = (url) => {
      try {
        return new URL(url).hostname.replace('.workers.dev', '…');
      } catch {
        return 'Worker';
      }
    };
    $('#ttsEndpointHint').textContent = `${shortHost(settings.ttsBaseUrl)}${settings.ttsBaseUrl.replace(/^https?:\/\/[^/]+/i, '')}${settings.ttsPath}`;
  }

  function setStatus(element, message = '', kind = '') {
    element.textContent = message;
    element.classList.remove('error', 'success');
    if (kind) element.classList.add(kind);
  }

  function setBadge(element, label, kind = '') {
    element.textContent = label;
    element.classList.remove('busy', 'ok', 'fail');
    if (kind) element.classList.add(kind);
  }

  function showToast(message) {
    const toast = $('#toast');
    toast.textContent = message;
    toast.classList.add('visible');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => toast.classList.remove('visible'), 2600);
  }

  function prettyBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  function formatSeconds(seconds) {
    const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
    const secs = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  }

  function bearerHeaders(key) {
    return key ? { Authorization: `Bearer ${key}` } : {};
  }

  async function readError(response) {
    const raw = await response.text();
    try {
      const data = JSON.parse(raw);
      return data.error?.message || data.message || data.detail || raw || `HTTP ${response.status}`;
    } catch {
      return raw || `HTTP ${response.status}`;
    }
  }

  function friendlyNetworkError(error) {
    if (error instanceof TypeError) {
      return '连接失败或浏览器拦截了跨域请求。请检查 Worker 是否开启 CORS（OPTIONS、Authorization、POST）。';
    }
    return error?.message || '请求没有完成，请检查接口设置后重试。';
  }

  // Mode switch
  document.querySelectorAll('.mode-tab').forEach((button) => {
    button.addEventListener('click', () => {
      const mode = button.dataset.mode;
      document.querySelectorAll('.mode-tab').forEach((tab) => {
        const isActive = tab === button;
        tab.classList.toggle('is-active', isActive);
        tab.setAttribute('aria-selected', String(isActive));
      });
      $('#panel-tts').hidden = mode !== 'tts';
      $('#panel-stt').hidden = mode !== 'stt';
    });
  });

  // The private console embeds the user's Worker key in its local source, not browser storage.
  const dialog = $('#configDialog');
  document.querySelectorAll('.settings-trigger').forEach((button) => button.addEventListener('click', () => {
    // Keys intentionally stay out of localStorage, so repopulate them whenever
    // the settings dialog opens (including after a failed request or page reload).
    $('#ttsKey').value = BUILT_IN_API_KEY;
    $('#sttKey').value = BUILT_IN_API_KEY;
    dialog.showModal();
  }));
  $('.dialog-close').addEventListener('click', () => dialog.close());
  $('.dialog-cancel').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  $('#configForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const form = $('#configForm');
    if (!form.reportValidity()) return;
    saveSettings();
    dialog.close();
    showToast('接口设置已保存');
  });

  // TTS
  const ttsText = $('#ttsText');
  ttsText.addEventListener('input', () => { $('#charCount').textContent = `${ttsText.value.length} / 3000`; });
  document.querySelectorAll('[data-voice]').forEach((button) => {
    button.addEventListener('click', () => { $('#ttsVoice').value = button.dataset.voice; });
  });
  $('#ttsVoice').addEventListener('change', () => { settings.ttsVoice = $('#ttsVoice').value.trim(); });
  $('#ttsSpeed').addEventListener('input', updateSpeedReadout);

  $('#ttsForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const status = $('#ttsStatus');
    const keyField = $('#ttsKey');
    const apiKey = keyField.value.trim() || BUILT_IN_API_KEY;
    if (!apiKey) {
      setStatus(status, '请先在“接口设置”中输入 TTS API Key。', 'error');
      dialog.showModal();
      keyField.focus();
      return;
    }
    if (!ttsText.value.trim()) {
      setStatus(status, '先写下一段要合成的文字。', 'error');
      return;
    }

    const button = $('#ttsForm button[type="submit"]');
    const startedAt = performance.now();
    const voice = $('#ttsVoice').value.trim() || settings.ttsVoice;
    const speed = Number($('#ttsSpeed').value);
    const requestUrl = endpoint(settings.ttsBaseUrl, settings.ttsPath);
    button.disabled = true;
    button.querySelector('.button-label').textContent = '声波生成中…';
    setStatus(status, '正在连接语音合成 Worker…');
    setBadge($('#ttsResultBadge'), '处理中', 'busy');
    $('#ttsEmpty').hidden = true;
    $('#ttsResult').hidden = true;

    try {
      const response = await fetch(requestUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...bearerHeaders(apiKey) },
        body: JSON.stringify({
          input: ttsText.value.trim(),
          voice,
          speed
        })
      });
      if (!response.ok) throw new Error(await readError(response));
      const contentType = (response.headers.get('content-type') || '').toLowerCase();
      let blob;
      let responseLabel = contentType.split(';')[0] || '';
      if (contentType.includes('json')) {
        const data = await response.json();
        const encoded = data.audio || data.data || data.audio_base64;
        const audioLink = data.audio_url || data.audioUrl || data.url;
        if (typeof audioLink === 'string') {
          const audioResponse = await fetch(new URL(audioLink, requestUrl), { headers: bearerHeaders(apiKey) });
          if (!audioResponse.ok) throw new Error(`音频下载失败：HTTP ${audioResponse.status}`);
          blob = await audioResponse.blob();
          responseLabel = audioResponse.headers.get('content-type') || blob.type || responseLabel;
        } else if (typeof encoded === 'string') {
          const base64 = encoded.replace(/^data:audio\/[^;]+;base64,/i, '');
          const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
          responseLabel = data.content_type || 'audio/mpeg';
          blob = new Blob([bytes], { type: responseLabel });
        } else {
          throw new Error(data.error?.message || data.message || '接口已响应，但没有返回可播放的音频数据。');
        }
      } else {
        blob = await response.blob();
      }
      if (!blob.size) throw new Error('Worker 返回了空音频。');
      if (activeAudioUrl) URL.revokeObjectURL(activeAudioUrl);
      activeAudioUrl = URL.createObjectURL(blob);
      const audio = $('#ttsAudio');
      audio.src = activeAudioUrl;
      $('#downloadAudio').href = activeAudioUrl;
      const mimeType = responseLabel || blob.type;
      const audioExtension = extensionForAudio(mimeType);
      $('#downloadAudio').download = `aether-voice-${new Date().toISOString().slice(0, 10)}.${audioExtension}`;
      $('#ttsResultMeta').textContent = `${voice} · ${audioFormatLabel(mimeType)} · ${prettyBytes(blob.size)}`;
      $('#ttsLatency').textContent = `${Math.round(performance.now() - startedAt)} ms`;
      $('#ttsResult').hidden = false;
      setBadge($('#ttsResultBadge'), '已完成', 'ok');
      setStatus(status, '合成完成，点击播放器试听。', 'success');
    } catch (error) {
      $('#ttsEmpty').hidden = false;
      $('#ttsLatency').textContent = `${Math.round(performance.now() - startedAt)} ms`;
      setBadge($('#ttsResultBadge'), '连接失败', 'fail');
      setStatus(status, friendlyNetworkError(error), 'error');
    } finally {
      button.disabled = false;
      button.querySelector('.button-label').textContent = '开始炼声';
    }
  });

  function extensionForAudio(contentType = '') {
    const mime = contentType.split(';')[0].trim().toLowerCase();
    const map = {
      'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav',
      'audio/ogg': 'ogg', 'audio/opus': 'opus', 'audio/aac': 'aac', 'audio/flac': 'flac'
    };
    return map[mime] || 'audio';
  }

  function audioFormatLabel(contentType = '') {
    const extension = extensionForAudio(contentType);
    return extension === 'audio' ? '音频' : extension.toUpperCase();
  }

  // WAV file selection and preview
  const fileInput = $('#audioFile');
  const dropZone = $('#dropZone');
  const selectedFileBox = $('#selectedFile');
  const transcribeButton = $('#transcribeButton');
  const sourcePreview = $('#sourcePreview');

  async function isWav(file) {
    if (!file || !/\.(wav|wave)$/i.test(file.name)) return false;
    const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    const riff = String.fromCharCode(...header.slice(0, 4));
    const wave = String.fromCharCode(...header.slice(8, 12));
    return (riff === 'RIFF' || riff === 'RIFX' || riff === 'RF64') && wave === 'WAVE';
  }

  async function setSelectedAudio(file) {
    if (!file) return;
    if (/\.mp3$/i.test(file.name)) {
      clearSelectedAudio();
      setStatus($('#sttStatus'), '正在将 MP3 转换为 WAV…');
      try {
        const wav = await convertRecordingToWav(file);
        const converted = new File([wav], file.name.replace(/\.mp3$/i, '.wav'), { type: 'audio/wav' });
        await setSelectedAudio(converted);
        $('#selectedName').textContent = file.name;
        $('#selectedMeta').textContent = `MP3 · 已转换为 WAV · ${prettyBytes(file.size)}`;
        setStatus($('#sttStatus'), 'MP3 已转换为 WAV，可以开始转写。', 'success');
      } catch {
        setStatus($('#sttStatus'), 'MP3 解码失败，请检查文件或换一个浏览器。', 'error');
      }
      return;
    }
    if (!(await isWav(file))) {
      showToast('请上传 WAV 或 MP3 音频文件。');
      return;
    }
    selectedAudioFile = file;
    $('#selectedName').textContent = file.name;
    $('#selectedMeta').textContent = `WAV · ${prettyBytes(file.size)}`;
    selectedFileBox.hidden = false;
    $('#fileTitle').textContent = 'WAV 已装载';
    $('#fileSubtitle').textContent = '确认无误后开始转写';
    transcribeButton.disabled = false;
    if (sourceAudioUrl) URL.revokeObjectURL(sourceAudioUrl);
    sourceAudioUrl = URL.createObjectURL(file);
    sourcePreview.src = sourceAudioUrl;
    sourcePreview.hidden = false;
    setStatus($('#sttStatus'), '音频已就绪。');
  }

  function clearSelectedAudio() {
    selectedAudioFile = null;
    fileInput.value = '';
    selectedFileBox.hidden = true;
    $('#fileTitle').textContent = '拖一段 WAV 或 MP3 录音到这里';
    $('#fileSubtitle').textContent = '或点击选择文件 · MP3 会自动转换为 WAV';
    transcribeButton.disabled = true;
    sourcePreview.pause();
    sourcePreview.removeAttribute('src');
    sourcePreview.load();
    sourcePreview.hidden = true;
    if (sourceAudioUrl) URL.revokeObjectURL(sourceAudioUrl);
    sourceAudioUrl = '';
  }

  fileInput.addEventListener('change', () => setSelectedAudio(fileInput.files?.[0]));
  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      fileInput.click();
    }
  });
  dropZone.addEventListener('dragover', (event) => { event.preventDefault(); dropZone.classList.add('dragover'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
  dropZone.addEventListener('drop', (event) => {
    event.preventDefault();
    dropZone.classList.remove('dragover');
    setSelectedAudio(event.dataTransfer?.files?.[0]);
  });
  $('#removeFile').addEventListener('click', clearSelectedAudio);

  // Browser recordings are converted to mono PCM WAV so the Worker always receives WAV.
  function toPcmWav(audioBuffer) {
    const samples = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;
    const bytesPerSample = 2;
    const dataLength = samples.length * bytesPerSample;
    const buffer = new ArrayBuffer(44 + dataLength);
    const view = new DataView(buffer);
    const writeText = (offset, value) => { for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i)); };
    writeText(0, 'RIFF');
    view.setUint32(4, 36 + dataLength, true);
    writeText(8, 'WAVE');
    writeText(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * bytesPerSample, true);
    view.setUint16(32, bytesPerSample, true);
    view.setUint16(34, 16, true);
    writeText(36, 'data');
    view.setUint32(40, dataLength, true);
    for (let i = 0, offset = 44; i < samples.length; i += 1, offset += 2) {
      const sample = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    }
    return new Blob([buffer], { type: 'audio/wav' });
  }

  async function convertRecordingToWav(blob) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) throw new Error('此浏览器无法读取录音。请改为上传 WAV 文件。');
    const decoder = new AudioContextClass();
    try {
      const decoded = await decoder.decodeAudioData(await blob.arrayBuffer());
      const rate = 16000;
      const frameCount = Math.max(1, Math.ceil(decoded.duration * rate));
      const offline = new OfflineAudioContext(1, frameCount, rate);
      const source = offline.createBufferSource();
      source.buffer = decoded;
      source.connect(offline.destination);
      source.start(0);
      const mono = await offline.startRendering();
      return toPcmWav(mono);
    } finally {
      await decoder.close().catch(() => {});
    }
  }

  function updateRecordTimer() {
    $('#recordTimer').textContent = formatSeconds((Date.now() - recordStartedAt) / 1000);
  }

  function stopRecordingUi() {
    clearInterval(recordInterval);
    recordInterval = null;
    recorder = null;
    if (recorderStream) recorderStream.getTracks().forEach((track) => track.stop());
    recorderStream = null;
    $('#recordButton').classList.remove('is-recording');
    $('#recordButton').querySelector('span').textContent = '开始录音';
    $('#recordTimer').hidden = true;
  }

  $('#recordButton').addEventListener('click', async () => {
    const button = $('#recordButton');
    if (recorder && recorder.state === 'recording') {
      button.disabled = true;
      button.querySelector('span').textContent = '正在转换 WAV…';
      recorder.stop();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setStatus($('#sttStatus'), '当前浏览器不支持录音，请直接上传 WAV 文件。', 'error');
      return;
    }
    try {
      clearSelectedAudio();
      recorderStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus'].find((type) => MediaRecorder.isTypeSupported(type));
      recorder = new MediaRecorder(recorderStream, mimeType ? { mimeType } : undefined);
      const chunks = [];
      recorder.addEventListener('dataavailable', (event) => { if (event.data.size) chunks.push(event.data); });
      recorder.addEventListener('stop', async () => {
        try {
          setStatus($('#sttStatus'), '录音结束，正在转换为 16 kHz WAV…');
          const sourceBlob = new Blob(chunks, { type: recorder?.mimeType || 'audio/webm' });
          const wavBlob = await convertRecordingToWav(sourceBlob);
          const wavFile = new File([wavBlob], `录音-${new Date().toISOString().replace(/[:.]/g, '-')}.wav`, { type: 'audio/wav' });
          await setSelectedAudio(wavFile);
          setStatus($('#sttStatus'), '录音已转换为 WAV，可以开始转写。', 'success');
        } catch (error) {
          setStatus($('#sttStatus'), error.message || '录音转换失败。', 'error');
        } finally {
          stopRecordingUi();
          button.disabled = false;
        }
      }, { once: true });
      recorder.start();
      recordStartedAt = Date.now();
      $('#recordTimer').hidden = false;
      updateRecordTimer();
      recordInterval = setInterval(updateRecordTimer, 1000);
      button.classList.add('is-recording');
      button.querySelector('span').textContent = '停止并转换';
      setStatus($('#sttStatus'), '正在录音；录音数据只在你点击转写后发送。');
    } catch (error) {
      stopRecordingUi();
      button.disabled = false;
      setStatus($('#sttStatus'), error.name === 'NotAllowedError' ? '麦克风权限未开启；也可以上传 WAV 文件。' : friendlyNetworkError(error), 'error');
    }
  });

  // STT
  $('#sttForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const status = $('#sttStatus');
    const keyField = $('#sttKey');
    const apiKey = keyField.value.trim() || BUILT_IN_API_KEY;
    if (!selectedAudioFile) {
      setStatus(status, '请先选择或录制一段 WAV 音频。', 'error');
      return;
    }
    if (!apiKey) {
      setStatus(status, '请先在“接口设置”中输入 STT API Key。', 'error');
      dialog.showModal();
      keyField.focus();
      return;
    }

    const button = transcribeButton;
    const startedAt = performance.now();
    button.disabled = true;
    button.querySelector('.button-label').textContent = '正在辨认…';
    setStatus(status, '正在上传 WAV 并识别…');
    setBadge($('#sttResultBadge'), '处理中', 'busy');
    $('#sttEmpty').hidden = true;
    $('#sttResult').hidden = true;

    try {
      const body = new FormData();
      body.append('file', selectedAudioFile, selectedAudioFile.name);
      body.append('language', settings.sttLanguage);
      const response = await fetch(endpoint(settings.sttBaseUrl, settings.sttPath), {
        method: 'POST',
        headers: bearerHeaders(apiKey),
        body
      });
      if (!response.ok) throw new Error(await readError(response));
      const raw = await response.text();
      let resultText = raw;
      try {
        const data = JSON.parse(raw);
        resultText = data.DisplayText ?? data.displayText ?? data.text ?? data.transcript ?? data.transcription ?? data.NBest?.[0]?.Display ?? data.result?.text ?? data.result ?? data.message ?? raw;
        if (typeof resultText !== 'string') resultText = JSON.stringify(resultText, null, 2);
      } catch {
        // Plain-text response is also supported.
      }
      if (!String(resultText).trim()) throw new Error('接口返回成功，但没有识别到文字。');
      $('#transcriptText').textContent = resultText;
      $('#sttLatency').textContent = `${Math.round(performance.now() - startedAt)} ms`;
      $('#sttResult').hidden = false;
      setBadge($('#sttResultBadge'), '已完成', 'ok');
      setStatus(status, '转写完成。', 'success');
    } catch (error) {
      $('#sttEmpty').hidden = false;
      $('#sttLatency').textContent = `${Math.round(performance.now() - startedAt)} ms`;
      setBadge($('#sttResultBadge'), '连接失败', 'fail');
      setStatus(status, friendlyNetworkError(error), 'error');
    } finally {
      button.disabled = !selectedAudioFile;
      button.querySelector('.button-label').textContent = '开始转写';
    }
  });

  $('#copyTranscript').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText($('#transcriptText').textContent);
      showToast('转写稿已复制');
    } catch {
      showToast('复制失败；请选中文字后手动复制。');
    }
  });

  fillSettingsForm();
  window.addEventListener('pagehide', () => {
    $('#ttsKey').value = '';
    $('#sttKey').value = '';
    if (activeAudioUrl) URL.revokeObjectURL(activeAudioUrl);
    if (sourceAudioUrl) URL.revokeObjectURL(sourceAudioUrl);
    if (recorder && recorder.state === 'recording') recorder.stop();
    if (recorderStream) recorderStream.getTracks().forEach((track) => track.stop());
  });
})();

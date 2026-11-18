# 炼声所 · 个人语音控制台

一个无需安装依赖的中文语音工作台，直接从浏览器调用你自己的 Cloudflare Workers。

## 启动

双击 `启动.command`，它会在本机开启静态网页服务并打开浏览器。也可以在终端运行：

```sh
cd "/Volumes/666/+Python mac/语音控制台"
python3 -m http.server 8765 --bind 127.0.0.1
```

然后访问 <http://127.0.0.1:8765>。本地 HTTP 地址能让浏览器正常使用录音权限，也便于 Worker 配置 CORS 来源。

## 已预设的接口

- 文字转语音：`https://edge-tts-weathered-math-d184.zyhmoonzy.workers.dev/v1` + `/audio/speech`
- 语音转文字：`https://azure-stt.zyhmoonzy.workers.dev/v1` + `/audio/transcriptions`
- 合成后端：Azure Speech Neural TTS；Worker 根据 `voice` 选择音色，并支持 `speed`
- 识别后端：Azure Speech 短语音识别接口；Worker 使用 `language`，忽略 OpenAI 风格的 `model` 字段
- 合成音色：`zh-CN-XiaoyiNeural`
- 识别上传：WAV、MP3；MP3 和浏览器录音会在本地转换为 16 kHz、单声道、16-bit PCM WAV

在页面中填写你自己的 Worker 口令。接口地址、音色和语速保存在当前浏览器。

## 接口约定

- TTS：`POST` JSON，字段为 `input`、`voice`、`speed`；Worker 返回音频二进制，输出格式由 Worker 决定。
- STT：`POST multipart/form-data`，字段为 `file`、`language`；响应可以是 Azure 短语音识别结果 JSON 或纯文本。
- 如果浏览器提示连接失败，请确认 Worker 的 CORS 响应允许本地页面来源、`OPTIONS` 预检、`Authorization` 请求头和 `POST` 方法。

所有网络请求只会在点击“开始炼声”或“开始转写”后发出。页面不会上传录音以外的本地文件。

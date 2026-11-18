# 极简独立办公任务语音助理（Windows & macOS 免安装版）系统设计规范

## 1. 概述与核心目标

本应用是一款面向日常办公场景的独立桌面级实时语音助理软件。为满足个人自用与轻便体验，软件兼具极致极简的外观、强大的后台多模态语音交互能力以及全链路本地化运行特性：

* **开箱即用 / 免安装**：
  * **macOS 端**：独立便携 `.app`（解压即可直接双击运行）。
  * **Windows 端**：单文件绿色便携 `.exe`（无需安装器，双击自解压或即开即用）。
  * **无需备案 / 纯本地直连**：客户端直连 Azure AI Foundry Realtime API 与搜索服务，无需任何公网中转服务器与域名备案。
* **极简 UI**：
  * 整个界面仅有一个高质感桌面悬浮语音交互球（灵动动效）。
  * 无多余输入框、导航栏、菜单项与设置窗体。
* **智能后台**：
  * 提示词完全内置在后台，提供默认的高效办公助理人设。
  * **语音指令动态切换人设**：支持自然语言直接下达换人设指令（如“切换为周报润色模式”、“扮演翻译官”），系统实时通过工具调用切换并语音确认。
  * **内置本地多源搜索 MCP**：无缝打通 Parallel Search、Tavily Search、Brave Search、Firecrawl 等多通道搜索引擎，智能体遇到时效问题或资料查询自动检索并语音回复。

---

## 2. 系统架构设计

```
+-------------------------------------------------------------+
|                     Electron 桌面悬浮客户端                   |
|                                                             |
|  +-------------------------------------------------------+  |
|  |           UI 表现层 (透明无边框悬浮球)                 |  |
|  | - 状态动效: 待命 / 聆听中 / 搜索中 / 语音播报中        |  |
|  | - 交互事件: 单击开始通话 / 单击挂断通话 / 拖拽移动    |  |
|  | - Web Audio API: 24kHz PCM 录音推流 & 音频流式播放     |  |
|  +---------------------------^---------------------------+  |
|                              | IPC 通信                     |
|  +---------------------------v---------------------------+  |
|  |                Node.js 后台核心控制层                  |  |
|  |                                                       |  |
|  | 1. Config Manager: 本地 config.json 读写与热加载      |  |
|  | 2. Realtime WebSocket Client:                         |  |
|  |    - 连接 Azure AI Foundry (gpt-realtime 模型)         |  |
|  |    - 双向流控 (Audio in / Audio out / VAD / 打断处理)   |  |
|  | 3. Persona Engine (人设管理系统):                      |  |
|  |    - 内置 6+ 款经典办公人设库与默认 System Prompt      |  |
|  |    - Tool: switch_persona (语音动态切人设)            |  |
|  | 4. Search MCP Integration (多源网络搜索网关):          |  |
|  |    - Tool: search_web / fetch_page                    |  |
|  |    - Parallel Search (首选) -> Tavily -> Brave        |  |
|  +-------------------------------------------------------+  |
+-------------------------------------------------------------+
               |                               |
       WebSocket (WSS)                  REST / JSON-RPC
               v                               v
    +--------------------+           +-------------------+
    | Azure AI Foundry   |           | 本地配置搜索服务   |
    | (gpt-realtime-2.1) |           | - Parallel Search |
    | Realtime 服务端     |           | - Tavily Search   |
    +--------------------+           | - Brave Search    |
                                     | - Firecrawl       |
                                     +-------------------+
```

---

## 3. 核心模块详细设计

### 3.1 UI 表现与交互逻辑
* **窗口形态**：
  * 尺寸约 100x100 像素，透明背景（`transparent: true`），无边框（`frame: false`），始终置顶（`alwaysOnTop: true`）。
  * 允许通过拖拽圆球在屏幕四周自由停放。
* **单一按钮交互**：
  * **未连线状态（待命）**：微弱呼吸灰白光效；单击按钮触发连接 Azure Realtime WebSocket。
  * **连线中 / 聆听状态**：蓝紫色流光渐变呼吸波纹；麦克风开启，流式采集 24kHz 单声道 PCM 格式音频送入 WebSocket。
  * **搜索处理中**：金色脉冲发散光效；模型检测到需联网检索，正在执行搜索工具。
  * **语音播报中**：声波跳动频率随音频振幅起伏；用户若开口说话，本地检测或服务端 VAD 立即停止本地音频播放（实现丝滑打断 Barge-in）。
  * **单击挂断**：任意时刻再次点击按钮立即断开 WebSocket，停止所有播放并恢复待命状态。

### 3.2 语音传输与音频处理
* **采样率与编解码**：采用 Azure Realtime API 标准的 24kHz 16-bit Mono PCM（小端序）。
* **录音采集**：利用 HTML5 AudioContext + ScriptProcessor / AudioWorklet 抓取麦克风输入，将 Float32 转换为 Int16 PCM Base64 块并发送 `input_audio_buffer.append` 事件。
* **下行播放**：接收服务端下发的 `response.audio.delta`，按帧入队 AudioContext 进行低延迟无缝流式回放。
* **实时打断（Barge-in）**：接收服务端 `input_audio_buffer.speech_started` 事件，本地即刻清空播放队列并停止当前 AudioBufferSourceNode。

### 3.3 提示词管理与语音人设切换（Persona Engine）
* **后台隐藏默认提示词**：
  * 基础角色：专业、高效、简明扼要的办公超级助理。口语表达精炼，适应语音收听，避免长篇大论。
* **人设动态切换机制**：
  * 在 Realtime Session 初始化时，注册函数工具 `switch_persona`：
    ```json
    {
      "type": "function",
      "name": "switch_persona",
      "description": "当用户通过语音明确要求改变角色、语气、风格或切换到特定助理模式时调用此工具",
      "parameters": {
        "type": "object",
        "properties": {
          "target_persona": {
            "type": "string",
            "enum": ["default", "weekly_report", "coding", "brainstorm", "translator", "executive", "custom"],
            "description": "目标人设类别"
          },
          "custom_instruction": {
            "type": "string",
            "description": "当目标为人设为 custom 时，用户具体要求的角色特点与行为准则"
          }
        },
        "required": ["target_persona"]
      }
    }
    ```
  * 当用户说“换成周报润色专家”时，智能体触发该工具。
  * 客户端接收到工具调用后，通过 WebSocket 发送 `session.update` 事件替换 `instructions`。
  * 工具返回成功后，智能体以新的人设语气语音答复确认（如：“好的，周报润色助理已就位，请告诉我你的原始素材。”）。

### 3.4 本地多源搜索 MCP 整合（Search Gateway）
* **工具定义**：向 Realtime 挂载 `search_web` 工具：
  ```json
  {
    "type": "function",
    "name": "search_web",
    "description": "当需要查询实时事实、新闻时政、最新技术文档、百科常识等用户提出的网络信息时调用",
    "parameters": {
      "type": "object",
      "properties": {
        "query": { "type": "string", "description": "精准检索关键词" }
      },
      "required": ["query"]
    }
  }
  ```
* **执行路由策略**：
  1. **第一梯队（首选）**：调用 `Parallel Search MCP` 的 `web_search` 接口，低延迟获取精炼网页片段。
  2. **第二梯队（回退/补充）**：若 Parallel Search 未配置或调用受阻，自动回退到 `Tavily Search API`。
  3. **第三梯队（复核）**：若需要多源核对，调用 `Brave Search API`。
  4. **特定网页抓取**：若需获取指定 URL 全文，调用 `Firecrawl`。
* **结果返还**：将搜索提取的核心事实摘要（控制在 300 字以内以适合口语输出）通过 `conversation.item.create`（role: tool）回传，并触发 `response.create`，模型立即将搜索结果转为生动的口语播报。

---

## 4. 配置文件设计 (`config.json`)

配置文件位于软件同级根目录，应用启动时自动检测，若不存在则自动生成带清晰注释的模板：

```json
{
  "azure_realtime": {
    "endpoint": "wss://<your-resource-name>.openai.azure.com/openai/realtime?api-version=2024-10-01-preview&deployment=gpt-realtime-2.1-datazone",
    "api_key": "YOUR_AZURE_OPENAI_KEY",
    "voice": "shimmer"
  },
  "search_services": {
    "parallel_search": {
      "enabled": true,
      "endpoint": "https://search.parallel.ai/mcp",
      "bearer_token": "fOid7M_uYqRqwdkUT_xeOPEdamJXfBRtkNYVsrOk"
    },
    "tavily": {
      "enabled": true,
      "api_key": "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"
    },
    "brave": {
      "enabled": true,
      "api_key": "BSA2m45uEtTVShYCq7c_ZdN4U00rM9d"
    },
    "firecrawl": {
      "enabled": true,
      "api_key": "fc-2faaf49f5ffe494da82fccdb1194d785"
    }
  },
  "window_settings": {
    "always_on_top": true,
    "position_x": null,
    "position_y": null
  }
}
```

---

## 5. 打包与绿色免安装交付方案

1. **macOS 打包**：
   * 构建目标：`dir` / `dmg` / `zip`。
   * 产物为独立的 `VoiceAssistant.app`，直接打包为 `.zip`。用户解压后直接双击即可运行。
2. **Windows 打包**：
   * 使用 `electron-builder` 配置 `target: "portable"`。
   * 产物为单个绿色独立文件 `VoiceAssistant-Portable.exe`。
   * 用户在任何 Windows 电脑上双击即可启动运行，不写注册表、无需安装向导。

---

## 6. 异常与边界场景处理

1. **未填写 Azure API Key / Endpoint**：
   * 点击圆球时圆球泛黄光提示，在终端或本地日志输出友好提示，并在同级目录打开/高亮 `config.json`。
2. **麦克风权限问题**：
   * 启动时检查麦克风权限，若未授权弹出系统授权提示或给出状态指示。
3. **网络与 WebSocket 意外中断**：
   * 自动重连 1 次，若多次失败自动断开并恢复灰白待命状态，防止持续报错。
4. **搜索超时或无网络**：
   * 搜索接口设置 5 秒超时保护，超时后通知模型“抱歉，网络检索超时，已按已有知识为您解答”。

---
*(规范制定完成)*

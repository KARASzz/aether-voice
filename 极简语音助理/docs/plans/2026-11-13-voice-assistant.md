# 极简独立办公任务语音助理（Windows & macOS 免安装版）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个独立、绿色免安装的桌面极简办公任务语音助理（支持 macOS 与 Windows），界面仅有一个悬浮语音球，通过端到端双向音频直连 Azure AI Foundry 实时模型，支持语音动态切换后台人设，并内置本地 Parallel Search、Tavily、Brave、Firecrawl 多源搜索工具。

**Architecture:** 基于 Electron 打造透明无边框、可自由拖拽置顶的单按钮悬浮交互层；主进程作为中枢控制，管理本地配置文件 `config.json`，承接 Web Audio 采集与播放的 24kHz PCM 音频流，直接与 Azure OpenAI Realtime WebSocket 建立端到端会话；内置人设引擎（Persona Engine）与搜索网关（Search Gateway），通过 Realtime Function Calling 自动分发语音换人设及网络检索。

**Tech Stack:** Electron, Node.js (v20+), WebSocket (`ws`), Web Audio API, `node:test` (内置轻量单元测试框架), `electron-builder` (macOS zip/dir 与 Windows portable 打包)。

---

### File Structure Map

* `package.json`: 依赖声明与打包构建脚本 (`start`, `test`, `build:mac`, `build:win`).
* `electron-builder.yml`: 跨平台免安装打包配置（macOS `.app` 目录及 zip、Windows 单文件 `portable` `.exe`）。
* `config.json`: 本地自用配置文件模板（预置已有的搜索 MCP 凭据与 Azure 字段）。
* `src/main/config.js`: 配置管理器，负责加载同级 `config.json`、设置默认值与校验。
* `src/main/search.js`: 搜索网关，按优先级依次路由 Parallel Search、Tavily、Brave、Firecrawl 并格式化摘要。
* `src/main/persona.js`: 人设引擎，内置常用办公人设，实现 `switch_persona` 函数与 System Prompt 更新。
* `src/main/realtime.js`: Azure Realtime 客户端，管理 WebSocket 通信、音频传输、VAD 状态、工具调用流转。
* `src/main/index.js`: Electron 主进程，配置透明、置顶、可拖拽的单按钮悬浮窗口与 IPC 调度。
* `src/preload/index.js`: ContextBridge 安全预加载脚本，向渲染层暴露必要的语音操作 API。
* `src/renderer/index.html`: 极简单按钮界面（仅一个支持拖拽交互的灵动声波球）。
* `src/renderer/style.css`: 纯 CSS 打造的呼吸、声波、搜索脉冲和流光动效。
* `src/renderer/app.js`: 渲染进程逻辑，基于 Web Audio 实现 24kHz PCM 麦克风音频采集及低延迟流式排队播放。
* `tests/config.test.js`: 配置读取、默认值补全及路径解析测试。
* `tests/search.test.js`: 搜索网关工具调度与降级逻辑测试。
* `tests/persona.test.js`: 人设注册、Prompt 获取及动态切换测试。

---

### Task 1: 初始化工程与基础配置

**Files:**
- Create: `package.json`
- Create: `config.json`
- Create: `electron-builder.yml`

- [ ] **Step 1: 编写 `package.json` 基础结构**

```json
{
  "name": "voice-assistant-desktop",
  "version": "1.0.0",
  "description": "极简独立办公任务语音助理（Windows & macOS 免安装版）",
  "main": "src/main/index.js",
  "scripts": {
    "start": "electron .",
    "test": "node --test tests/*.test.js",
    "build:mac": "electron-builder --mac dir --config electron-builder.yml",
    "build:win": "electron-builder --win portable --config electron-builder.yml"
  },
  "keywords": ["voice-assistant", "azure-realtime", "electron"],
  "author": "karas",
  "license": "MIT",
  "dependencies": {
    "ws": "^8.18.0"
  },
  "devDependencies": {
    "electron": "^33.2.0",
    "electron-builder": "^25.1.8"
  }
}
```

- [ ] **Step 2: 创建默认模板 `config.json`**

```json
{
  "azure_realtime": {
    "endpoint": "wss://YOUR_AZURE_RESOURCE.openai.azure.com/openai/realtime?api-version=2024-10-01-preview&deployment=gpt-realtime-2.1-datazone",
    "api_key": "YOUR_AZURE_KEY_HERE",
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
    "width": 110,
    "height": 110
  }
}
```

- [ ] **Step 3: 创建 `electron-builder.yml` 跨平台打包配置**

```yaml
appId: com.karas.voiceassistant
productName: VoiceAssistant
directories:
  output: dist
files:
  - "src/**/*"
  - "config.json"
  - "package.json"
  - "node_modules/**/*"
mac:
  target:
    - target: dir
    - target: zip
  category: public.app-category.productivity
  hardenedRuntime: false
  gatekeeperAssess: false
win:
  target:
    - target: portable
portable:
  splashImage: null
```

- [ ] **Step 4: 安装依赖并验证安装**

Run: `npm install`
Expected: 成功安装 `ws`, `electron`, `electron-builder` 且无报错。

- [ ] **Step 5: 提交基础配置**

Run:
```bash
git add package.json config.json electron-builder.yml
git commit -m "chore: 初始化工程依赖与打包配置"
```

---

### Task 2: 配置管理模块与单元测试

**Files:**
- Create: `src/main/config.js`
- Test: `tests/config.test.js`

- [ ] **Step 1: 编写配置模块单元测试 `tests/config.test.js`**

```javascript
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { loadConfig, getSearchCredentials } = require('../src/main/config');

test('loadConfig 应该正确读取现有配置', () => {
  const cfg = loadConfig();
  assert.ok(cfg.azure_realtime);
  assert.ok(cfg.search_services);
  assert.strictEqual(typeof cfg.window_settings.always_on_top, 'boolean');
});

test('getSearchCredentials 应该提取有效搜索配置', () => {
  const creds = getSearchCredentials();
  assert.ok(creds.parallel_search.bearer_token);
  assert.ok(creds.tavily.api_key);
});
```

- [ ] **Step 2: 运行测试以确认失败**

Run: `node --test tests/config.test.js`
Expected: FAIL (Cannot find module '../src/main/config')

- [ ] **Step 3: 编写配置加载模块 `src/main/config.js`**

```javascript
const fs = require('node:fs');
const path = require('node:path');

function getConfigPath() {
  // 优先同级目录，其次 app.getPath('userData')
  const localPath = path.resolve(__dirname, '../../config.json');
  return localPath;
}

function loadConfig() {
  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) {
    throw new Error(`配置文件未找到: ${configPath}`);
  }
  const raw = fs.readFileSync(configPath, 'utf-8');
  return JSON.parse(raw);
}

function getSearchCredentials() {
  const config = loadConfig();
  return config.search_services || {};
}

module.exports = {
  loadConfig,
  getSearchCredentials,
  getConfigPath
};
```

- [ ] **Step 4: 运行测试并验证通过**

Run: `node --test tests/config.test.js`
Expected: PASS

- [ ] **Step 5: 提交**

Run:
```bash
git add src/main/config.js tests/config.test.js
git commit -m "feat: 实现配置读取与测试"
```

---

### Task 3: 多源网络搜索网关（Search Gateway）

**Files:**
- Create: `src/main/search.js`
- Test: `tests/search.test.js`

- [ ] **Step 1: 编写搜索网关测试 `tests/search.test.js`**

```javascript
const test = require('node:test');
const assert = require('node:assert');
const { searchWeb, formatSearchResult } = require('../src/main/search');

test('formatSearchResult 格式化结果应该紧凑且包含核心文本', () => {
  const mockResults = [
    { title: 'Test 1', snippet: 'Content 1', url: 'https://example.com/1' },
    { title: 'Test 2', snippet: 'Content 2', url: 'https://example.com/2' }
  ];
  const output = formatSearchResult('测试', mockResults);
  assert.ok(output.includes('搜索关键词: 测试'));
  assert.ok(output.includes('Content 1'));
});

test('searchWeb 包含降级容错机制', async () => {
  // 即使网络或无配置，也能优雅返回字符串而不是直接抛异常
  const result = await searchWeb('人工智能最新进展');
  assert.strictEqual(typeof result, 'string');
  assert.ok(result.length > 0);
});
```

- [ ] **Step 2: 运行测试以确认失败**

Run: `node --test tests/search.test.js`
Expected: FAIL (Cannot find module '../src/main/search')

- [ ] **Step 3: 编写搜索网关模块 `src/main/search.js`**

```javascript
const { getSearchCredentials } = require('./config');

async function searchParallel(query, creds) {
  if (!creds?.parallel_search?.enabled || !creds?.parallel_search?.bearer_token) return null;
  const res = await fetch(creds.parallel_search.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${creds.parallel_search.bearer_token}`
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name: 'web_search',
        arguments: { query }
      }
    }),
    signal: AbortSignal.timeout(5000)
  });
  if (!res.ok) return null;
  const data = await res.json();
  const textContent = data.result?.content?.[0]?.text;
  if (!textContent) return null;
  return [{ title: query, snippet: textContent, url: 'https://search.parallel.ai' }];
}

async function searchTavily(query, creds) {
  if (!creds?.tavily?.enabled || !creds?.tavily?.api_key) return null;
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: creds.tavily.api_key,
      query,
      search_depth: 'basic',
      max_results: 3
    }),
    signal: AbortSignal.timeout(5000)
  });
  if (!res.ok) return null;
  const data = await res.json();
  return (data.results || []).map(r => ({
    title: r.title,
    snippet: r.content,
    url: r.url
  }));
}

async function searchBrave(query, creds) {
  if (!creds?.brave?.enabled || !creds?.brave?.api_key) return null;
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=3`;
  const res = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'X-Subscription-Token': creds.brave.api_key
    },
    signal: AbortSignal.timeout(5000)
  });
  if (!res.ok) return null;
  const data = await res.json();
  return (data.web?.results || []).map(r => ({
    title: r.title,
    snippet: r.description,
    url: r.url
  }));
}

function formatSearchResult(query, results) {
  if (!results || results.length === 0) {
    return `搜索关键词: ${query}\n未找到相关的网络公开结果。`;
  }
  const items = results.slice(0, 3).map((r, i) => `${i + 1}. [${r.title}] ${r.snippet}`).join('\n');
  return `搜索关键词: ${query}\n以下为检索到的最新摘要：\n${items}\n请根据以上事实，用自然、精炼的语音回答用户。`;
}

async function searchWeb(query) {
  const creds = getSearchCredentials();
  try {
    // 依次尝试 Parallel Search -> Tavily -> Brave
    const pResult = await searchParallel(query, creds);
    if (pResult && pResult.length > 0) return formatSearchResult(query, pResult);

    const tResult = await searchTavily(query, creds);
    if (tResult && tResult.length > 0) return formatSearchResult(query, tResult);

    const bResult = await searchBrave(query, creds);
    if (bResult && bResult.length > 0) return formatSearchResult(query, bResult);
  } catch (err) {
    console.error('搜索服务请求失败:', err.message);
  }
  return `已尝试网络搜索“${query}”，但检索服务超时或未返回结果，请直接结合你已有知识给出解答。`;
}

module.exports = {
  searchWeb,
  formatSearchResult
};
```

- [ ] **Step 4: 运行测试并验证通过**

Run: `node --test tests/search.test.js`
Expected: PASS

- [ ] **Step 5: 提交**

Run:
```bash
git add src/main/search.js tests/search.test.js
git commit -m "feat: 实现多源搜索网关与容错降级"
```

---

### Task 4: 人设引擎与提示词管理（Persona Engine）

**Files:**
- Create: `src/main/persona.js`
- Test: `tests/persona.test.js`

- [ ] **Step 1: 编写人设引擎测试 `tests/persona.test.js`**

```javascript
const test = require('node:test');
const assert = require('node:assert');
const { getPersonaPrompt, switchPersona, listPersonas } = require('../src/main/persona');

test('默认人设存在且包含语音交互规范', () => {
  const prompt = getPersonaPrompt('default');
  assert.ok(prompt.includes('语音助理'));
  assert.ok(prompt.includes('精炼'));
});

test('switchPersona 能够动态切换人设并返回确认语', () => {
  const res = switchPersona('weekly_report');
  assert.strictEqual(res.success, true);
  assert.ok(res.message.includes('周报'));
  assert.ok(getPersonaPrompt().includes('周报'));
});

test('switchPersona 支持自定义人设要求', () => {
  const res = switchPersona('custom', '你现在扮演苏格拉底，以提问方式引导');
  assert.strictEqual(res.success, true);
  assert.ok(getPersonaPrompt().includes('苏格拉底'));
});
```

- [ ] **Step 2: 运行测试以确认失败**

Run: `node --test tests/persona.test.js`
Expected: FAIL (Cannot find module '../src/main/persona')

- [ ] **Step 3: 编写人设管理模块 `src/main/persona.js`**

```javascript
const BASE_INSTRUCTIONS = `你是一个运行在用户桌面上的专业办公任务语音助理。
核心原则：
1. 请全程使用自然口语交流，语句保持简明精炼，适应语音收听，不要输出长篇大论或大段 Markdown 格式。
2. 遇到不确定的事实、时效性信息，请主动调用 search_web 工具进行搜索。
3. 当用户通过语音提出人设或角色切换要求时（例如“换成周报专家”、“做我的翻译官”、“切换为代码顾问”），必须调用 switch_persona 工具进行切换。`;

const PERSONA_MAP = {
  default: {
    name: '默认办公助理',
    desc: '全能办公秘书，协助日程、待办整理、信息查阅与总结',
    instructions: `${BASE_INSTRUCTIONS}\n当前模式：全能办公助手。热情、干练、高效地协助用户梳理办公事务。`
  },
  weekly_report: {
    name: '周报润色专家',
    desc: '聚焦工作成果提炼、数字化表达与项目复盘',
    instructions: `${BASE_INSTRUCTIONS}\n当前模式：周报润色专家。请帮用户梳理核心产出、量化指标并优化语句逻辑。`
  },
  coding: {
    name: '极客技术顾问',
    desc: '快速排查代码问题、架构讨论与技术方案对比',
    instructions: `${BASE_INSTRUCTIONS}\n当前模式：资深技术顾问。分析问题深入浅出，聚焦核心逻辑与最优解。`
  },
  translator: {
    name: '同声传译官',
    desc: '精准、地道的中英双向口语翻译与润色',
    instructions: `${BASE_INSTRUCTIONS}\n当前模式：同声传译官。根据用户的输入直接提供地道、精准的对照翻译，并附带简要表达亮点。`
  },
  brainstorm: {
    name: '头脑风暴创意伙伴',
    desc: '启发思考，提供多元视角与创意发散方案',
    instructions: `${BASE_INSTRUCTIONS}\n当前模式：创意伙伴。思维活跃，善于提出反直觉思路和创新方案。`
  }
};

let currentPersona = 'default';
let customInstructionOverride = null;

function getPersonaPrompt(key = currentPersona) {
  if (key === 'custom' && customInstructionOverride) {
    return `${BASE_INSTRUCTIONS}\n当前自定义模式：${customInstructionOverride}`;
  }
  return PERSONA_MAP[key]?.instructions || PERSONA_MAP.default.instructions;
}

function switchPersona(targetKey, customInstruction = '') {
  if (targetKey === 'custom' && customInstruction) {
    currentPersona = 'custom';
    customInstructionOverride = customInstruction;
    return {
      success: true,
      persona: 'custom',
      message: `已为你切换为自定义模式：“${customInstruction}”。请随时开口！`
    };
  }

  if (PERSONA_MAP[targetKey]) {
    currentPersona = targetKey;
    customInstructionOverride = null;
    return {
      success: true,
      persona: targetKey,
      message: `已为你切换为【${PERSONA_MAP[targetKey].name}】模式。请问有什么可以帮您？`
    };
  }

  // 模糊匹配
  for (const [k, v] of Object.entries(PERSONA_MAP)) {
    if (v.name.includes(targetKey) || targetKey.includes(k)) {
      currentPersona = k;
      return {
        success: true,
        persona: k,
        message: `已切换为【${v.name}】模式。`
      };
    }
  }

  // 默认作为自定义处理
  currentPersona = 'custom';
  customInstructionOverride = targetKey;
  return {
    success: true,
    persona: 'custom',
    message: `已为你切换为特定角色模式：“${targetKey}”。`
  };
}

function listPersonas() {
  return Object.entries(PERSONA_MAP).map(([key, item]) => ({
    key,
    name: item.name,
    desc: item.desc
  }));
}

module.exports = {
  getPersonaPrompt,
  switchPersona,
  listPersonas,
  BASE_INSTRUCTIONS
};
```

- [ ] **Step 4: 运行测试并验证通过**

Run: `node --test tests/persona.test.js`
Expected: PASS

- [ ] **Step 5: 提交**

Run:
```bash
git add src/main/persona.js tests/persona.test.js
git commit -m "feat: 实现人设管理与语音动态切换引擎"
```

---

### Task 5: Azure Realtime WebSocket 通信控制器

**Files:**
- Create: `src/main/realtime.js`

- [ ] **Step 1: 编写 Realtime 控制器 `src/main/realtime.js`**

```javascript
const WebSocket = require('ws');
const { loadConfig } = require('./config');
const { getPersonaPrompt, switchPersona } = require('./persona');
const { searchWeb } = require('./search');

class RealtimeSession {
  constructor(options = {}) {
    this.ws = null;
    this.isConnected = false;
    this.onStateChange = options.onStateChange || (() => {});
    this.onAudioDelta = options.onAudioDelta || (() => {});
    this.onSpeechStarted = options.onSpeechStarted || (() => {});
  }

  connect() {
    const config = loadConfig();
    const { endpoint, api_key, voice = 'shimmer' } = config.azure_realtime;

    if (!endpoint || !api_key || api_key.startsWith('YOUR_')) {
      throw new Error('未正确配置 Azure Realtime Endpoint 或 API Key，请检查 config.json');
    }

    this.onStateChange('connecting');

    const headers = {
      'api-key': api_key
    };

    this.ws = new WebSocket(endpoint, { headers });

    this.ws.on('open', () => {
      this.isConnected = true;
      this.onStateChange('connected');
      this.initSession(voice);
    });

    this.ws.on('message', async (raw) => {
      try {
        const event = JSON.parse(raw.toString());
        await this.handleServerEvent(event);
      } catch (err) {
        console.error('解析 Realtime 消息异常:', err);
      }
    });

    this.ws.on('close', () => {
      this.isConnected = false;
      this.onStateChange('disconnected');
    });

    this.ws.on('error', (err) => {
      console.error('Realtime WebSocket 报错:', err.message);
      this.onStateChange('error', err.message);
    });
  }

  initSession(voice) {
    const sessionUpdate = {
      type: 'session.update',
      session: {
        modalities: ['audio', 'text'],
        instructions: getPersonaPrompt(),
        voice: voice,
        input_audio_format: 'pcm16',
        output_audio_format: 'pcm16',
        input_audio_transcription: {
          model: 'whisper-1'
        },
        turn_detection: {
          type: 'server_vad',
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 600
        },
        tools: [
          {
            type: 'function',
            name: 'search_web',
            description: '当用户询问实时事实、新闻、资料或需要网络检索时调用',
            parameters: {
              type: 'object',
              properties: {
                query: { type: 'string', description: '精准搜索关键词' }
              },
              required: ['query']
            }
          },
          {
            type: 'function',
            name: 'switch_persona',
            description: '当用户通过语音明确要求切换角色、风格、人设或特定模式时调用',
            parameters: {
              type: 'object',
              properties: {
                target_persona: {
                  type: 'string',
                  description: '目标人设标识：default(全能助理), weekly_report(周报专家), coding(技术顾问), translator(同声传译), brainstorm(头脑风暴), custom(自定义)'
                },
                custom_instruction: {
                  type: 'string',
                  description: '如果 target_persona 为 custom，用户的具体人设要求'
                }
              },
              required: ['target_persona']
            }
          }
        ]
      }
    };
    this.send(sessionUpdate);
  }

  async handleServerEvent(event) {
    switch (event.type) {
      case 'response.audio.delta':
        if (event.delta) {
          this.onAudioDelta(event.delta);
        }
        break;

      case 'input_audio_buffer.speech_started':
        // 用户开口打断，通知前端停播音频
        this.onSpeechStarted();
        break;

      case 'response.function_call_arguments.done':
        await this.handleFunctionCall(event);
        break;

      case 'error':
        console.error('Realtime 服务端报错:', event.error);
        break;
    }
  }

  async handleFunctionCall(event) {
    const { name, call_id, arguments: argsJson } = event;
    let args = {};
    try {
      args = JSON.parse(argsJson);
    } catch (e) {}

    let output = '';

    if (name === 'search_web') {
      this.onStateChange('searching');
      output = await searchWeb(args.query || '');
      this.onStateChange('connected');
    } else if (name === 'switch_persona') {
      const res = switchPersona(args.target_persona, args.custom_instruction);
      output = res.message;
      // 动态更新当前会话 Instructions
      this.send({
        type: 'session.update',
        session: {
          instructions: getPersonaPrompt()
        }
      });
    }

    // 回传工具输出
    this.send({
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: call_id,
        output: output
      }
    });

    // 触发模型播报回复
    this.send({
      type: 'response.create'
    });
  }

  sendAudioChunk(base64Pcm) {
    if (!this.isConnected || !this.ws) return;
    this.send({
      type: 'input_audio_buffer.append',
      audio: base64Pcm
    });
  }

  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
    this.onStateChange('disconnected');
  }
}

module.exports = {
  RealtimeSession
};
```

- [ ] **Step 2: 验证模块引入无语法错误**

Run: `node -e "require('./src/main/realtime')"`
Expected: 顺利退出且无错误。

- [ ] **Step 3: 提交**

Run:
```bash
git add src/main/realtime.js
git commit -m "feat: 实现 Realtime 通信、事件流转与工具调度"
```

---

### Task 6: Electron 悬浮窗中枢与安全 IPC 桥接

**Files:**
- Create: `src/preload/index.js`
- Create: `src/main/index.js`

- [ ] **Step 1: 编写预加载脚本 `src/preload/index.js`**

```javascript
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  toggleSession: () => ipcRenderer.invoke('session:toggle'),
  sendAudioChunk: (base64) => ipcRenderer.send('audio:chunk', base64),
  onStateChange: (callback) => ipcRenderer.on('state:change', (_event, state) => callback(state)),
  onAudioDelta: (callback) => ipcRenderer.on('audio:delta', (_event, delta) => callback(delta)),
  onStopAudio: (callback) => ipcRenderer.on('audio:stop', () => callback())
});
```

- [ ] **Step 2: 编写主进程入口 `src/main/index.js`**

```javascript
const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('node:path');
const { loadConfig } = require('./config');
const { RealtimeSession } = require('./realtime');

let mainWindow = null;
let realtimeSession = null;

function createWindow() {
  const config = loadConfig();
  const winSettings = config.window_settings || {};
  const width = winSettings.width || 110;
  const height = winSettings.height || 110;

  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

  mainWindow = new BrowserWindow({
    width,
    height,
    x: winSettings.position_x || (screenWidth - width - 40),
    y: winSettings.position_y || (screenHeight - height - 40),
    frame: false,
    transparent: true,
    alwaysOnTop: winSettings.always_on_top ?? true,
    resizable: false,
    skipTaskbar: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  realtimeSession = new RealtimeSession({
    onStateChange: (state, extra) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('state:change', state);
      }
    },
    onAudioDelta: (delta) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('audio:delta', delta);
      }
    },
    onSpeechStarted: () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('audio:stop');
      }
    }
  });
}

ipcMain.handle('session:toggle', () => {
  if (!realtimeSession) return 'disconnected';
  if (realtimeSession.isConnected) {
    realtimeSession.disconnect();
    return 'disconnected';
  } else {
    try {
      realtimeSession.connect();
      return 'connecting';
    } catch (err) {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('state:change', 'error');
      }
      return 'error';
    }
  }
});

ipcMain.on('audio:chunk', (_event, base64) => {
  if (realtimeSession && realtimeSession.isConnected) {
    realtimeSession.sendAudioChunk(base64);
  }
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
```

- [ ] **Step 3: 验证主进程代码语法**

Run: `node -c src/main/index.js && node -c src/preload/index.js`
Expected: 顺利退出且无错误。

- [ ] **Step 4: 提交**

Run:
```bash
git add src/preload/index.js src/main/index.js
git commit -m "feat: 构建悬浮透明窗体与 IPC 安全桥接"
```

---

### Task 7: 极简前端界面与低延迟 Web Audio 引擎

**Files:**
- Create: `src/renderer/index.html`
- Create: `src/renderer/style.css`
- Create: `src/renderer/app.js`

- [ ] **Step 1: 编写单按钮极简 HTML 页面 `src/renderer/index.html`**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Voice Assistant</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <div class="drag-region">
    <div id="orb-button" class="orb state-idle" title="点击开始语音对讲">
      <div class="orb-inner"></div>
      <div class="orb-wave"></div>
      <div class="orb-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/>
          <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
          <line x1="12" y1="19" x2="12" y2="22"/>
        </svg>
      </div>
    </div>
  </div>
  <script src="app.js"></script>
</body>
</html>
```

- [ ] **Step 2: 编写动效样式 `src/renderer/style.css`**

```css
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
  user-select: none;
}

body {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
}

.drag-region {
  -webkit-app-region: drag;
  padding: 10px;
}

.orb {
  -webkit-app-region: no-drag;
  width: 80px;
  height: 80px;
  border-radius: 50%;
  position: relative;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.orb-inner {
  position: absolute;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  filter: blur(4px);
  z-index: 1;
}

.orb-wave {
  position: absolute;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  z-index: 0;
}

.orb-icon {
  position: relative;
  z-index: 2;
  width: 32px;
  height: 32px;
  color: #fff;
  transition: transform 0.3s;
}

/* 待命状态 */
.state-idle .orb-inner {
  background: radial-gradient(circle, #555 0%, #222 100%);
  box-shadow: 0 4px 15px rgba(0,0,0,0.3);
}
.state-idle:hover {
  transform: scale(1.05);
}

/* 连线中 / 聆听中（蓝紫流光呼吸） */
.state-connected .orb-inner {
  background: radial-gradient(circle, #7928ca 0%, #ff0080 100%);
  box-shadow: 0 0 25px rgba(255, 0, 128, 0.6);
  animation: pulse 1.8s infinite ease-in-out;
}
.state-connected .orb-wave {
  border: 2px solid rgba(121, 40, 202, 0.4);
  animation: ripple 2s infinite ease-out;
}

/* 搜索网络中（金色脉冲） */
.state-searching .orb-inner {
  background: radial-gradient(circle, #f59e0b 0%, #d97706 100%);
  box-shadow: 0 0 30px rgba(245, 158, 11, 0.8);
  animation: spin-pulse 1s infinite linear;
}

/* 异常状态（黄色/红光提示配置缺失） */
.state-error .orb-inner {
  background: radial-gradient(circle, #ef4444 0%, #b91c1c 100%);
  box-shadow: 0 0 20px rgba(239, 68, 68, 0.6);
}

@keyframes pulse {
  0%, 100% { transform: scale(1); opacity: 0.9; }
  50% { transform: scale(1.08); opacity: 1; }
}

@keyframes ripple {
  0% { transform: scale(0.9); opacity: 0.8; }
  100% { transform: scale(1.6); opacity: 0; }
}

@keyframes spin-pulse {
  0% { transform: scale(1) rotate(0deg); }
  50% { transform: scale(1.1) rotate(180deg); }
  100% { transform: scale(1) rotate(360deg); }
}
```

- [ ] **Step 3: 编写音频处理与状态绑定 `src/renderer/app.js`**

```javascript
let audioCtx = null;
let mediaStream = null;
let scriptNode = null;
let isRecording = false;

// 播放队列管理
let nextPlayTime = 0;
const activeSources = [];

const orb = document.getElementById('orb-button');

function updateState(state) {
  orb.className = `orb state-${state}`;
  if (state === 'connected') {
    startAudioCapture();
  } else if (state === 'disconnected' || state === 'error') {
    stopAudioCapture();
    stopAllAudioPlayback();
  }
}

window.electronAPI.onStateChange((state) => {
  updateState(state);
});

window.electronAPI.onAudioDelta((base64Delta) => {
  playAudioChunk(base64Delta);
});

window.electronAPI.onStopAudio(() => {
  stopAllAudioPlayback();
});

orb.addEventListener('click', async () => {
  await window.electronAPI.toggleSession();
});

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
        noiseSuppression: true
      }
    });

    const source = audioCtx.createMediaStreamSource(mediaStream);
    // 采用 2048 缓冲区
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
    console.error('麦克风初始化失败:', err);
    updateState('error');
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

function playAudioChunk(base64Pcm) {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
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
```

- [ ] **Step 4: 提交**

Run:
```bash
git add src/renderer/index.html src/renderer/style.css src/renderer/app.js
git commit -m "feat: 构建单按钮 UI 与 24kHz Web Audio 流式采集播放引擎"
```

---

### Task 8: 运行完整自动化测试与免安装打包构建

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 运行所有核心模块单元测试**

Run: `node --test tests/*.test.js`
Expected: 所有测试 PASS。

- [ ] **Step 2: 执行 macOS 独立绿色版本打包**

Run: `npm run build:mac`
Expected: 在 `dist/mac/` 生成独立的 `VoiceAssistant.app`，并在 `dist/` 下生成免安装 zip 归档包。

- [ ] **Step 3: 验证打包产物完整性与目录结构**

Run: `ls -la dist/`
Expected: 包含 `VoiceAssistant-1.0.0-mac.zip` 或 `mac/VoiceAssistant.app`。

- [ ] **Step 4: 提交并生成终态交付文档**

Run:
```bash
git add .
git commit -m "chore: 完成两端构建配置与集成验收"
```

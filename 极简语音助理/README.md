# 极简独立办公任务语音助理

一个独立的桌面端免安装极简办公任务语音助理，支持 macOS 与 Windows。

---

## 核心特性

1. **极致极简界面**：
   * 桌面仅有一个精美的半透明悬浮语音球，可自由拖拽置顶。
   * **单击开启 / 再次单击挂断**：支持端到端实时双向对讲、自然打断（Barge-in）、说完自动回答。
2. **直连 Azure AI Foundry 实时语音大模型**：
   * 采用 24kHz 单声道 PCM 低延迟流式传输，直连你的 Azure Realtime 服务端。
3. **后台语音动态切换人设**：
   * 支持通过自然语音随时切换角色：
     * *“换成周报润色专家”*
     * *“做我的极客技术顾问”*
     * *“切换为同声传译官”*
     * *“现在进入头脑风暴模式”*
     * *“自定义：你现在扮演苏格拉底，用反诘法引导我思考”*
   * 智能体在后台自动调用工具更新 System Prompt 并语音确认。
4. **内置多源网络搜索 MCP**：
   * 遇到实时事实、时效新闻、技术文档检索时，智能体自动调用内置的搜索网关：
     * **Parallel Search**（首选高速事实检索）
     * **Tavily Search**（多角度综合研究检索）
     * **Brave Search**（时政与公开网络交叉验证）
     * **Firecrawl**（深度内容抓取）
   * 自动将检索结果精炼后转为自然口语解答。

---

## 快速使用

### 1. 配置凭据 (`config.json`)
在软件同级目录下打开 `config.json`，填入你的 Azure AI Foundry 实时模型配置：

```json
{
  "azure_realtime": {
    "endpoint": "wss://<YOUR-AZURE-RESOURCE>.openai.azure.com/openai/realtime?api-version=2024-10-01-preview&deployment=gpt-realtime-2.1-datazone",
    "api_key": "YOUR_AZURE_KEY_HERE",
    "voice": "shimmer"
  }
}
```
*(注：本地已为你预填好 Parallel Search、Tavily、Brave、Firecrawl 的凭据)*

### 2. 运行软件

* **macOS 用户**：
  * **直接双击**：双击本目录下的 `启动.command` 即可运行。
  * **或使用打包产物**：解压运行 `dist/mac-arm64/VoiceAssistant.app`。
* **Windows 用户**：
  * **直接双击**：双击本目录下的 `启动.bat` 即可启动。
  * **单文件打包**：运行 `npm run build:win` 可输出单文件绿色版 `VoiceAssistant-Portable.exe`。

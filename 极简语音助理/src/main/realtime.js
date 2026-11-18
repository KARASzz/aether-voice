const WebSocket = require('ws');
const { loadConfig, getConfigPath } = require('./config');
const { getPersonaPrompt, switchPersona } = require('./persona');
const { searchWeb } = require('./search');
const { getFoundryAgentToken, ensureApiKey } = require('./auth');

function buildConnectionDetails(az) {
  const isAgent = az.mode === 'agent' || !!az.agent_name || (az.endpoint && az.endpoint.includes('/agents/'));

  if (isAgent) {
    const resourceName = az.resource_name || 'karas-2-resource';
    const projectName = az.project_name || 'karas-2';
    const agentName = az.agent_name || 'lilith';
    const wsUrl = `wss://${resourceName}.services.ai.azure.com/api/projects/${projectName}/agents/${agentName}/endpoint/protocols/voice`;
    return {
      type: 'agent',
      wsUrl,
      headers: {
        'Foundry-Features': 'VoiceAgents=V1Preview',
        'User-Agent': 'ai-projects/2.7.0'
      }
    };
  }

  let ep = (az.endpoint || '').trim();
  let wsUrl = ep.replace(/^https:\/\//i, 'wss://').replace(/^http:\/\//i, 'ws://');
  if (!wsUrl.includes('/openai/realtime')) {
    const match = ep.match(/https?:\/\/([^\/]+)/i);
    const host = match ? match[1] : ep;
    const resourceName = az.resource_name || host.split('.')[0];
    const deployment = az.deployment || az.model || 'gpt-realtime-2.1-datazone';
    const apiVersion = az.api_version || '2024-10-01-preview';
    wsUrl = `wss://${resourceName}.openai.azure.com/openai/realtime?api-version=${apiVersion}&deployment=${deployment}`;
  }

  return {
    type: 'openai_realtime',
    wsUrl,
    headers: {}
  };
}

class RealtimeSession {
  constructor(options = {}) {
    this.ws = null;
    this.isConnected = false;
    this.connectionType = 'agent';
    this.onStateChange = options.onStateChange || (() => {});
    this.onAudioDelta = options.onAudioDelta || (() => {});
    this.onSpeechStarted = options.onSpeechStarted || (() => {});
  }

  async connect() {
    const config = loadConfig();
    const az = config.azure_realtime || {};
    const conn = buildConnectionDetails(az);
    this.connectionType = conn.type;

    this.onStateChange('connecting', '正在连线智能体...');

    const headers = { ...conn.headers };

    if (conn.type === 'agent') {
      try {
        const token = await getFoundryAgentToken(az);
        headers['Authorization'] = `Bearer ${token}`;
      } catch (err) {
        throw new Error('智能体凭据认证失败: ' + err.message);
      }
    } else {
      let apiKey = az.api_key;
      if (!apiKey || apiKey.startsWith('YOUR_')) {
        try {
          apiKey = await ensureApiKey(config, getConfigPath());
        } catch (err) {
          console.warn('获取 API Key 失败:', err.message);
        }
      }
      if (!apiKey || apiKey.startsWith('YOUR_')) {
        throw new Error('未配置 API Key！请在 config.json 中填入 Azure Key');
      }
      headers['api-key'] = apiKey;
    }

    try {
      this.ws = new WebSocket(conn.wsUrl, { headers });
    } catch (e) {
      this.onStateChange('error', 'Endpoint 地址格式有误: ' + e.message);
      return;
    }

    this.ws.on('open', () => {
      this.isConnected = true;
      this.onStateChange('connected', '语音连线成功，随时可以开口说话');
      if (this.connectionType !== 'agent') {
        this.initSession(az.voice || 'shimmer');
      }
    });

    this.ws.on('message', async (raw) => {
      try {
        const event = JSON.parse(raw.toString());
        await this.handleServerEvent(event);
      } catch (err) {
        console.error('解析 Realtime 消息异常:', err);
      }
    });

    this.ws.on('close', (code, reason) => {
      this.isConnected = false;
      const reasonStr = reason ? reason.toString() : '';
      console.log(`Realtime 连接关闭 code=${code}, reason=${reasonStr}`);
      if (code === 1000 || code === 1005) {
        this.onStateChange('disconnected', '');
      } else {
        this.onStateChange('error', `连接中断 (${code}): ${reasonStr || '请检查 Endpoint 和 Key'}`);
      }
    });

    this.ws.on('error', (err) => {
      console.error('Realtime WebSocket 报错:', err.message);
      this.onStateChange('error', '连接出错: ' + err.message);
    });
  }

  initSession(voice) {
    // 智能适配 Azure 语音对象与 OpenAI 原生语音
    let voicePayload = voice;
    if (typeof voice === 'string') {
      if (voice.includes('Neural') || voice.includes('Multilingual') || voice.startsWith('zh-') || voice.startsWith('en-')) {
        voicePayload = {
          name: voice,
          type: 'azure-standard'
        };
      } else {
        voicePayload = {
          name: voice,
          type: 'openai'
        };
      }
    }

    const sessionUpdate = {
      type: 'session.update',
      session: {
        modalities: ['audio', 'text'],
        instructions: getPersonaPrompt(),
        voice: voicePayload,
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
            description: '当用户询问实时事实、新闻时政、技术文档、最新资料或需要网络检索时调用',
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
            description: '当用户通过语音对你提出任何人设、角色、语气、性格或任务要求（如“换成...角色”、“扮演...”、“变成...”、“做我的...”、“恢复默认”）时调用',
            parameters: {
              type: 'object',
              properties: {
                instruction: {
                  type: 'string',
                  description: '用户要求扮演的角色、性格风格或人设指令详情'
                }
              },
              required: ['instruction']
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
      case 'response.output_audio.delta':
        if (event.delta) {
          this.onAudioDelta(event.delta);
        }
        break;

      case 'response.output_audio_transcript.done':
      case 'response.audio_transcript.done':
        if (event.transcript) {
          console.log(`[莉莉丝]: ${event.transcript}`);
          this.onStateChange('connected', `莉莉丝: ${event.transcript}`);
        }
        break;

      case 'input_audio_buffer.speech_started':
        // 用户开口插话打断
        this.onSpeechStarted();
        this.onStateChange('connected', '正在倾听您说话...');
        break;

      case 'input_audio_buffer.speech_stopped':
        this.onStateChange('connected', '正在思考与检索...');
        break;

      case 'response.function_call_arguments.done':
        await this.handleFunctionCall(event);
        break;

      case 'error':
        console.error('Realtime 服务端报错:', event.error);
        const errMsg = event.error?.message || '服务端异常';
        this.onStateChange('error', errMsg);
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
      this.onStateChange('searching', `正在检索: ${args.query || ''}`);
      output = await searchWeb(args.query || '');
      this.onStateChange('connected', '已检索完毕，正在回答');
    } else if (name === 'switch_persona') {
      const userInstruction = args.instruction || args.custom_instruction || args.target_persona || '';
      const res = switchPersona(userInstruction);
      output = res.message;
      this.onStateChange('connected', `已切换人设: ${res.persona}`);
      this.send({
        type: 'session.update',
        session: {
          instructions: getPersonaPrompt()
        }
      });
    }

    this.send({
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: call_id,
        output: output
      }
    });

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
      try {
        this.ws.close();
      } catch (e) {}
      this.ws = null;
    }
    this.isConnected = false;
    this.onStateChange('disconnected', '');
  }
}

module.exports = {
  RealtimeSession
};

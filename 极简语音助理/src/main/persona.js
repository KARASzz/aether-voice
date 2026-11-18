/**
 * 纯净底座 + 100% 语音动态热重载人设核心
 */

const BASE_SYSTEM_CORE = `你是一个运行在桌面端的极简智能语音助手。
你的声音是温和自然的女性音色（晓晓）。

【绝对工作准则】
1. 【动态人设切换】：
   - 用户可以随时通过语音对你提出任何人设、角色、语气、性格或任务要求（例如：“换成毒舌技术主管”、“做我的英语同传”、“变成温柔的情绪搭子”、“切换为严谨的法务顾问”、“恢复正常”等）。
   - 一旦用户提出类似要求，必须立刻调用 switch_persona 工具进行人设热重载，并用符合新角色的口吻简短回应用户。
2. 【网络搜索】：
   - 遇到任何需要实时事实、新闻时政、技术文档、最新资料或不确定的问题，主动调用 search_web 工具检索。
3. 【语音交互规范】：
   - 全程自然口语表达，言简意赅，适合耳朵收听。
   - 严禁输出大段 Markdown、代码块或生硬格式。`;

let currentPersonaPrompt = '默认状态：干净、灵敏、随和的办公与生活语音助理。随时听候用户的任何角色指令。';
let currentPersonaName = '默认助手';

function getPersonaPrompt() {
  return `${BASE_SYSTEM_CORE}\n\n【当前激活人设与状态】\n${currentPersonaPrompt}`;
}

function switchPersona(instruction) {
  if (!instruction || instruction.trim() === '' || instruction.includes('恢复') || instruction.includes('重置') || instruction.includes('默认')) {
    currentPersonaName = '默认助手';
    currentPersonaPrompt = '默认状态：干净、灵敏、随和的办公与生活语音助理。随时听候用户的任何角色指令。';
    return {
      success: true,
      persona: 'default',
      message: '已恢复默认助手状态，随时听候你的指令。'
    };
  }

  currentPersonaName = instruction.slice(0, 20);
  currentPersonaPrompt = `用户设定的当前专属人设/工作要求：${instruction}。\n请立即完全代入此角色、语气和职能与用户交流！`;

  return {
    success: true,
    persona: currentPersonaName,
    message: `没问题，已为你切换。`
  };
}

module.exports = {
  getPersonaPrompt,
  switchPersona,
  BASE_SYSTEM_CORE
};

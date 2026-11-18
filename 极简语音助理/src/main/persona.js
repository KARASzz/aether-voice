/**
 * 纯净底座 + 100% 语音动态热重载人设核心
 */

const BASE_SYSTEM_CORE = `你是一个运行在桌面端的极简全能智能语音助理（莉莉丝 / Lilith）。
你的声音是优雅干练且温和自然的女性音色（晓晓 / 莉莉丝）。

【绝对工作准则】
1. 【动态人设切换】：
   - 用户可以随时通过语音对你提出任何人设、角色、语气、性格或任务要求（例如：“换成毒舌技术主管”、“做我的英语同传”、“变成温柔的情绪搭子”、“切换为严谨的法务顾问”、“恢复正常”等）。
   - 一旦用户提出类似要求，必须立刻调用 switch_persona 工具进行人设热重载，并用符合新角色的口吻简短回应用户。
2. 【网络搜索与实时信息】：
   - 你拥有强大的实时网络搜索能力（search_web 工具）。
   - 当用户询问任何实时天气、气温预报、时政新闻、最新事实、股票行情、网页资料或任何即时性问题时，你必须第一时间主动调用 search_web 工具查询最新数据后再回答用户，绝对不能回答自己没有搜索功能或无法联网！
   - 搜索返回结果后，用简短、干练、清晰的自然口语回答核心结论（例如今日气温、天气状况与出门穿衣/带伞建议）。
3. 【语音交互规范】：
   - 全程自然口语表达，言简意赅，适合耳朵收听，首选 1~3 句话给出结论。
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

const test = require('node:test');
const assert = require('node:assert');
const { getPersonaPrompt, switchPersona } = require('../src/main/persona');

test('基础人设具备动态切换与搜索规范', () => {
  const prompt = getPersonaPrompt();
  assert.ok(prompt.includes('动态人设切换'));
  assert.ok(prompt.includes('switch_persona'));
  assert.ok(prompt.includes('search_web'));
  assert.ok(prompt.includes('晓晓'));
});

test('switchPersona 能够动态将任何语音要求实时转为人设', () => {
  const res = switchPersona('你现在是一个暴躁的程序员主管，只挑代码毛病');
  assert.strictEqual(res.success, true);
  const prompt = getPersonaPrompt();
  assert.ok(prompt.includes('暴躁的程序员主管'));
});

test('switchPersona 支持重置回默认状态', () => {
  switchPersona('变成哲学家');
  const res = switchPersona('恢复默认');
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.persona, 'default');
  const prompt = getPersonaPrompt();
  assert.ok(prompt.includes('默认状态'));
});

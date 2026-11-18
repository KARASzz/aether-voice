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
  const result = await searchWeb('人工智能最新进展');
  assert.strictEqual(typeof result, 'string');
  assert.ok(result.length > 0);
});

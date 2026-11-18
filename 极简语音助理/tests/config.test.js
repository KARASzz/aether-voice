const test = require('node:test');
const assert = require('node:assert');
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

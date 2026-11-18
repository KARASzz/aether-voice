const fs = require('node:fs');
const path = require('node:path');

function getConfigPath() {
  const candidates = [
    // 1. 同级工作目录
    path.resolve(process.cwd(), 'config.json'),
    // 2. 相对源码根目录
    path.resolve(__dirname, '../../config.json'),
    // 3. 打包 App 外层（针对 macOS 独立 app）
    path.resolve(__dirname, '../../../../config.json')
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  // 默认回退到源码根目录
  return path.resolve(__dirname, '../../config.json');
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

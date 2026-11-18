const https = require('https');
const querystring = require('querystring');
const fs = require('fs');

let cachedToken = null;
let tokenExpiresAt = 0;

/**
 * 获取访问 Foundry 智能体服务所需的 Entra ID Bearer Token
 * Scope: https://ai.azure.com/.default
 */
async function getFoundryAgentToken(az) {
  const now = Date.now();
  if (cachedToken && tokenExpiresAt > now + 60000) {
    return cachedToken;
  }

  const { client_id, client_secret, tenant_id } = az;
  if (!client_id || !client_secret || !tenant_id) {
    throw new Error('未配置服务主体凭据(client_id, client_secret, tenant_id)');
  }

  const postData = querystring.stringify({
    grant_type: 'client_credentials',
    client_id: client_id,
    client_secret: client_secret,
    scope: 'https://ai.azure.com/.default'
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'login.microsoftonline.com',
      path: `/${tenant_id}/oauth2/v2.0/token`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          if (data.access_token) {
            cachedToken = data.access_token;
            tokenExpiresAt = Date.now() + (data.expires_in || 3600) * 1000;
            resolve(cachedToken);
          } else {
            reject(new Error(data.error_description || '获取 Foundry 智能体 Token 失败'));
          }
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

/**
 * 确保或自动获取 ARM Key（备用模式）
 */
async function ensureApiKey(config, cfgPath) {
  const az = config.azure_realtime || {};
  if (az.api_key && !az.api_key.startsWith('YOUR_')) {
    return az.api_key;
  }

  if (az.client_id && az.client_secret && az.tenant_id) {
    const postData = querystring.stringify({
      grant_type: 'client_credentials',
      client_id: az.client_id,
      client_secret: az.client_secret,
      scope: 'https://management.azure.com/.default'
    });

    const token = await new Promise((resolve, reject) => {
      const req = https.request({
        hostname: 'login.microsoftonline.com',
        path: `/${az.tenant_id}/oauth2/v2.0/token`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(postData)
        }
      }, res => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            const data = JSON.parse(body);
            if (data.access_token) resolve(data.access_token);
            else reject(new Error(data.error_description || '获取 ARM Token 失败'));
          } catch(e) { reject(e); }
        });
      });
      req.on('error', reject);
      req.write(postData);
      req.end();
    });

    const subId = '66ff06b4-6559-4c93-ae91-67a369d39fbc';
    const rg = az.resource_group || 'KARAS';
    const accountName = az.resource_name || 'karas-2-resource';
    const keysPath = `/subscriptions/${subId}/resourceGroups/${rg}/providers/Microsoft.CognitiveServices/accounts/${accountName}/listKeys?api-version=2024-10-01`;

    const apiKey = await new Promise((resolve, reject) => {
      const req = https.request({
        hostname: 'management.azure.com',
        path: keysPath,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Length': '0'
        }
      }, res => {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => {
          try {
            const keys = JSON.parse(body);
            if (keys.key1) resolve(keys.key1);
            else reject(new Error('未找到有效 CognitiveServices Key'));
          } catch(e) { reject(e); }
        });
      });
      req.on('error', reject);
      req.end();
    });

    if (apiKey) {
      az.api_key = apiKey;
      if (cfgPath && fs.existsSync(cfgPath)) {
        try {
          fs.writeFileSync(cfgPath, JSON.stringify(config, null, 2), 'utf-8');
        } catch(e) {}
      }
      return apiKey;
    }
  }

  return null;
}

module.exports = { getFoundryAgentToken, ensureApiKey };

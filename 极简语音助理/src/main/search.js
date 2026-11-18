const { getSearchCredentials } = require('./config');

async function searchParallel(query, creds) {
  if (!creds?.parallel_search?.enabled || !creds?.parallel_search?.bearer_token) return null;
  try {
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
  } catch (e) {
    return null;
  }
}

async function searchTavily(query, creds) {
  if (!creds?.tavily?.enabled || !creds?.tavily?.api_key) return null;
  try {
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
  } catch (e) {
    return null;
  }
}

async function searchBrave(query, creds) {
  if (!creds?.brave?.enabled || !creds?.brave?.api_key) return null;
  try {
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
  } catch (e) {
    return null;
  }
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
  return `已尝试网络搜索“${query}”，但检索服务超时或暂无可用结果，请直接结合你已有知识给出解答。`;
}

module.exports = {
  searchWeb,
  formatSearchResult
};

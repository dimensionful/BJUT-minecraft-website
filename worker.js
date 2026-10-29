/**
 * BJUT-MC · Cloudflare Worker
 * Static site + D1-backed polls + Minecraft server status.
 */

const SERVER_INFO = {
  name: 'BJUT-MC 单世界',
  host: 'world.bjutcraft.online',
  port: 21159,
  version: '26.3',
  world: '单世界'
};

const POLLS = {
  version: {
    maxSelections: 2,
    options: [
      { id: 'vanilla-26-3', label: '26.3 原版生存' },
      { id: 'aeronautics-1-21-1', label: '1.21.1 整合包：航空学' },
      { id: 'other-version', label: '其它版本' }
    ]
  },
  playstyle: {
    maxSelections: 2,
    options: [
      { id: 'casual', label: '休闲养老' },
      { id: 'technical', label: '生电' },
      { id: 'minigames', label: '小游戏' },
      { id: 'modpack', label: '整合包' }
    ]
  }
};

const COOKIE_NAME = 'bjutmc_voter';
const MAX_BODY_BYTES = 16 * 1024;
const MAX_CUSTOM_VERSION_LENGTH = 32;

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store, max-age=0',
      'x-content-type-options': 'nosniff',
      ...headers
    }
  });
}

function parseCookies(header) {
  const cookies = {};
  if (!header) return cookies;

  header.split(';').forEach((part) => {
    const separator = part.indexOf('=');
    if (separator === -1) return;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (!name) return;
    try {
      cookies[name] = decodeURIComponent(value);
    } catch (error) {
      cookies[name] = value;
    }
  });
  return cookies;
}

function validVoterId(value) {
  return typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
}

function makeCookie(value, request) {
  const isHttps = new URL(request.url).protocol === 'https:' ||
    String(request.headers.get('x-forwarded-proto') || '').split(',')[0].trim() === 'https';
  return COOKIE_NAME + '=' + encodeURIComponent(value) +
    '; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000' +
    (isHttps ? '; Secure' : '');
}

function ensureVoter(request) {
  const cookies = parseCookies(request.headers.get('cookie'));
  let voterId = cookies[COOKIE_NAME];
  let cookie = '';

  if (!validVoterId(voterId)) {
    voterId = crypto.randomUUID();
    cookie = makeCookie(voterId, request);
  }

  return { voterId, cookie };
}

function normalizeCustomVersion(value) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function customVersionLength(value) {
  return Array.from(value).length;
}

function parseOptions(value) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

async function queryMinecraftServer() {
  const endpoint = 'https://api.mcsrvstat.us/3/' + SERVER_INFO.host + ':' + SERVER_INFO.port;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  const startedAt = performance.now();

  try {
    const response = await fetch(endpoint, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'BJUT-MC-Website/1.0 (+https://www.bjutcraft.online)'
      },
      signal: controller.signal
    });

    if (!response.ok) throw new Error('状态接口返回 ' + response.status);
    const data = await response.json();
    if (!data.online) throw new Error('服务器当前离线');

    const players = data.players || {};
    const protocol = data.protocol && typeof data.protocol === 'object' ? data.protocol : {};
    const motd = Array.isArray(data.motd && data.motd.clean)
      ? data.motd.clean.join(' ').trim()
      : '';
    const sourceUpdatedAt = data.debug && Number.isFinite(data.debug.cachetime)
      ? new Date(data.debug.cachetime * 1000).toISOString()
      : null;

    return {
      online: true,
      latencyMs: Math.round(performance.now() - startedAt),
      version: {
        name: data.version || protocol.name || SERVER_INFO.version,
        protocol: Number.isFinite(protocol.version) ? protocol.version : null
      },
      players: {
        online: Number.isFinite(players.online) ? players.online : 0,
        max: Number.isFinite(players.max) ? players.max : 0
      },
      motd,
      sourceUpdatedAt,
      source: 'mcsrvstat.us'
    };
  } finally {
    clearTimeout(timer);
  }
}
async function handleServerStatus(ctx) {
  const cache = caches.default;
  const cacheKey = new Request('https://status-cache.internal/api/server-status');
  let cached;

  try {
    cached = await cache.match(cacheKey);
  } catch (error) {}

  if (cached) return cached;

  const checkedAt = new Date().toISOString();
  let payload;

  try {
    const result = await queryMinecraftServer();
    payload = {
      server: SERVER_INFO,
      ...result,
      checkedAt
    };
  } catch (error) {
    payload = {
      server: SERVER_INFO,
      online: false,
      checkedAt,
      error: error.message || '无法连接服务器'
    };
  }

  const response = json(payload, 200, {
    'cache-control': 'public, max-age=20, s-maxage=20'
  });

  try {
    ctx.waitUntil(cache.put(cacheKey, response.clone()));
  } catch (error) {}

  return response;
}

function buildStats(pollId, rows, voterId) {
  const definition = POLLS[pollId];
  const allowed = new Set(definition.options.map((option) => option.id));
  const counts = new Map(definition.options.map((option) => [option.id, 0]));
  const customMap = new Map();
  const votes = [];

  for (const row of rows) {
    const options = [...new Set(parseOptions(row.options).filter((id) => allowed.has(id)))];
    if (options.length < 1 || options.length > definition.maxSelections) continue;

    const customVersion = pollId === 'version' && options.includes('other-version')
      ? String(row.custom_version || '').trim()
      : '';

    votes.push({ voterId: row.voter_id, options, customVersion });
    options.forEach((id) => counts.set(id, (counts.get(id) || 0) + 1));

    if (pollId === 'version' && customVersion) {
      const key = customVersion.toLocaleLowerCase('zh-CN');
      const current = customMap.get(key);
      if (current) {
        current.count += 1;
      } else {
        customMap.set(key, { label: customVersion, count: 1 });
      }
    }
  }

  const totalVoters = votes.length;
  const currentVote = votes.find((vote) => vote.voterId === voterId);
  const customVersions = Array.from(customMap.values())
    .map((entry) => ({
      label: entry.label,
      count: entry.count,
      percent: totalVoters > 0 ? Math.round((entry.count / totalVoters) * 1000) / 10 : 0
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'zh-CN'));

  return {
    id: pollId,
    maxSelections: definition.maxSelections,
    totalVoters,
    totalSelections: votes.reduce((sum, vote) => sum + vote.options.length, 0),
    options: definition.options.map((option) => {
      const count = counts.get(option.id) || 0;
      return {
        id: option.id,
        label: option.label,
        count,
        percent: totalVoters > 0 ? Math.round((count / totalVoters) * 1000) / 10 : 0
      };
    }),
    customVersions,
    myVotes: currentVote ? currentVote.options.slice() : [],
    myCustomVersion: currentVote ? currentVote.customVersion : ''
  };
}

async function loadPollStats(env, pollId, voterId) {
  const { results } = await env.DB
    .prepare('SELECT voter_id, options, custom_version FROM votes WHERE poll_id = ?')
    .bind(pollId)
    .all();

  return buildStats(pollId, results || [], voterId);
}

async function readJsonBody(request) {
  const contentType = request.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const error = new Error('请求必须使用 application/json');
    error.statusCode = 415;
    throw error;
  }

  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) {
    const error = new Error('请求体过大');
    error.statusCode = 413;
    throw error;
  }

  try {
    return text ? JSON.parse(text) : {};
  } catch (error) {
    const parseError = new Error('请求体不是合法 JSON');
    parseError.statusCode = 400;
    throw parseError;
  }
}

async function handleVote(request, env, pollId) {
  const definition = POLLS[pollId];
  if (!definition) {
    return json({ error: '这项统计不存在。' }, 404);
  }

  const { voterId, cookie } = ensureVoter(request);
  let body;

  try {
    body = await readJsonBody(request);
  } catch (error) {
    return json({ error: error.message }, error.statusCode || 400);
  }

  if (!Array.isArray(body.options)) {
    return json({ error: '请提交选项列表。' }, 400);
  }

  const allowed = new Set(definition.options.map((option) => option.id));
  const options = [...new Set(body.options.filter((option) => typeof option === 'string' && allowed.has(option)))];

  if (options.length < 1 || options.length > definition.maxSelections) {
    return json({ error: '每题请选择 1 至 ' + definition.maxSelections + ' 项。' }, 400);
  }
  if (options.length !== body.options.length) {
    return json({ error: '选项中有无效项或重复项。' }, 400);
  }

  let customVersion = '';
  if (pollId === 'version') {
    if (body.customVersion !== undefined && typeof body.customVersion !== 'string') {
      return json({ error: '版本名称格式无效。' }, 400);
    }

    customVersion = normalizeCustomVersion(body.customVersion);
    if (customVersionLength(customVersion) > MAX_CUSTOM_VERSION_LENGTH) {
      return json({ error: '版本名称不能超过 ' + MAX_CUSTOM_VERSION_LENGTH + ' 个字符。' }, 400);
    }

    const hasOtherVersion = options.includes('other-version');
    if (hasOtherVersion && !customVersion) {
      return json({ error: '选择“其它版本”后，请填写版本名称。' }, 400);
    }
    if (!hasOtherVersion && customVersion) {
      return json({ error: '填写其它版本名称时，请选择“其它版本”。' }, 400);
    }
  }

  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO votes (poll_id, voter_id, options, custom_version, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(poll_id, voter_id) DO UPDATE SET
       options = excluded.options,
       custom_version = excluded.custom_version,
       updated_at = excluded.updated_at`
  )
    .bind(pollId, voterId, JSON.stringify(options), customVersion || null, now)
    .run();

  const poll = await loadPollStats(env, pollId, voterId);
  const response = json({
    poll,
    updatedAt: now,
    message: '投票已记录'
  });

  if (cookie) response.headers.append('Set-Cookie', cookie);
  return response;
}

async function handleApi(request, env, url, ctx) {
  if (url.pathname === '/api/server-status') {
    if (request.method !== 'GET') return json({ error: 'Method Not Allowed' }, 405);
    return handleServerStatus(ctx);
  }

  if (url.pathname === '/api/health') {
    if (request.method !== 'GET') return json({ error: 'Method Not Allowed' }, 405);

    try {
      await env.DB.prepare('SELECT 1 AS ok').first();
      return json({
        ok: true,
        service: 'bjut-mc-polls',
        database: 'D1',
        time: new Date().toISOString()
      });
    } catch (error) {
      return json({ ok: false, error: '数据库未连接' }, 503);
    }
  }

  if (url.pathname === '/api/polls') {
    if (request.method !== 'GET') return json({ error: 'Method Not Allowed' }, 405);

    const { voterId, cookie } = ensureVoter(request);
    const pollIds = Object.keys(POLLS);
    const entries = await Promise.all(
      pollIds.map(async (pollId) => [pollId, await loadPollStats(env, pollId, voterId)])
    );
    const polls = Object.fromEntries(entries);
    const response = json({
      polls,
      updatedAt: new Date().toISOString()
    });

    if (cookie) response.headers.append('Set-Cookie', cookie);
    return response;
  }

  const voteMatch = url.pathname.match(/^\/api\/polls\/([a-z0-9-]+)\/vote$/);
  if (voteMatch) {
    if (request.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);
    return handleVote(request, env, voteMatch[1]);
  }

  return json({ error: 'API not found' }, 404);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.hostname === 'bjutcraft.online') {
      url.hostname = 'www.bjutcraft.online';
      return Response.redirect(url.toString(), 308);
    }

    if (url.pathname.startsWith('/api/')) {
      try {
        return await handleApi(request, env, url, ctx);
      } catch (error) {
        console.error('[api]', error);
        return json({ error: '服务器内部错误' }, 500);
      }
    }

    return env.ASSETS.fetch(request);
  }
};


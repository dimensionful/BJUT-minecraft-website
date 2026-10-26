#!/usr/bin/env node
'use strict';

/* =========================================================
   BJUT-MC · static site + poll backend
   Node.js >= 18, no external dependencies.
   ========================================================= */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = __dirname;
const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 8787);
const DATA_FILE = process.env.DATA_FILE
  ? path.resolve(process.env.DATA_FILE)
  : path.join(ROOT, 'data', 'votes.json');
const COOKIE_NAME = 'bjutmc_voter';
const MAX_BODY_BYTES = 16 * 1024;
const VOTES_PER_MINUTE = 120;
const MAX_CUSTOM_VERSION_LENGTH = 32;

// Option ids must match the data-poll-option values in index.html.
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

const PUBLIC_FILES = new Set([
  '/index.html',
  '/styles.css',
  '/script.js',
  '/favicon.svg'
]);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
};

/* ----------------------------- state ----------------------------- */

function defaultState() {
  const polls = {};
  Object.keys(POLLS).forEach((pollId) => {
    polls[pollId] = { voters: {} };
  });
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    polls
  };
}

function validVoterId(value) {
  return typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
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

function sanitizeState(raw) {
  const clean = defaultState();
  if (!raw || typeof raw !== 'object' || !raw.polls || typeof raw.polls !== 'object') {
    return clean;
  }

  Object.keys(POLLS).forEach((pollId) => {
    const source = raw.polls[pollId];
    if (!source || typeof source.voters !== 'object' || source.voters === null) return;

    const allowed = new Set(POLLS[pollId].options.map((option) => option.id));
    Object.keys(source.voters).forEach((voterId) => {
      if (!validVoterId(voterId)) return;
      const vote = source.voters[voterId];
      if (!vote || !Array.isArray(vote.options)) return;

      const options = [...new Set(vote.options.filter((id) => allowed.has(id)))];
      if (options.length < 1 || options.length > POLLS[pollId].maxSelections) return;

      let customVersion = '';
      if (pollId === 'version' && options.includes('other-version')) {
        customVersion = normalizeCustomVersion(vote.customVersion);
        if (customVersionLength(customVersion) > MAX_CUSTOM_VERSION_LENGTH) {
          customVersion = Array.from(customVersion).slice(0, MAX_CUSTOM_VERSION_LENGTH).join('');
        }
      }

      const cleanedVote = {
        options,
        updatedAt: typeof vote.updatedAt === 'string' ? vote.updatedAt : new Date().toISOString()
      };
      if (customVersion) cleanedVote.customVersion = customVersion;

      clean.polls[pollId].voters[voterId] = cleanedVote;
    });
  });

  if (typeof raw.updatedAt === 'string') {
    clean.updatedAt = raw.updatedAt;
  }
  return clean;
}

function persistState(nextState) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  const temporary = DATA_FILE + '.tmp';
  fs.writeFileSync(temporary, JSON.stringify(nextState, null, 2) + '\n', 'utf8');
  fs.renameSync(temporary, DATA_FILE);
}

function loadState() {
  try {
    const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    return sanitizeState(raw);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error('[state] 无法读取投票数据，已重新初始化：', error.message);
      try {
        if (fs.existsSync(DATA_FILE)) {
          const backup = DATA_FILE + '.corrupt-' + Date.now();
          fs.renameSync(DATA_FILE, backup);
          console.error('[state] 原文件已备份到', backup);
        }
      } catch (backupError) {
        console.error('[state] 备份损坏文件失败：', backupError.message);
      }
    }

    const fresh = defaultState();
    try {
      persistState(fresh);
    } catch (writeError) {
      console.error('[state] 无法初始化数据文件：', writeError.message);
    }
    return fresh;
  }
}

let state = loadState();

/* ----------------------------- helpers ----------------------------- */

function log(message) {
  console.log('[' + new Date().toISOString() + '] ' + message);
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

function cookieHeader(value, request) {
  const secure = Boolean(request.socket.encrypted) ||
    String(request.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
  return COOKIE_NAME + '=' + encodeURIComponent(value) +
    '; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000' +
    (secure ? '; Secure' : '');
}

function ensureVoter(request, response) {
  const cookies = parseCookies(request.headers.cookie);
  let voterId = cookies[COOKIE_NAME];
  let issued = false;

  if (!validVoterId(voterId)) {
    voterId = crypto.randomUUID();
    response.setHeader('Set-Cookie', cookieHeader(voterId, request));
    issued = true;
  }

  return { voterId, issued };
}

function sendJson(response, statusCode, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store, max-age=0',
    'X-Content-Type-Options': 'nosniff'
  });
  response.end(body);
}

function sendText(response, statusCode, text) {
  response.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  response.end(text);
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    const contentType = String(request.headers['content-type'] || '');
    if (!contentType.includes('application/json')) {
      const error = new Error('请求必须使用 application/json');
      error.statusCode = 415;
      reject(error);
      return;
    }

    let size = 0;
    const chunks = [];

    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        const error = new Error('请求体过大');
        error.statusCode = 413;
        reject(error);
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });

    request.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        const parseError = new Error('请求体不是合法 JSON');
        parseError.statusCode = 400;
        reject(parseError);
      }
    });

    request.on('error', reject);
  });
}

function pollStats(pollId, voterId) {
  const definition = POLLS[pollId];
  const voters = Object.values(state.polls[pollId].voters);
  const counts = new Map(definition.options.map((option) => [option.id, 0]));

  voters.forEach((vote) => {
    vote.options.forEach((optionId) => {
      if (counts.has(optionId)) {
        counts.set(optionId, counts.get(optionId) + 1);
      }
    });
  });

  const totalVoters = voters.length;
  const currentVote = state.polls[pollId].voters[voterId];
  const customMap = new Map();

  if (pollId === 'version') {
    voters.forEach((vote) => {
      if (!vote.options.includes('other-version') || !vote.customVersion) return;
      const key = vote.customVersion.toLocaleLowerCase('zh-CN');
      const entry = customMap.get(key);
      if (entry) {
        entry.count += 1;
      } else {
        customMap.set(key, { label: vote.customVersion, count: 1 });
      }
    });
  }

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
    totalSelections: voters.reduce((sum, vote) => sum + vote.options.length, 0),
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
    myCustomVersion: currentVote && currentVote.customVersion ? currentVote.customVersion : ''
  };
}

function allPolls(voterId) {
  const polls = {};
  Object.keys(POLLS).forEach((pollId) => {
    polls[pollId] = pollStats(pollId, voterId);
  });
  return {
    polls,
    updatedAt: state.updatedAt
  };
}

/* ----------------------------- rate limit ----------------------------- */

const voteBuckets = new Map();

function allowVote(remoteAddress) {
  const key = remoteAddress || 'unknown';
  const now = Date.now();
  const current = voteBuckets.get(key);

  if (!current || now - current.startedAt > 60_000) {
    voteBuckets.set(key, { startedAt: now, count: 1 });
    return true;
  }

  if (current.count >= VOTES_PER_MINUTE) {
    return false;
  }

  current.count += 1;
  return true;
}

/* ----------------------------- static files ----------------------------- */

function resolveStaticPath(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch (error) {
    return null;
  }

  if (decoded === '/' || decoded === '') decoded = '/index.html';
  if (decoded.includes('\0')) return null;

  const fullPath = path.resolve(ROOT, '.' + decoded);
  if (fullPath !== ROOT && !fullPath.startsWith(ROOT + path.sep)) return null;

  const relative = '/' + path.relative(ROOT, fullPath).split(path.sep).join('/');
  if (PUBLIC_FILES.has(relative)) return fullPath;

  if (relative.startsWith('/preview/') && /\.(png|jpe?g|webp)$/i.test(relative)) {
    return fullPath;
  }

  return null;
}

function serveStatic(request, response, pathname) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    sendText(response, 405, 'Method Not Allowed');
    return;
  }

  const filePath = resolveStaticPath(pathname);
  if (!filePath) {
    sendText(response, 404, 'Not Found');
    return;
  }

  let stats;
  try {
    stats = fs.statSync(filePath);
  } catch (error) {
    sendText(response, 404, 'Not Found');
    return;
  }

  if (!stats.isFile()) {
    sendText(response, 404, 'Not Found');
    return;
  }

  const extension = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[extension] || 'application/octet-stream';
  const noCache = extension === '.html' || extension === '.css' || extension === '.js';

  response.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': stats.size,
    'Cache-Control': noCache ? 'no-cache' : 'public, max-age=3600',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'SAMEORIGIN'
  });

  if (request.method === 'HEAD') {
    response.end();
    return;
  }

  fs.createReadStream(filePath)
    .on('error', () => {
      if (!response.headersSent) {
        sendText(response, 500, 'Internal Server Error');
      } else {
        response.destroy();
      }
    })
    .pipe(response);
}

/* ----------------------------- API ----------------------------- */

async function handleApi(request, response, pathname) {
  if (pathname === '/api/health' && request.method === 'GET') {
    sendJson(response, 200, {
      ok: true,
      service: 'bjut-mc-polls',
      time: new Date().toISOString()
    });
    return;
  }

  if (pathname === '/api/polls' && request.method === 'GET') {
    const { voterId } = ensureVoter(request, response);
    sendJson(response, 200, allPolls(voterId));
    return;
  }

  const voteMatch = pathname.match(/^\/api\/polls\/([a-z0-9-]+)\/vote$/);
  if (voteMatch && request.method === 'POST') {
    const pollId = voteMatch[1];
    const definition = POLLS[pollId];

    if (!definition) {
      sendJson(response, 404, { error: '这项统计不存在。' });
      return;
    }

    if (!allowVote(request.socket.remoteAddress)) {
      sendJson(response, 429, { error: '提交过于频繁，请稍后再试。' });
      return;
    }

    const { voterId } = ensureVoter(request, response);
    let body;
    try {
      body = await readJsonBody(request);
    } catch (error) {
      sendJson(response, error.statusCode || 400, { error: error.message });
      return;
    }

    if (!Array.isArray(body.options)) {
      sendJson(response, 400, { error: '请提交选项列表。' });
      return;
    }

    const allowed = new Set(definition.options.map((option) => option.id));
    const options = [...new Set(body.options.filter((option) => typeof option === 'string' && allowed.has(option)))];

    if (options.length < 1 || options.length > definition.maxSelections) {
      sendJson(response, 400, { error: '每题请选择 1 至 ' + definition.maxSelections + ' 项。' });
      return;
    }

    if (options.length !== body.options.length) {
      sendJson(response, 400, { error: '选项中有无效项或重复项。' });
      return;
    }

    let customVersion = '';
    if (pollId === 'version') {
      if (body.customVersion !== undefined && typeof body.customVersion !== 'string') {
        sendJson(response, 400, { error: '版本名称格式无效。' });
        return;
      }

      customVersion = normalizeCustomVersion(body.customVersion);
      if (customVersionLength(customVersion) > MAX_CUSTOM_VERSION_LENGTH) {
        sendJson(response, 400, { error: '版本名称不能超过 ' + MAX_CUSTOM_VERSION_LENGTH + ' 个字符。' });
        return;
      }

      const hasOtherVersion = options.includes('other-version');
      if (hasOtherVersion && !customVersion) {
        sendJson(response, 400, { error: '选择“其它版本”后，请填写版本名称。' });
        return;
      }
      if (!hasOtherVersion && customVersion) {
        sendJson(response, 400, { error: '填写其它版本名称时，请选择“其它版本”。' });
        return;
      }
    }

    const previousVote = state.polls[pollId].voters[voterId];
    const previousUpdatedAt = state.updatedAt;
    const now = new Date().toISOString();
    const nextVote = {
      options,
      updatedAt: now
    };
    if (customVersion) nextVote.customVersion = customVersion;

    state.polls[pollId].voters[voterId] = nextVote;
    state.updatedAt = now;

    try {
      persistState(state);
    } catch (error) {
      if (previousVote) {
        state.polls[pollId].voters[voterId] = previousVote;
      } else {
        delete state.polls[pollId].voters[voterId];
      }
      state.updatedAt = previousUpdatedAt;
      console.error('[state] 写入投票数据失败：', error.message);
      sendJson(response, 500, { error: '统计暂时无法保存，请稍后再试。' });
      return;
    }

    log('vote ' + pollId + ' · ' + voterId.slice(0, 8) + ' · ' + options.join(','));
    sendJson(response, 200, {
      poll: pollStats(pollId, voterId),
      updatedAt: state.updatedAt,
      message: '投票已记录'
    });
    return;
  }

  if (voteMatch) {
    sendJson(response, 405, { error: 'Method Not Allowed' });
    return;
  }

  sendJson(response, 404, { error: 'API not found' });
}

/* ----------------------------- server ----------------------------- */

const server = http.createServer((request, response) => {
  let pathname = '/';
  try {
    const url = new URL(request.url, 'http://' + (request.headers.host || 'localhost'));
    pathname = url.pathname;
  } catch (error) {
    sendText(response, 400, 'Bad Request');
    return;
  }

  if (pathname.startsWith('/api/')) {
    handleApi(request, response, pathname).catch((error) => {
      console.error('[api]', error);
      if (!response.headersSent) {
        sendJson(response, 500, { error: '服务器内部错误' });
      } else {
        response.destroy();
      }
    });
    return;
  }

  serveStatic(request, response, pathname);
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error('端口 ' + PORT + ' 已被占用。请设置 PORT 环境变量后重试。');
  } else {
    console.error('服务器启动失败：', error);
  }
  process.exitCode = 1;
});

server.listen(PORT, HOST, () => {
  console.log('');
  console.log('  BJUT-MC 页面与统计服务已启动');
  console.log('  http://' + HOST + ':' + PORT);
  console.log('  数据文件：' + DATA_FILE);
  console.log('');
});

function shutdown(signal) {
  log('收到 ' + signal + '，正在关闭服务…');
  server.close(() => {
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

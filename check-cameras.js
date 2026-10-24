// Verifica quais câmeras estão ao vivo e grava public/status.json.
//
// Método: para cada câmera, faz a mesma negociação WebRTC (WHEP) do player
// oficial do COR e checa, via getStats(), se chega VÍDEO de verdade
// (pacotes/bytes recebidos > 0). Status HTTP não basta: há câmeras offline
// que "conectam" mas nunca mandam frame.
//
// Fluxo novo do COR (não há mais token/streamUrl):
//   POST {origin}/api/camera/player/session/start/{apiId}/  {}        -> { sessionId }
//   POST {origin}/api/camera/player/whep/{sessionId}/  (SDP offer)    -> SDP answer
//   POST {origin}/api/camera/player/session/stop/      {sessionId}
// A sinalização exige header Origin same-origin (o COR responde 403 sem ele) e
// não libera CORS. Por isso o checker sobe um servidor local que injeta o Origin
// e faz de proxy: a página (servida em 127.0.0.1) fala só com esse proxy, então
// não há CORS, e o vídeo (mídia WebRTC) conecta direto nos servidores do COR.
//
// IMPORTANTE: o COR limita a taxa de criação de sessões (HTTP 429). Com muita
// concorrência, ele passa a rejeitar tudo e as câmeras boas apareceriam como
// offline. Por isso o proxy aplica um LIMITE DE TAXA global no session/start e
// RETENTA os 429/5xx com backoff (respeitando Retry-After). Assim a checagem se
// ajusta sozinha ao limite do servidor.
//
// Identificador: apiId (ex. "000001"). É o único campo presente em TODAS as
// variações da API do COR.
//
// Requer Google Chrome (tem H.264). Em CI: `npx playwright install chrome`.
//
// O COR limita MUITO a criação de sessões: aceita um "burst" (~100 câmeras) e
// depois estrangula (~0.25/s). Então o scan completo das ~7k é LENTO de
// propósito (~2-4h) pra não ser bloqueado. Rode à noite, a cada ~3 dias.
// Em 2+ passes, as câmeras que ficaram em 429 são rechecadas (são minoria).
//
// Env: CONCURRENCY (10), RATE (1.5 = session/start por segundo; abaixe se vir
//      muitos session_429), WAIT_MS (6000), PASSES (4), LIMIT (0=todas),
//      OUT (public/status.json),
//      IDS (apiIds separados por vírgula, p/ rechecar só algumas — não grava OUT)

const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

const COR = 'https://appcor.cor-rio.work';
const API = COR + '/api/cameras/?limit=0';
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '10', 10);
const RATE = parseFloat(process.env.RATE || '1.5'); // session/start por segundo
const WAIT_MS = parseInt(process.env.WAIT_MS || '6000', 10);
const LIMIT = process.env.LIMIT ? parseInt(process.env.LIMIT, 10) : 0;
const IDS = process.env.IDS ? process.env.IDS.split(',').map(s => s.trim()).filter(Boolean) : null;
const OUT = process.env.OUT || path.join(__dirname, 'public', 'status.json');

// Header que faz o COR aceitar a sinalização (same-origin). Sem ele: 403.
const COR_HEADERS = { Origin: COR, Referer: COR + '/' };

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// A API alterna entre a lista completa (com cameraId, ~7k) e uma "lite" (só
// coords, menos câmeras). Buscamos até vir a completa, para checar o máximo.
async function fetchFullList(maxTries = 14) {
  let last = [];
  for (let i = 0; i < maxTries; i++) {
    try {
      const r = await fetch(API, { headers: { ...COR_HEADERS, Accept: 'application/json' } });
      const j = await r.json();
      const a = Array.isArray(j) ? j : (j.cameras || []);
      if (a.length >= last.length) last = a;
      if (a.some(c => c && c.cameraId)) return a; // versão completa
    } catch (e) { /* tenta de novo */ }
    await sleep(800);
  }
  return last; // só veio lite; devolve mesmo assim
}

// ---- Limite de taxa (token bucket) no session/start ------------------------
let tokens = RATE, lastRefill = Date.now();
async function takeToken() {
  while (true) {
    const now = Date.now();
    tokens = Math.min(RATE, tokens + ((now - lastRefill) / 1000) * RATE);
    lastRefill = now;
    if (tokens >= 1) { tokens -= 1; return; }
    await sleep(Math.max(20, Math.ceil(((1 - tokens) / RATE) * 1000)));
  }
}

// ---- Proxy local da sinalização (injeta Origin, limita taxa, retenta) ------
function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', c => { data += c; });
    req.on('end', () => resolve(data));
  });
}

// Faz a chamada ao COR. rateLimit: gasta um token antes (só no session/start).
// retries: nº de retentativas em 429/502/503/504 (throttle/transiente).
async function corFetch(target, contentType, body, { rateLimit = false, retries = 0 } = {}) {
  let attempt = 0;
  while (true) {
    if (rateLimit) await takeToken();
    let r;
    try {
      r = await fetch(target, { method: 'POST', headers: { ...COR_HEADERS, 'Content-Type': contentType }, body });
    } catch (e) {
      if (attempt++ < retries) { await sleep(Math.min(8000, 400 * 2 ** attempt) + Math.random() * 300); continue; }
      throw e;
    }
    const throttled = r.status === 429 || r.status === 502 || r.status === 503 || r.status === 504;
    if (!throttled || attempt++ >= retries) return r;
    let waitMs = Math.min(3000, 300 * 2 ** attempt) + Math.random() * 200;
    const ra = r.headers.get('retry-after');
    if (ra && !isNaN(+ra)) waitMs = Math.max(waitMs, (+ra) * 1000);
    await sleep(waitMs);
  }
}

async function sendResp(r, res) {
  const text = await r.text();
  const headers = {
    'Content-Type': r.headers.get('content-type') || 'text/plain',
    'Access-Control-Allow-Origin': '*'
  };
  res.writeHead(r.status, headers);
  res.end(text);
}

function makeServer() {
  return http.createServer(async (req, res) => {
    const u = req.url || '/';
    try {
      if (req.method === 'OPTIONS') {
        res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
        return res.end();
      }
      if (req.method === 'POST' && u.startsWith('/session/start/')) {
        const apiId = decodeURIComponent(u.slice('/session/start/'.length));
        await readBody(req);
        const r = await corFetch(`${COR}/api/camera/player/session/start/${encodeURIComponent(apiId)}/`, 'application/json', '{}', { rateLimit: true, retries: 2 });
        return sendResp(r, res);
      }
      if (req.method === 'POST' && u.startsWith('/whep/')) {
        const sid = decodeURIComponent(u.slice('/whep/'.length));
        const sdp = await readBody(req);
        const r = await corFetch(`${COR}/api/camera/player/whep/${encodeURIComponent(sid)}/`, 'application/sdp', sdp, { retries: 3 });
        return sendResp(r, res);
      }
      if (req.method === 'POST' && u === '/heartbeat') {
        const body = await readBody(req);
        const r = await corFetch(`${COR}/api/camera/player/session/heartbeat/`, 'application/json', body, {});
        return sendResp(r, res);
      }
      if (req.method === 'POST' && u === '/stop') {
        const body = await readBody(req);
        const r = await corFetch(`${COR}/api/camera/player/session/stop/`, 'application/json', body, {});
        return sendResp(r, res);
      }
    } catch (e) {
      if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      return res.end(JSON.stringify({ error: 'proxy_error' }));
    }
    // página em branco (o checker só precisa de um documento same-origin)
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<!doctype html><title>checker</title>');
  });
}

// ---- Lógica executada dentro da página (tem WebRTC/H.264 via Chrome) --------
// STUN-only, uma sessão por câmera: o WHEP do COR não devolve TURN (header Link
// vazio) e os servidores de mídia são alcançáveis direto desta rede.
function pageHelpers() {
  window.__sleep = (ms) => new Promise(r => setTimeout(r, ms));
  window.__waitIce = (pc, ms) => new Promise((resolve) => {
    if (pc.iceGatheringState === 'complete') return resolve();
    const t = setTimeout(resolve, ms);
    pc.addEventListener('icegatheringstatechange', () => {
      if (pc.iceGatheringState === 'complete') { clearTimeout(t); resolve(); }
    });
  });
  window.__stop = (sessionId) => fetch('/stop', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId })
  }).catch(() => { });

  window.__checkOne = async function (apiId, waitMs) {
    let pc, sessionId;
    try {
      const s = await fetch('/session/start/' + encodeURIComponent(apiId), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
      });
      if (!s.ok) return { online: false, reason: 'session_' + s.status };
      const sd = await s.json().catch(() => ({}));
      sessionId = sd.sessionId;
      if (!sessionId) return { online: false, reason: 'no_session' };

      pc = new RTCPeerConnection({ bundlePolicy: 'max-bundle', iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] });
      pc.addTransceiver('video', { direction: 'recvonly' });
      pc.addTransceiver('audio', { direction: 'recvonly' });
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await window.__waitIce(pc, 2000);

      const w = await fetch('/whep/' + encodeURIComponent(sessionId), {
        method: 'POST', headers: { 'Content-Type': 'application/sdp' },
        body: pc.localDescription.sdp
      });
      if (!w.ok) { try { pc.close(); } catch (e) {} window.__stop(sessionId); return { online: false, reason: 'whep_' + w.status }; }
      await pc.setRemoteDescription({ type: 'answer', sdp: await w.text() });

      let pkts = 0, bytes = 0;
      const t0 = Date.now();
      while (Date.now() - t0 < waitMs) {
        await window.__sleep(400);
        const stats = await pc.getStats();
        stats.forEach(r => {
          if (r.type === 'inbound-rtp' && (r.kind === 'video' || r.mediaType === 'video')) {
            pkts = r.packetsReceived || 0; bytes = r.bytesReceived || 0;
          }
        });
        if (pkts > 0 || bytes > 0) break;
      }
      try { pc.close(); } catch (e) {}
      window.__stop(sessionId);
      return { online: (pkts > 0 || bytes > 0), reason: (pkts > 0 ? 'frames' : 'no_media') };
    } catch (e) {
      if (pc) { try { pc.close(); } catch (_) {} }
      if (sessionId) window.__stop(sessionId);
      return { online: false, reason: 'error' };
    }
  };
}

(async () => {
  console.log('↓ Buscando lista de câmeras...');
  const listRaw = await fetchFullList();
  // Desde 24/10/2026 o COR manda o apiId sem zeros ("1" em vez de "000001") e às
  // vezes repete a câmera nas duas formas: padroniza em 6 dígitos (formato do site).
  const seen = new Set();
  let cameras = listRaw.filter(c => c && c.apiId)
    .map(c => ({ ...c, apiId: String(c.apiId).padStart(6, '0') }))
    .filter(c => !seen.has(c.apiId) && seen.add(c.apiId));
  if (IDS) cameras = IDS.map(id => cameras.find(c => c.apiId === id) || { apiId: id });
  if (LIMIT) cameras = cameras.slice(0, LIMIT);
  if (!cameras.length) throw new Error('API não devolveu câmeras. Tente novamente.');
  console.log(`→ ${cameras.length} câmeras | origem ${COR} | concorrência ${CONCURRENCY} | taxa ${RATE}/s`);

  const server = makeServer();
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const ORIGIN_URL = `http://127.0.0.1:${server.address().port}/`;

  const browser = await chromium.launch({ headless: true, channel: 'chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext();
  await ctx.addInitScript(pageHelpers);

  const pages = [];
  for (let i = 0; i < CONCURRENCY; i++) {
    const p = await ctx.newPage();
    await p.goto(ORIGIN_URL, { waitUntil: 'domcontentloaded' });
    pages.push(p);
  }

  const results = new Array(cameras.length);

  // Um resultado é "provisório" (pode ser throttle/transiente) e merece novo
  // passe; frames/no_media/whep_403/whep_404 são definitivos.
  function needsRetry(reason) {
    if (!reason) return true;
    if (['proxy_error', 'error', 'page_error', 'no_session', 'none'].includes(reason)) return true;
    const m = /^(session|whep)_(\d+)$/.exec(reason);
    if (m) { const code = +m[2]; return code === 429 || code === 408 || (code >= 500 && code <= 599); }
    return false; // frames, no_media, whep_403, whep_404
  }

  // Roda a checagem sobre uma lista de índices, distribuída entre as páginas.
  // earlyAbort: aborta cedo se o COR já estiver throttlando quase tudo (evita
  // gastar horas num scan que não vai dar certo). Só no passe 1 (lista completa).
  let aborted = null;
  async function runPass(indices, earlyAbort) {
    let k = 0, done = 0;
    const started = Date.now();
    async function worker(page) {
      while (true) {
        if (aborted) break;
        const j = k++;
        if (j >= indices.length) break;
        const i = indices[j];
        try {
          results[i] = await page.evaluate(
            ([apiId, w]) => window.__checkOne(apiId, w),
            [cameras[i].apiId, WAIT_MS]
          );
        } catch (e) {
          results[i] = { online: false, reason: 'page_error' };
        }
        done++;
        if (done % 100 === 0 || done === indices.length) {
          const secs = ((Date.now() - started) / 1000).toFixed(0);
          const on = results.filter(r => r && r.online).length;
          console.log(`  ${done}/${indices.length}  (online ${on})  ${secs}s`);
        }
        if (earlyAbort && done === 400) {
          const t429 = indices.slice(0, 400).filter(ix => (results[ix] || {}).reason === 'session_429').length;
          if (t429 > 240) aborted = `COR throttlando forte (${t429}/400 em 429 nas primeiras câmeras)`;
        }
      }
    }
    await Promise.all(pages.map(worker));
  }

  // Passe 1: todas. Passes seguintes: só as que ficaram throttladas (429/5xx),
  // que são minoria — com uma pausa pra "janela" de burst do COR reabrir.
  const MAX_PASSES = parseInt(process.env.PASSES || '4', 10);
  await runPass(cameras.map((_, i) => i), !IDS && !LIMIT);
  if (aborted) {
    await browser.close(); server.close();
    console.error(`\n⚠️  Abortado cedo: ${aborted}. status.json NÃO foi alterado. Tente mais tarde ou com RATE menor.`);
    process.exit(1);
  }
  for (let pass = 2; pass <= MAX_PASSES; pass++) {
    const pending = results.map((r, i) => needsRetry(r && r.reason) ? i : -1).filter(i => i >= 0);
    if (!pending.length) break;
    console.log(`\n↻ Passe ${pass}: rechecando ${pending.length} câmeras throttladas (aguarda 8s)...`);
    await sleep(8000);
    const before = pending.length;
    await runPass(pending);
    const after = results.filter((r, i) => pending.includes(i) && needsRetry(r && r.reason)).length;
    if (after >= before) break; // não melhorou: para de insistir
  }

  await browser.close();
  server.close();

  const online = [], offline = [], reasons = {};
  cameras.forEach((c, i) => {
    const r = results[i] || { online: false, reason: 'none' };
    (r.online ? online : offline).push(c.apiId);
    reasons[r.reason] = (reasons[r.reason] || 0) + 1;
  });
  const tally = Object.entries(reasons).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join('  ');
  console.log(`\nMotivos: ${tally}`);

  // Rede toda throttlada = resultado não confiável; não sobrescreve o status bom.
  const throttled = (reasons['session_429'] || 0) + (reasons['whep_429'] || 0);
  if (!IDS && throttled > cameras.length * 0.2) {
    console.error(`\n⚠️  ${throttled} câmeras ficaram em 429 (limite de taxa). Resultado não confiável — status.json NÃO foi alterado. Rode de novo com RATE menor (ex.: RATE=3).`);
    process.exit(1);
  }

  const out = {
    generatedAt: new Date().toISOString(),
    total: cameras.length,
    onlineCount: online.length,
    offlineCount: offline.length,
    online,    // lista de apiId
    offline    // lista de apiId
  };
  if (IDS) {
    console.log(`\n✅ (modo IDS, não grava) ${online.length} online / ${offline.length} offline`);
    cameras.forEach((c, i) => console.log(`   ${c.apiId}: ${results[i] && results[i].online ? 'ONLINE' : 'offline'} (${results[i] && results[i].reason})`));
  } else {
    fs.writeFileSync(OUT, JSON.stringify(out));
    console.log(`\n✅ ${OUT}: ${online.length} online / ${offline.length} offline (de ${cameras.length})`);
  }
})().catch(e => { console.error('FALHOU:', e); process.exit(1); });

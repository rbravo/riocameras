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
//        (o header Link do WHEP traz os ICE servers/TURN a usar)
//   POST {origin}/api/camera/player/session/heartbeat/ {sessionId}
//   POST {origin}/api/camera/player/session/stop/      {sessionId}
// A sinalização exige header Origin same-origin (o COR responde 403 sem ele) e
// não libera CORS. Por isso o checker sobe um servidor local que injeta o Origin
// e faz de proxy: a página (servida em 127.0.0.1) fala só com esse proxy, então
// não há CORS, e o vídeo (mídia WebRTC) conecta direto nos servidores do COR.
//
// Identificador: apiId (ex. "000001"). É o único campo presente em TODAS as
// variações da API do COR.
//
// Requer Google Chrome (tem H.264). Em CI: `npx playwright install chrome`.
//
// Env: CONCURRENCY (20), WAIT_MS (7000), LIMIT (0=todas), OUT (public/status.json),
//      IDS (apiIds separados por vírgula, p/ rechecar só algumas — não grava OUT)

const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

const COR = 'https://appcor.cor-rio.work';
const API = COR + '/api/cameras/?limit=0';
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '20', 10);
const WAIT_MS = parseInt(process.env.WAIT_MS || '7000', 10);
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
      const r = await fetch(API, { headers: { Accept: 'application/json' } });
      const j = await r.json();
      const a = Array.isArray(j) ? j : (j.cameras || []);
      if (a.length >= last.length) last = a;
      if (a.some(c => c && c.cameraId)) return a; // versão completa
    } catch (e) { /* tenta de novo */ }
    await sleep(800);
  }
  return last; // só veio lite; devolve mesmo assim
}

// ---- Proxy local da sinalização (injeta Origin e devolve com CORS) ----------
function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', c => { data += c; });
    req.on('end', () => resolve(data));
  });
}

async function proxyTo(target, contentType, body, res) {
  try {
    const r = await fetch(target, {
      method: 'POST',
      headers: { ...COR_HEADERS, 'Content-Type': contentType },
      body
    });
    const text = await r.text();
    const headers = {
      'Content-Type': r.headers.get('content-type') || 'text/plain',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Expose-Headers': 'Link'
    };
    const link = r.headers.get('link');
    if (link) headers['Link'] = link;
    res.writeHead(r.status, headers);
    res.end(text);
  } catch (e) {
    res.writeHead(502, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ error: 'proxy_error' }));
  }
}

function makeServer() {
  return http.createServer(async (req, res) => {
    const u = req.url || '/';
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      });
      return res.end();
    }
    if (req.method === 'POST' && u.startsWith('/session/start/')) {
      const apiId = decodeURIComponent(u.slice('/session/start/'.length));
      await readBody(req);
      return proxyTo(`${COR}/api/camera/player/session/start/${encodeURIComponent(apiId)}/`, 'application/json', '{}', res);
    }
    if (req.method === 'POST' && u.startsWith('/whep/')) {
      const sid = decodeURIComponent(u.slice('/whep/'.length));
      const sdp = await readBody(req);
      return proxyTo(`${COR}/api/camera/player/whep/${encodeURIComponent(sid)}/`, 'application/sdp', sdp, res);
    }
    if (req.method === 'POST' && u === '/heartbeat') {
      const body = await readBody(req);
      return proxyTo(`${COR}/api/camera/player/session/heartbeat/`, 'application/json', body, res);
    }
    if (req.method === 'POST' && u === '/stop') {
      const body = await readBody(req);
      return proxyTo(`${COR}/api/camera/player/session/stop/`, 'application/json', body, res);
    }
    // página em branco (o checker só precisa de um documento same-origin)
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<!doctype html><title>checker</title>');
  });
}

// ---- Lógica executada dentro da página (tem WebRTC/H.264 via Chrome) --------
function pageHelpers() {
  window.__sleep = (ms) => new Promise(r => setTimeout(r, ms));
  window.__waitIce = (pc, ms) => new Promise((resolve) => {
    if (pc.iceGatheringState === 'complete') return resolve();
    const t = setTimeout(resolve, ms);
    pc.addEventListener('icegatheringstatechange', () => {
      if (pc.iceGatheringState === 'complete') { clearTimeout(t); resolve(); }
    });
  });
  // ICE servers (TURN) vêm no header Link do WHEP (rel="ice-server").
  window.__parseIce = function (linkHeader) {
    if (!linkHeader) return [];
    const servers = [];
    for (const part of linkHeader.split(/,(?=\s*<)/)) {
      const m = part.match(/<([^>]+)>/);
      if (!m || !/rel\s*=\s*"ice-server"/i.test(part)) continue;
      const s = { urls: m[1] };
      const u = part.match(/username\s*=\s*"([^"]+)"/i);
      const c = part.match(/credential\s*=\s*"([^"]+)"/i);
      if (u) s.username = u[1];
      if (c) s.credential = c[1];
      servers.push(s);
    }
    return servers;
  };
  window.__stop = (sessionId) => fetch('/stop', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId })
  }).catch(() => { });

  window.__checkOne = async function (apiId, waitMs) {
    // iceServers=null na 1ª tentativa (STUN padrão) só para descobrir os TURN
    // pelo header Link; se vierem, reconecta usando-os (como o player oficial).
    async function negotiate(iceServers) {
      let pc, sessionId;
      try {
        const s = await fetch('/session/start/' + encodeURIComponent(apiId), {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
        });
        if (!s.ok) return { online: false, reason: 'session_' + s.status };
        const sd = await s.json().catch(() => ({}));
        sessionId = sd.sessionId;
        if (!sessionId) return { online: false, reason: 'no_session' };

        const defaults = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }];
        pc = new RTCPeerConnection({ bundlePolicy: 'max-bundle', iceServers: (iceServers && iceServers.length) ? iceServers : defaults });
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
        const answer = await w.text();

        if (!iceServers || !iceServers.length) {
          const disc = window.__parseIce(w.headers.get('Link'));
          if (disc.length) { try { pc.close(); } catch (e) {} window.__stop(sessionId); return negotiate(disc); }
        }

        await pc.setRemoteDescription({ type: 'answer', sdp: answer });

        let pkts = 0, bytes = 0;
        const t0 = Date.now();
        while (Date.now() - t0 < waitMs) {
          await window.__sleep(500);
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
    }
    return negotiate(null);
  };
}

(async () => {
  console.log('↓ Buscando lista de câmeras...');
  const listRaw = await fetchFullList();
  let cameras = listRaw.filter(c => c && c.apiId);
  if (IDS) cameras = IDS.map(id => cameras.find(c => c.apiId === id) || { apiId: id });
  if (LIMIT) cameras = cameras.slice(0, LIMIT);
  if (!cameras.length) throw new Error('API não devolveu câmeras. Tente novamente.');
  console.log(`→ ${cameras.length} câmeras | origem ${COR} | concorrência ${CONCURRENCY}`);

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
  let next = 0, done = 0;
  const started = Date.now();
  async function worker(page) {
    while (true) {
      const i = next++;
      if (i >= cameras.length) break;
      try {
        results[i] = await page.evaluate(
          ([apiId, w]) => window.__checkOne(apiId, w),
          [cameras[i].apiId, WAIT_MS]
        );
      } catch (e) {
        results[i] = { online: false, reason: 'page_error' };
      }
      done++;
      if (done % 100 === 0 || done === cameras.length) {
        const secs = ((Date.now() - started) / 1000).toFixed(0);
        const on = results.filter(r => r && r.online).length;
        console.log(`  ${done}/${cameras.length}  (online ${on})  ${secs}s`);
      }
    }
  }
  await Promise.all(pages.map(worker));

  await browser.close();
  server.close();

  const online = [], offline = [];
  cameras.forEach((c, i) => { (results[i] && results[i].online ? online : offline).push(c.apiId); });
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

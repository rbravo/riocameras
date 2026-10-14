// Verifica quais câmeras estão ao vivo e grava public/status.json.
//
// Método: para cada câmera, faz a mesma negociação WebRTC (WHEP) do site e
// checa, via getStats(), se chega VÍDEO de verdade (pacotes/bytes recebidos > 0).
// Status HTTP não basta: há câmeras offline que "conectam" mas nunca mandam frame.
//
// Identificador: apiId (ex. "000001"). É o único campo presente em TODAS as
// variações da API do COR (ela às vezes responde uma versão "lite" sem cameraId).
//
// Requer Google Chrome (tem H.264). Em CI: `npx playwright install chrome`.
//
// Env: CONCURRENCY (20), WAIT_MS (7000), LIMIT (0=todas), OUT (public/status.json)

const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

const API = 'https://appcor.cor-rio.work/api/cameras/?limit=0';
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '20', 10);
const WAIT_MS = parseInt(process.env.WAIT_MS || '7000', 10);
const LIMIT = process.env.LIMIT ? parseInt(process.env.LIMIT, 10) : 0;
const OUT = process.env.OUT || path.join(__dirname, 'public', 'status.json');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// A API alterna entre a lista completa (com streamUrl) e uma "lite" (só coords).
// Buscamos até vir a completa (tem o token e todas as câmeras).
async function fetchFullList(maxTries = 14) {
  let last = [];
  for (let i = 0; i < maxTries; i++) {
    try {
      const r = await fetch(API, { headers: { Accept: 'application/json' } });
      const j = await r.json();
      const a = Array.isArray(j) ? j : (j.cameras || []);
      last = a;
      if (a.some(c => c && c.streamUrl)) return a; // versão completa
    } catch (e) { /* tenta de novo */ }
    await sleep(800);
  }
  return last; // só veio lite; devolve mesmo assim (sem token)
}

function pageHelpers() {
  window.__sleep = (ms) => new Promise(r => setTimeout(r, ms));
  window.__waitIce = (pc, ms) => new Promise((resolve) => {
    if (pc.iceGatheringState === 'complete') return resolve();
    const t = setTimeout(resolve, ms);
    pc.addEventListener('icegatheringstatechange', () => {
      if (pc.iceGatheringState === 'complete') { clearTimeout(t); resolve(); }
    });
  });
  window.__checkOne = async function (apiId, key, origin, waitMs) {
    let pc;
    try {
      const s = await fetch(origin + '/app/session/start', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: apiId, key })
      });
      if (!s.ok) return { online: false, reason: 'session_' + s.status };
      const sd = await s.json().catch(() => ({}));
      const sessionId = sd.sessionId;
      if (!sessionId) return { online: false, reason: 'no_session' };

      pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
      pc.addTransceiver('video', { direction: 'recvonly' });
      pc.addTransceiver('audio', { direction: 'recvonly' });
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await window.__waitIce(pc, 2000);

      const w = await fetch(origin + '/app/whep/' + sessionId, {
        method: 'POST', headers: { 'Content-Type': 'application/sdp' },
        body: pc.localDescription.sdp
      });
      if (!w.ok) { try { pc.close(); } catch (e) {} return { online: false, reason: 'whep_' + w.status }; }
      await pc.setRemoteDescription({ type: 'answer', sdp: await w.text() });

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
      return { online: (pkts > 0 || bytes > 0), reason: (pkts > 0 ? 'frames' : 'no_media') };
    } catch (e) {
      if (pc) { try { pc.close(); } catch (_) {} }
      return { online: false, reason: 'error' };
    }
  };
}

(async () => {
  console.log('↓ Buscando lista completa de câmeras...');
  const listRaw = await fetchFullList();
  let cameras = listRaw.filter(c => c && c.apiId);
  if (LIMIT) cameras = cameras.slice(0, LIMIT);

  const withStream = cameras.find(c => c.streamUrl);
  if (!withStream) throw new Error('API não devolveu a versão completa (sem token). Tente novamente.');
  const streamOrigin = new URL(withStream.streamUrl).origin;
  const key = new URL(withStream.streamUrl).searchParams.get('KEY');
  if (!key) throw new Error('token não encontrado na lista');
  console.log(`→ ${cameras.length} câmeras | origem ${streamOrigin} | concorrência ${CONCURRENCY}`);

  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<!doctype html><title>checker</title>');
  });
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
          ([apiId, k, o, w]) => window.__checkOne(apiId, k, o, w),
          [cameras[i].apiId, key, streamOrigin, WAIT_MS]
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
  fs.writeFileSync(OUT, JSON.stringify(out));
  console.log(`\n✅ ${OUT}: ${online.length} online / ${offline.length} offline (de ${cameras.length})`);
})().catch(e => { console.error('FALHOU:', e); process.exit(1); });

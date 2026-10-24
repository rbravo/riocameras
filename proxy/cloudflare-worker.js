/**
 * Proxy do COR.Rio (Cloudflare Worker): lista de câmeras + sinalização de vídeo.
 *
 * Por quê:
 *  - A API do COR não envia CORS, então o browser não pode falar com ela direto.
 *  - A lista alterna entre a versão COMPLETA (com cameraId, ~7k câmeras) e uma
 *    "lite" (só coords). Este proxy faz retry até vir a completa e adiciona CORS.
 *  - O COR mudou o vídeo: não há mais token/streamUrl. Agora é uma sessão
 *    same-origin (POST .../session/start/{apiId} + WHEP). O browser não pode
 *    chamar isso de outra origem (o COR exige o header Origin e não libera CORS),
 *    então este Worker faz de proxy da SINALIZAÇÃO, injetando o Origin. A mídia
 *    (WebRTC) conecta direto nos servidores do COR via ICE/TURN.
 *
 * Rotas:
 *  - GET  /                      -> lista de câmeras + CORS            (site)
 *  - POST /session/start/{apiId} -> { sessionId }                      (site/checker)
 *  - POST /whep/{sessionId}      -> SDP answer (+ header Link c/ ICE)
 *  - POST /heartbeat  {sessionId}
 *  - POST /stop       {sessionId}
 *
 * Deploy: ver proxy/README.md  (grátis: 100 mil req/dia).
 */

const COR = 'https://appcor.cor-rio.work';
const API = COR + '/api/cameras/';
const PLAYER = COR + '/api/camera/player';
const ALLOW_ORIGIN = '*';     // ou 'https://rbravo.github.io'
const LIST_TTL = 120;         // segundos de cache (borda) da lista
// Header que faz o COR aceitar a sinalização (same-origin). Sem ele: 403.
// Desde 24/10/2026 a LISTA também exige (responde 403 "Acesso não permitido.").
const COR_HEADERS = { Origin: COR, Referer: COR + '/' };

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors() });

    const url = new URL(request.url);
    const p = url.pathname;

    // ---- Sinalização de vídeo (proxy POST) ---------------------------------
    if (request.method === 'POST') {
      if (p.startsWith('/session/start/')) {
        const apiId = decodeURIComponent(p.slice('/session/start/'.length));
        return proxy(`${PLAYER}/session/start/${encodeURIComponent(apiId)}/`, 'application/json', '{}');
      }
      if (p.startsWith('/whep/')) {
        const sid = decodeURIComponent(p.slice('/whep/'.length));
        return proxy(`${PLAYER}/whep/${encodeURIComponent(sid)}/`, 'application/sdp', await request.text());
      }
      if (p === '/heartbeat') return proxy(`${PLAYER}/session/heartbeat/`, 'application/json', await request.text());
      if (p === '/stop') return proxy(`${PLAYER}/session/stop/`, 'application/json', await request.text());
      return new Response('Not Found', { status: 404, headers: cors() });
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', { status: 405, headers: cors() });
    }

    // ---- Lista de câmeras (cacheada) ---------------------------------------
    const cache = caches.default;
    const cacheKey = new Request(url.origin + '/__list', request);
    let resp = await cache.match(cacheKey);
    if (resp) return resp;

    const list = await fetchPreferFull(API + '?limit=0');
    // Lista vazia = a origem falhou (ex.: 403). Não cacheia nem finge sucesso.
    if (!list.length) return json({ error: 'Falha ao buscar câmeras na origem' }, 502, 0);
    resp = json(list, 200, LIST_TTL);
    if (resp.status === 200) ctx.waitUntil(cache.put(cacheKey, resp.clone()));
    return resp;
  }
};

// Encaminha a sinalização ao COR com o header Origin e devolve com CORS.
// Expõe o header Link (ICE servers/TURN) para o browser poder lê-lo.
async function proxy(target, contentType, body) {
  try {
    const r = await fetch(target, {
      method: 'POST',
      headers: { ...COR_HEADERS, 'Content-Type': contentType },
      body
    });
    const text = await r.text();
    const h = cors();
    h.set('Content-Type', r.headers.get('content-type') || 'text/plain');
    const link = r.headers.get('link');
    if (link) h.set('Link', link);
    return new Response(text, { status: r.status, headers: h });
  } catch (e) {
    const h = cors();
    h.set('Content-Type', 'application/json; charset=utf-8');
    return new Response(JSON.stringify({ error: 'proxy_error', detail: String(e) }), { status: 502, headers: h });
  }
}

async function fetchPreferFull(url, tries = 14) {
  let last = [];
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { ...COR_HEADERS, Accept: 'application/json' }, cf: { cacheTtl: 0 } });
      if (r.ok) {
        const j = await r.json();
        const a = Array.isArray(j) ? j : (j.cameras || []);
        if (a.length >= last.length) last = a;
        if (a.some(c => c && c.cameraId)) return a; // versão completa
      }
    } catch (e) { /* tenta de novo */ }
    await new Promise(res => setTimeout(res, 500));
  }
  return last;
}

function cors() {
  const h = new Headers();
  h.set('Access-Control-Allow-Origin', ALLOW_ORIGIN);
  h.set('Access-Control-Allow-Methods', 'GET,HEAD,POST,OPTIONS');
  h.set('Access-Control-Allow-Headers', 'Content-Type');
  h.set('Access-Control-Expose-Headers', 'Link');
  h.set('Access-Control-Max-Age', '86400');
  return h;
}

function json(obj, status, ttl) {
  const h = cors();
  h.set('Content-Type', 'application/json; charset=utf-8');
  h.set('Cache-Control', `public, max-age=${ttl}`);
  return new Response(JSON.stringify(obj), { status, headers: h });
}

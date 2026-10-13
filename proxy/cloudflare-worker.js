/**
 * Proxy da lista de câmeras do COR.Rio (Cloudflare Worker).
 *
 * Por quê:
 *  - A API do COR não envia CORS, então o browser não pode buscá-la direto.
 *  - A API alterna entre a lista COMPLETA (com streamUrl/token) e uma versão
 *    "lite" (só coords). Este proxy faz retry até vir a completa e adiciona CORS.
 *
 * Rotas:
 *  - GET /        -> lista completa de câmeras + CORS   (usada pelo site)
 *  - GET /token   -> só o token global { key, exp } + CORS
 *
 * Deploy: ver proxy/README.md  (grátis: 100 mil req/dia).
 */

const API = 'https://appcor.cor-rio.work/api/cameras/';
const ALLOW_ORIGIN = '*';     // ou 'https://rbravo.github.io'
const LIST_TTL = 120;         // segundos de cache (borda) da lista
const TOKEN_TTL = 300;        // segundos de cache do token

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors() });
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', { status: 405, headers: cors() });
    }

    const url = new URL(request.url);
    const isToken = url.pathname.endsWith('/token');
    const cache = caches.default;
    const cacheKey = new Request(url.origin + (isToken ? '/__token' : '/__list'), request);

    let resp = await cache.match(cacheKey);
    if (resp) return resp;

    const list = await fetchPreferFull(isToken ? API + '?limit=1' : API + '?limit=0');

    if (isToken) {
      const withStream = list.find(c => c && c.streamUrl);
      const key = withStream ? new URL(withStream.streamUrl).searchParams.get('KEY') : null;
      let exp = null;
      if (key) { try { exp = JSON.parse(atob(key.split('.')[1])).exp; } catch (_) {} }
      resp = json({ key, exp }, key ? 200 : 502, TOKEN_TTL);
    } else {
      resp = json(list, 200, LIST_TTL);
    }

    if (resp.status === 200) ctx.waitUntil(cache.put(cacheKey, resp.clone()));
    return resp;
  }
};

async function fetchPreferFull(url, tries = 6) {
  let last = [];
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { Accept: 'application/json' }, cf: { cacheTtl: 0 } });
      if (r.ok) {
        const j = await r.json();
        const a = Array.isArray(j) ? j : (j.cameras || []);
        last = a;
        if (a.some(c => c && c.streamUrl)) return a;
      }
    } catch (e) { /* tenta de novo */ }
    await new Promise(res => setTimeout(res, 500));
  }
  return last;
}

function cors() {
  const h = new Headers();
  h.set('Access-Control-Allow-Origin', ALLOW_ORIGIN);
  h.set('Access-Control-Allow-Methods', 'GET,HEAD,OPTIONS');
  h.set('Access-Control-Allow-Headers', 'Content-Type');
  h.set('Access-Control-Max-Age', '86400');
  return h;
}

function json(obj, status, ttl) {
  const h = cors();
  h.set('Content-Type', 'application/json; charset=utf-8');
  h.set('Cache-Control', `public, max-age=${ttl}`);
  return new Response(JSON.stringify(obj), { status, headers: h });
}

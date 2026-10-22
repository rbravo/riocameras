const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

// Origem da API oficial do COR.Rio
const COR = 'https://appcor.cor-rio.work';
const COR_API = COR + '/api/cameras/';
const PLAYER = COR + '/api/camera/player';
// Header que faz o COR aceitar a sinalização (same-origin). Sem ele: 403.
const COR_HEADERS = { Origin: COR, Referer: COR + '/' };

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// A API do COR alterna entre a lista completa (com cameraId, ~7k) e uma versão
// "lite" (só coords). Buscamos até vir a completa.
async function fetchPreferFull(url, tries = 14) {
    let last = [];
    for (let i = 0; i < tries; i++) {
        try {
            const r = await fetch(url, { headers: { Accept: 'application/json' } });
            if (r.ok) {
                const j = await r.json();
                const a = Array.isArray(j) ? j : (j.cameras || []);
                if (a.length >= last.length) last = a;
                if (a.some(c => c && c.cameraId)) return a;
            }
        } catch (e) { /* tenta de novo */ }
        await sleep(300);
    }
    return last; // só veio lite
}

// Cache em memória (cachear alguns minutos alivia a origem).
const cache = {};
async function cachedFull(url, ttlMs) {
    const hit = cache[url];
    if (hit && Date.now() - hit.at < ttlMs) return hit.data;
    const data = await fetchPreferFull(url);
    if (data.some(c => c && c.cameraId) || !hit) cache[url] = { at: Date.now(), data };
    return (cache[url] || { data }).data;
}

function cors(res) {
    res.set('Access-Control-Allow-Origin', '*');
}

// Encaminha a sinalização de vídeo ao COR com o header Origin e devolve com CORS.
// Expõe o header Link (ICE servers/TURN) para o browser poder lê-lo.
async function proxySignal(target, contentType, body, res) {
    try {
        const r = await fetch(target, {
            method: 'POST',
            headers: { ...COR_HEADERS, 'Content-Type': contentType },
            body
        });
        const text = await r.text();
        cors(res);
        res.set('Access-Control-Expose-Headers', 'Link');
        res.set('Content-Type', r.headers.get('content-type') || 'text/plain');
        const link = r.headers.get('link');
        if (link) res.set('Link', link);
        res.status(r.status).send(text);
    } catch (e) {
        cors(res);
        res.status(502).json({ error: 'proxy_error', detail: String(e) });
    }
}

// Corpo cru para as rotas de sinalização (SDP é text/plain-ish; JSON idem).
const rawBody = express.text({ type: () => true, limit: '2mb' });

// Servir arquivos estáticos da pasta public
app.use(express.static('public'));

// Proxy da LISTA (adiciona CORS). Em dev, o site aponta CAMERAS_LIST aqui.
app.get('/api/cameras-live', async (req, res) => {
    try {
        const data = await cachedFull(COR_API + '?limit=0', 120000);
        cors(res);
        res.set('Cache-Control', 'public, max-age=120');
        res.json(data);
    } catch (e) {
        res.status(502).json({ error: 'Falha ao buscar câmeras na origem', detail: String(e) });
    }
});

// ---- Sinalização de vídeo (mesmas rotas do Cloudflare Worker) --------------
app.options(['/session/start/:apiId', '/whep/:sessionId', '/heartbeat', '/stop'], (req, res) => {
    cors(res);
    res.set('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    res.status(204).end();
});
app.post('/session/start/:apiId', rawBody, (req, res) =>
    proxySignal(`${PLAYER}/session/start/${encodeURIComponent(req.params.apiId)}/`, 'application/json', '{}', res));
app.post('/whep/:sessionId', rawBody, (req, res) =>
    proxySignal(`${PLAYER}/whep/${encodeURIComponent(req.params.sessionId)}/`, 'application/sdp', req.body || '', res));
app.post('/heartbeat', rawBody, (req, res) =>
    proxySignal(`${PLAYER}/session/heartbeat/`, 'application/json', req.body || '{}', res));
app.post('/stop', rawBody, (req, res) =>
    proxySignal(`${PLAYER}/session/stop/`, 'application/json', req.body || '{}', res));

// Rota legada (arquivo local antigo do feed cocr; não é mais usada pelo site)
app.get('/api/cameras', (req, res) => {
    try {
        const data = fs.readFileSync('camera_api_json.json', 'utf8');
        res.json(JSON.parse(data));
    } catch (error) {
        res.status(500).json({ error: 'Erro ao carregar dados das câmeras' });
    }
});

// Rota para obter os dados dos bairros
app.get('/api/bairros', (req, res) => {
    try {
        const data = fs.readFileSync('bairros-rj.json', 'utf8');
        res.json(JSON.parse(data));
    } catch (error) {
        res.status(500).json({ error: 'Erro ao carregar dados dos bairros' });
    }
});

// Rota principal
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
    console.log(`  Lista (proxy):  http://localhost:${PORT}/api/cameras-live`);
    console.log(`  Sinalização:    POST /session/start/:apiId, /whep/:sessionId, /heartbeat, /stop`);
});

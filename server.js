const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

// Origem da API oficial do COR.Rio
const COR_API = 'https://appcor.cor-rio.work/api/cameras/';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// A API do COR alterna entre a lista completa (com streamUrl/token) e uma
// versão "lite" (só coords). Buscamos até vir a completa.
async function fetchPreferFull(url, tries = 14) {
    let last = [];
    for (let i = 0; i < tries; i++) {
        try {
            const r = await fetch(url, { headers: { Accept: 'application/json' } });
            if (r.ok) {
                const j = await r.json();
                const a = Array.isArray(j) ? j : (j.cameras || []);
                last = a;
                if (a.some(c => c && c.streamUrl)) return a;
            }
        } catch (e) { /* tenta de novo */ }
        await sleep(300);
    }
    return last; // só veio lite
}

// Cache em memória (tokens valem ~10h; cachear alguns minutos alivia a origem).
const cache = {};
async function cachedFull(url, ttlMs) {
    const hit = cache[url];
    if (hit && Date.now() - hit.at < ttlMs) return hit.data;
    const data = await fetchPreferFull(url);
    if (data.some(c => c && c.streamUrl) || !hit) cache[url] = { at: Date.now(), data };
    return (cache[url] || { data }).data;
}

function cors(res) {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Cache-Control', 'public, max-age=120');
}

// Servir arquivos estáticos da pasta public
app.use(express.static('public'));

// Proxy da LISTA completa (adiciona CORS). Use isto em dev apontando
// CAMERAS_API para http://localhost:3000/api/cameras-live
app.get('/api/cameras-live', async (req, res) => {
    try {
        const data = await cachedFull(COR_API + '?limit=0', 120000);
        cors(res);
        res.json(data);
    } catch (e) {
        res.status(502).json({ error: 'Falha ao buscar câmeras na origem', detail: String(e) });
    }
});

// Proxy SÓ do TOKEN (JWT global, vale ~10h). Tiramos da mesma lista completa
// (?limit=0) — o ?limit=1 passou a vir sempre "lite", sem token.
app.get('/api/token', async (req, res) => {
    try {
        const data = await cachedFull(COR_API + '?limit=0', 120000);
        const withStream = data.find(c => c && c.streamUrl);
        const key = withStream ? new URL(withStream.streamUrl).searchParams.get('KEY') : null;
        if (!key) throw new Error('token não encontrado (API só devolveu lista lite)');
        let exp = null;
        try { exp = JSON.parse(Buffer.from(key.split('.')[1], 'base64').toString()).exp; } catch (_) {}
        cors(res);
        res.json({ key, exp });
    } catch (e) {
        res.status(502).json({ error: 'Falha ao obter token', detail: String(e) });
    }
});

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
    console.log(`  Lista (proxy): http://localhost:${PORT}/api/cameras-live`);
    console.log(`  Token (proxy): http://localhost:${PORT}/api/token`);
});

// Atualiza a lista ESTÁTICA de câmeras (public/cameras.json) a partir da API
// oficial do COR.Rio. Mantém só os campos estáveis (sem tokens, que expiram).
//
// Uso:  npm run update-cameras
// Depois: npm run build  (e publique). As coordenadas mudam pouco, então rode
// isto só de vez em quando; o TOKEN é buscado ao vivo pelo site (não entra aqui).

const fs = require('fs');
const path = require('path');

const COR = 'https://appcor.cor-rio.work';
const API = COR + '/api/cameras/?limit=0';
const OUT = path.join(__dirname, 'public', 'cameras.json');
// Sem o Origin/Referer do próprio COR a API responde 403 (desde 24/10/2026).
const COR_HEADERS = { Origin: COR, Referer: COR + '/' };

// A API alterna entre a lista completa e uma "lite" (menos câmeras).
// Buscamos até vir a completa, para não gravar uma lista parcial.
async function fetchFullList(tries = 14) {
    let last = [];
    for (let i = 0; i < tries; i++) {
        try {
            const r = await fetch(API, { headers: { ...COR_HEADERS, Accept: 'application/json' } });
            if (r.ok) {
                const j = await r.json();
                const a = Array.isArray(j) ? j : (j.cameras || []);
                last = a;
                if (a.some(c => c && c.cameraId)) return a; // versão completa
            }
        } catch (e) { /* tenta de novo */ }
        await new Promise(res => setTimeout(res, 300));
    }
    return last;
}

(async () => {
    console.log('↓ Buscando lista em', API);
    const arr = await fetchFullList();

    // Mantém apenas o que é estável. O apiId é o CODE usado no streaming.
    // Desde 24/10/2026 ele vem sem zeros ("1" em vez de "000001") e às vezes
    // repetido nas duas formas: padroniza em 6 dígitos e descarta as repetidas.
    const seen = new Set();
    const out = arr
        .filter(c => c && c.apiId)
        .map(c => ({
            cameraId: c.cameraId,
            apiId: String(c.apiId).padStart(6, '0'),
            nome: c.nome || '',
            lat: c.lat,
            lon: c.lon
        }))
        .filter(c => !seen.has(c.apiId) && seen.add(c.apiId));

    fs.writeFileSync(OUT, JSON.stringify(out));
    const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
    console.log(`✅ ${out.length} câmeras gravadas em public/cameras.json (${kb} KB)`);
    console.log('   Agora rode: npm run build');
})().catch(e => { console.error('FALHOU:', e.message); process.exit(1); });

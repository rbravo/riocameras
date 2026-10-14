// Atualiza a lista ESTÁTICA de câmeras (public/cameras.json) a partir da API
// oficial do COR.Rio. Mantém só os campos estáveis (sem tokens, que expiram).
//
// Uso:  npm run update-cameras
// Depois: npm run build  (e publique). As coordenadas mudam pouco, então rode
// isto só de vez em quando; o TOKEN é buscado ao vivo pelo site (não entra aqui).

const fs = require('fs');
const path = require('path');

const API = 'https://appcor.cor-rio.work/api/cameras/?limit=0';
const OUT = path.join(__dirname, 'public', 'cameras.json');

// A API alterna entre a lista completa e uma "lite" (menos câmeras).
// Buscamos até vir a completa, para não gravar uma lista parcial.
async function fetchFullList(tries = 14) {
    let last = [];
    for (let i = 0; i < tries; i++) {
        try {
            const r = await fetch(API, { headers: { Accept: 'application/json' } });
            if (r.ok) {
                const j = await r.json();
                const a = Array.isArray(j) ? j : (j.cameras || []);
                last = a;
                if (a.some(c => c && c.streamUrl)) return a; // versão completa
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
    const out = arr
        .filter(c => c && c.apiId)
        .map(c => ({
            cameraId: c.cameraId,
            apiId: c.apiId,
            nome: c.nome || '',
            lat: c.lat,
            lon: c.lon
        }));

    fs.writeFileSync(OUT, JSON.stringify(out));
    const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
    console.log(`✅ ${out.length} câmeras gravadas em public/cameras.json (${kb} KB)`);
    console.log('   Agora rode: npm run build');
})().catch(e => { console.error('FALHOU:', e.message); process.exit(1); });

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

(async () => {
    console.log('↓ Buscando lista em', API);
    const resp = await fetch(API, { headers: { Accept: 'application/json' } });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const list = await resp.json();
    const arr = Array.isArray(list) ? list : (list.cameras || []);

    // Mantém apenas o que é estável. O apiId é o CODE usado no streaming.
    const out = arr
        .filter(c => c && c.cameraId != null && c.apiId)
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

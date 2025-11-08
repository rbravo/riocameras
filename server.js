const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

// Servir arquivos estáticos da pasta public
app.use(express.static('public'));

// Rota para obter os dados das câmeras
app.get('/api/cameras', (req, res) => {
    try {
        const data = fs.readFileSync('camera_api_json.json', 'utf8');
        const cameras = JSON.parse(data);
        res.json(cameras);
    } catch (error) {
        res.status(500).json({ error: 'Erro ao carregar dados das câmeras' });
    }
});

// Rota principal
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
});

# Rio de Janeiro - Mapa de Câmeras 🎥

Visualizador interativo das câmeras de monitoramento do Rio de Janeiro em mapa.

![Preview](https://img.shields.io/badge/status-online-success)
![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)

## 🌟 Demo

🔗 **[Ver Demo Online](https://rbravo.github.io/riocameras/)**

## ✨ Funcionalidades

- 🗺️ Mapa interativo com todas as câmeras do Rio de Janeiro
- 📍 Marcadores customizados para cada câmera
- 🎥 Visualização da câmera em popup ao clicar
- 🟢 Indicação de status: verde = funcionando, cinza = fora do ar (verificado a cada ~3 dias)
- 🆓 100% gratuito e open source

## 🚀 Como usar

### Versão de desenvolvimento (com Node.js)

```bash
# Instalar dependências
npm install

# Iniciar servidor local
npm start
```

Acesse: http://localhost:3000

### Build para produção

```bash
# Gerar versão estática
npm run build
```

Os arquivos prontos para deploy estarão na pasta `build/`

## 📦 Deploy

### GitHub Pages (Automático)

```bash
# Deploy automático via script
npm run deploy
```

Ou configure GitHub Actions (arquivo já incluído em `.github/workflows/deploy.yml`)

## 🛠️ Tecnologias

- **Node.js + Express** - Servidor de desenvolvimento
- **Leaflet** - Biblioteca de mapas (open source)
- **OpenStreetMap** - Tiles do mapa (gratuito)
- **WebRTC** - Reprodução do vídeo das câmeras no navegador
- **Vanilla JS** - Sem frameworks pesados

## 📁 Estrutura

```
riocameras/
├── public/              # Arquivos da versão de desenvolvimento
│   └── index.html
├── build/               # Arquivos da versão de produção (gerados)
│   ├── index.html
│   ├── bairros-data.js
│   └── README.md
├── proxy/               # Proxy da lista de câmeras (Cloudflare Worker)
│   ├── cloudflare-worker.js
│   └── wrangler.toml
├── .github/workflows/
│   ├── deploy.yml          # Build + deploy no GitHub Pages (a cada push)
│   └── check-cameras.yml   # Checa status das câmeras a cada ~3 dias
├── server.js            # Servidor Express
├── build-script.js      # Script de build
├── check-cameras.js     # Verifica quais câmeras estão no ar -> public/status.json
├── deploy-github.js     # Script de deploy
└── bairros-rj.json      # Coordenadas dos bairros (para centralizar o mapa)
```

## 🟢 Status das câmeras

Um job agendado ([`.github/workflows/check-cameras.yml`](.github/workflows/check-cameras.yml))
roda a cada ~3 dias, verifica quais câmeras estão transmitindo e grava
`public/status.json`. O site lê esse arquivo e colore os marcadores
(verde = funcionando, cinza = fora do ar, azul = ainda não verificada).

Dá para rodar manualmente na aba **Actions** do GitHub (botão *Run workflow*)
ou localmente com `npm run check-cameras` (precisa de Google Chrome instalado).

## ⚙️ Configuração do proxy de câmeras

O mapa carrega a lista de câmeras através de um pequeno proxy
(Cloudflare Worker, grátis — pasta [`proxy/`](proxy/)).

- **Em desenvolvimento** não precisa configurar nada: o `npm start` já sobe o
  proxy junto (o site usa `/api/cameras-live` do próprio `server.js`).
- **Em produção** (GitHub Pages), publique o proxy e informe a URL dele no topo
  do `<script>` em [`public/index.html`](public/index.html):

  ```js
  const WORKER_BASE = 'https://SEU-WORKER.workers.dev';
  ```

Deploy do proxy (detalhes em [`proxy/README.md`](proxy/README.md)):

```bash
npm i -g wrangler
wrangler login
cd proxy && wrangler deploy      # imprime a URL https://...workers.dev
```

Depois, basta `npm run build` e `npm run deploy`.

## 📝 Scripts disponíveis

```bash
npm start            # Servidor de desenvolvimento em http://localhost:3000
npm run build        # Gera a versão estática em build/
npm run deploy       # Publica no GitHub Pages
npm run check-cameras # Verifica o status das câmeras -> public/status.json
```

## 🤝 Contribuindo

Contribuições são bem-vindas! Sinta-se à vontade para:

1. Fazer fork do projeto
2. Criar uma branch (`git checkout -b feature/nova-funcionalidade`)
3. Commit suas mudanças (`git commit -m 'Adiciona nova funcionalidade'`)
4. Push para a branch (`git push origin feature/nova-funcionalidade`)
5. Abrir um Pull Request

## 📄 Licença

MIT License - sinta-se livre para usar este projeto como quiser!

## 👤 Autor

Feito com ❤️ para a cidade do Rio de Janeiro

---

⭐ Se este projeto foi útil, considere dar uma estrela!

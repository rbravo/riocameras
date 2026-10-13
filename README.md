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
│   └── deploy.yml       # Build + deploy no GitHub Pages (a cada push)
├── server.js            # Servidor Express
├── build-script.js      # Script de build
├── check-cameras.js     # Verifica quais câmeras estão no ar -> public/status.json
├── check-and-push.cmd   # Roda o check + commit + push (para o Agendador do Windows)
├── deploy-github.js     # Script de deploy
└── bairros-rj.json      # Coordenadas dos bairros (para centralizar o mapa)
```

## 🟢 Status das câmeras

`check-cameras.js` faz a negociação WebRTC real de cada câmera e grava em
`public/status.json` quais estão transmitindo. Ao dar push, o `deploy.yml`
republica o site, que colore os marcadores (verde = funcionando,
cinza = fora do ar, azul = ainda não verificada).

> ⚠️ **Precisa rodar de uma rede brasileira.** Os servidores de vídeo do COR
> não entregam o stream para IPs de datacenter / fora do Brasil — por isso
> **não** funciona em runner do GitHub Actions (acusaria tudo como offline).

### Agendar a cada ~3 dias (Windows)

Use o `check-and-push.cmd` (roda o check, commita e dá push):

1. **Agendador de Tarefas** → *Criar Tarefa Básica*.
2. Disparador: **Diariamente**, com *Repetir a cada 3 dias*, num horário em que o PC costuma estar ligado.
3. Ação: *Iniciar um programa* → caminho completo do `check-and-push.cmd`; em *Iniciar em*, a pasta do projeto.
4. Em *Propriedades* da tarefa, deixe **"Executar somente quando o usuário estiver conectado"** (para a janela aparecer).
5. Teste com o botão **Executar** (leva ~40–60 min).

O `check-and-push.cmd` já commita e dá push sozinho. No fim, **a janela fica
aberta** mostrando o resultado (publicado / sem mudanças / push falhou) — assim,
se rodar de madrugada, você vê de manhã se precisa fazer algo. Normalmente **não
precisa**: só se aparecer que o push falhou, aí você roda `git push`.

Pré-requisitos: `npm install` (instala o Playwright), **Google Chrome** instalado
e credencial do git salva (para o `git push` rodar sem pedir senha).

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

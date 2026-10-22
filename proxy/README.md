# Proxy de câmeras (Cloudflare Worker)

Proxy que serve, para o site em produção:
- a **lista** de câmeras (`GET /`), e
- a **sinalização de vídeo** (`POST /session/start/{apiId}`, `/whep/{sessionId}`,
  `/heartbeat`, `/stop`).

O COR removeu o token embutido e passou a exigir uma sessão **same-origin** para o
vídeo (responde 403 sem o header `Origin`, e não libera CORS). O Worker injeta esse
`Origin` e devolve com CORS, expondo o header `Link` do WHEP (ICE servers/TURN). A
mídia (WebRTC) conecta direto nos servidores do COR.

Grátis (100 mil requisições/dia no plano free).

> ⚠️ Sempre que mudar `cloudflare-worker.js`, rode `wrangler deploy` de novo —
> senão o vídeo do site publicado para de funcionar.

## Deploy

```bash
npm i -g wrangler      # uma vez
wrangler login         # abre o navegador para autorizar
cd proxy
wrangler deploy        # publica e imprime a URL https://rio-cameras-proxy.<voce>.workers.dev
```

Depois, em `../public/index.html`, aponte `WORKER_BASE` para essa URL:

```js
const WORKER_BASE = 'https://rio-cameras-proxy.SEU-USUARIO.workers.dev';
```

e rode `npm run build` + `npm run deploy` na raiz do projeto.

## Testar

```bash
curl -i "https://rio-cameras-proxy.SEU-USUARIO.workers.dev/"
# deve responder 200 com o header access-control-allow-origin: *
```

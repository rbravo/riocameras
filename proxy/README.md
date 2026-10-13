# Proxy de câmeras (Cloudflare Worker)

Pequeno proxy que serve a lista de câmeras para o site em produção.
Grátis (100 mil requisições/dia no plano free).

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

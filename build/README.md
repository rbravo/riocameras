# 📦 Build para Deploy Estático

Esta pasta contém a versão estática do site de câmeras do Rio de Janeiro, pronta para deploy em serviços de hospedagem estática.

## 📁 Arquivos

- `index.html` - Página principal com o mapa
- `cameras-data.js` - Dados das câmeras em formato JavaScript
- `bairros-data.js` - Dados dos bairros do Rio de Janeiro em formato JavaScript

## 🚀 Como fazer deploy

### Amazon S3

1. Crie um bucket S3 no console AWS
2. Ative "Static website hosting" nas propriedades do bucket
3. Configure as permissões para acesso público (se necessário)
4. Faça upload dos arquivos desta pasta:
   ```bash
   aws s3 sync . s3://seu-bucket-name --acl public-read
   ```

### GitHub Pages

1. Crie um repositório no GitHub
2. Faça upload dos arquivos desta pasta
3. Vá em Settings > Pages
4. Selecione a branch main e a pasta raiz
5. Seu site ficará disponível em `https://seu-usuario.github.io/seu-repo`

### Netlify

1. Acesse https://app.netlify.com
2. Arraste a pasta `build` para fazer deploy
3. Pronto! Seu site estará no ar instantaneamente

### Vercel

1. Instale a CLI: `npm i -g vercel`
2. Execute na pasta build: `vercel --prod`
3. Siga as instruções

## 🌐 Outros serviços gratuitos

- **Cloudflare Pages** - https://pages.cloudflare.com
- **Firebase Hosting** - https://firebase.google.com/docs/hosting
- **Azure Static Web Apps** - https://azure.microsoft.com/services/app-service/static

## ⚠️ Nota sobre CORS

Se você encontrar problemas de CORS ao carregar as câmeras via iframe, isso depende da configuração do servidor `aplicativo.cocr.com.br`. O site estático funciona perfeitamente, mas o carregamento dos iframes depende das políticas do servidor de origem.

## 🔄 Atualizar dados

Para atualizar os dados das câmeras, execute na raiz do projeto:
```bash
npm run build
```

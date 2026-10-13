const fs = require('fs');
const path = require('path');

console.log('🚀 Iniciando build da versão standalone...\n');

// Criar pasta build se não existir
const buildDir = path.join(__dirname, 'build');
if (!fs.existsSync(buildDir)) {
    fs.mkdirSync(buildDir);
    console.log('✅ Pasta build/ criada');
}

// 1. Ler e adaptar o index.html da pasta public
console.log('📄 Adaptando index.html da pasta public...');
let htmlContent = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');

// Adicionar a tag script para carregar bairros-data.js ANTES do Leaflet.
// (As câmeras agora vêm AO VIVO da API do COR.Rio — veja CAMERAS_API no index.html —
//  então não há mais cameras-data.js embutido.)
htmlContent = htmlContent.replace(
    '<!-- Leaflet JS -->',
    '<!-- Leaflet JS -->\n    <script src="bairros-data.js"></script>'
);

// Substituir o fetch dos bairros por uso direto dos dados
const fetchBairrosPattern = /\/\/ Buscar dados dos bairros\s+fetch\('\/api\/bairros'\)\s+\.then\(response => response\.json\(\)\)\s+\.then\(bairros => \{([\s\S]*?)\}\)\s+\.catch\(error => \{[\s\S]*?\}\);/;

htmlContent = htmlContent.replace(fetchBairrosPattern, (match, innerCode) => {
    return `// Carregar dados do arquivo bairros-data.js
        const bairros = BAIRROS_DATA;
        {${innerCode}}`;
});

fs.writeFileSync(path.join(buildDir, 'index.html'), htmlContent);
console.log('✅ index.html gerado');

// Remover cameras-data.js legado (não é mais usado; lista agora é cameras.json)
const legacyCamerasData = path.join(buildDir, 'cameras-data.js');
if (fs.existsSync(legacyCamerasData)) {
    fs.unlinkSync(legacyCamerasData);
    console.log('🧹 cameras-data.js legado removido');
}

// Copiar a lista estática de câmeras (public/cameras.json -> build/cameras.json)
console.log('📊 Copiando cameras.json...');
fs.copyFileSync(
    path.join(__dirname, 'public', 'cameras.json'),
    path.join(buildDir, 'cameras.json')
);
console.log('✅ cameras.json copiado');

// Copiar o status das câmeras, se existir (gerado por `npm run check-cameras`)
const statusSrc = path.join(__dirname, 'public', 'status.json');
if (fs.existsSync(statusSrc)) {
    fs.copyFileSync(statusSrc, path.join(buildDir, 'status.json'));
    console.log('✅ status.json copiado');
} else {
    console.log('ℹ️  status.json ainda não existe (rode o job de checagem)');
}

// 3. Gerar bairros-data.js
console.log('📊 Gerando bairros-data.js...');
const bairrosJson = fs.readFileSync('bairros-rj.json', 'utf8');
const bairrosData = `const BAIRROS_DATA = ${bairrosJson}`;
fs.writeFileSync(path.join(buildDir, 'bairros-data.js'), bairrosData);
console.log('✅ bairros-data.js gerado');

// 4. Criar README
console.log('📝 Gerando README.md...');
const readme = `# 📦 Build para Deploy Estático

Esta pasta contém a versão estática do site de câmeras do Rio de Janeiro, pronta para deploy em serviços de hospedagem estática.

## 📁 Arquivos

- \`index.html\` - Página principal com o mapa
- \`cameras-data.js\` - Dados das câmeras em formato JavaScript
- \`bairros-data.js\` - Dados dos bairros do Rio de Janeiro em formato JavaScript

## 🚀 Como fazer deploy

### Amazon S3

1. Crie um bucket S3 no console AWS
2. Ative "Static website hosting" nas propriedades do bucket
3. Configure as permissões para acesso público (se necessário)
4. Faça upload dos arquivos desta pasta:
   \`\`\`bash
   aws s3 sync . s3://seu-bucket-name --acl public-read
   \`\`\`

### GitHub Pages

1. Crie um repositório no GitHub
2. Faça upload dos arquivos desta pasta
3. Vá em Settings > Pages
4. Selecione a branch main e a pasta raiz
5. Seu site ficará disponível em \`https://seu-usuario.github.io/seu-repo\`

### Netlify

1. Acesse https://app.netlify.com
2. Arraste a pasta \`build\` para fazer deploy
3. Pronto! Seu site estará no ar instantaneamente

### Vercel

1. Instale a CLI: \`npm i -g vercel\`
2. Execute na pasta build: \`vercel --prod\`
3. Siga as instruções

## 🌐 Outros serviços gratuitos

- **Cloudflare Pages** - https://pages.cloudflare.com
- **Firebase Hosting** - https://firebase.google.com/docs/hosting
- **Azure Static Web Apps** - https://azure.microsoft.com/services/app-service/static

## ⚠️ Nota sobre CORS

Se você encontrar problemas de CORS ao carregar as câmeras via iframe, isso depende da configuração do servidor \`aplicativo.cocr.com.br\`. O site estático funciona perfeitamente, mas o carregamento dos iframes depende das políticas do servidor de origem.

## 🔄 Atualizar dados

Para atualizar os dados das câmeras, execute na raiz do projeto:
\`\`\`bash
npm run build
\`\`\`
`;

fs.writeFileSync(path.join(buildDir, 'README.md'), readme);
console.log('✅ README.md gerado');

// Estatísticas
const htmlSize = (fs.statSync(path.join(buildDir, 'index.html')).size / 1024).toFixed(2);
const bairrosJsSize = (fs.statSync(path.join(buildDir, 'bairros-data.js')).size / 1024).toFixed(2);

console.log('\n✨ Build concluído com sucesso!\n');
console.log('📊 Estatísticas:');
console.log(`   - index.html: ${htmlSize} KB`);
console.log(`   - bairros-data.js: ${bairrosJsSize} KB`);
console.log(`   - Total: ${(parseFloat(htmlSize) + parseFloat(bairrosJsSize)).toFixed(2)} KB`);
console.log('\n📁 Arquivos prontos em: build/');
console.log('🚀 Pronto para deploy!\n');

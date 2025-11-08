# Rio de Janeiro - Mapa de Câmeras 🎥

Visualizador interativo das câmeras de monitoramento do Rio de Janeiro em mapa.

![Preview](https://img.shields.io/badge/status-online-success)
![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)

## 🌟 Demo

🔗 **[Ver Demo Online](https://seu-usuario.github.io/seu-repositorio/)**

## ✨ Funcionalidades

- 🗺️ Mapa interativo com todas as câmeras do Rio de Janeiro
- 📍 Marcadores customizados para cada câmera
- 🎥 Visualização da câmera em popup ao clicar
- 📱 Interface responsiva
- ⚡ Carregamento rápido
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

### Outros serviços

- **Netlify**: Arraste a pasta `build` no site
- **Vercel**: `vercel build/ --prod`
- **Amazon S3**: `aws s3 sync build/ s3://seu-bucket`

## 🛠️ Tecnologias

- **Node.js + Express** - Servidor de desenvolvimento
- **Leaflet** - Biblioteca de mapas (open source)
- **OpenStreetMap** - Tiles do mapa (gratuito)
- **Vanilla JS** - Sem frameworks pesados

## 📁 Estrutura

```
riocameras/
├── public/              # Arquivos da versão de desenvolvimento
│   └── index.html
├── build/               # Arquivos da versão de produção (gerados)
│   ├── index.html
│   ├── cameras-data.js
│   └── README.md
├── server.js            # Servidor Express
├── build-script.js      # Script de build
├── deploy-github.js     # Script de deploy
└── camera_api_json.json # Dados das câmeras
```

## 🔄 Atualizar dados das câmeras

1. Substitua o arquivo `camera_api_json.json`
2. Execute `npm run build`
3. Execute `npm run deploy` (se quiser publicar)

## 📝 Scripts disponíveis

```bash
npm start        # Inicia servidor de desenvolvimento
npm run build    # Gera build de produção
npm run deploy   # Deploy para GitHub Pages
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

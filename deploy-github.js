const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Iniciando deploy para GitHub Pages...\n');

// Verificar se estamos em um repositório git
try {
    execSync('git rev-parse --git-dir', { stdio: 'ignore' });
} catch (error) {
    console.error('❌ Este diretório não é um repositório git.');
    console.log('\n📝 Para configurar o git:');
    console.log('   git init');
    console.log('   git add .');
    console.log('   git commit -m "Initial commit"');
    console.log('   git branch -M main');
    console.log('   git remote add origin https://github.com/SEU-USUARIO/SEU-REPOSITORIO.git');
    console.log('   git push -u origin main');
    process.exit(1);
}

// 1. Fazer build
console.log('📦 Fazendo build...');
try {
    execSync('npm run build', { stdio: 'inherit' });
    console.log('✅ Build concluído\n');
} catch (error) {
    console.error('❌ Erro ao fazer build');
    process.exit(1);
}

// 2. Verificar se a branch gh-pages existe
console.log('🔍 Verificando branch gh-pages...');
let ghPagesExists = false;
try {
    execSync('git show-ref --verify --quiet refs/heads/gh-pages');
    ghPagesExists = true;
    console.log('✅ Branch gh-pages existe\n');
} catch (error) {
    console.log('📝 Branch gh-pages não existe, será criada\n');
}

// 3. Fazer commit dos arquivos de build
console.log('📤 Preparando deploy...');
try {
    // Salvar a branch atual
    const currentBranch = execSync('git branch --show-current', { encoding: 'utf8' }).trim();
    console.log(`   Branch atual: ${currentBranch}`);

    // Criar ou mudar para gh-pages
    if (ghPagesExists) {
        execSync('git checkout gh-pages', { stdio: 'inherit' });
    } else {
        execSync('git checkout --orphan gh-pages', { stdio: 'inherit' });
    }

    // Limpar tudo exceto a pasta build
    console.log('   Limpando branch gh-pages...');
    const files = fs.readdirSync('.');
    files.forEach(file => {
        if (file !== 'build' && file !== '.git' && file !== 'node_modules') {
            try {
                if (fs.lstatSync(file).isDirectory()) {
                    fs.rmSync(file, { recursive: true, force: true });
                } else {
                    fs.unlinkSync(file);
                }
            } catch (err) {
                // Ignorar erros
            }
        }
    });

    // Mover arquivos da pasta build para a raiz
    console.log('   Movendo arquivos do build...');
    const buildFiles = fs.readdirSync('build');
    buildFiles.forEach(file => {
        fs.renameSync(path.join('build', file), file);
    });
    fs.rmdirSync('build');

    // Criar .nojekyll para evitar processamento do Jekyll
    fs.writeFileSync('.nojekyll', '');

    // Adicionar todos os arquivos
    execSync('git add -A', { stdio: 'inherit' });

    // Fazer commit
    const timestamp = new Date().toLocaleString('pt-BR');
    execSync(`git commit -m "Deploy: ${timestamp}"`, { stdio: 'inherit' });

    // Push
    console.log('\n🚀 Fazendo push para GitHub...');
    execSync('git push origin gh-pages --force', { stdio: 'inherit' });

    // Voltar para a branch original
    console.log(`\n🔙 Voltando para branch ${currentBranch}...`);
    execSync(`git checkout ${currentBranch}`, { stdio: 'inherit' });

    console.log('\n✨ Deploy concluído com sucesso!\n');
    console.log('📍 Seu site estará disponível em:');
    console.log('   https://SEU-USUARIO.github.io/SEU-REPOSITORIO/');
    console.log('\n⚙️  Configure GitHub Pages:');
    console.log('   1. Vá em Settings > Pages no seu repositório');
    console.log('   2. Em "Source", selecione a branch "gh-pages"');
    console.log('   3. Aguarde alguns minutos para o deploy finalizar');

} catch (error) {
    console.error('\n❌ Erro durante o deploy:', error.message);
    console.log('\n💡 Dica: Verifique se você configurou o remote do git:');
    console.log('   git remote -v');
    process.exit(1);
}

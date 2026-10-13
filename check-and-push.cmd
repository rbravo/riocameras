@echo off
REM ============================================================
REM  Verifica o status das cameras e publica (verde/cinza no mapa).
REM  PRECISA rodar de uma rede brasileira (os servidores de video do
REM  COR nao entregam o stream para IPs de datacenter / fora do Brasil).
REM
REM  Agende no Agendador de Tarefas do Windows (a cada ~3 dias).
REM  Pre-requisitos: `npm install`, Google Chrome instalado e
REM  credencial do git salva (para o push rodar sem pedir senha).
REM ============================================================
cd /d "%~dp0"

echo [%date% %time%] Checando status das cameras...
call npm run check-cameras
if errorlevel 1 (
  echo Check falhou. Abortando (status.json nao foi alterado/publicado).
  exit /b 1
)

git add public/status.json
git diff --cached --quiet
if %errorlevel%==0 (
  echo Sem mudancas no status.json. Nada a publicar.
  exit /b 0
)

git commit -m "chore: atualiza status das cameras"
git push
echo [%date% %time%] status.json publicado (o deploy.yml republica o site).

@echo off
REM ============================================================
REM  Verifica o status das cameras e publica (verde/cinza no mapa).
REM  PRECISA rodar de uma rede brasileira (os servidores de video do
REM  COR nao entregam o stream para IPs de datacenter / fora do Brasil).
REM
REM  Agende no Agendador de Tarefas do Windows (a cada ~3 dias), com a
REM  opcao "Executar somente quando o usuario estiver conectado" (para a
REM  janela aparecer). A janela fica ABERTA no fim mostrando o resultado.
REM
REM  Pre-requisitos: `npm install`, Google Chrome instalado e
REM  credencial do git salva (para o push rodar sem pedir senha).
REM ============================================================
title Check de status das cameras - RioCameras
cd /d "%~dp0"

REM Mantem o repo local atualizado (arvore limpa aqui, entao e seguro).
echo [%date% %time%] Atualizando repo (git pull)...
git pull --rebase

echo [%date% %time%] Checando status das cameras... (leva ~40-60 min)
echo.
call npm run check-cameras
if errorlevel 1 goto checkfail

git add public/status.json
git diff --cached --quiet
if errorlevel 1 goto haschanges

echo.
echo ============================================================
echo   =  SEM MUDANCAS no status.json. Nada a publicar.
echo      Nao precisa fazer nada.
echo ============================================================
goto fim

:haschanges
git commit -m "chore: atualiza status das cameras"
git push
if errorlevel 1 goto pushfail
echo.
echo ============================================================
echo   OK  PUBLICADO com sucesso! Nao precisa fazer nada.
echo       O site sera republicado automaticamente (deploy.yml).
echo ============================================================
goto fim

:pushfail
echo.
echo ============================================================
echo   !!  O COMMIT foi feito, mas o PUSH FALHOU.
echo       >>> Rode voce mesmo:  git push
echo       (veja o erro acima - pode ser conexao ou credencial)
echo ============================================================
goto fim

:checkfail
echo.
echo ============================================================
echo   XX  O CHECK FALHOU. O status.json NAO foi alterado.
echo       Nada foi publicado. Veja o erro acima.
echo       Nao precisa fazer push.
echo ============================================================

:fim
echo.
echo [%date% %time%] Fim. (Esta janela ficara aberta ate voce fecha-la.)
echo.
pause

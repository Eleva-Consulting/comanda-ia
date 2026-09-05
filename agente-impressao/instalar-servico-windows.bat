@echo off
setlocal

set SERVICO=ComandaIA-AgenteImpressao
set PASTA=%~dp0
set EXE=%PASTA%comanda-ia-agente-impressao.exe
set NSSM=%PASTA%nssm.exe
set LOG=%PASTA%agente.log

rem Precisa rodar como Administrador — "net session" só funciona elevado.
net session >nul 2>&1
if %errorLevel% neq 0 (
  echo.
  echo ERRO: este script precisa ser executado como Administrador.
  echo Clique com o botao direito neste arquivo e escolha "Executar como administrador".
  echo.
  pause
  exit /b 1
)

if not exist "%EXE%" (
  echo.
  echo ERRO: nao encontrei "%EXE%".
  echo Coloque este .bat na mesma pasta do comanda-ia-agente-impressao.exe e do .env.
  echo.
  pause
  exit /b 1
)

if not exist "%PASTA%.env" (
  echo.
  echo ERRO: nao encontrei o arquivo .env nesta pasta.
  echo Configure o .env (copie o .env.example e preencha) antes de instalar o servico.
  echo.
  pause
  exit /b 1
)

if not exist "%NSSM%" (
  echo.
  echo ERRO: nao encontrei "%NSSM%".
  echo Baixe o nssm.exe em https://nssm.cc/download ^(pasta win64^) e coloque nesta mesma pasta
  echo antes de continuar.
  echo.
  pause
  exit /b 1
)

echo Instalando o servico "%SERVICO%"...
"%NSSM%" install %SERVICO% "%EXE%"
"%NSSM%" set %SERVICO% AppDirectory "%PASTA%"
"%NSSM%" set %SERVICO% AppStdout "%LOG%"
"%NSSM%" set %SERVICO% AppStderr "%LOG%"
"%NSSM%" set %SERVICO% Start SERVICE_AUTO_START

echo Iniciando o servico...
"%NSSM%" start %SERVICO%

echo.
echo Pronto! O agente de impressao agora roda como servico do Windows:
echo  - inicia sozinho no boot do Windows, sem precisar de ninguem logado
echo  - reinicia sozinho se o processo cair
echo  - log em: %LOG%
echo.
echo Para parar:      "%NSSM%" stop %SERVICO%
echo Para desinstalar: "%NSSM%" remove %SERVICO% confirm
echo.
pause

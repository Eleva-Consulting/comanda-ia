# 00 — Setup do ambiente de desenvolvimento

Este documento consolida todo o processo de configuração do ambiente de desenvolvimento usado no projeto `comanda-ia`, com explicações sobre o porquê de cada escolha.

## Contexto

O projeto é desenvolvido em **Windows** usando um **ambiente Linux integrado** (WSL2). Essa é a combinação mais usada por desenvolvedores web em Windows, porque o ecossistema de ferramentas modernas (Node.js, Docker, bancos de dados, frameworks) foi construído pensando em Linux/Mac. Tentar desenvolver no Windows puro gera muitos problemas de compatibilidade.

## O que é WSL2

**WSL** significa "Windows Subsystem for Linux". É um **subsistema que permite rodar um Linux real dentro do Windows**, com integração completa — você edita arquivos no VS Code do Windows que estão dentro do Linux, roda comandos de um lado que afetam o outro, tudo funcionando como se fosse uma máquina só.

A versão 2 (WSL2) usa virtualização por baixo dos panos (Hyper-V), mas de forma otimizada pela própria Microsoft.

### Analogia

Pense em WSL2 como uma **cozinha industrial dentro da sua casa**: um espaço separado, equipado especificamente pra um propósito (desenvolvimento), mas integrado com a casa (Windows). Você circula entre os dois naturalmente.

## Ferramentas instaladas

### 1. WSL2 + Ubuntu 24.04

**O que é:** O Ubuntu é a distribuição Linux mais popular para desenvolvimento. É o sistema operacional que roda dentro do WSL2.

**Como instalar:**

```powershell
wsl --install -d Ubuntu-24.04
```

Após reiniciar, abre o Ubuntu e cria usuário + senha do Linux (senha diferente da senha do Windows).

### 2. Visual Studio Code + extensão WSL

**O que é:** Editor de código da Microsoft, gratuito e extensível. Com a extensão WSL, consegue editar arquivos do Linux como se fossem do Windows.

**Como integrar:**

1. Instalar VS Code no Windows
2. Instalar a extensão "WSL" (Microsoft) via `Ctrl + Shift + X`
3. No terminal Linux, dentro de uma pasta: `code .`

Quando o VS Code abre conectado ao WSL, aparece um badge azul "WSL: Ubuntu-24.04" no canto inferior esquerdo.

### 3. Git

**O que é:** Sistema de controle de versão. Grava histórico de todas as alterações feitas no código, permitindo voltar atrás, comparar versões, colaborar com outros devs.

**Analogia com Terraform:** o Git faz com o código o que o `terraform state` faz com a infra — registra o estado em diferentes momentos.

**Como configurar depois de instalado:**

```bash
git config --global user.name "Seu Nome Completo"
git config --global user.email "seuemail@exemplo.com"
```

> Importante: valores com espaço precisam de aspas.

### 4. Node.js (via NVM)

**O que é:** Runtime do JavaScript — o programa que executa código JS/TS fora do navegador. A versão atual é a 22 (LTS).

**Por que via NVM:** NVM significa "Node Version Manager". Permite ter várias versões do Node instaladas e trocar entre elas com um comando. Projetos diferentes podem exigir versões diferentes.

**Instalação:**

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
```

Depois fechar e abrir o terminal, então:

```bash
nvm install 22
node --version  # deve mostrar v22.x.x
npm --version   # deve mostrar 10.x.x
```

### 5. Docker Desktop

**O que é:** Ferramenta que permite rodar aplicações em **containers** — ambientes isolados com tudo que a aplicação precisa pra funcionar, sem instalar nada no sistema.

**Para que vamos usar:**
- Rodar PostgreSQL (banco de dados) localmente
- Rodar Evolution API (integração WhatsApp) localmente
- Base pra deploy em produção

**Analogia com Azure:** container é o mesmo conceito do **Azure Container Instance** ou do **App Service**, mas rodando na sua máquina. Tudo empacotado junto, isolado do sistema.

**Como testar que funciona:**

```bash
docker run hello-world
```

Se aparecer "Hello from Docker!", está tudo certo.

## Estrutura de pastas adotada

No Linux, é boa prática manter todos os projetos na pasta home:

```
/home/seuusuario/
└── projetos/
    └── comanda-ia/
        ├── src/
        ├── docs/
        ├── node_modules/
        ├── package.json
        └── ...
```

## Fluxo de trabalho diário

Depois do setup feito, abrir o projeto é só:

```bash
# Abre o Ubuntu (menu iniciar → Ubuntu ou WSL)
cd ~/projetos/comanda-ia
code .
```

O VS Code abre conectado ao WSL com o projeto pronto.

## Conceitos importantes aprendidos aqui

### Sudo

`sudo` antes de um comando no Linux significa "executar como administrador". Pede a senha do Linux.

> Ao digitar a senha, **nada aparece na tela** — nem asteriscos. É normal, é segurança.

### Terminal do VS Code vs terminal do Ubuntu

O VS Code tem um terminal integrado (atalho: `` Ctrl + ` ``). Quando aberto dentro de um projeto conectado via WSL, ele já abre no Linux, na pasta certa. Evita ter que alternar janelas.

### Pastas com ponto no início

No Linux, pastas e arquivos que começam com `.` são **ocultos** por padrão. Exemplos:

- `.git` — a pasta interna do Git
- `.gitignore` — arquivo que diz o que não deve ir pro Git
- `.env` — variáveis de ambiente (senhas, tokens)

Pra listar incluindo eles: `ls -la`.

## Próximos tópicos

- [01 — JavaScript, TypeScript e Node.js](./01-js-ts-nodejs.md)
- [02 — Frameworks e APIs (com Fastify)](./02-frameworks-e-apis.md)# 00 — Setup do ambiente de desenvolvimento

Este documento consolida todo o processo de configuração do ambiente de desenvolvimento usado no projeto `comanda-ia`, com explicações sobre o porquê de cada escolha.

## Contexto

O projeto é desenvolvido em **Windows** usando um **ambiente Linux integrado** (WSL2). Essa é a combinação mais usada por desenvolvedores web em Windows, porque o ecossistema de ferramentas modernas (Node.js, Docker, bancos de dados, frameworks) foi construído pensando em Linux/Mac. Tentar desenvolver no Windows puro gera muitos problemas de compatibilidade.

## O que é WSL2

**WSL** significa "Windows Subsystem for Linux". É um **subsistema que permite rodar um Linux real dentro do Windows**, com integração completa — você edita arquivos no VS Code do Windows que estão dentro do Linux, roda comandos de um lado que afetam o outro, tudo funcionando como se fosse uma máquina só.

A versão 2 (WSL2) usa virtualização por baixo dos panos (Hyper-V), mas de forma otimizada pela própria Microsoft.

### Analogia

Pense em WSL2 como uma **cozinha industrial dentro da sua casa**: um espaço separado, equipado especificamente pra um propósito (desenvolvimento), mas integrado com a casa (Windows). Você circula entre os dois naturalmente.

## Ferramentas instaladas

### 1. WSL2 + Ubuntu 24.04

**O que é:** O Ubuntu é a distribuição Linux mais popular para desenvolvimento. É o sistema operacional que roda dentro do WSL2.

**Como instalar:**

```powershell
wsl --install -d Ubuntu-24.04
```

Após reiniciar, abre o Ubuntu e cria usuário + senha do Linux (senha diferente da senha do Windows).

### 2. Visual Studio Code + extensão WSL

**O que é:** Editor de código da Microsoft, gratuito e extensível. Com a extensão WSL, consegue editar arquivos do Linux como se fossem do Windows.

**Como integrar:**

1. Instalar VS Code no Windows
2. Instalar a extensão "WSL" (Microsoft) via `Ctrl + Shift + X`
3. No terminal Linux, dentro de uma pasta: `code .`

Quando o VS Code abre conectado ao WSL, aparece um badge azul "WSL: Ubuntu-24.04" no canto inferior esquerdo.

### 3. Git

**O que é:** Sistema de controle de versão. Grava histórico de todas as alterações feitas no código, permitindo voltar atrás, comparar versões, colaborar com outros devs.

**Analogia com Terraform:** o Git faz com o código o que o `terraform state` faz com a infra — registra o estado em diferentes momentos.

**Como configurar depois de instalado:**

```bash
git config --global user.name "Seu Nome Completo"
git config --global user.email "seuemail@exemplo.com"
```

> Importante: valores com espaço precisam de aspas.

### 4. Node.js (via NVM)

**O que é:** Runtime do JavaScript — o programa que executa código JS/TS fora do navegador. A versão atual é a 22 (LTS).

**Por que via NVM:** NVM significa "Node Version Manager". Permite ter várias versões do Node instaladas e trocar entre elas com um comando. Projetos diferentes podem exigir versões diferentes.

**Instalação:**

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
```

Depois fechar e abrir o terminal, então:

```bash
nvm install 22
node --version  # deve mostrar v22.x.x
npm --version   # deve mostrar 10.x.x
```

### 5. Docker Desktop

**O que é:** Ferramenta que permite rodar aplicações em **containers** — ambientes isolados com tudo que a aplicação precisa pra funcionar, sem instalar nada no sistema.

**Para que vamos usar:**
- Rodar PostgreSQL (banco de dados) localmente
- Rodar Evolution API (integração WhatsApp) localmente
- Base pra deploy em produção

**Analogia com Azure:** container é o mesmo conceito do **Azure Container Instance** ou do **App Service**, mas rodando na sua máquina. Tudo empacotado junto, isolado do sistema.

**Como testar que funciona:**

```bash
docker run hello-world
```

Se aparecer "Hello from Docker!", está tudo certo.

## Estrutura de pastas adotada

No Linux, é boa prática manter todos os projetos na pasta home:

```
/home/seuusuario/
└── projetos/
    └── comanda-ia/
        ├── src/
        ├── docs/
        ├── node_modules/
        ├── package.json
        └── ...
```

## Fluxo de trabalho diário

Depois do setup feito, abrir o projeto é só:

```bash
# Abre o Ubuntu (menu iniciar → Ubuntu ou WSL)
cd ~/projetos/comanda-ia
code .
```

O VS Code abre conectado ao WSL com o projeto pronto.

## Conceitos importantes aprendidos aqui

### Sudo

`sudo` antes de um comando no Linux significa "executar como administrador". Pede a senha do Linux.

> Ao digitar a senha, **nada aparece na tela** — nem asteriscos. É normal, é segurança.

### Terminal do VS Code vs terminal do Ubuntu

O VS Code tem um terminal integrado (atalho: `` Ctrl + ` ``). Quando aberto dentro de um projeto conectado via WSL, ele já abre no Linux, na pasta certa. Evita ter que alternar janelas.

### Pastas com ponto no início

No Linux, pastas e arquivos que começam com `.` são **ocultos** por padrão. Exemplos:

- `.git` — a pasta interna do Git
- `.gitignore` — arquivo que diz o que não deve ir pro Git
- `.env` — variáveis de ambiente (senhas, tokens)

Pra listar incluindo eles: `ls -la`.

## Próximos tópicos

- [01 — JavaScript, TypeScript e Node.js](./01-js-ts-nodejs.md)
- [02 — Frameworks e APIs (com Fastify)](./02-frameworks-e-apis.md)
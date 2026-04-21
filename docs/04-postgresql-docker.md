# 04 — PostgreSQL e Docker Compose

Este documento consolida o que foi aprendido sobre bancos de dados relacionais, PostgreSQL e orquestração de containers com Docker Compose.

## O problema: sistemas sem memória

Até aqui, nossa API vive **só em memória**. Toda vez que recebemos um pedido em `POST /pedidos`, processamos e esquecemos. Se o servidor reiniciar, tudo se perde.

Um sistema real precisa de **persistência** — guardar dados de forma permanente, consultá-los eficientemente, recuperá-los mesmo após falhas.

É para isso que existem os bancos de dados.

## Tipos de banco de dados

### Relacionais (SQL)

Dados organizados em **tabelas** com **linhas** e **colunas**. Tabelas se relacionam entre si. Linguagem padrão: SQL.

Exemplos: PostgreSQL, MySQL, SQL Server, Oracle.

### Não-relacionais (NoSQL)

Dados em formatos variados: documentos (JSON-like), chave-valor, grafos.

Exemplos: MongoDB, Redis, DynamoDB, Neo4j.

### Qual escolher

Para a maioria dos SaaS, **relacional (SQL)** é a escolha certa. Motivos:

- Dados da aplicação costumam ser bem estruturados
- Relacionamentos entre entidades são comuns (cliente → pedido → itens)
- Integridade transacional (ou tudo funciona, ou nada é alterado)
- Maturidade de ferramentas e conhecimento da comunidade

## Por que PostgreSQL

É o banco relacional open-source mais adotado em projetos modernos. Vantagens:

- Gratuito e open-source
- Suportado nativamente em todas as clouds (Azure, AWS, GCP)
- Extensível (tipos customizados, funções, extensões)
- Excelente performance
- JSON nativo (dá para misturar relacional com documento)
- Padrão de mercado em SaaS

Na Azure, existe o serviço **Azure Database for PostgreSQL** — gerenciado, com backup automático, réplicas, etc. É o que vamos usar em produção.

## Docker e orquestração

### Por que rodar o banco via container

Sem Docker, para desenvolver localmente seria necessário:

1. Baixar o instalador do Postgres
2. Instalar no sistema
3. Configurar usuário, senha, porta manualmente
4. Gerenciar o serviço
5. Se der problema, desinstalar e repetir tudo

Com Docker:

```bash
docker compose up -d
```

E pronto. Isolado, reprodutível, descartável.

### Docker Compose

Docker Compose é uma ferramenta para **orquestrar múltiplos containers** declarativamente. Em vez de escrever vários comandos `docker run`, você descreve os serviços em um arquivo `docker-compose.yml` e sobe tudo com um comando.

**Paralelo com Terraform:** Docker standalone é como `az cli` (imperativo). Docker Compose é como Terraform (declarativo). Você descreve o estado desejado e a ferramenta garante que aquele estado seja alcançado.

## Configuração do projeto

Arquivo `docker-compose.yml` na raiz do projeto:

```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: comanda-ia-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: comanda_ia
      POSTGRES_PASSWORD: senha_local_dev
      POSTGRES_DB: comanda_ia_dev
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

### Explicando cada campo

| Campo | Significado |
|---|---|
| `services` | Lista dos containers a orquestrar |
| `image` | Qual imagem Docker usar. `postgres:16-alpine` = Postgres 16 em Alpine Linux (versão reduzida) |
| `container_name` | Nome amigável do container |
| `restart: unless-stopped` | Se o container cair, reinicia automaticamente (simula produção) |
| `environment` | Variáveis que a imagem do Postgres usa para configuração inicial |
| `ports` | Mapeamento `host:container`. `5432:5432` expõe a porta interna para acesso externo |
| `volumes` | Persistência de dados (sobrevive à destruição do container) |

### Por que Alpine

Alpine é uma distribuição Linux ultrarreduzida (cerca de 5 MB base). Imagens Docker baseadas em Alpine são muito menores que as baseadas em Debian. Para Postgres:

- `postgres:16` → cerca de 400 MB
- `postgres:16-alpine` → cerca de 80 MB

Além do tamanho menor, menos software instalado significa menor superfície de ataque.

## Volumes Docker

### O problema

Containers são efêmeros por design. Se o container for destruído, todos os dados nele também.

### A solução

Um **volume** é um "disco virtual" gerenciado pelo Docker, separado do ciclo de vida do container. Mapeamos uma pasta interna do container para um volume, e os dados sobrevivem mesmo se o container for recriado.

No nosso caso:

```yaml
volumes:
  - postgres_data:/var/lib/postgresql/data
```

A pasta onde o Postgres guarda os dados (`/var/lib/postgresql/data`) é mapeada para um volume chamado `postgres_data`. Se derrubarmos o container e recriarmos, os dados continuam lá.

## Comandos essenciais

### Controle do container

| Comando | Efeito |
|---|---|
| `docker compose up -d` | Sobe os serviços em segundo plano |
| `docker compose stop` | Para os containers (preserva dados) |
| `docker compose start` | Reinicia containers parados |
| `docker compose down` | Para e remove containers (volume preservado) |
| `docker compose down -v` | Para, remove e apaga volumes (dados perdidos) |
| `docker compose logs postgres` | Mostra logs do serviço |
| `docker compose logs -f postgres` | Logs em tempo real (Ctrl+C para sair) |
| `docker ps` | Lista containers em execução |

### Acessar o Postgres via linha de comando

O cliente `psql` vem dentro da própria imagem. Para acessá-lo:

```bash
docker exec -it comanda-ia-postgres psql -U comanda_ia -d comanda_ia_dev
```

Decomposição:

- `docker exec -it` — executa comando dentro de um container rodando, interativo
- `comanda-ia-postgres` — qual container
- `psql` — cliente SQL do Postgres
- `-U comanda_ia` — usuário
- `-d comanda_ia_dev` — banco

Após entrar, o prompt muda para `comanda_ia_dev=#`.

### Comandos dentro do psql

| Comando | Efeito |
|---|---|
| `\l` | Lista todos os bancos |
| `\dt` | Lista tabelas do banco atual |
| `\d nome_tabela` | Mostra estrutura de uma tabela |
| `\du` | Lista usuários |
| `\q` | Sai do psql |
| `SELECT version();` | Mostra versão do Postgres |

## Segurança em desenvolvimento vs produção

### O que está ok em desenvolvimento

Deixar a senha em texto puro no `docker-compose.yml` é aceitável para desenvolvimento local, desde que:

- O arquivo não exponha dados reais
- O banco não seja acessível pela internet (só localhost)
- Seja uma senha diferente da usada em produção

### O que fazer em produção

Em produção, nunca deixar senhas em arquivos versionados. Usar:

- **Variáveis de ambiente** fora do código (`.env` ignorado pelo Git)
- **Secrets managers** (Azure Key Vault, AWS Secrets Manager)
- **Managed identities** quando disponíveis

Isso será tratado em um documento futuro sobre configuração e segurança.

## Próximos tópicos

Virão em breve:

- 05 — Prisma ORM: modelagem de dados e acesso ao banco
- 06 — Migrations e versionamento de schema
- 07 — Relacionamentos entre entidades
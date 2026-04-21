# 01 — JavaScript, TypeScript e Node.js

Este documento explica a relação entre essas três tecnologias e por que foram escolhidas pro projeto. É um tema que confunde muita gente que tá começando.

## Analogia para fixar

Pense num carro:

- **JavaScript** = o **motor** (o que faz tudo funcionar)
- **Navegador** (Chrome, Firefox) = um **chassi** que usa esse motor
- **Node.js** = outro **chassi** que usa o mesmo motor, só que pra outro tipo de estrada (servidor)
- **TypeScript** = um **simulador** onde você projeta o motor antes de montar, pra ver se vai funcionar

## JavaScript (JS)

### O que é

Uma **linguagem de programação**. É o que se escreve.

```javascript
const nome = "Vinicius";
console.log("Olá " + nome);
```

### História

Criada em 1995 para rodar dentro de navegadores. Serviu durante 14 anos **só** pra isso — deixar páginas web interativas.

### Características

- **Linguagem permissiva.** Aceita muita coisa sem reclamar — o que é ruim quando você quer segurança.
- **Dinamicamente tipada.** Não declara tipos: uma variável pode guardar qualquer coisa, inclusive mudar de tipo no meio do programa.

Exemplo do "problema" do JavaScript:

```javascript
let x = 10;        // x é um número
x = "dez";         // agora é uma string
x = [1, 2, 3];     // agora é um array
// o JavaScript nunca reclama
```

## Node.js

### O que é

**Runtime** do JavaScript fora do navegador. É o programa que permite rodar código JS no servidor, na sua máquina, em containers — em qualquer lugar que não seja um navegador.

### História

Criado em 2009 por Ryan Dahl. Ele pegou o **V8** (motor JavaScript do Chrome) e transformou num programa standalone. Isso revolucionou o mundo dev porque, pela primeira vez, uma linguagem servia tanto pro front-end quanto pro back-end.

### Por que é importante

Antes do Node.js, um desenvolvedor web precisava dominar pelo menos duas linguagens: uma pro navegador (JavaScript) e outra pro servidor (PHP, Ruby, Python, Java). Com Node.js, uma linguagem cobre os dois lados.

### O que tem dentro

- **Motor V8** (executa JavaScript)
- **Bibliotecas built-in** (ler arquivo, fazer requisições HTTP, acessar banco, etc.)
- **npm** (gerenciador de pacotes — repositório com milhões de bibliotecas prontas)

## TypeScript (TS)

### O que é

JavaScript com **sistema de tipos**. Você declara o tipo de cada variável, e um compilador verifica **antes de rodar** se tudo bate.

```typescript
const nome: string = "Vinicius";
const idade: number = 30;

function saudar(pessoa: string): string {
  return "Olá, " + pessoa;
}
```

### Por que existe

Resolver o problema da permissividade do JavaScript em projetos grandes. Empresas como Microsoft, Google, Airbnb — todas migraram seus projetos JavaScript pra TypeScript.

### O pulo do gato

**Node.js não entende TypeScript diretamente.** Ele só executa JavaScript puro. Então como funciona?

Existem duas formas:

#### Forma 1 — Compilar primeiro, rodar depois

```
arquivo.ts  →  (compilador tsc)  →  arquivo.js  →  (Node.js executa)
```

Esse é o modelo "produção": compila uma vez, roda várias.

#### Forma 2 — Usar tsx (ferramenta que une os dois passos)

O `tsx` é o que instalamos no projeto. Ele pega o `.ts`, compila em memória e executa na hora. Prático pra desenvolvimento.

```bash
npx tsx src/index.ts
```

### Vantagens em projetos reais

- **Pega bugs antes de rodar.** Uma comparação errada, uma função chamada com argumento de tipo errado — o TypeScript te avisa no editor.
- **Auto-complete inteligente.** O VS Code sugere métodos e propriedades baseado nos tipos.
- **Refatoração segura.** Renomeou uma função? Todos os lugares que usam dela viram um erro imediatamente.
- **Documentação implícita.** Ver os tipos de uma função já explica o que ela faz.

### Paralelo com Terraform

TypeScript declara tipos assim:

```typescript
const nome: string = "Vinicius";
```

Terraform declara tipos assim:

```hcl
variable "nome" {
  type    = string
  default = "Vinicius"
}
```

É a mesma ideia: nome, tipo, valor.

## Por que essa combinação no projeto

| Camada | Por quê |
|---|---|
| **JavaScript** como base | Linguagem única front + back — aprende uma coisa, usa em dois lugares |
| **Node.js** no backend | Roda JS no servidor, na Azure, em containers |
| **TypeScript** pra segurança | Pega bugs enquanto se escreve, não quando um cliente reclama |

## Ecossistema relacionado

### npm (Node Package Manager)

Gerenciador de pacotes. Instala bibliotecas de terceiros com um comando:

```bash
npm install fastify
```

Cria/atualiza:

- `package.json` — lista as dependências (como o `terraform.tf` com `required_providers`)
- `package-lock.json` — versões exatas travadas (como o `terraform.lock.hcl`)
- `node_modules/` — pasta com o código das bibliotecas baixadas (nunca vai pro Git)

### tsconfig.json

Arquivo que configura o TypeScript. Define:

- `target` — qual versão do JS gerar
- `module` — sistema de módulos
- `rootDir` / `outDir` — onde fica o código-fonte e onde vai o compilado
- `strict` — ativa verificações rigorosas (recomendado)

## Dúvidas comuns

### Preciso aprender JavaScript antes de TypeScript?

Não. Como TypeScript é um superset de JavaScript, aprender TypeScript diretamente também te ensina JavaScript. Os conceitos de lógica (variáveis, funções, loops, condicionais) são os mesmos. TypeScript só adiciona a parte de tipos.

### O TypeScript é mais lento que o JavaScript?

Não em runtime. Depois que compila, vira JavaScript puro. A única "lentidão" é no processo de compilar — alguns milissegundos extras na hora de rodar em desenvolvimento. Em produção, roda JavaScript puro normal.

### Vou precisar saber C++ ou algo assim pra mexer com Node.js?

Não. Node.js abstrai toda a camada de baixo nível. Você só escreve JavaScript/TypeScript.

## Próximo tópico

- [02 — Frameworks e APIs (com Fastify)](./02-frameworks-e-apis.md)
# oficina-execucao-service

[![CI](https://github.com/engineercodeprojects/fase-04-soat-fiap-oficina-execucao-service/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/engineercodeprojects/fase-04-soat-fiap-oficina-execucao-service/actions/workflows/ci.yml)

Microsserviço **Execução** da Oficina Mecânica (Tech Challenge FIAP, Fase 4). Cuida da **execução das Ordens de Serviço (OS)**: atribuição de mecânico, diagnóstico (serviços + peças), catálogo de serviços e produtos, **estoque com baixa e devolução (rollback) transacionais** e o ciclo de vida da execução. A OS em si (dados e status oficial) pertence ao **OS Service** (`fase-04-soat-fiap-oficina-os-service`), acessado por HTTP.

- NestJS 11 + TypeScript, DDD por módulo (`src/<modulo>/{domain,application,infrastructure}`), linguagem ubíqua em português.
- Banco próprio **AWS DynamoDB** (SDK v3 `@aws-sdk/client-dynamodb` + `@aws-sdk/lib-dynamodb`).
- Auth resource-server (JWT HS256 da auth-lambda) e logs/métricas/health do [`@guilhermeqmaia/oficina-kit`](https://github.com/guilhermeqmaia/soat-fiap-oficina-kit).
- Swagger em **`/api/docs`** (fora de produção).

## Arquitetura

```
src/
├── dynamodb/      cliente DynamoDB, nomes de tabelas (env), health, definição/criação de tabelas (dev/teste)
├── servico/       catálogo de serviços (CRUD /catalogo/servicos)
├── produto/       catálogo de produtos + estoque (CRUD /catalogo/produtos, entradas, movimentações,
│                  EstoqueService: baixa/devolução com TransactWriteItems)
├── execucao/      agregado Execução (1 por OS), máquina de estados, rotas /execucao/ordens,
│                  OsServiceClient (porta OsServiceGateway + callbacks via ClienteHttpInterno do kit)
└── shared/        erros de domínio e validações comuns; teste de arquitetura (regra de dependência)
```

| Camada           | Conteúdo                                                                               | Pode depender de                                    |
| ---------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `domain`         | Entidades (`Execucao`, `Produto`, `Servico`), regras puras de estoque, portas (repos)  | nada de Nest/infra (só `oficina-kit/core` e `auth`) |
| `application`    | Casos de uso, `EstoqueService`, porta `OsServiceGateway`                               | `domain`, `@nestjs/common`                          |
| `infrastructure` | Controllers + DTOs (class-validator/Swagger), repositórios DynamoDB, `OsServiceClient` | tudo                                                |

`src/shared/architecture.spec.ts` quebra o build se a regra de dependência for violada. Erros de domínio (`DomainError`) viram HTTP no `DomainExceptionFilter` do kit (400/403/404/409); nas rotas `/execucao/ordens`, o `409` leva `{ motivo }` (contrato interno) e OS Service indisponível vira **502**.

## Modelo de dados (DynamoDB)

Nome físico = `DYNAMODB_TABLE_PREFIX` + nome base (ou override completo `DYNAMODB_TABLE_<TABELA>`). A aplicação **assume que as tabelas existem**: em produção elas vêm do Terraform do `fase-04-soat-fiap-oficina-infra-db`; em dev/teste, do script `npm run dynamodb:create-tables`. As definições de referência (chaves e GSIs) ficam em [`src/dynamodb/definicoes-tabelas.ts`](src/dynamodb/definicoes-tabelas.ts).

| Tabela                  | Chave                   | GSIs                                                                           | Item                                                                                                                                                           |
| ----------------------- | ----------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `execucoes`             | `osId` (HASH)           | —                                                                              | `{ osId (= numeroOS), veiculoId, descricaoProblema, mecanicoId, status, diagnostico, servicos[], estoqueBaixado, finalizadaEm, createdAt, updatedAt, versao }` |
| `servicos`              | `servicoId` (HASH)      | —                                                                              | `{ servicoId, nome, descricao, precoBase, createdAt, updatedAt }`                                                                                              |
| `produtos`              | `produtoId` (HASH)      | —                                                                              | `{ produtoId, nome, sku, preco, quantidadeEstoque, createdAt, updatedAt }`                                                                                     |
| `movimentacoes_estoque` | `movimentacaoId` (HASH) | `osId-data-index` (`osId`+`data`), `produtoId-data-index` (`produtoId`+`data`) | `{ movimentacaoId, produtoId, tipo (ENTRADA \| BAIXA \| DEVOLUCAO), quantidade, osId, servicoId, data }`                                                       |

- `servicos[]` da execução é um **snapshot**: `{ servicoId, nome, preco, produtos: [{ produtoId, nome, sku, precoUnitario, quantidade }] }` — preço congelado no vínculo; editar/remover o catálogo não altera OS em andamento.
- `versao` = **lock otimista** (`ConditionExpression: versao = :lida`): duas operações concorrentes na mesma OS → a segunda recebe `409`.
- O GSI `osId-data-index` sustenta o rollback (todas as movimentações da OS); `produtoId-data-index`, o extrato por produto. Movimentações `ENTRADA` (sem OS) não têm `osId` e ficam fora do índice por OS.
- Listagens do catálogo usam `Scan` paginado (catálogos pequenos); unicidade de SKU é checada por `Scan` — para escalar, um GSI em `sku` no infra-db.

### Transações de estoque

Baixa, devolução e entrada usam **um único `TransactWriteItems`** (tudo ou nada) — [`dynamodb-estoque.repository.ts`](src/produto/infrastructure/dynamodb-estoque.repository.ts):

1. Um `Update` por **produto** em `produtos` com `SET quantidadeEstoque = quantidadeEstoque + :delta` (o delta é consolidado por produto, pois o DynamoDB não aceita duas operações no mesmo item numa transação — e um produto pode atender vários serviços da OS):
   - `ConditionExpression: attribute_exists(produtoId) AND quantidadeEstoque >= :necessario` na baixa → **o saldo nunca fica negativo**, mesmo com concorrência;
2. Um `Put` por movimentação em `movimentacoes_estoque` (uma por produto × serviço, para rastrear qual serviço consumiu a peça), com `attribute_not_exists(movimentacaoId)`.

Se qualquer condição falhar, nada é gravado; `CancellationReasons` (com `ReturnValuesOnConditionCheckFailure: ALL_OLD`) é traduzido para `EstoqueInsuficienteError` (409, com saldo disponível) ou `ProdutoNaoEncontradoError` (404). Antes da transação, o domínio (`validarSaldo`) já valida o saldo para dar a mensagem clara; a condição do banco é a garantia final. Limite: 100 itens por transação.

**Devolução (rollback)** é calculada pelo **líquido do histórico da OS** (Σ BAIXA − Σ DEVOLUCAO por produto × serviço): repetir o rollback não devolve em dobro (idempotente para retries do OS Service).

## Máquina de estados da execução

```
NA_FILA ──► ATRIBUIDA ──► EM_DIAGNOSTICO ──► AGUARDANDO_APROVACAO ──► EM_EXECUCAO ──► EXECUTADA
   │            │               │                    │
   └────────────┴───────────────┴────────────────────┴──► CANCELADA (DELETE do OS Service)
```

- `NA_FILA`: enfileirada pelo OS Service (`execucao.enfileirar`), ainda sem mecânico.
- `ATRIBUIDA`: mecânico assumiu/foi atribuído. O primeiro serviço vinculado move para `EM_DIAGNOSTICO`.
- Serviços e peças só podem ser alterados em `ATRIBUIDA`/`EM_DIAGNOSTICO`. `EXECUTADA` e `CANCELADA` são finais.

## Fluxo ponta a ponta (contrato RFC-0008)

O OS Service é o orquestrador da saga ([`docs/contratos/http-interno.md`](https://github.com/engineercodeprojects/fase-04-soat-fiap-oficina-os-service/blob/main/docs/contratos/http-interno.md)): ele **chama** a Execução nos comandos e a Execução **responde por callback** às ações do mecânico.

```mermaid
sequenceDiagram
  participant O as OS Service
  participant E as Execução
  participant D as DynamoDB
  participant M as Mecânico
  O->>E: POST /execucao/ordens {numeroOS, veiculoId, descricaoProblema}
  E->>D: Put execucoes (NA_FILA)
  E-->>O: 201 {numeroOS, posicaoFila} = execucao.enfileirada
  M->>E: POST /execucao/ordens/{n}/atribuir-mecanico
  M->>E: POST .../servicos  +  .../servicos/{servicoId}/produtos
  M->>E: POST /execucao/ordens/{n}/diagnostico {diagnostico}
  E->>D: Put execucoes (AGUARDANDO_APROVACAO, lock otimista)
  E->>D: TransactWriteItems (baixa produtos + movimentacoes BAIXA)
  E->>O: POST /ordens-servico/{n}/eventos  execucao.diagnostico-concluido
  alt orçamento reprovado / OS cancelada
    O->>E: DELETE /execucao/ordens/{n} {motivo}
    E->>D: Put execucoes (CANCELADA) + TransactWriteItems (DEVOLUCAO)
    E-->>O: 200 = execucao.reservas-liberadas
  else aprovado
    O->>E: POST /execucao/ordens/{n}/iniciar
    E-->>O: 200 {numeroOS} = execucao.iniciada (EM_EXECUCAO)
    M->>E: POST /execucao/ordens/{n}/finalizar
    E->>O: POST /ordens-servico/{n}/eventos  execucao.finalizada
  end
```

- A **baixa** acontece no fechamento do diagnóstico; a **devolução**, no `DELETE` do OS Service. `iniciar` só muda o status (as peças já foram baixadas).
- **Consistência:** cada operação grava primeiro o estado local (o lock otimista serializa operações concorrentes e impede baixa em dobro) e só então propaga. Se o callback falhar, o estado local é **restaurado** e as peças baixadas são **devolvidas**. Resposta: `409 { motivo }` se o OS recusou (4xx), `502` se ficou indisponível (timeout/rede/5xx após os retries).
- **Recusa de negócio** = `409 { statusCode, message, motivo }` em todas as rotas de `/execucao/ordens` (o OS lê `motivo` para montar `execucao.recusada`).
- **Idempotência:** `POST /execucao/ordens` por `numeroOS` (repetir devolve a mesma execução), `iniciar` repetido = `200`, `DELETE` repetido ou sem execução = `200` sem efeito (a devolução é o líquido do histórico).

## Integração com o OS Service

[`OsServiceClient`](src/execucao/infrastructure/os-service/os-service.client.ts) implementa a porta `OsServiceGateway` com o `ClienteHttpInterno` do kit (`HttpInternoModule` global):

| Callback `type`                  | Quando                                  | `data`                                                                                                                                                                                                                     |
| -------------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `execucao.diagnostico-concluido` | `POST /execucao/ordens/{n}/diagnostico` | `{ numeroOS, mecanicoId, diagnostico, itens[] }`. Cada item é `{ tipo: SERVICO\|PRODUTO, referenciaId, nome, quantidade, precoUnitario: "100.00", servicoId? }` (`servicoId` só nos PRODUTO, apontando para o serviço pai) |
| `execucao.finalizada`            | `POST /execucao/ordens/{n}/finalizar`   | `{ numeroOS, finalizadaEm }`                                                                                                                                                                                               |

- `POST {OS_SERVICE_URL}/ordens-servico/{numeroOS}/eventos` com o envelope `{ id (UUID v7), type, version: 1, occurredAt, producer: "execucao-service", data }` (`criarEnvelopeHttp`).
- Auth: JWT de serviço (`role: SERVICO`, `sub: execucao-service`, mesmo `JWT_SECRET`). Header `x-correlation-id` = número da OS.
- Retry com backoff (200 ms, 800 ms, 3 s) só para timeout/rede/5xx; 4xx não repete. `OS_SERVICE_TENTATIVAS` ajusta o número de tentativas.

## Rotas e roles

Todas exigem `Authorization: Bearer <JWT>` (HS256, claims `sub`, `cpf`, `role`, `iss`, `exp`, validado com `JWT_SECRET`/`JWT_ISSUER`). Os prefixos `/execucao` e `/catalogo` são os que o API Gateway roteia para este serviço. Um `MECANICO` só opera execuções atribuídas a ele (`sub` = `mecanicoId`), senão `403`.

| Método e rota                                                    | Roles                       | Descrição                                                                   |
| ---------------------------------------------------------------- | --------------------------- | --------------------------------------------------------------------------- |
| `POST /execucao/ordens`                                          | SERVICO, ADMIN              | `execucao.enfileirar` → `201 { numeroOS, posicaoFila }` / `409 { motivo }`  |
| `POST /execucao/ordens/:numeroOS/iniciar`                        | SERVICO, ADMIN              | `execucao.iniciar` → `EM_EXECUCAO`                                          |
| `DELETE /execucao/ordens/:numeroOS` `{ motivo? }`                | SERVICO, ADMIN              | `execucao.liberar-reservas`: devolve as peças e marca `CANCELADA`           |
| `GET /execucao/ordens` `?mecanicoId&status`                      | ADMIN, MECANICO             | Fila (MECANICO vê as suas e as `NA_FILA`)                                   |
| `GET /execucao/ordens/:numeroOS`                                 | ADMIN, MECANICO, SERVICO    | Detalhe + `valorTotal` (mão de obra + peças)                                |
| `POST /execucao/ordens/:numeroOS/atribuir-mecanico`              | ADMIN, MECANICO             | Tira da fila (MECANICO só atribui a si mesmo)                               |
| `POST /execucao/ordens/:numeroOS/servicos`                       | MECANICO, ADMIN             | Vincula N serviços do catálogo                                              |
| `DELETE /execucao/ordens/:numeroOS/servicos/:servicoId`          | MECANICO, ADMIN             | Desvincula serviço                                                          |
| `POST /execucao/ordens/:numeroOS/servicos/:servicoId/produtos`   | MECANICO, ADMIN             | Vincula peças ao serviço (um produto pode atender vários serviços)          |
| `POST /execucao/ordens/:numeroOS/diagnostico` `{ diagnostico }`  | MECANICO, ADMIN             | Baixa no estoque (transação) + callback `execucao.diagnostico-concluido`    |
| `POST /execucao/ordens/:numeroOS/finalizar`                      | MECANICO, ADMIN             | `EXECUTADA` + callback `execucao.finalizada`                                |
| `GET /execucao/ordens/:numeroOS/movimentacoes`                   | ADMIN, ESTOQUISTA, MECANICO | Movimentações de estoque da OS                                              |
| `POST /catalogo/servicos`, `PATCH/DELETE /catalogo/servicos/:id` | ADMIN                       | Catálogo de serviços                                                        |
| `GET /catalogo/servicos`, `GET /catalogo/servicos/:id`           | ADMIN, MECANICO, ESTOQUISTA |                                                                             |
| `POST /catalogo/produtos`, `PATCH /catalogo/produtos/:id`        | ADMIN, ESTOQUISTA           | Catálogo de produtos (saldo inicial na criação; o PATCH não altera o saldo) |
| `DELETE /catalogo/produtos/:id`                                  | ADMIN                       |                                                                             |
| `GET /catalogo/produtos`, `GET /catalogo/produtos/:id`           | ADMIN, ESTOQUISTA, MECANICO |                                                                             |
| `POST /catalogo/produtos/:id/entradas`                           | ADMIN, ESTOQUISTA           | Reposição (movimentação `ENTRADA`, transacional)                            |
| `GET /catalogo/produtos/:id/movimentacoes`                       | ADMIN, ESTOQUISTA           | Extrato do produto                                                          |
| `GET /health`, `/health/ready`, `/metrics`                       | público                     | Liveness, readiness (`DescribeTable`), Prometheus                           |

## Variáveis de ambiente

| Variável                                                                          | Obrigatória     | Descrição                                                                              |
| --------------------------------------------------------------------------------- | --------------- | -------------------------------------------------------------------------------------- |
| `JWT_SECRET`                                                                      | sim             | Segredo HS256 compartilhado com a auth-lambda (≥ 32 chars em produção)                 |
| `JWT_ISSUER`                                                                      | não             | `iss` esperado (ex.: `oficina-auth-lambda`)                                            |
| `OS_SERVICE_URL`                                                                  | sim em produção | Base do OS Service. Vazio em dev = propagação desligada (só log)                       |
| `OS_SERVICE_*`                                                                    | não             | Contrato configurável (tabela acima)                                                   |
| `AWS_REGION`                                                                      | não             | Default `us-east-1`                                                                    |
| `DYNAMODB_ENDPOINT`                                                               | não             | Endpoint do DynamoDB Local (`http://localhost:8000`). Vazio = AWS (credenciais do pod) |
| `DYNAMODB_TABLE_PREFIX`                                                           | não             | Prefixo dos nomes das tabelas (ex.: `oficina-`)                                        |
| `DYNAMODB_TABLE_EXECUCOES` / `_SERVICOS` / `_PRODUTOS` / `_MOVIMENTACOES_ESTOQUE` | não             | Nome completo de uma tabela (vence o prefixo)                                          |
| `PORT`, `LOG_LEVEL`, `DD_*`                                                       | não             | Porta (3002), log, APM                                                                 |

Veja [`.env.example`](.env.example).

## Rodando localmente (DynamoDB Local)

```bash
cp .env.example .env               # ajuste JWT_SECRET
npm ci
docker compose up -d dynamodb      # DynamoDB Local em :8000 (dados em volume)
npm run dynamodb:create-tables     # cria as 4 tabelas com o prefixo do .env (idempotente)
npm run start:dev                  # http://localhost:3002/api/docs
# opcional: UI do DynamoDB em http://localhost:8001
docker compose --profile admin up -d dynamodb-admin
```

`npm run docker:up` faz os dois primeiros passos. O script `create-tables` recusa rodar sem `DYNAMODB_ENDPOINT` (proteção contra criar tabelas na AWS; force com `ALLOW_AWS_CREATE_TABLES=true`).

Token de teste (mesmo segredo do `.env`):

```bash
export JWT_SECRET=...   # o mesmo do .env
ADMIN=$(node -e "console.log(require('@guilhermeqmaia/oficina-kit/testing').mintToken({sub:'adm-1',role:'ADMIN'}))")
MEC=$(node -e "console.log(require('@guilhermeqmaia/oficina-kit/testing').mintToken({sub:'mec-1',role:'MECANICO'}))")
EST=$(node -e "console.log(require('@guilhermeqmaia/oficina-kit/testing').mintToken({sub:'est-1',role:'ESTOQUISTA'}))")
SVC=$(node -e "console.log(require('@guilhermeqmaia/oficina-kit/testing').mintServiceToken({servico:'os-service'}))")
API=http://localhost:3002
```

## Exemplos de curl

```bash
# Catálogo
curl -s -X POST $API/catalogo/servicos -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' \
  -d '{"nome":"Troca de oleo","descricao":"Oleo + filtro","precoBase":120}'
curl -s $API/catalogo/servicos -H "Authorization: Bearer $MEC"
curl -s -X PATCH $API/catalogo/servicos/$SERVICO_ID -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' -d '{"precoBase":130}'
curl -s -X DELETE $API/catalogo/servicos/$SERVICO_ID -H "Authorization: Bearer $ADMIN"

curl -s -X POST $API/catalogo/produtos -H "Authorization: Bearer $EST" -H 'Content-Type: application/json' \
  -d '{"nome":"Oleo 5W30 1L","sku":"OL-5W30","preco":45.9,"quantidadeEstoque":10}'
curl -s -X POST $API/catalogo/produtos/$PRODUTO_ID/entradas -H "Authorization: Bearer $EST" -H 'Content-Type: application/json' -d '{"quantidade":5}'
curl -s $API/catalogo/produtos/$PRODUTO_ID/movimentacoes -H "Authorization: Bearer $EST"

# OS Service enfileira a OS-2026-0042
curl -s -X POST $API/execucao/ordens -H "Authorization: Bearer $SVC" -H 'Content-Type: application/json' \
  -d '{"numeroOS":"OS-2026-0042","veiculoId":"vei-1","descricaoProblema":"Barulho ao frear"}'

# Mecânico assume e diagnostica
N=OS-2026-0042
curl -s -X POST $API/execucao/ordens/$N/atribuir-mecanico -H "Authorization: Bearer $MEC" -H 'Content-Type: application/json' -d '{"mecanicoId":"mec-1"}'
curl -s -X POST $API/execucao/ordens/$N/servicos -H "Authorization: Bearer $MEC" -H 'Content-Type: application/json' -d "{\"servicoIds\":[\"$SERVICO_ID\"]}"
curl -s -X POST $API/execucao/ordens/$N/servicos/$SERVICO_ID/produtos -H "Authorization: Bearer $MEC" -H 'Content-Type: application/json' \
  -d "{\"produtos\":[{\"produtoId\":\"$PRODUTO_ID\",\"quantidade\":4}]}"
curl -s -X POST $API/execucao/ordens/$N/diagnostico -H "Authorization: Bearer $MEC" -H 'Content-Type: application/json' \
  -d '{"diagnostico":"Oleo vencido"}'                      # baixa no estoque + callback
curl -s $API/execucao/ordens/$N -H "Authorization: Bearer $MEC"   # valorTotal = orçamento

# Orçamento reprovado / OS cancelada (OS Service)
curl -s -X DELETE $API/execucao/ordens/$N -H "Authorization: Bearer $SVC" -H 'Content-Type: application/json' -d '{"motivo":"Orcamento reprovado"}'

# ...ou aprovado
curl -s -X POST $API/execucao/ordens/$N/iniciar -H "Authorization: Bearer $SVC"
curl -s -X POST $API/execucao/ordens/$N/finalizar -H "Authorization: Bearer $MEC"   # callback execucao.finalizada
curl -s "$API/execucao/ordens?status=EXECUTADA" -H "Authorization: Bearer $ADMIN"
```

## Testes

```bash
npm run test:unit:cov      # domínio + casos de uso + OsServiceClient (gate 80%)
npm run test:integration   # e2e: AppModule real + DynamoDB Local + OS Service fake (recebe os callbacks)
```

- **Unitários:** máquina de estados, agregado `Execucao`, validação de saldo, planejamento de baixa/devolução (idempotência), casos de uso com fakes (compensações quando o callback falha, idempotência, fila), `OsServiceClient` contra um servidor HTTP fake (envelope, JWT, correlação, retry, 4xx/5xx), filtro `409 { motivo }`.
- **e2e** (`*.e2e.spec.ts`): sobe `amazon/dynamodb-local` via testcontainers (ou usa `DYNAMODB_ENDPOINT` se definido, ex. `docker compose up -d dynamodb`), cria as tabelas com prefixo próprio e cobre: fluxo completo do contrato (enfileirar → diagnóstico → iniciar → finalizar, com os callbacks verificados), veículo duplicado, estoque insuficiente (nada baixado), `DELETE` idempotente, OS Service fora do ar (502 + devolução), roles por rota, CRUDs.

## Deploy

- `Dockerfile` multi-stage; sem migrações no boot (tabelas são do Terraform).
- `k8s/` (kustomize) + overlay `k8s-aws/` (EKS). O ConfigMap define `DYNAMODB_TABLE_PREFIX`/`AWS_REGION`/`OS_SERVICE_URL`; o único Secret é `JWT_SECRET`. Acesso ao DynamoDB pelas credenciais do nó/pod (`LabRole` no AWS Academy).
- **Pendência no `infra-db`:** o `dynamodb.tf` atual cria uma tabela single-table `oficina-execucao` (PK/SK + GSIs, RFC-0007). Este serviço usa as 4 tabelas acima — o Terraform precisa criá-las (chaves e GSIs de `src/dynamodb/definicoes-tabelas.ts`) com o mesmo prefixo do ConfigMap.

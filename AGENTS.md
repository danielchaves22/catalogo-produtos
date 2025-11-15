# AGENTS.md

Instruções para agentes e colaboradores trabalharem neste repositório (monorepo) de Catálogo de Produtos.

## Escopo e Prioridade
- Escopo: este arquivo se aplica a todo o repositório, incluindo `backend/` e `frontend/`.
- Prioridade: siga estas diretrizes ao criar/editar arquivos. Se houver outro `AGENTS.md` em subpastas, o mais profundo prevalece para arquivos naquela subárvore.
- Objetivo: manter consistência, segurança e previsibilidade durante desenvolvimento, testes e refatorações.

## Stack e Requisitos
- Node.js 18+ e npm.
- Banco de dados MySQL acessível (variáveis no `backend/.env`).
- Frontend em Next.js 15 (pasta `frontend/`).
- Backend em Node/Express + TypeScript + Prisma (pasta `backend/`).
- Docker opcional via `docker-compose.yml` (não inclui banco por padrão).

## Estrutura do Monorepo
- `backend/`: API REST (Express), validações com `zod`, ORM Prisma, testes com Jest.
- `frontend/`: Next.js (Pages Router), componentes de UI reutilizáveis, hooks e contexts.
- `docs/`: guias e SQL auxiliares.
- Scripts úteis na raiz (`package.json`):
  - `npm run install:all`
  - `npm run build:all`
  - `npm run start:backend`
  - `npm run start:frontend`

## Padrões Gerais
- Idioma: use nomes de domínio em PT-BR conforme o código existente; termos técnicos e utilitários podem estar em inglês.
- Nomes de arquivo TypeScript: `kebab-case` (ex.: `produto.service.ts`).
- Componentes React: arquivo e componente em `PascalCase` (ex.: `OperadorEstrangeiroCard.tsx`).
- Variáveis/funções: `camelCase`. Classes/Interfaces/Types: `PascalCase`.
- Imports relativos; evite caminhos absolutos se não houver configuração de alias.
- Não introduzir formatadores/linters sem alinhamento prévio. Siga o estilo existente.
- Não expor segredos em código, logs ou exemplos. Use `.env`.

## Backend (Express + Prisma)
- Camadas e responsabilidades:
  - `routes/`: define endpoints e conecta middleware/validadores aos controllers.
  - `validators/`: esquemas `zod` (ex.: `produto.validator.ts`). Use `validate.middleware.ts`.
  - `controllers/`: orquestram requisições, chamam serviços e retornam respostas.
  - `services/`: regras de negócio e acesso a dados via Prisma (`utils/prisma.ts`).
  - `utils/`: utilitários (JWT, logger, crypto, etc.).
- Validação: centralize em `validators/*` e aplique via `validate.middleware.ts`.
- Autenticação/Autorização: use `auth.middleware.ts` e `policies/permission.policy.ts`.
- Erros: tipar/normalizar com `types/*` (`validation-error.ts`, `prisma-error.ts`). Logar com `utils/logger.ts`.
- Documentação: atualizar `swagger.ts` ao adicionar/alterar endpoints relevantes.
- Prisma:
  - Não editar artefatos gerados. Rode `prisma generate` quando necessário.
  - Não utilizamos migrations do Prisma. Para alterações de DDL, atualize os scripts SQL da aplicação e registre a mudança em um novo arquivo em `docs/sql`.
- Testes (Jest):
  - Preferir testes de serviço e controller em `__tests__/` próximos aos módulos.
  - Evitar dependência real de rede; mockar integrações externas.
- Padrões de resposta:
  - Sucesso: status HTTP adequado + payload consistente.
  - Falha: status adequado + objeto de erro padronizado; não vazar detalhes sensíveis.

### Fluxo para nova rota (exemplo)
1) Criar `validators/minha-rota.validator.ts` (zod schemas).
2) Adicionar handler em `controllers/minha-rota.controller.ts`.
3) Implementar regra em `services/minha-rota.service.ts` (usar Prisma via `utils/prisma`).
4) Expor endpoint em `routes/minha-rota.routes.ts`, conectando validadores e auth.
5) Atualizar `swagger.ts` e adicionar testes de serviço/controller.

## Frontend (Next.js)
- Estrutura:
  - Pages Router em `pages/` (rotas como arquivos). Use `useProtectedRoute` para rotas protegidas.
  - UI reutilizável em `components/ui/*` e domínios em `components/*`.
  - Estados globais em `contexts/*`.
  - Helpers/libs em `lib/*` (ex.: `api.ts`, `validation.ts`, `masks.ts`).
- Estilo: TailwindCSS (config em `tailwind.config.js` e `styles/globals.css`). Evitar CSS in-line pesado.
- Acesso à API: use `lib/api.ts` (Axios). Respeitar `NEXT_PUBLIC_API_URL`.
- Componentes: funções puras, sem efeitos colaterais fora de hooks. Hooks customizados com prefixo `use`.
- Acessibilidade: rotular inputs, botões e elementos interativos.
- Testes: há testes utilitários mínimos; não adicionar frameworks de teste sem alinhamento.

### Fluxo para nova página (exemplo)
1) Criar arquivo em `pages/minha-pagina.tsx`.
2) Montar UI com componentes de `components/ui/*` quando aplicável.
3) Consumir API via `lib/api.ts`; tratar erros com `hooks/useApiErrors`.
4) Proteger rota quando necessário com `hooks/useProtectedRoute`.

## Variáveis de Ambiente
- Backend (`backend/.env.example`): `DATABASE_URL`, `PORT`, `JWT_SECRET`, `CATALOG_SCHEMA_NAME`, credenciais AWS/SISCOMEX quando aplicável.
- Frontend (`frontend/.env.example`): `NEXT_PUBLIC_API_URL` (ex.: `http://localhost:3000/api/v1`).
- Nunca cometer `.env` ao repositório. Fornecer `.env.example` atualizado.

## Como Executar
- Local:
  - `npm run install:all`
  - Backend dev: `npm run start:backend` (porta 3000)
  - Frontend dev: `npm run start:frontend` (porta 3001)
- Docker:
  - Preparar `backend/.env.docker` e `frontend/.env.docker`.
  - `docker-compose up -d`

## Banco de Dados
- MySQL necessário e acessível ao backend.
 - Alinhar mudanças de schema e refletir nos scripts SQL da aplicação (e acrescentar arquivo incremental em `docs/sql`).
- Evitar queries ad-hoc fora dos serviços; preferir Prisma.

## Migrations
As migrations do Prisma não são utilizadas. Caso haja alteração na DDL do banco de dados, atualizar o arquivo de SQL da aplicação e criar um arquivo novo apenas com a alteração da implementação respectiva, como vem sendo feito na pasta `docs`.

## Observabilidade
- Métricas disponíveis via `prom-client`. Expor/atualizar métricas apenas quando fizer sentido para o domínio.
- Logs estruturados com `winston` em `utils/logger.ts`.

## O que Evitar
- Alterar artefatos gerados (Prisma client).
- Acessar banco diretamente em controllers/middlewares.
- Vazar segredos em logs ou payloads.
- Mudar contratos públicos (rotas/DTOs) sem alinhar backend/frontend.

## Dúvidas Rápidas
- Endpoints API: veja `backend/src/routes/*` e `swagger.ts`.
- Permissões/autorização: `backend/src/constants/permissoes.ts` e `policies/permission.policy.ts`.
- Upload/Storage: `services/storage.*` (S3 e local) e `docs/STORAGE_S3.md`.
  - Sempre utilizar `storageFactory()` para determinar o provedor adequado.
  - Em novos fluxos de upload, respeitar a regra: ambiente local salva em disco (`LocalStorageProvider`) e demais ambientes utilizam S3 (`S3StorageProvider`).
  - Registre metadados de expiração ou caminhos no job/entidade correspondente em vez de persistir blobs diretamente no banco.

—
Se algo não estiver coberto aqui, siga o padrão dos arquivos existentes na mesma pasta e mantenha as mudanças mínimas, coesas e testáveis.

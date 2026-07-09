# Módulo Operador Estrangeiro

## Visão Geral

O módulo **Operador Estrangeiro** permite o cadastro e gerenciamento de fabricantes/produtores estrangeiros conforme especificações do Portal Único Siscomex (PUCOMEX). Este módulo é essencial para operações de importação, permitindo a identificação precisa dos fabricantes dos produtos importados.

Cada operador está associado a um catálogo específico (`catalogo_id`). O superusuário autenticado somente visualiza e gerencia operadores pertencentes aos seus catálogos.

## Funcionalidades

### ✅ Implementadas

- **CRUD Completo**: Criar, listar, editar e desativar operadores estrangeiros
- **Sistema de Versões**: Controle de versões conforme padrão SISCOMEX
- **Busca Avançada**: Por nome, TIN, país ou cidade
- **Identificações Adicionais**: Suporte para DUNS, LEI, EIN, etc.
- **Validações**: Validação de dados conforme regras do SISCOMEX
- **Interface Responsiva**: Design adaptado para desktop e mobile

### 🔄 Planejadas

- **Integração SISCOMEX**: Sincronização com API do Portal Único
- **Importação em Lote**: Upload de arquivo JSON/CSV
- **Exportação**: Download dos dados em diversos formatos
- **Auditoria**: Log de alterações e histórico

## Estrutura do Banco de Dados

### Tabelas Principais

#### `operador_estrangeiro`
- **id**: Identificador único interno
- **catalogo_id**: Referência para o catálogo ao qual o operador pertence
- **pais_codigo**: Referência para tabela `pais`
- **tin**: Trader Identification Number (formato: BR12345678000101)
- **nome**: Razão social do operador estrangeiro
- **email**: Email de contato
- **codigo_interno**: Código interno da empresa importadora
- **numero**: Identificador interno aleatório gerado pelo sistema
- **logradouro**: Endereço completo
- **cidade**: Cidade do operador
- **subdivisao_codigo**: Estado/província (referência para `subdivisao`)
- **codigo_postal**: CEP/ZIP Code
- **codigo**: Código gerado pelo SISCOMEX (quando integrado)
- **versao**: Controle de versões
- **situacao**: RASCUNHO | ATIVADO | DESATIVADO
- **data_inclusao**: Data de criação
- **data_ultima_alteracao**: Data da última modificação
- **data_referencia**: Para inclusões retroativas

#### Situações do Operador
- **RASCUNHO** (🟡 `#e4a835`): Operador em edição que ainda não foi transmitido ao PUCOMEX
- **ATIVADO** (🟢 `#27f58a`): Operador transmitido ao PUCOMEX
- **DESATIVADO** (🔴 `#f2545f`): Operador desativado no PUCOMEX

#### `identificacao_adicional`
- **id**: Identificador único
- **operador_estrangeiro_id**: Referência para operador
- **numero**: Número da identificação (ex: DUNS, LEI)
- **agencia_emissora_codigo**: Referência para `agencia_emissora`

### Tabelas Auxiliares

#### `pais`
- **codigo**: Código ISO (ex: BR, US, CN)
- **sigla**: Sigla do país
- **nome**: Nome completo do país

#### `subdivisao`
- **codigo**: Código da subdivisão (ex: BR-SP, US-CA)
- **sigla**: Sigla da subdivisão
- **nome**: Nome completo (ex: São Paulo, California)

#### `agencia_emissora`
- **codigo**: Código da agência (ex: DUNS, LEI, EIN)
- **sigla**: Sigla da agência
- **nome**: Nome completo da agência

## API Endpoints

### Operadores Estrangeiros

```
GET    /api/v1/operadores-estrangeiros              # Listar todos
GET    /api/v1/operadores-estrangeiros/:id          # Buscar por ID
GET    /api/v1/operadores-estrangeiros/buscar-por-tin/:tin  # Buscar por TIN
POST   /api/v1/operadores-estrangeiros              # Criar novo
PUT    /api/v1/operadores-estrangeiros/:id          # Atualizar (nova versão)
DELETE /api/v1/operadores-estrangeiros/:id          # Desativar
```

### Dados Auxiliares

```
GET    /api/v1/operadores-estrangeiros/aux/paises            # Lista de países
GET    /api/v1/operadores-estrangeiros/aux/subdivisoes       # Lista de subdivisões
GET    /api/v1/operadores-estrangeiros/aux/agencias-emissoras # Lista de agências
GET    /api/v1/operadores-estrangeiros/aux/catalogos         # Lista de catálogos do superusuário
```

## Componentes Frontend

### Páginas

- **`/operadores-estrangeiros`**: Lista paginada com filtros
- **`/operadores-estrangeiros/novo`**: Formulário de criação
- **`/operadores-estrangeiros/[id]`**: Formulário de edição

### Componentes Reutilizáveis

- **`OperadorEstrangeiroCard`**: Card para exibição de detalhes
- **`OperadorEstrangeiroSelector`**: Modal de seleção de operadores
- **`useOperadorEstrangeiro`**: Hook para operações CRUD

### Filtros Disponíveis

- **Busca por texto**: Nome, TIN, país ou cidade
- **Situação**: Rascunho, Ativado, Desativado
- **País**: Filtro por país de origem

## Regras de Negócio

### TIN (Trader Identification Number)

O TIN segue o padrão internacional da OMA (Organização Mundial de Aduanas):
- **Formato**: Código do país (2 letras) + Identificador nacional
- **Exemplo Brasil**: BR12345678000101 (BR + CNPJ)
- **Exemplo EUA**: US123456789 (US + EIN)
- **Exemplo China**: CN91110000123456789A (CN + identificador local)

### Sistema de Versões

- **Nova Versão**: Para atualizações em operadores ativos
- **Retificação**: Para correções durante processo de despacho
- **Desativação**: Remove operador de uso futuro mas mantém histórico

### Identificações Adicionais

Suporte para múltiplas identificações por operador:
- **DUNS**: Dun & Bradstreet Number
- **LEI**: Legal Entity Identifier
- **EIN**: Employer Identification Number (EUA)
- **VAT**: Value Added Tax Number (Europa)
- **E outros**: Conforme necessidade

## Instalação e Configuração

### 1. Executar Migrations

```bash
# No diretório do backend
npm run prisma:generate
# Executar scripts SQL manualmente ou via migration tool
```

### 2. Popular Dados Iniciais

```bash
# Executar o script SQL de dados iniciais
mysql -u usuario -p database < scripts_dados_iniciais_operador_estrangeiro.sql
```

### 3. Configurar Variáveis de Ambiente

```bash
# Adicionar ao .env do backend
SISCOMEX_API_URL=https://portalunico.siscomex.gov.br/catp/api
SISCOMEX_AUTH_URL=https://portalunico.siscomex.gov.br/portal/api/autenticar
SISCOMEX_CERT_PATH=/path/to/certificado.pem
SISCOMEX_KEY_PATH=/path/to/chave_privada.pem
```

### 4. Instalar Dependências

```bash
# Backend
cd backend
npm install axios

# Frontend (se necessário)
cd ../frontend
npm install
```

## Uso

### Criar Novo Operador

1. Acesse **Operadores Estrangeiros** no menu
2. Clique em **"Novo Operador"**
3. Preencha os dados obrigatórios:
   - CNPJ Raiz da empresa responsável
   - País do fabricante/produtor
   - Nome do operador
4. Adicione identificações adicionais se necessário
5. Salve o operador

### Buscar Operadores

- **Por TIN**: Digite o TIN completo (ex: BR12345678000101)
- **Por nome**: Busca parcial no nome do operador
- **Por país**: Filtre por país de origem
- **Por cidade**: Busca na cidade do operador

### Integração com Produtos

Os operadores estrangeiros podem ser vinculados aos produtos do catálogo, permitindo:
- Rastreabilidade da origem dos produtos
- Compliance com regulamentações de importação
- Facilitar processos de certificação e auditoria

## Troubleshooting

### Problemas Comuns

**Erro ao carregar países/subdivisões:**
- Verificar se os dados iniciais foram inseridos
- Verificar conexão com banco de dados

**TIN inválido:**
- Verificar formato: Código país (2 letras) + identificador
- Verificar se TIN já não está cadastrado (deve ser único)

**Erro de validação:**
- Verificar campos obrigatórios: CNPJ Raiz, País, Nome
- Verificar formato do email se preenchido

### Logs e Debug

```bash
# Logs do backend (desenvolvimento)
cd backend
npm run dev

# Logs de erro são salvos via Winston
# Verificar console do navegador para erros de frontend
```

## Roadmap

### Versão 2.0
- [ ] Integração completa com API SISCOMEX
- [ ] Sincronização automática de dados
- [ ] Importação/Exportação em lote
- [ ] Relatórios gerenciais
- [ ] API de integração para sistemas terceiros

### Versão 2.1
- [ ] Geolocalização de operadores
- [ ] Integração com APIs de compliance internacional
- [ ] Dashboard analytics
- [ ] Mobile app

## Contribuição

Para contribuir com o módulo:

1. Criar branch específica: `feature/operador-estrangeiro-nova-funcionalidade`
2. Seguir padrões de código estabelecidos
3. Adicionar testes para novas funcionalidades
4. Atualizar documentação
5. Submeter Pull Request

## Suporte

Para dúvidas ou problemas:
- Consultar documentação do SISCOMEX
- Verificar logs da aplicação
- Contactar equipe de desenvolvimento

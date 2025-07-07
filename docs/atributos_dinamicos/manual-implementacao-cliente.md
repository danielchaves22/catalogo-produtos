# Manual de Integração - Sistema de Atributos Dinâmicos

Este documento orienta como integrar o sistema de atributos dinâmicos ao seu aplicativo.

## Sumário

1. [Visão Geral](#1-visão-geral)
2. [Arquitetura de Integração](#2-arquitetura-de-integração)
3. [Estrutura do Banco de Dados](#3-estrutura-do-banco-de-dados)
4. [Fluxo de Sincronização](#4-fluxo-de-sincronização)
5. [Renderização de Formulários Dinâmicos](#5-renderização-de-formulários-dinâmicos)
6. [Gestão de Produtos](#6-gestão-de-produtos)
7. [Validações e Regras de Negócio](#7-validações-e-regras-de-negócio)
8. [Tratamento de Mudanças de Estrutura](#8-tratamento-de-mudanças-de-estrutura)
9. [Estratégias de Cache](#9-estratégias-de-cache)
10. [Monitoramento e Manutenção](#10-monitoramento-e-manutenção)
11. [Migração e Rollout](#11-migração-e-rollout)
12. [Considerações de Performance](#12-considerações-de-performance)

---

## 1. Visão Geral

### 1.1 Objetivo da Integração

Este manual descreve como integrar um sistema de atributos dinâmicos a uma aplicação existente de gestão de produtos. O sistema permite que características de produtos sejam definidas dinamicamente baseadas em seu código NCM (Nomenclatura Comum do Mercosul), sem necessidade de alterações no schema do banco de dados.

### 1.2 Benefícios da Integração

- **Flexibilidade**: Novos atributos sem mudanças estruturais
- **Conformidade**: Atende requisitos regulatórios que mudam frequentemente
- **Reutilização**: Integra com dados existentes do servidor de atributos
- **Manutenibilidade**: Centraliza regras de negócio complexas
- **Escalabilidade**: Suporta milhares de combinações NCM/atributo

### 1.3 Componentes Principais

1. **Cache Local**: Armazena estruturas de atributos para performance
2. **Sincronizador**: Mantém dados atualizados com o servidor
3. **Renderizador**: Gera formulários dinamicamente
4. **Validador**: Aplica regras de negócio
5. **Persistência**: Armazena valores junto aos produtos

---

## 2. Arquitetura de Integração

### 2.1 Visão de Alto Nível

```
┌─────────────────────────────────────────────────────────────┐
│                    Aplicação Existente                      │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │   UI Layer  │  │ Business     │  │  Data Access     │  │
│  │             │  │ Logic        │  │  Layer           │  │
│  └──────┬──────┘  └──────┬───────┘  └────────┬─────────┘  │
│         │                 │                    │            │
│  ┌──────┴─────────────────┴───────────────────┴─────────┐  │
│  │              Novo Módulo de Atributos                 │  │
│  │  ┌────────────┐  ┌─────────────┐  ┌───────────────┐  │  │
│  │  │   Cache    │  │    Sync     │  │  Validation   │  │  │
│  │  │  Service   │  │   Service   │  │   Service     │  │  │
│  │  └────────────┘  └─────────────┘  └───────────────┘  │  │
│  └───────────────────────────────────────────────────────┘  │
│                              │                               │
└──────────────────────────────┼───────────────────────────────┘
                               │
                    ┌──────────┴──────────┐
                    │  Servidor Atributos │
                    │      (Externa)       │
                    └─────────────────────┘
```

### 2.2 Pontos de Integração

#### 2.2.1 Interface de Usuário
- Adicionar componente de formulário dinâmico na tela de cadastro/edição
- Incluir campo de seleção de NCM (se não existir)
- Implementar alertas para mudanças de estrutura

#### 2.2.2 Camada de Negócio
- Interceptar operações de salvamento para incluir validações
- Adicionar lógica de snapshot de estrutura
- Implementar regras condicionais

#### 2.2.3 Camada de Dados
- Criar novas tabelas de cache (ncm_cache e atributos_cache)
- Escolher estratégia de integração:
  - **OPÇÃO 1**: Criar tabela separada (produto_atributos) - Mais seguro
  - **OPÇÃO 2**: Adicionar colunas na tabela existente - Mais integrado
- Adicionar índices para queries JSON

### 2.3 Dependências Mínimas

- Banco de dados com suporte a JSON (MySQL 5.7+, PostgreSQL 9.3+)
- Cliente HTTP para comunicação com servidor
- Sistema de cache (memória ou Redis)
- Scheduler para sincronização periódica

---

## 3. Estrutura do Banco de Dados

### 3.1 Script SQL de Criação

```sql
-- =====================================================
-- IMPORTANTE: Este script oferece DUAS OPÇÕES de integração
-- 
-- OPÇÃO 1: Criar tabela separada (produto_atributos)
--   - Mais segura, não altera sistema existente
--   - Recomendada para começar
-- 
-- OPÇÃO 2: Adicionar colunas na sua tabela de produtos
--   - Mais integrada, mas altera estrutura existente
--   - Use após validar com Opção 1
-- =====================================================

-- =====================================================
-- Tabelas de CACHE (necessárias para ambas opções)
-- =====================================================

-- Tabela: ncm_cache
-- Descrição: Cache local de NCMs para evitar consultas repetidas
-- -----------------------------------------------------
CREATE TABLE ncm_cache (
  codigo VARCHAR(8) PRIMARY KEY,
  descricao VARCHAR(255) NOT NULL,
  unidade_medida VARCHAR(10),
  data_sincronizacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_descricao (descricao),
  INDEX idx_data_sync (data_sincronizacao)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Cache de NCMs sincronizados do servidor';

-- Tabela: atributos_cache
-- Descrição: Cache de estruturas de atributos por NCM/modalidade
-- -----------------------------------------------------
CREATE TABLE atributos_cache (
  id INT PRIMARY KEY AUTO_INCREMENT,
  ncm_codigo VARCHAR(8) NOT NULL,
  modalidade ENUM('IMPORTACAO', 'EXPORTACAO') NOT NULL,
  estrutura_json JSON NOT NULL COMMENT 'Estrutura completa dos atributos',
  hash_estrutura VARCHAR(64) COMMENT 'Hash MD5 para detectar mudanças',
  data_sincronizacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_ncm_modalidade (ncm_codigo, modalidade),
  FOREIGN KEY (ncm_codigo) REFERENCES ncm_cache(codigo) ON DELETE CASCADE,
  INDEX idx_modalidade (modalidade),
  INDEX idx_data_sync (data_sincronizacao)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Cache de estruturas de atributos';

-- =====================================================
-- OPÇÃO 1: Criar nova tabela de produtos com atributos
-- Use esta opção se preferir manter os atributos dinâmicos
-- separados do seu sistema atual de produtos
-- =====================================================
CREATE TABLE produto_atributos (
  id INT PRIMARY KEY AUTO_INCREMENT,
  produto_id INT NOT NULL COMMENT 'ID do produto no seu sistema',
  ncm_codigo VARCHAR(8) NOT NULL,
  modalidade ENUM('IMPORTACAO', 'EXPORTACAO') NOT NULL,
  valores_atributos_json JSON COMMENT 'Valores preenchidos dos atributos',
  estrutura_snapshot_json JSON COMMENT 'Snapshot da estrutura no momento do cadastro',
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_produto (produto_id),
  INDEX idx_ncm_modalidade (ncm_codigo, modalidade),
  FOREIGN KEY (ncm_codigo) REFERENCES ncm_cache(codigo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Atributos dinâmicos dos produtos';

-- =====================================================
-- OPÇÃO 2: Adicionar colunas na tabela existente
-- Use esta opção se preferir integrar diretamente
-- ATENÇÃO: Substituir 'sua_tabela_produto' pelo nome real
-- =====================================================
/*
ALTER TABLE sua_tabela_produto
ADD COLUMN ncm_codigo VARCHAR(8),
ADD COLUMN modalidade ENUM('IMPORTACAO', 'EXPORTACAO'),
ADD COLUMN valores_atributos_json JSON COMMENT 'Valores preenchidos dos atributos',
ADD COLUMN estrutura_snapshot_json JSON COMMENT 'Snapshot da estrutura no momento do cadastro',
ADD INDEX idx_ncm_modalidade (ncm_codigo, modalidade),
ADD FOREIGN KEY (ncm_codigo) REFERENCES ncm_cache(codigo);
*/

-- =====================================================
-- Queries úteis para consultas e relatórios
-- Adapte conforme a opção escolhida (tabela separada ou integrada)
-- =====================================================

-- Query 1: Identificar produtos com estrutura potencialmente desatualizada
-- Uso: Executar periodicamente para identificar produtos que precisam revisão
/*
-- Para OPÇÃO 1 (tabela separada):
SELECT 
    pa.id,
    pa.produto_id,
    pa.ncm_codigo,
    pa.modalidade,
    pa.atualizado_em,
    ac.data_sincronizacao as estrutura_atualizada_em
FROM produto_atributos pa
INNER JOIN atributos_cache ac ON 
    pa.ncm_codigo = ac.ncm_codigo 
    AND pa.modalidade = ac.modalidade
WHERE pa.estrutura_snapshot_json IS NOT NULL
    AND MD5(pa.estrutura_snapshot_json) != ac.hash_estrutura;

-- Para OPÇÃO 2 (tabela integrada):
-- Substituir 'sua_tabela_produto' pelo nome real
SELECT 
    p.id,
    p.codigo,  -- Adaptar campos conforme sua tabela
    p.ncm_codigo,
    p.modalidade
FROM sua_tabela_produto p
INNER JOIN atributos_cache ac ON 
    p.ncm_codigo = ac.ncm_codigo 
    AND p.modalidade = ac.modalidade
WHERE p.estrutura_snapshot_json IS NOT NULL
    AND MD5(p.estrutura_snapshot_json) != ac.hash_estrutura;
*/

-- Query 2: Estatísticas de uso de NCMs
-- Uso: Relatórios gerenciais e priorização de sincronização
/*
-- Para OPÇÃO 1 (tabela separada):
SELECT 
    n.codigo as ncm,
    n.descricao,
    COUNT(DISTINCT pa.produto_id) as total_produtos,
    MAX(pa.atualizado_em) as ultimo_uso,
    CASE 
        WHEN n.data_sincronizacao < DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 'CACHE_ANTIGO'
        ELSE 'CACHE_RECENTE'
    END as status_cache
FROM ncm_cache n
LEFT JOIN produto_atributos pa ON n.codigo = pa.ncm_codigo
GROUP BY n.codigo, n.descricao, n.data_sincronizacao
ORDER BY total_produtos DESC;
*/

-- Query 3: NCMs mais utilizados sem cache
-- Uso: Identificar NCMs que precisam ser sincronizados
/*
-- Para OPÇÃO 1 (tabela separada):
SELECT 
    pa.ncm_codigo,
    COUNT(DISTINCT pa.produto_id) as total_uso
FROM produto_atributos pa
LEFT JOIN ncm_cache nc ON pa.ncm_codigo = nc.codigo
WHERE nc.codigo IS NULL
GROUP BY pa.ncm_codigo
ORDER BY total_uso DESC
LIMIT 50;
*/

-- =====================================================
-- Índices adicionais para performance com JSON
-- =====================================================

-- Para MySQL 5.7+ (índices funcionais em campos JSON)
-- Exemplo: índice no campo 'pais_origem' dentro do JSON
-- ALTER TABLE produto 
-- ADD COLUMN pais_origem_idx VARCHAR(100) AS 
--   (JSON_UNQUOTE(JSON_EXTRACT(valores_atributos_json, '$.pais_origem'))) STORED,
-- ADD INDEX idx_pais_origem (pais_origem_idx);

-- Para PostgreSQL (índices GIN)
-- CREATE INDEX idx_valores_gin ON produto USING GIN (valores_atributos_json);
```

### 3.2 Dicionário de Dados

#### Tabela: ncm_cache
| Campo | Tipo | Descrição |
|-------|------|-----------|
| codigo | VARCHAR(8) | Código NCM de 8 dígitos |
| descricao | VARCHAR(255) | Descrição do NCM |
| unidade_medida | VARCHAR(10) | Unidade de medida padrão |
| data_sincronizacao | TIMESTAMP | Última atualização do cache |

#### Tabela: atributos_cache
| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | INT | Identificador único |
| ncm_codigo | VARCHAR(8) | Referência ao NCM |
| modalidade | ENUM | IMPORTACAO ou EXPORTACAO |
| estrutura_json | JSON | Estrutura completa dos atributos |
| hash_estrutura | VARCHAR(64) | Hash para detectar mudanças |
| data_sincronizacao | TIMESTAMP | Última atualização |

#### OPÇÃO 1 - Tabela: produto_atributos (nova)
| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | INT | Identificador único |
| produto_id | INT | FK para produto no sistema existente |
| ncm_codigo | VARCHAR(8) | NCM do produto |
| modalidade | ENUM | Tipo de operação |
| valores_atributos_json | JSON | Valores preenchidos |
| estrutura_snapshot_json | JSON | Estrutura no momento do cadastro |
| criado_em | TIMESTAMP | Data de criação |
| atualizado_em | TIMESTAMP | Última atualização |

#### OPÇÃO 2 - Campos adicionados na tabela existente
| Campo | Tipo | Descrição |
|-------|------|-----------|
| ncm_codigo | VARCHAR(8) | NCM do produto |
| modalidade | ENUM | Tipo de operação |
| valores_atributos_json | JSON | Valores preenchidos |
| estrutura_snapshot_json | JSON | Estrutura no momento do cadastro |

### 3.3 Escolhendo entre as Opções

**OPÇÃO 1 - Tabela Separada (produto_atributos)**
✅ Vantagens:
- Não altera estrutura existente
- Migração mais segura
- Separação de responsabilidades

❌ Desvantagens:
- JOIN adicional nas queries
- Sincronização de IDs

**OPÇÃO 2 - Integração Direta**
✅ Vantagens:
- Queries mais simples
- Dados unificados
- Menos manutenção

❌ Desvantagens:
- Altera tabela existente
- Risco em produção
- Pode gerar conflitos

### 3.4 Queries de Referência

As queries SQL comentadas na seção anterior devem ser adaptadas conforme a opção escolhida. Elas cobrem os casos de uso mais comuns:

1. **Detecção de mudanças**: Comparar hash da estrutura
2. **Estatísticas**: Agrupar e contar uso
3. **Manutenção**: Identificar dados faltantes

Recomenda-se criar funções ou procedures em sua aplicação para encapsular estas queries, facilitando manutenção e reuso.

---

## 4. Fluxo de Sincronização

### 4.1 Estratégia de Cache

O sistema implementa um cache em duas camadas:

1. **Cache de NCMs**: Informações básicas dos códigos NCM
2. **Cache de Estruturas**: Definições completas de atributos por NCM/modalidade

### 4.2 Processo de Sincronização

#### 4.2.1 Sincronização sob Demanda

Quando um usuário seleciona um NCM:

1. **Verificar cache local**
   - Buscar NCM na tabela `ncm_cache`
   - Verificar idade do cache (configurável, ex: 24 horas)

2. **Se cache válido**
   - Retornar dados imediatamente
   - Opcionalmente, agendar atualização assíncrona

3. **Se cache inválido ou ausente**
   - Fazer requisição ao servidor
   - Atualizar cache local
   - Retornar dados atualizados

#### 4.2.2 Sincronização Agendada

Processo executado periodicamente (ex: diariamente):

1. **Identificar NCMs prioritários**
   - NCMs mais utilizados (últimos 30 dias)
   - NCMs com cache expirado
   - NCMs de produtos ativos

2. **Sincronizar em lotes**
   - Agrupar requisições para eficiência
   - Implementar rate limiting
   - Registrar falhas para retry

3. **Limpar cache obsoleto**
   - Remover NCMs não utilizados há X dias
   - Compactar histórico de sincronização

### 4.3 Gestão de Falhas

- **Timeout de requisições**: Usar cache antigo se disponível
- **Servidor indisponível**: Modo offline com dados em cache
- **Dados corrompidos**: Validar JSON antes de salvar
- **Conflitos de versão**: Preferir dados mais recentes

---

## 5. Renderização de Formulários Dinâmicos

### 5.1 Estrutura de Atributos

Os atributos seguem uma hierarquia que deve ser respeitada na renderização:

```
Estrutura
├── Atributos Simples
│   ├── TEXTO
│   ├── NUMERO_INTEIRO
│   ├── NUMERO_REAL
│   ├── BOOLEANO
│   └── LISTA_ESTATICA
├── Atributos Compostos
│   └── Sub-atributos (recursivo)
└── Atributos Condicionados
    └── Aparecem baseados em condições
```

### 5.2 Processo de Renderização

#### 5.2.1 Produto Novo

1. **Carregar estrutura atual**
   - Buscar no cache ou servidor
   - Usar versão mais recente

2. **Construir formulário**
   - Iterar pelos atributos
   - Aplicar regras de visibilidade
   - Configurar validações

3. **Inicializar valores**
   - Campos vazios ou valores padrão
   - Respeitar multivalorados

#### 5.2.2 Produto Existente

1. **Carregar snapshot**
   - Usar `estrutura_snapshot_json` do produto
   - Garantir compatibilidade com valores salvos

2. **Verificar mudanças**
   - Comparar com estrutura atual
   - Alertar se houver divergências

3. **Restaurar valores**
   - Popular campos com `valores_atributos_json`
   - Manter campos removidos visíveis (somente leitura)

### 5.3 Componentes Necessários

#### 5.3.1 Renderizador de Campo
- Detectar tipo de campo (`forma_preenchimento`)
- Aplicar máscaras e formatações
- Configurar limites (tamanho, decimais)

#### 5.3.2 Gerenciador de Condicionais
- Avaliar condições em tempo real
- Mostrar/ocultar campos dinamicamente
- Atualizar obrigatoriedade

#### 5.3.3 Validador em Tempo Real
- Validar conforme usuário digita
- Mostrar mensagens de erro contextuais
- Prevenir submissão com erros

---

## 6. Gestão de Produtos

### 6.1 Estratégias de Integração

Antes de implementar, escolha entre:

1. **Tabela Separada (produto_atributos)**
   - Vincula ao produto existente via `produto_id`
   - Menor risco, fácil rollback
   - Ideal para piloto

2. **Integração Direta**
   - Adiciona colunas JSON na tabela existente
   - Melhor performance (sem JOINs)
   - Requer alteração estrutural

### 6.2 Criação de Produto

#### Fluxo Principal

1. **Seleção de NCM**
   - Interface de busca/seleção
   - Validar código de 8 dígitos
   - Exibir descrição para confirmação

2. **Escolha de Modalidade**
   - Importação ou Exportação
   - Determina conjunto de atributos

3. **Preenchimento de Atributos**
   - Renderizar formulário dinâmico
   - Validar em tempo real
   - Salvar rascunhos (opcional)

4. **Persistência**
   - Validar conjunto completo
   - Criar snapshot da estrutura
   - Salvar em transação atômica
   - Para OPÇÃO 1: Inserir em produto_atributos com referência ao produto
   - Para OPÇÃO 2: Atualizar campos JSON na tabela de produto existente

### 6.3 Edição de Produto

#### Considerações Especiais

1. **Preservar Integridade**
   - Usar estrutura do snapshot
   - Não perder dados de campos removidos
   - Permitir visualização histórica

2. **Alertar Mudanças**
   - Comparar estruturas (snapshot vs atual)
   - Oferecer atualização opcional
   - Documentar mudanças aplicadas

3. **Migração de Estrutura**
   - Mapear campos compatíveis
   - Alertar campos removidos
   - Solicitar novos obrigatórios

### 6.4 Consultas e Relatórios

#### Queries Úteis

```sql
-- Para OPÇÃO 1 (tabela separada):
-- Buscar produtos por valor de atributo específico
SELECT pa.*, p.* 
FROM produto_atributos pa
JOIN sua_tabela_produto p ON pa.produto_id = p.id
WHERE JSON_EXTRACT(pa.valores_atributos_json, '$.marca') = 'Dell';

-- Para OPÇÃO 2 (tabela integrada):
-- Buscar produtos por valor de atributo específico
SELECT * FROM sua_tabela_produto 
WHERE JSON_EXTRACT(valores_atributos_json, '$.marca') = 'Dell';

-- Produtos com estrutura desatualizada (OPÇÃO 1)
SELECT pa.*, ac.hash_estrutura as hash_atual
FROM produto_atributos pa
INNER JOIN atributos_cache ac 
    ON pa.ncm_codigo = ac.ncm_codigo 
    AND pa.modalidade = ac.modalidade
WHERE pa.estrutura_snapshot_json IS NOT NULL
    AND MD5(pa.estrutura_snapshot_json) != ac.hash_estrutura;

-- Estatísticas por NCM
SELECT 
    n.codigo as ncm,
    n.descricao,
    COUNT(DISTINCT pa.produto_id) as total_produtos
FROM ncm_cache n
LEFT JOIN produto_atributos pa ON n.codigo = pa.ncm_codigo
GROUP BY n.codigo, n.descricao
ORDER BY total_produtos DESC;
```

---

## 7. Validações e Regras de Negócio

### 7.1 Níveis de Validação

#### 7.1.1 Cliente (Tempo Real)
- **Tipo de dado**: Número, texto, booleano
- **Formato**: Máscaras, expressões regulares
- **Limites**: Tamanho, range numérico
- **Obrigatoriedade**: Campos requeridos

#### 7.1.2 Servidor Local (Pré-save)
- **Integridade**: Todos obrigatórios preenchidos
- **Condicionais**: Regras complexas
- **Unicidade**: Quando aplicável
- **Consistência**: Entre campos relacionados

#### 7.1.3 Servidor Remoto (Pós-save)
- **Regras de negócio**: Específicas do domínio
- **Validações cruzadas**: Com outros sistemas
- **Compliance**: Requisitos regulatórios
- **Avisos**: Não impeditivos

### 7.2 Implementação de Regras

#### 7.2.1 Obrigatoriedade
- Base: Campo `obrigatorio` do atributo
- Condicional: Avaliar `descricao_condicao`
- Override: Por NCM/modalidade específica

#### 7.2.2 Validações por Tipo

**TEXTO**
- Tamanho máximo
- Máscara/padrão
- Caracteres permitidos

**NUMERO_INTEIRO**
- Range válido
- Dígitos máximos

**NUMERO_REAL**
- Casas decimais
- Precisão total

**LISTA_ESTATICA**
- Valor no domínio
- Cardinalidade (se multivalorado)

**BOOLEANO**
- Apenas true/false

### 7.3 Mensagens de Erro

Estrutura recomendada:
- **Campo**: Identificador do atributo
- **Mensagem**: Texto explicativo
- **Tipo**: erro, aviso, info
- **Ação**: Sugestão de correção

---

## 8. Tratamento de Mudanças de Estrutura

### 8.1 Detecção de Mudanças

Comparar hashes ou estruturas completas:
- Durante edição de produtos
- Em sincronizações periódicas
- Por demanda do usuário

### 8.2 Tipos de Mudanças

#### 8.2.1 Adição de Atributos
- **Impacto**: Baixo
- **Ação**: Solicitar preenchimento se obrigatório

#### 8.2.2 Remoção de Atributos
- **Impacto**: Médio
- **Ação**: Manter dados, marcar como obsoleto

#### 8.2.3 Mudança de Tipo
- **Impacto**: Alto
- **Ação**: Conversão assistida ou re-entrada

#### 8.2.4 Mudança de Obrigatoriedade
- **Impacto**: Variável
- **Ação**: Validar produtos existentes

### 8.3 Estratégias de Migração

1. **Manual por Produto**
   - Usuário decide quando atualizar
   - Mantém controle total
   - Adequado para poucos produtos

2. **Assistida em Lote**
   - Sistema sugere mapeamentos
   - Usuário revisa e aprova
   - Eficiente para muitos produtos

3. **Automática com Regras**
   - Conversões pré-definidas
   - Aplicação em background
   - Requer validação cuidadosa

---

## 9. Estratégias de Cache

### 9.1 Políticas de Cache

#### 9.1.1 Time-to-Live (TTL)
- **NCMs**: 7 dias (estável)
- **Estruturas**: 24 horas (pode mudar)
- **Configurável**: Por ambiente/necessidade

#### 9.1.2 Invalidação
- **Por evento**: Mudanças conhecidas
- **Por tempo**: TTL expirado
- **Manual**: Interface administrativa

### 9.2 Otimizações

1. **Pré-carregamento**
   - NCMs mais usados
   - Durante baixa demanda
   - Em lotes eficientes

2. **Cache Compartilhado**
   - Entre usuários/sessões
   - Redis ou similar
   - Reduz carga no servidor

3. **Compressão**
   - JSONs grandes
   - Gzip ou similar
   - Trade-off CPU vs storage

### 9.3 Métricas de Cache

Monitorar para otimização:
- Taxa de acerto (hit rate)
- Tamanho médio de entrada
- Tempo de vida útil real
- Frequência de invalidação

---

## 10. Monitoramento e Manutenção

### 10.1 Métricas Essenciais

#### 10.1.1 Performance
- Tempo de sincronização
- Latência de renderização
- Queries mais lentas
- Taxa de erro em validações

#### 10.1.2 Negócio
- Produtos por NCM
- Atributos mais preenchidos
- Taxa de estruturas desatualizadas
- Erros de validação frequentes

#### 10.1.3 Sistema
- Tamanho do cache
- Crescimento do banco
- Falhas de sincronização
- Disponibilidade da API

### 10.2 Rotinas de Manutenção

#### Diária
- Verificar logs de erro
- Monitorar sincronizações
- Validar integridade do cache

#### Semanal
- Limpar cache expirado
- Analisar métricas
- Revisar produtos com erro

#### Mensal
- Otimizar índices
- Arquivar dados antigos
- Relatório de uso

### 10.3 Troubleshooting Comum

| Problema | Diagnóstico | Solução |
|----------|-------------|---------|
| Formulário não carrega | Cache corrompido | Limpar cache do NCM |
| Validações incorretas | Estrutura desatualizada | Forçar sincronização |
| Lentidão em queries | Índices faltando | Criar índices JSON |
| Erros de sincronização | API indisponível | Verificar conectividade |
| Dados JSON inválidos | Estrutura corrompida | Validar JSON antes de salvar |

---

## 11. Migração e Rollout

### 11.1 Preparação

#### 11.1.1 Análise de Impacto
- Mapear produtos existentes
- Identificar NCMs utilizados
- Estimar volume de dados
- Definir grupos de teste

#### 11.1.2 Ambiente de Teste
- Clonar dados de produção
- Simular sincronizações
- Validar integrações
- Treinar usuários-chave

### 11.2 Estratégia de Rollout

#### Fase 1: Piloto (2-4 semanas)
- Grupo pequeno de usuários
- NCMs selecionados
- Monitoramento intensivo
- Coleta de feedback

#### Fase 2: Expansão (4-8 semanas)
- Aumentar usuários gradualmente
- Incluir mais NCMs
- Refinar baseado em feedback
- Otimizar performance

#### Fase 3: Produção Total
- Todos usuários e NCMs
- Desativar sistema antigo
- Suporte intensificado
- Documentação completa

### 11.3 Rollback

Plano de contingência:
1. Manter sistema antigo em standby
2. Backup antes de cada fase
3. Scripts de reversão testados
4. Comunicação clara com usuários

---

## 12. Considerações de Performance

### 12.1 Otimizações de Banco

#### 12.1.1 Índices Essenciais
```sql
-- Para OPÇÃO 1 (tabela separada):
CREATE INDEX idx_pa_produto_id ON produto_atributos(produto_id);
CREATE INDEX idx_pa_json_marca ON produto_atributos((CAST(valores_atributos_json->>'$.marca' AS CHAR(50))));

-- Para OPÇÃO 2 (tabela integrada):
CREATE INDEX idx_prod_ncm ON sua_tabela_produto(ncm_codigo);
CREATE INDEX idx_prod_json_marca ON sua_tabela_produto((CAST(valores_atributos_json->>'$.marca' AS CHAR(50))));
```

#### 12.1.2 Otimizações para Queries Frequentes

Para queries executadas com alta frequência, considere:

1. **Campos calculados persistidos** (MySQL 5.7+)
```sql
-- Para OPÇÃO 1:
ALTER TABLE produto_atributos 
ADD COLUMN estrutura_hash_atual VARCHAR(64) 
    GENERATED ALWAYS AS (MD5(estrutura_snapshot_json)) STORED,
ADD INDEX idx_estrutura_hash (estrutura_hash_atual);
```

2. **Materialized Views** (PostgreSQL) ou **Tabelas de agregação** (todos SGBDs)
   - Apenas se volume justificar
   - Atualização via triggers ou jobs
   - Trade-off: espaço vs performance

3. **Procedures armazenadas**
   - Para lógica complexa reutilizada
   - Reduz tráfego de rede
   - Facilita manutenção centralizada

#### 12.1.3 Particionamento
Para grandes volumes:
- Por data de criação
- Por NCM (hash)
- Por status

### 12.2 Otimizações de Aplicação

#### 12.2.1 Lazy Loading
- Carregar estruturas sob demanda
- Paginar listas grandes
- Diferir validações não críticas

#### 12.2.2 Caching Inteligente
- Memória para dados quentes
- Disco para volume maior
- Invalidação seletiva

#### 12.2.3 Processamento Assíncrono
- Sincronizações em background
- Validações não bloqueantes
- Relatórios agendados

### 12.3 Escalabilidade

#### Horizontal
- Cache distribuído
- Load balancing
- Sharding de dados

#### Vertical
- Otimizar queries
- Índices apropriados
- Hardware adequado

---

## Conclusão

A integração do sistema de atributos dinâmicos representa uma evolução significativa na gestão de produtos, oferecendo flexibilidade sem comprometer a integridade dos dados existentes. 

### Próximos Passos

1. **Avaliar** a infraestrutura atual contra os requisitos
2. **Prototipar** com um subconjunto de funcionalidades
3. **Validar** com usuários-chave
4. **Planejar** rollout gradual
5. **Monitorar** e otimizar continuamente

### Suporte

Para questões específicas de implementação:
- Consulte a documentação da API do servidor
- Revise logs de sincronização regularmente
- Mantenha canal de feedback com usuários
- Documente decisões e customizações

Este sistema foi projetado para evoluir com suas necessidades, mantendo a simplicidade como princípio fundamental.
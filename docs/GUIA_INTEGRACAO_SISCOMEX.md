# Guia de Integração SISCOMEX

## Visão Geral

Este documento explica como utilizar o sistema de integração com a API do Portal Único Siscomex (PUCOMEX) implementado no backend do Catálogo de Produtos.

## Arquitetura da Solução

### Componentes Principais

1. **SiscomexTransformersService** - Responsável por transformar dados internos para o formato SISCOMEX
2. **SiscomexExportService** - Gerencia exportação e geração de arquivos
3. **SiscomexService** - Comunicação direta com a API SISCOMEX
4. **Controllers e Routes** - Endpoints REST para acesso às funcionalidades

### Fluxo de Dados

```
Dados Internos → Transformers → Formato SISCOMEX → API/Export
```

## Configuração

### Variáveis de Ambiente

```bash
# Configuração da API SISCOMEX
SISCOMEX_API_URL=https://api.portalunico.siscomex.gov.br
SISCOMEX_AMBIENTE=producao # ou 'treinamento'
SISCOMEX_CERT_PATH=/path/to/certificado.pem
SISCOMEX_KEY_PATH=/path/to/chave_privada.pem

# Senha para criptografia de certificados
CERT_PASSWORD_SECRET=chavehexadecimal32bytes
```

### Configuração de Certificado Digital

1. Obtenha certificado A1 ou A3 válido do ICP-Brasil
2. Converta para formato PEM se necessário
3. Configure os caminhos nas variáveis de ambiente
4. Teste a conectividade

## Endpoints Disponíveis

### Exportação

#### 1. Exportar Catálogo Completo
```http
GET /api/v1/siscomex/export/catalogo
```

**Parâmetros de Query:**
- `catalogoId` (opcional) - ID do catálogo específico
- `incluirOperadores` (boolean) - Incluir operadores estrangeiros (padrão: true)
- `incluirProdutos` (boolean) - Incluir produtos (padrão: true)
- `apenasAtivos` (boolean) - Apenas itens ativos (padrão: true)
- `formato` (string) - json ou xml (padrão: json)

**Resposta:**
```json
{
  "sucesso": true,
  "arquivo": {
    "nome": "catalogo_siscomex_1640995200000.json",
    "caminho": "123/certificados/exports/catalogo_siscomex_1640995200000.json",
    "tamanho": 1024
  },
  "resumo": {
    "totalProdutos": 10,
    "totalOperadores": 5,
    "produtosValidados": 8,
    "produtosComErro": 2,
    "erros": []
  }
}
```

#### 2. Exportar Produtos Específicos
```http
POST /api/v1/siscomex/export/produtos
```

**Body:**
```json
{
  "produtoIds": [1, 2, 3],
  "formato": "json"
}
```

#### 3. Download de Arquivo
```http
GET /api/v1/siscomex/export/download/{arquivo}
```

#### 4. Validar Produtos
```http
POST /api/v1/siscomex/export/validar
```

**Body:**
```json
{
  "produtoIds": [1, 2, 3]
}
```

#### 5. Preview de Exportação
```http
GET /api/v1/siscomex/export/preview/{catalogoId}
```

#### 6. Status da Exportação
```http
GET /api/v1/siscomex/export/status?catalogoId=1
```

### Comunicação com API

#### 1. Consultar Produtos
```http
GET /api/v1/siscomex/produtos?cnpjRaiz=12345678&ncm=12345678
```

#### 2. Incluir Produto
```http
POST /api/v1/siscomex/produtos
```

#### 3. Verificar Status da API
```http
GET /api/v1/siscomex/status
```

## Formatos de Dados

### Produto SISCOMEX

```json
{
  "cnpjRaiz": "12345678",
  "ncm": "12345678",
  "modalidadeOperacao": "IMPORTACAO",
  "denominacaoProduto": "Nome do Produto",
  "detalhamentoComplementar": "Descrição detalhada",
  "codigoInterno": "PROD001",
  "atributos": [
    {
      "codigo": "001",
      "nome": "Atributo Exemplo",
      "valor": "Valor do atributo",
      "obrigatorio": true,
      "tipo": "TEXTO"
    }
  ],
  "fabricantes": [
    {
      "tin": "123456789",
      "nome": "Fabricante Exemplo",
      "pais": "US",
      "conhecido": true,
      "endereco": {
        "logradouro": "123 Main St",
        "cidade": "New York",
        "codigoPostal": "10001",
        "subdivisao": "NY"
      }
    }
  ]
}
```

### Operador Estrangeiro SISCOMEX

```json
{
  "cnpjRaiz": "12345678",
  "tin": "123456789",
  "nome": "Operador Exemplo",
  "pais": "US",
  "endereco": {
    "logradouro": "123 Main St",
    "cidade": "New York",
    "codigoPostal": "10001",
    "subdivisao": "NY"
  },
  "email": "contato@operador.com",
  "identificacoesAdicionais": [
    {
      "numero": "123456",
      "agenciaEmissora": "DUNS"
    }
  ]
}
```

## Validações

### Produto

- CNPJ deve estar presente no catálogo
- NCM deve ter 8 dígitos
- Denominação é obrigatória
- Atributos obrigatórios devem estar preenchidos
- Pelo menos um operador estrangeiro conhecido deve estar vinculado

### Operador Estrangeiro

- Nome é obrigatório
- País deve ser válido (código ISO)
- TIN é recomendado para operadores conhecidos
- Endereço completo melhora a qualidade dos dados

## Tratamento de Erros

### Códigos de Erro Comuns

- **401** - Certificado digital inválido ou expirado
- **403** - Sem permissão para a operação
- **422** - Dados inválidos (verificar atributos obrigatórios)
- **429** - Limite de requisições excedido
- **500/502/503** - Problemas no servidor SISCOMEX

### Estratégias de Retry

1. **Erro 429** - Aguardar 60 segundos e tentar novamente
2. **Erro 5xx** - Retry exponencial (1s, 2s, 4s, 8s)
3. **Erro de certificado** - Verificar configuração e validade

## Exemplo de Uso Prático

### 1. Exportar todos os produtos válidos

```typescript
import { SiscomexExportService } from './services/siscomex-export.service';

const exportService = new SiscomexExportService();

// Exportar catálogo completo
const resultado = await exportService.exportarCatalogo(superUserId, {
  apenasAtivos: true,
  formato: 'json'
});

if (resultado.sucesso) {
  console.log(`Arquivo gerado: ${resultado.arquivo.nome}`);
  console.log(`${resultado.resumo.produtosValidados} produtos válidos`);
} else {
  console.error('Erros:', resultado.resumo.erros);
}
```

### 2. Validar produtos antes do envio

```typescript
// Validar produtos específicos
const validacao = await exportService.validarProdutosParaExportacao(
  [1, 2, 3], 
  superUserId
);

console.log(`Válidos: ${validacao.produtosValidos.length}`);
console.log(`Inválidos: ${validacao.produtosInvalidos.length}`);

// Mostrar erros de validação
validacao.produtosInvalidos.forEach(produto => {
  console.log(`${produto.denominacao}: ${produto.erros.join(', ')}`);
});
```

### 3. Enviar produtos para SISCOMEX

```typescript
import { SiscomexService } from './services/siscomex.service';
import { SiscomexTransformersService } from './services/siscomex-transformers.service';

const siscomexService = new SiscomexService();
const transformersService = new SiscomexTransformersService();

// Buscar produto do banco
const produto = await buscarProdutoCompleto(produtoId);

// Transformar para formato SISCOMEX
const produtoSiscomex = transformersService.transformarProdutoParaSiscomex(produto);

// Enviar para API
try {
  const resultado = await siscomexService.incluirProduto(produtoSiscomex);
  console.log(`Produto cadastrado no SISCOMEX: ${resultado.codigo}`);
} catch (error) {
  console.error('Erro no envio:', error.message);
}
```

## Monitoramento

### Logs Importantes

- Todas as requisições para SISCOMEX são logadas
- Erros de validação são detalhados nos logs
- Status de conectividade é verificado periodicamente

### Métricas Recomendadas

- Taxa de sucesso de envios
- Tempo de resposta da API SISCOMEX
- Volume de produtos processados
- Frequência de erros por tipo

## Boas Práticas

### Desenvolvimento

1. **Sempre validar** produtos antes do envio
2. **Usar preview** para verificar transformações
3. **Implementar retry** para falhas temporárias
4. **Monitorar certificado** digital (validade)
5. **Testar em ambiente** de homologação primeiro

### Produção

1. **Agendar sincronizações** em horários de baixo movimento
2. **Processar em lotes** pequenos (5-10 produtos)
3. **Manter backup** dos arquivos de exportação
4. **Monitorar status** da API regularmente
5. **Alertar** sobre falhas de certificado

## Troubleshooting

### Problemas Comuns

#### Certificado não carregado
```bash
# Verificar permissões do arquivo
ls -la /path/to/certificado.pem

# Testar carregamento manual
openssl x509 -in certificado.pem -text -noout
```

#### Dados não validando
```bash
# Verificar estrutura dos atributos
curl -X POST /api/v1/siscomex/export/validar \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"produtoIds": [1]}'
```

#### API retornando 401
- Verificar validade do certificado
- Confirmar configuração SSL/TLS
- Testar conectividade de rede

## Roadmap

### Funcionalidades Futuras

- [ ] Sincronização bidirecional automática
- [ ] Dashboard de monitoramento
- [ ] Notificações de status
- [ ] Histórico de sincronizações
- [ ] Relatórios de conformidade
- [ ] Integração com outros módulos PUCOMEX

### Melhorias Técnicas

- [ ] Cache de metadados da API
- [ ] Compressão de arquivos grandes
- [ ] Paralelização de envios
- [ ] Webhook para notificações
- [ ] Métricas detalhadas

## Suporte

Para dúvidas sobre implementação:
1. Verificar logs da aplicação
2. Consultar documentação oficial SISCOMEX
3. Testar conectividade com ambiente de homologação
4. Verificar configuração de certificados

Para problemas da API SISCOMEX:
- Portal: https://www.gov.br/siscomex
- Suporte: Central Serpro de Atendimento
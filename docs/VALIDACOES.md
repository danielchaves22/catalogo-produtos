# Sistema de Validações

## Visão Geral

O sistema implementa validações completas para **CPF**, **CNPJ** e **CEP** tanto no frontend quanto no backend, garantindo consistência e integridade dos dados.

## Funcionalidades Implementadas

### ✅ Frontend
- **Máscaras automáticas** nos inputs (CPF, CNPJ, CEP)
- **Validação em tempo real** durante digitação
- **Formatação automática** para exibição
- **Mensagens de erro personalizadas**

### ✅ Backend
- **Validação com Zod** nos endpoints da API
- **Algoritmos de validação** seguindo regras oficiais
- **Sanitização** de dados (remoção de caracteres especiais)
- **Mensagens de erro padronizadas**

## Componentes

### MaskedInput Component

```typescript
<MaskedInput
  label="CPF/CNPJ"
  mask="cpf-cnpj"  // 'cpf' | 'cnpj' | 'cpf-cnpj' | 'cep'
  value={formData.cpf_cnpj}
  onChange={handleMaskedChange('cpf_cnpj')}
  error={errors.cpf_cnpj}
/>
```

**Máscaras Disponíveis:**
- `cpf`: 000.000.000-00
- `cnpj`: 00.000.000/0000-00  
- `cpf-cnpj`: Dinâmica (CPF ou CNPJ conforme digitação)
- `cep`: 00000-000

### Utilitários de Validação

**Frontend (`lib/validation.ts`)**
```typescript
import { isValidCPF, isValidCNPJ, isValidCEP, formatCPFOrCNPJ } from '@/lib/validation';

// Validações
const cpfValido = isValidCPF('11144477735');
const cnpjValido = isValidCNPJ('11222333000181');
const cepValido = isValidCEP('01310100');

// Formatação
const cpfFormatado = formatCPFOrCNPJ('11144477735'); // 111.444.777-35
const cnpjFormatado = formatCPFOrCNPJ('11222333000181'); // 11.222.333/0001-81
```

**Backend (`utils/validation.ts`)**
```typescript
import { customValidations } from '../utils/validation';

// Uso com Zod
const schema = z.object({
  cpf_cnpj: z.string()
    .refine(customValidations.cpfOrCnpj, { message: 'CPF ou CNPJ inválido' }),
  cep: z.string()
    .refine(customValidations.cep, { message: 'CEP inválido' })
});
```

## Aplicação nos CRUDs

### Catálogo de Produtos

**Campos validados:**
- **CPF/CNPJ**: Máscara dinâmica + validação de dígitos verificadores
- **Status**: Enum (ATIVO/INATIVO)

**Implementação:**
- Input com máscara `cpf-cnpj`
- Validação automática durante digitação  
- Armazenamento apenas de números no banco
- Formatação na exibição das listagens

### Operador Estrangeiro

**Campos validados:**
- **CNPJ Raiz**: Validação de CNPJ (dropdown de catálogos existentes)
- **CEP**: Máscara + validação de formato
- **Email**: Validação de formato de email
- **TIN**: Formato livre (varia por país)

**Implementação:**
- CEP com máscara automática
- Validação de CNPJ no dropdown
- Campos opcionais com validação condicional

## Algoritmos de Validação

### CPF
- **Formato**: 11 dígitos numéricos
- **Validação**: Algoritmo de dígitos verificadores
- **Rejeita**: CPFs com todos os dígitos iguais (111.111.111-11)

### CNPJ  
- **Formato**: 14 dígitos numéricos
- **Validação**: Algoritmo de dígitos verificadores
- **Rejeita**: CNPJs com todos os dígitos iguais

### CEP
- **Formato**: 8 dígitos numéricos
- **Validação**: Formato e não pode ser 00000-000
- **Máscara**: 00000-000

## Fluxo de Validação

### 1. Frontend (Tempo Real)
```
Usuário digita → Máscara aplicada → Validação → Feedback visual
```

### 2. Submit do Formulário
```
Dados coletados → Validação local → Sanitização → Envio para API
```

### 3. Backend (API)
```
Dados recebidos → Validação Zod → Processamento → Resposta
```

### 4. Armazenamento
```
Apenas números armazenados → Formatação na consulta
```

## Exemplos de Uso

### Criando um Catálogo
```typescript
const formData = {
  nome: 'Empresa Exemplo',
  cpf_cnpj: '11.222.333/0001-81', // Com máscara
  status: 'ATIVO'
};

// No submit, apenas números são enviados:
// { nome: 'Empresa Exemplo', cpf_cnpj: '11222333000181', status: 'ATIVO' }
```

### Validação Manual
```typescript
// Validar CPF
const resultado = isValidCPFOrCNPJ('111.444.777-35');
// { valid: true, type: 'CPF' }

// Validar CNPJ
const resultado = isValidCPFOrCNPJ('11.222.333/0001-81');
// { valid: true, type: 'CNPJ' }

// Validar CEP
const cepValido = isValidCEP('01310-100');
// true
```

## Mensagens de Erro

### CPF
- "CPF inválido"
- "CPF deve ter 11 dígitos"
- "CPF é obrigatório"

### CNPJ
- "CNPJ inválido"  
- "CNPJ deve ter 14 dígitos"
- "CNPJ é obrigatório"

### CEP
- "CEP inválido"
- "CEP deve ter 8 dígitos"
- "CEP é obrigatório"

## Testando as Validações

### 1. Teste Manual na Interface
- Acesse os formulários de Catálogo ou Operador Estrangeiro
- Digite valores inválidos e observe os erros
- Teste a formatação automática

### 2. Teste via Console
Execute o script de teste no console do navegador (arquivo disponível em `validation_tests.js`)

### 3. Teste de API
```bash
# Teste com CNPJ válido
curl -X POST http://localhost:3000/api/catalogos \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"nome":"Teste","cpf_cnpj":"11222333000181","status":"ATIVO"}'

# Teste com CNPJ inválido (deve retornar erro)
curl -X POST http://localhost:3000/api/catalogos \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"nome":"Teste","cpf_cnpj":"11111111111111","status":"ATIVO"}'
```

## Casos de Teste

### CPFs Válidos
- 111.444.777-35
- 123.456.789-09
- 000.000.001-91

### CPFs Inválidos  
- 111.111.111-11 (todos iguais)
- 123.456.789-00 (dígito verificador errado)
- 12345678901 (sem formatação, mas válido)

### CNPJs Válidos
- 11.222.333/0001-81
- 00.000.000/0001-91
- 12.345.678/0001-95

### CNPJs Inválidos
- 11.111.111/1111-11 (todos iguais)
- 12.345.678/0001-00 (dígito verificador errado)

### CEPs Válidos
- 01310-100
- 04567-890
- 12345-678

### CEPs Inválidos
- 00000-000 (todos zeros)
- 1234-567 (formato incorreto)
- abcde-fgh (não numérico)

## Troubleshooting

### Problema: Máscara não aparece
- Verificar se o componente `MaskedInput` está importado
- Confirmar se a prop `mask` está definida corretamente

### Problema: Validação não funciona no backend
- Verificar se `customValidations` está importado
- Confirmar se as validações estão aplicadas no schema Zod

### Problema: Dados formatados salvos no banco
- Verificar se está usando `onlyNumbers()` antes de salvar
- Confirmar se o handler `handleMaskedChange` está sendo usado

### Problema: Erro de validação em dados antigos
- Executar script de migração para limpar dados existentes
- Adicionar validação condicional para dados legados

## Roadmap

### Versão Futura
- [ ] Validação de TIN internacional
- [ ] Integração com APIs de validação de CEP
- [ ] Validação de email com DNS lookup
- [ ] Máscara para telefones brasileiros
- [ ] Validação de IBAN para operadores internacionais

### Melhorias Sugeridas
- [ ] Cache de validações para melhor performance
- [ ] Debounce nas validações em tempo real
- [ ] Feedback visual mais rico (cores, ícones)
- [ ] Suporte a validação offline
# Histórico de Versões de Produto (SISCOMEX)

## Objetivo
Registrar e exibir, por produto, o histórico de versões confirmadas com sucesso no SISCOMEX.

## Escopo
- O histórico pertence ao produto (`produto_id`).
- Apenas versões criadas com sucesso são registradas.
- Não inclui eventos de erro operacional.

## Modelo de Persistência
Tabela: `produto_historico_versao`.

Campos principais:
- `produto_id`
- `versao_siscomex`
- `tipo_evento` (`CRIACAO` ou `ATUALIZACAO`)
- `delta_json`
- `snapshot_json` (checkpoint periódico)
- `is_checkpoint`
- `transmissao_id`
- `criado_em`

## Contrato do Delta JSON
```json
{
  "schemaVersion": 1,
  "changes": [
    {
      "path": "denominacao",
      "op": "replace",
      "before": "texto anterior",
      "after": "texto novo",
      "label": "Denominação"
    }
  ]
}
```

### Operações
- `add`
- `remove`
- `replace`

## Regras de Resumo
- Versão 1: `Produto criado no SISCOMEX.`
- Demais versões: `<N> alteração(ões) na versão <V>.`

## API
### `GET /api/v1/produtos/:id/historico`
Retorna timeline ordenada por versão decrescente.

## Frontend
A tela de cadastro/edição do produto exibe a aba `Histórico` ao lado de `Atributos Dinâmicos`, listando versão, data e mudanças.

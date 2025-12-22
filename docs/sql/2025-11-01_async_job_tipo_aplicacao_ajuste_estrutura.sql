-- Adiciona novo tipo de job assíncrono para aplicação dos ajustes de estrutura
ALTER TABLE async_job
  MODIFY COLUMN tipo ENUM(
    'IMPORTACAO_PRODUTO',
    'EXCLUSAO_MASSIVA',
    'ALTERACAO_ATRIBUTOS',
    'AJUSTE_ESTRUTURA',
    'APLICACAO_AJUSTE_ESTRUTURA',
    'EXPORTACAO_PRODUTO',
    'EXPORTACAO_FABRICANTE',
    'TRANSMISSAO_PRODUTO'
  ) NOT NULL;

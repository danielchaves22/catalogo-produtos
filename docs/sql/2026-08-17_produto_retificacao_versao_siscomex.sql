ALTER TABLE produto
  MODIFY versao VARCHAR(8) NULL;

ALTER TABLE produto_transmissao_item
  MODIFY operacao ENUM('INCLUSAO', 'NOVA_VERSAO', 'RETIFICACAO') NOT NULL DEFAULT 'INCLUSAO',
  MODIFY retorno_versao VARCHAR(8) NULL;

ALTER TABLE produto_historico_versao
  MODIFY versao_siscomex VARCHAR(8) NOT NULL;

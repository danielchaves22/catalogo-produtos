-- Atualiza enum de categoria de mensagens para incluir IMPORTACAO_CONCLUIDA
ALTER TABLE mensagem
  MODIFY categoria ENUM('ATUALIZACAO_SISCOMEX', 'IMPORTACAO_CONCLUIDA') NOT NULL DEFAULT 'ATUALIZACAO_SISCOMEX';

-- Inclui campo para metadados estruturados
ALTER TABLE mensagem
  ADD COLUMN metadados JSON NULL AFTER categoria;

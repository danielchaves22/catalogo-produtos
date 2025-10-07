-- Adiciona o status REVERTIDA à coluna situacao da tabela importacao_produto
ALTER TABLE `importacao_produto`
  MODIFY `situacao` ENUM('EM_ANDAMENTO', 'CONCLUIDA', 'REVERTIDA') NOT NULL DEFAULT 'EM_ANDAMENTO';

-- Ajusta enum de async_job.tipo para incluir a exportação de fabricantes vinculados
ALTER TABLE async_job
    MODIFY COLUMN tipo ENUM('IMPORTACAO_PRODUTO', 'EXCLUSAO_MASSIVA', 'ALTERACAO_ATRIBUTOS', 'AJUSTE_ESTRUTURA', 'EXPORTACAO_PRODUTO', 'EXPORTACAO_FABRICANTE') NOT NULL;
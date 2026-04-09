ALTER TABLE certificado
    ADD COLUMN compatibilidade_status ENUM('NAO_VERIFICADO', 'COMPATIVEL', 'CORRIGIDO_AUTOMATICAMENTE') NOT NULL DEFAULT 'NAO_VERIFICADO' AFTER senha,
    ADD COLUMN validado_em DATETIME NULL AFTER compatibilidade_status,
    ADD COLUMN detalhe_validacao VARCHAR(255) NULL AFTER validado_em;

ALTER TABLE async_job
    MODIFY COLUMN tipo ENUM('IMPORTACAO_PRODUTO', 'EXCLUSAO_MASSIVA', 'ALTERACAO_ATRIBUTOS', 'AJUSTE_ESTRUTURA', 'EXPORTACAO_PRODUTO') NOT NULL;

ALTER TABLE async_job_file
    ADD COLUMN storage_path VARCHAR(512) NULL AFTER conteudo_base64,
    ADD COLUMN storage_provider VARCHAR(64) NULL AFTER storage_path,
    ADD COLUMN expira_em DATETIME NULL AFTER storage_provider;

CREATE TABLE IF NOT EXISTS produto_exportacao (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    super_user_id INT UNSIGNED NOT NULL,
    usuario_catalogo_id INT UNSIGNED NULL,
    todos_filtrados TINYINT(1) NOT NULL DEFAULT 0,
    filtros_json JSON NULL,
    ids_selecionados_json JSON NULL,
    ids_deselecionados_json JSON NULL,
    busca VARCHAR(255) NULL,
    arquivo_nome VARCHAR(255) NULL,
    arquivo_path VARCHAR(512) NULL,
    arquivo_expira_em DATETIME NULL,
    arquivo_tamanho INT UNSIGNED NULL,
    total_itens INT UNSIGNED NULL,
    async_job_id INT UNSIGNED NULL,
    criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE INDEX uk_exportacao_job (async_job_id),
    INDEX idx_exportacao_super_user (super_user_id),
    CONSTRAINT fk_exportacao_super_user FOREIGN KEY (super_user_id) REFERENCES comex(idv32),
    CONSTRAINT fk_exportacao_usuario_catalogo FOREIGN KEY (usuario_catalogo_id) REFERENCES usuario_catalogo(id),
    CONSTRAINT fk_exportacao_job FOREIGN KEY (async_job_id) REFERENCES async_job(id)
);

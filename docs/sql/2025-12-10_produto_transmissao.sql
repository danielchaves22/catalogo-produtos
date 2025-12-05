ALTER TABLE async_job
    MODIFY COLUMN tipo ENUM(
        'IMPORTACAO_PRODUTO',
        'EXCLUSAO_MASSIVA',
        'ALTERACAO_ATRIBUTOS',
        'AJUSTE_ESTRUTURA',
        'EXPORTACAO_PRODUTO',
        'EXPORTACAO_FABRICANTE',
        'TRANSMISSAO_PRODUTO'
    ) NOT NULL;

CREATE TABLE IF NOT EXISTS produto_transmissao (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    super_user_id INT UNSIGNED NOT NULL,
    catalogo_id INT UNSIGNED NOT NULL,
    usuario_catalogo_id INT UNSIGNED NULL,
    async_job_id INT UNSIGNED NULL,
    modalidade ENUM('PRODUTOS') NOT NULL DEFAULT 'PRODUTOS',
    status ENUM('EM_FILA', 'PROCESSANDO', 'CONCLUIDO', 'FALHO', 'PARCIAL') NOT NULL DEFAULT 'EM_FILA',
    total_itens INT UNSIGNED NOT NULL DEFAULT 0,
    total_sucesso INT UNSIGNED NOT NULL DEFAULT 0,
    total_erro INT UNSIGNED NOT NULL DEFAULT 0,
    selecao_json JSON NULL,
    payload_envio_path VARCHAR(512) NULL,
    payload_envio_expira_em DATETIME NULL,
    payload_envio_tamanho INT UNSIGNED NULL,
    payload_envio_provider VARCHAR(64) NULL,
    payload_retorno_path VARCHAR(512) NULL,
    payload_retorno_expira_em DATETIME NULL,
    payload_retorno_tamanho INT UNSIGNED NULL,
    payload_retorno_provider VARCHAR(64) NULL,
    iniciado_em DATETIME NULL,
    concluido_em DATETIME NULL,
    criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE INDEX uk_transmissao_job (async_job_id),
    INDEX idx_transmissao_super_user (super_user_id),
    INDEX idx_transmissao_catalogo (catalogo_id),
    CONSTRAINT fk_transmissao_super_user FOREIGN KEY (super_user_id) REFERENCES comex(idv32),
    CONSTRAINT fk_transmissao_catalogo FOREIGN KEY (catalogo_id) REFERENCES catalogo(id),
    CONSTRAINT fk_transmissao_usuario_catalogo FOREIGN KEY (usuario_catalogo_id) REFERENCES usuario_catalogo(id),
    CONSTRAINT fk_transmissao_job FOREIGN KEY (async_job_id) REFERENCES async_job(id)
);

CREATE TABLE IF NOT EXISTS produto_transmissao_item (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    transmissao_id INT UNSIGNED NOT NULL,
    produto_id INT UNSIGNED NOT NULL,
    status ENUM('PENDENTE', 'PROCESSANDO', 'SUCESSO', 'ERRO') NOT NULL DEFAULT 'PENDENTE',
    mensagem TEXT NULL,
    retorno_codigo VARCHAR(255) NULL,
    retorno_versao INT UNSIGNED NULL,
    retorno_situacao VARCHAR(64) NULL,
    criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_transmissao_item_transmissao (transmissao_id),
    INDEX idx_transmissao_item_produto (produto_id),
    CONSTRAINT fk_transmissao_item_transmissao FOREIGN KEY (transmissao_id) REFERENCES produto_transmissao(id) ON DELETE CASCADE,
    CONSTRAINT fk_transmissao_item_produto FOREIGN KEY (produto_id) REFERENCES produto(id)
);

-- Criação da tabela de valores padrão por NCM
CREATE TABLE IF NOT EXISTS ncm_valores_padrao (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    super_user_id INT UNSIGNED NOT NULL,
    ncm_codigo VARCHAR(8) NOT NULL,
    modalidade VARCHAR(10) NULL,
    valores_json JSON NOT NULL,
    estrutura_snapshot_json JSON NULL,
    criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    criado_por VARCHAR(255) NULL,
    atualizado_por VARCHAR(255) NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_superuser_ncm (super_user_id, ncm_codigo),
    -- Integridade com o superusuário mantida via aplicação, pois a tabela comex está em outro schema
    INDEX idx_ncm_valores_padrao_super_user (super_user_id)
);

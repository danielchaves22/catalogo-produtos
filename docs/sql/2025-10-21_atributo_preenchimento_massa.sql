-- Cria tabela para registrar o histórico de preenchimento em massa de atributos
CREATE TABLE IF NOT EXISTS atributo_preenchimento_massa (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    super_user_id INT UNSIGNED NOT NULL,
    ncm_codigo VARCHAR(255) NOT NULL,
    modalidade VARCHAR(255) NULL,
    catalogo_ids_json JSON NULL,
    catalogos_json JSON NULL,
    valores_json JSON NOT NULL,
    estrutura_snapshot_json JSON NULL,
    produtos_excecao_json JSON NULL,
    produtos_impactados INT NOT NULL DEFAULT 0,
    criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    criado_por VARCHAR(255) NULL,
    PRIMARY KEY (id),
    INDEX idx_attr_massa_super_user (super_user_id)
);

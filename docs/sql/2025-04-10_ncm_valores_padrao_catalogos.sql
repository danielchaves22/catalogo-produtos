-- Criação da tabela de relacionamento entre valores padrão de NCM e catálogos
CREATE TABLE IF NOT EXISTS ncm_valores_padrao_catalogo (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    ncm_valores_padrao_id INT UNSIGNED NOT NULL,
    catalogo_id INT UNSIGNED NOT NULL,
    criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_valor_padrao_catalogo (ncm_valores_padrao_id, catalogo_id),
    INDEX idx_nvpc_catalogo (catalogo_id),
    CONSTRAINT fk_nvpc_valor_padrao FOREIGN KEY (ncm_valores_padrao_id) REFERENCES ncm_valores_padrao(id) ON DELETE CASCADE,
    CONSTRAINT fk_nvpc_catalogo FOREIGN KEY (catalogo_id) REFERENCES catalogo(id) ON DELETE CASCADE
);

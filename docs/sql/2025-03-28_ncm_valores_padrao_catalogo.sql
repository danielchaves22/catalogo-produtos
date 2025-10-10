-- Criação da tabela de associação entre valores padrão de NCM e catálogos
CREATE TABLE IF NOT EXISTS ncm_valores_padrao_catalogo (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    ncm_valores_padrao_id INT UNSIGNED NOT NULL,
    catalogo_id INT UNSIGNED NOT NULL,
    criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_ncm_valores_padrao_catalogo (ncm_valores_padrao_id, catalogo_id),
    INDEX idx_ncm_valores_padrao_catalogo_valor (ncm_valores_padrao_id),
    INDEX idx_ncm_valores_padrao_catalogo_catalogo (catalogo_id)
);

-- Popula a associação com todos os catálogos do superusuário para preservar o comportamento atual
INSERT INTO ncm_valores_padrao_catalogo (ncm_valores_padrao_id, catalogo_id)
SELECT v.id, c.id
FROM ncm_valores_padrao v
JOIN catalogo c ON c.super_user_id = v.super_user_id
LEFT JOIN ncm_valores_padrao_catalogo rel
    ON rel.ncm_valores_padrao_id = v.id AND rel.catalogo_id = c.id
WHERE rel.id IS NULL;

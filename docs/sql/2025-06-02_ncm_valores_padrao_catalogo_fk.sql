-- Garante integridade referencial da tabela de associação entre valores padrão de NCM e catálogos
SET @fk_valor_exists := (
    SELECT COUNT(*)
    FROM information_schema.REFERENTIAL_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND CONSTRAINT_NAME = 'fk_ncm_valores_padrao_catalogo_valor'
);

SET @sql_add_fk_valor := IF(
    @fk_valor_exists = 0,
    'ALTER TABLE ncm_valores_padrao_catalogo\n        ADD CONSTRAINT fk_ncm_valores_padrao_catalogo_valor\n            FOREIGN KEY (ncm_valores_padrao_id) REFERENCES ncm_valores_padrao (id) ON DELETE CASCADE',
    'SELECT "Constraint fk_ncm_valores_padrao_catalogo_valor já existe"'
);

PREPARE stmt FROM @sql_add_fk_valor;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @fk_catalogo_exists := (
    SELECT COUNT(*)
    FROM information_schema.REFERENTIAL_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND CONSTRAINT_NAME = 'fk_ncm_valores_padrao_catalogo_catalogo'
);

SET @sql_add_fk_catalogo := IF(
    @fk_catalogo_exists = 0,
    'ALTER TABLE ncm_valores_padrao_catalogo\n        ADD CONSTRAINT fk_ncm_valores_padrao_catalogo_catalogo\n            FOREIGN KEY (catalogo_id) REFERENCES catalogo (id) ON DELETE CASCADE',
    'SELECT "Constraint fk_ncm_valores_padrao_catalogo_catalogo já existe"'
);

PREPARE stmt FROM @sql_add_fk_catalogo;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Repopula vínculos ausentes para manter o comportamento padrão
INSERT INTO ncm_valores_padrao_catalogo (ncm_valores_padrao_id, catalogo_id)
SELECT v.id, c.id
FROM ncm_valores_padrao v
JOIN catalogo c ON c.super_user_id = v.super_user_id
LEFT JOIN ncm_valores_padrao_catalogo rel
    ON rel.ncm_valores_padrao_id = v.id AND rel.catalogo_id = c.id
WHERE rel.id IS NULL;

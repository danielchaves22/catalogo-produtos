SET @sql := (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.statistics
      WHERE table_schema = DATABASE()
        AND table_name = 'produto'
        AND index_name = 'codigo'
    ),
    'ALTER TABLE produto DROP INDEX codigo',
    'SELECT 1'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.statistics
      WHERE table_schema = DATABASE()
        AND table_name = 'produto'
        AND index_name = 'uk_codigo_versao'
    ),
    'ALTER TABLE produto DROP INDEX uk_codigo_versao',
    'SELECT 1'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.statistics
      WHERE table_schema = DATABASE()
        AND table_name = 'produto'
        AND index_name = 'uk_catalogo_codigo'
    ),
    'ALTER TABLE produto DROP INDEX uk_catalogo_codigo',
    'SELECT 1'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

ALTER TABLE ncm_cache
  MODIFY COLUMN unidade_medida VARCHAR(20) NULL;

ALTER TABLE produto
  MODIFY COLUMN denominacao VARCHAR(120) NOT NULL;

ALTER TABLE produto
  ADD UNIQUE INDEX uk_catalogo_codigo (catalogo_id, codigo);

-- Recria functions/triggers de numeracao sem DEFINER fixo.
-- Use no schema do Catalogo de Produtos afetado antes de testar inserts em catalogo, produto ou operador_estrangeiro.
-- Causa corrigida: objetos restaurados com DEFINER=`catpro`@`%` ou outro usuario inexistente geram MySQL 1449.

DROP TRIGGER IF EXISTS before_catalogo_insert;
DROP TRIGGER IF EXISTS before_produto_insert;
DROP TRIGGER IF EXISTS before_operador_estrangeiro_insert;

DROP FUNCTION IF EXISTS generate_unique_random_numero;
DROP FUNCTION IF EXISTS generate_unique_random_produto_numero;
DROP FUNCTION IF EXISTS generate_unique_random_operador_numero;

DELIMITER $$

CREATE FUNCTION generate_unique_random_numero()
RETURNS INT UNSIGNED
BEGIN
    DECLARE random_num INT UNSIGNED;
    DECLARE is_unique BOOLEAN;
    DECLARE max_attempts INT DEFAULT 100;
    DECLARE attempt_count INT DEFAULT 0;

    SET is_unique = FALSE;

    WHILE NOT is_unique AND attempt_count < max_attempts DO
        SET random_num = FLOOR(1000000 + RAND() * 9000000);

        IF NOT EXISTS (SELECT 1 FROM catalogo WHERE numero = random_num) THEN
            SET is_unique = TRUE;
        END IF;

        SET attempt_count = attempt_count + 1;
    END WHILE;

    IF NOT is_unique THEN
        SELECT IFNULL(MAX(numero), 1000000) + 1 INTO random_num FROM catalogo;
    END IF;

    RETURN random_num;
END$$

CREATE TRIGGER before_catalogo_insert
BEFORE INSERT ON catalogo
FOR EACH ROW
BEGIN
    IF NEW.numero IS NULL OR NEW.numero = 0 THEN
        SET NEW.numero = generate_unique_random_numero();
    END IF;

    SET NEW.ultima_alteracao = NOW();
END$$

CREATE FUNCTION generate_unique_random_produto_numero()
RETURNS INT UNSIGNED
BEGIN
    DECLARE random_num INT UNSIGNED;
    DECLARE is_unique BOOLEAN;
    DECLARE max_attempts INT DEFAULT 100;
    DECLARE attempt_count INT DEFAULT 0;

    SET is_unique = FALSE;

    WHILE NOT is_unique AND attempt_count < max_attempts DO
        SET random_num = FLOOR(1000000 + RAND() * 9000000);

        IF NOT EXISTS (SELECT 1 FROM produto WHERE numero = random_num) THEN
            SET is_unique = TRUE;
        END IF;

        SET attempt_count = attempt_count + 1;
    END WHILE;

    IF NOT is_unique THEN
        SELECT IFNULL(MAX(numero), 1000000) + 1 INTO random_num FROM produto;
    END IF;

    RETURN random_num;
END$$

CREATE TRIGGER before_produto_insert
BEFORE INSERT ON produto
FOR EACH ROW
BEGIN
    IF NEW.numero IS NULL OR NEW.numero = 0 THEN
        SET NEW.numero = generate_unique_random_produto_numero();
    END IF;
END$$

CREATE FUNCTION generate_unique_random_operador_numero()
RETURNS INT UNSIGNED
BEGIN
    DECLARE random_num INT UNSIGNED;
    DECLARE is_unique BOOLEAN;
    DECLARE max_attempts INT DEFAULT 100;
    DECLARE attempt_count INT DEFAULT 0;

    SET is_unique = FALSE;

    WHILE NOT is_unique AND attempt_count < max_attempts DO
        SET random_num = FLOOR(1000000 + RAND() * 9000000);

        IF NOT EXISTS (SELECT 1 FROM operador_estrangeiro WHERE numero = random_num) THEN
            SET is_unique = TRUE;
        END IF;

        SET attempt_count = attempt_count + 1;
    END WHILE;

    IF NOT is_unique THEN
        SELECT IFNULL(MAX(numero), 1000000) + 1 INTO random_num FROM operador_estrangeiro;
    END IF;

    RETURN random_num;
END$$

CREATE TRIGGER before_operador_estrangeiro_insert
BEFORE INSERT ON operador_estrangeiro
FOR EACH ROW
BEGIN
    IF NEW.numero IS NULL OR NEW.numero = 0 THEN
        SET NEW.numero = generate_unique_random_operador_numero();
    END IF;
END$$

DELIMITER ;

SELECT TRIGGER_NAME, DEFINER
FROM information_schema.TRIGGERS
WHERE TRIGGER_SCHEMA = DATABASE()
  AND TRIGGER_NAME IN (
      'before_catalogo_insert',
      'before_produto_insert',
      'before_operador_estrangeiro_insert'
  )
ORDER BY TRIGGER_NAME;

SELECT ROUTINE_NAME, ROUTINE_TYPE, DEFINER
FROM information_schema.ROUTINES
WHERE ROUTINE_SCHEMA = DATABASE()
  AND ROUTINE_NAME IN (
      'generate_unique_random_numero',
      'generate_unique_random_produto_numero',
      'generate_unique_random_operador_numero'
  )
ORDER BY ROUTINE_NAME;

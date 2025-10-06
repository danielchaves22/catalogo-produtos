-- Atualização: adiciona número interno único aos operadores estrangeiros
-- Justificativa: padronizar identificação interna, alinhando com produtos e catálogos.

ALTER TABLE operador_estrangeiro
    ADD COLUMN numero INT UNSIGNED NOT NULL AFTER codigo_interno;

CREATE UNIQUE INDEX IF NOT EXISTS idx_operador_estrangeiro_numero ON operador_estrangeiro (numero);

DROP FUNCTION IF EXISTS generate_unique_random_operador_numero;
DELIMITER $$
CREATE FUNCTION generate_unique_random_operador_numero()
RETURNS INT UNSIGNED
BEGIN
    DECLARE random_num INT UNSIGNED;
    DECLARE is_unique BOOLEAN DEFAULT FALSE;
    DECLARE max_attempts INT DEFAULT 100;
    DECLARE attempt_count INT DEFAULT 0;

    WHILE NOT is_unique AND attempt_count < max_attempts DO
        SET random_num = FLOOR(100000 + RAND() * 900000);
        IF NOT EXISTS (SELECT 1 FROM operador_estrangeiro WHERE numero = random_num) THEN
            SET is_unique = TRUE;
        END IF;
        SET attempt_count = attempt_count + 1;
    END WHILE;

    IF NOT is_unique THEN
        SELECT IFNULL(MAX(numero), 100000) + 1 INTO random_num FROM operador_estrangeiro;
    END IF;

    RETURN random_num;
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS before_operador_estrangeiro_insert;
DELIMITER $$
CREATE TRIGGER before_operador_estrangeiro_insert
BEFORE INSERT ON operador_estrangeiro
FOR EACH ROW
BEGIN
    IF NEW.numero IS NULL OR NEW.numero = 0 THEN
        SET NEW.numero = generate_unique_random_operador_numero();
    END IF;
END$$
DELIMITER ;

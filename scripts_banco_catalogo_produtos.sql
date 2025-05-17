-- Criar o schema catpro-hml
CREATE SCHEMA IF NOT EXISTS `catpro-hml`;

-- Tabela catalogo no schema catpro-hml
CREATE TABLE `catpro-hml`.`catalogo` (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    nome VARCHAR(255) NOT NULL,
    cpf_cnpj VARCHAR(20),
    ultima_alteracao DATETIME NOT NULL,
    numero INT UNSIGNED NOT NULL,
    status ENUM('ATIVO', 'INATIVO') NOT NULL DEFAULT 'ATIVO',
    PRIMARY KEY (id),
    UNIQUE INDEX idx_numero (numero)
);

-- Função para gerar números aleatórios de 6 dígitos
DELIMITER $$

CREATE FUNCTION `catpro-hml`.generate_unique_random_numero() 
RETURNS INT UNSIGNED
BEGIN
    DECLARE random_num INT UNSIGNED;
    DECLARE is_unique BOOLEAN;
    DECLARE max_attempts INT DEFAULT 100;
    DECLARE attempt_count INT DEFAULT 0;
    
    SET is_unique = FALSE;
    
    WHILE NOT is_unique AND attempt_count < max_attempts DO
        -- Gerar número entre 100000 e 999999 (6 dígitos)
        SET random_num = FLOOR(100000 + RAND() * 900000);
        
        -- Verificar se já existe
        IF NOT EXISTS (SELECT 1 FROM `catpro-hml`.catalogo WHERE numero = random_num) THEN
            SET is_unique = TRUE;
        END IF;
        
        SET attempt_count = attempt_count + 1;
    END WHILE;
    
    -- Se não conseguiu um número único após várias tentativas, usar fallback
    IF NOT is_unique THEN
        -- Fallback: Pegar o maior número existente e adicionar 1
        SELECT IFNULL(MAX(numero), 100000) + 1 INTO random_num FROM `catpro-hml`.catalogo;
    END IF;
    
    RETURN random_num;
END$$

DELIMITER ;

-- Trigger para inserir o número automático antes do INSERT
DELIMITER $$

CREATE TRIGGER `catpro-hml`.before_catalogo_insert
BEFORE INSERT ON `catpro-hml`.catalogo
FOR EACH ROW
BEGIN
    -- Se o número não foi especificado explicitamente, gerar um
    IF NEW.numero IS NULL OR NEW.numero = 0 THEN
        SET NEW.numero = `catpro-hml`.generate_unique_random_numero();
    END IF;
    
    -- Atualizar também o timestamp de última alteração
    SET NEW.ultima_alteracao = NOW();
END$$

DELIMITER ;
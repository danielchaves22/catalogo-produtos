use `catpro-hml`;

-- Criar o schema catpro-hml
CREATE TABLE IF NOT EXISTS catalogo (
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
DELIMITER $$;

CREATE FUNCTION IF NOT EXISTS generate_unique_random_numero() 
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
        IF NOT EXISTS (SELECT 1 FROM catalogo WHERE numero = random_num) THEN
            SET is_unique = TRUE;
        END IF;
        
        SET attempt_count = attempt_count + 1;
    END WHILE;
    
    -- Se não conseguiu um número único após várias tentativas, usar fallback
    IF NOT is_unique THEN
        -- Fallback: Pegar o maior número existente e adicionar 1
        SELECT IFNULL(MAX(numero), 100000) + 1 INTO random_num FROM catalogo;
    END IF;
    
    RETURN random_num;
END$$

DELIMITER ;

-- Trigger para inserir o número automático antes do INSERT
DELIMITER $$;

CREATE TRIGGER IF NOT EXISTS before_catalogo_insert
BEFORE INSERT ON catalogo
FOR EACH ROW
BEGIN
    -- Se o número não foi especificado explicitamente, gerar um
    IF NEW.numero IS NULL OR NEW.numero = 0 THEN
        SET NEW.numero = generate_unique_random_numero();
    END IF;
    
    -- Atualizar também o timestamp de última alteração
    SET NEW.ultima_alteracao = NOW();
END$$

DELIMITER ;

    -- Script SQL - Operador Estrangeiro
    -- Adicionar ao arquivo de criação de tabelas

    -- Tabelas auxiliares para dropdowns
    CREATE TABLE IF NOT EXISTS pais (
        codigo VARCHAR(10) NOT NULL PRIMARY KEY,
        sigla VARCHAR(10) NOT NULL,
        nome VARCHAR(255) NOT NULL,
        INDEX idx_nome (nome)
    );

    CREATE TABLE IF NOT EXISTS agencia_emissora (
        codigo VARCHAR(20) NOT NULL PRIMARY KEY,
        sigla VARCHAR(20) NOT NULL,
        nome VARCHAR(255) NOT NULL,
        INDEX idx_nome (nome)
    );

    CREATE TABLE IF NOT EXISTS subdivisao (
        codigo VARCHAR(20) NOT NULL PRIMARY KEY,
        sigla VARCHAR(20) NOT NULL,
        nome VARCHAR(255) NOT NULL,
        pais_codigo VARCHAR(10) NOT NULL,
        INDEX idx_nome (nome),
        INDEX idx_pais (pais_codigo),
        FOREIGN KEY (pais_codigo) REFERENCES pais(codigo)
    );

    -- Tabela principal do Operador Estrangeiro
    CREATE TABLE IF NOT EXISTS operador_estrangeiro (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        cnpj_raiz_responsavel VARCHAR(14) NOT NULL,
        
        -- Dados básicos
        pais_codigo VARCHAR(10) NOT NULL,
        tin VARCHAR(50),
        nome VARCHAR(255) NOT NULL,
        email VARCHAR(255),
        codigo_interno VARCHAR(100),
        
        -- Endereço
        codigo_postal VARCHAR(50),
        logradouro VARCHAR(500),
        cidade VARCHAR(255),
        subdivisao_codigo VARCHAR(20),
        
        -- Controle do sistema
        codigo VARCHAR(50), -- Código gerado pelo SISCOMEX
        versao INT UNSIGNED NOT NULL DEFAULT 1,
        situacao ENUM('ATIVO', 'INATIVO', 'DESATIVADO') NOT NULL DEFAULT 'ATIVO',
        data_inclusao DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        data_ultima_alteracao DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        data_referencia DATETIME, -- Para inclusão retroativa
        
        PRIMARY KEY (id),
        FOREIGN KEY (pais_codigo) REFERENCES pais(codigo),
        FOREIGN KEY (subdivisao_codigo) REFERENCES subdivisao(codigo),
        INDEX idx_cnpj_raiz (cnpj_raiz_responsavel),
        INDEX idx_tin (tin),
        INDEX idx_nome (nome),
        INDEX idx_situacao (situacao),
        UNIQUE INDEX idx_tin_unique (tin) -- TIN deve ser único quando preenchido
    );

    -- Tabela para identificações adicionais (DUNS, LEI, etc.)
    CREATE TABLE IF NOT EXISTS identificacao_adicional (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        operador_estrangeiro_id INT UNSIGNED NOT NULL,
        numero VARCHAR(100) NOT NULL,
        agencia_emissora_codigo VARCHAR(20) NOT NULL,
        
        PRIMARY KEY (id),
        FOREIGN KEY (operador_estrangeiro_id) REFERENCES operador_estrangeiro(id) ON DELETE CASCADE,
        FOREIGN KEY (agencia_emissora_codigo) REFERENCES agencia_emissora(codigo),
        INDEX idx_operador (operador_estrangeiro_id),
        INDEX idx_numero (numero)
    );

    CREATE TABLE ncm_cache (
        id INT PRIMARY KEY AUTO_INCREMENT,
        codigo VARCHAR(8) UNIQUE NOT NULL,
        descricao VARCHAR(255),
        -- Metadados de sincronização
        data_ultima_sincronizacao TIMESTAMP,
        hash_estrutura VARCHAR(64), -- MD5/SHA da estrutura
        versao_estrutura INT,
        -- Dados para UI
        unidade_medida VARCHAR(10),
        aliquota_ii DECIMAL(5,2)
    );

    CREATE TABLE atributos_cache (
        id INT PRIMARY KEY AUTO_INCREMENT,
        ncm_codigo VARCHAR(8),
        modalidade VARCHAR(50),
        estrutura_json JSON NOT NULL,
        -- Versionamento
        data_sincronizacao TIMESTAMP,
        versao INT,
        hash_estrutura VARCHAR(64),
        vigencia_inicio DATE,
        vigencia_fim DATE,
        -- Índice único para evitar duplicatas
        UNIQUE KEY uk_ncm_modalidade_versao (ncm_codigo, modalidade, versao)
    );

    CREATE TABLE produto (
        id INT PRIMARY KEY AUTO_INCREMENT,
        catalogo_id INT UNSIGNED NOT NULL,
        codigo VARCHAR(50) UNIQUE DEFAULT NULL,
        versao INT NOT NULL DEFAULT 1,
        status ENUM('RASCUNHO', 'ATIVO', 'INATIVO') DEFAULT 'RASCUNHO',
        ncm_codigo VARCHAR(8) NOT NULL,
        modalidade VARCHAR(50),
        -- Rastreabilidade
        atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        criado_por VARCHAR(100),
        -- Versionamento de estrutura
        versao_estrutura_atributos INT,
        INDEX idx_ncm (ncm_codigo),
        INDEX idx_catalogo (catalogo_id),
        FOREIGN KEY (catalogo_id) REFERENCES catalogo(id),
        UNIQUE KEY uk_codigo_versao (codigo, versao)
    );

    CREATE TABLE produto_atributos (
        id INT PRIMARY KEY AUTO_INCREMENT,
        produto_id INT NOT NULL,
        valores_json JSON NOT NULL,
        -- Snapshot da estrutura no momento do preenchimento
        estrutura_snapshot_json JSON,
        -- Validação
        validado_em TIMESTAMP NULL,
        erros_validacao JSON NULL,
        FOREIGN KEY (produto_id) REFERENCES produto(id)
    );

    CREATE TABLE codigo_interno_produto (
        id INT PRIMARY KEY AUTO_INCREMENT,
        produto_id INT NOT NULL,
        codigo VARCHAR(50) NOT NULL,
        FOREIGN KEY (produto_id) REFERENCES produto(id) ON DELETE CASCADE
    );

    CREATE TABLE operador_estrangeiro_produto (
        id INT PRIMARY KEY AUTO_INCREMENT,
        pais_codigo VARCHAR(2) NOT NULL,
        conhecido BOOLEAN NOT NULL,
        operador_estrangeiro_id INT NULL,
        produto_id INT NOT NULL,
        FOREIGN KEY (pais_codigo) REFERENCES pais(codigo),
        FOREIGN KEY (operador_estrangeiro_id) REFERENCES operador_estrangeiro(id),
        FOREIGN KEY (produto_id) REFERENCES produto(id) ON DELETE CASCADE
    );


    -- Scripts de dados iniciais para Operador Estrangeiro
    -- Execute após criar as tabelas

    -- Inserir países principais
    INSERT INTO pais (codigo, sigla, nome) VALUES
    -- América do Sul
    ('BR', 'BR', 'Brasil'),
    ('AR', 'AR', 'Argentina'),
    ('UY', 'UY', 'Uruguai'),
    ('PY', 'PY', 'Paraguai'),
    ('CL', 'CL', 'Chile'),
    ('PE', 'PE', 'Peru'),
    ('CO', 'CO', 'Colômbia'),
    ('VE', 'VE', 'Venezuela'),
    ('EC', 'EC', 'Equador'),
    ('BO', 'BO', 'Bolívia'),
    ('GY', 'GY', 'Guiana'),
    ('SR', 'SR', 'Suriname'),

    -- América do Norte
    ('US', 'US', 'Estados Unidos'),
    ('CA', 'CA', 'Canadá'),
    ('MX', 'MX', 'México'),

    -- Europa
    ('DE', 'DE', 'Alemanha'),
    ('FR', 'FR', 'França'),
    ('IT', 'IT', 'Itália'),
    ('ES', 'ES', 'Espanha'),
    ('GB', 'GB', 'Reino Unido'),
    ('PT', 'PT', 'Portugal'),
    ('NL', 'NL', 'Países Baixos'),
    ('BE', 'BE', 'Bélgica'),
    ('CH', 'CH', 'Suíça'),
    ('AT', 'AT', 'Áustria'),
    ('SE', 'SE', 'Suécia'),
    ('NO', 'NO', 'Noruega'),
    ('DK', 'DK', 'Dinamarca'),
    ('FI', 'FI', 'Finlândia'),

    -- Ásia
    ('CN', 'CN', 'China'),
    ('JP', 'JP', 'Japão'),
    ('KR', 'KR', 'Coreia do Sul'),
    ('IN', 'IN', 'Índia'),
    ('TH', 'TH', 'Tailândia'),
    ('VN', 'VN', 'Vietnã'),
    ('MY', 'MY', 'Malásia'),
    ('SG', 'SG', 'Singapura'),
    ('ID', 'ID', 'Indonésia'),
    ('PH', 'PH', 'Filipinas'),

    -- Oceania
    ('AU', 'AU', 'Austrália'),
    ('NZ', 'NZ', 'Nova Zelândia'),

    -- África
    ('ZA', 'ZA', 'África do Sul'),
    ('EG', 'EG', 'Egito'),
    ('MA', 'MA', 'Marrocos'),
    ('NG', 'NG', 'Nigéria'),

    -- Oriente Médio
    ('AE', 'AE', 'Emirados Árabes Unidos'),
    ('SA', 'SA', 'Arábia Saudita'),
    ('IL', 'IL', 'Israel'),
    ('TR', 'TR', 'Turquia');

    -- Inserir subdivisões principais (estados brasileiros e alguns internacionais)
    INSERT INTO subdivisao (codigo, sigla, nome, pais_codigo) VALUES
    -- Estados brasileiros
    ('BR-AC', 'AC', 'Acre', 'BR'),
    ('BR-AL', 'AL', 'Alagoas', 'BR'),
    ('BR-AP', 'AP', 'Amapá', 'BR'),
    ('BR-AM', 'AM', 'Amazonas', 'BR'),
    ('BR-BA', 'BA', 'Bahia', 'BR'),
    ('BR-CE', 'CE', 'Ceará', 'BR'),
    ('BR-DF', 'DF', 'Distrito Federal', 'BR'),
    ('BR-ES', 'ES', 'Espírito Santo', 'BR'),
    ('BR-GO', 'GO', 'Goiás', 'BR'),
    ('BR-MA', 'MA', 'Maranhão', 'BR'),
    ('BR-MT', 'MT', 'Mato Grosso', 'BR'),
    ('BR-MS', 'MS', 'Mato Grosso do Sul', 'BR'),
    ('BR-MG', 'MG', 'Minas Gerais', 'BR'),
    ('BR-PA', 'PA', 'Pará', 'BR'),
    ('BR-PB', 'PB', 'Paraíba', 'BR'),
    ('BR-PR', 'PR', 'Paraná', 'BR'),
    ('BR-PE', 'PE', 'Pernambuco', 'BR'),
    ('BR-PI', 'PI', 'Piauí', 'BR'),
    ('BR-RJ', 'RJ', 'Rio de Janeiro', 'BR'),
    ('BR-RN', 'RN', 'Rio Grande do Norte', 'BR'),
    ('BR-RS', 'RS', 'Rio Grande do Sul', 'BR'),
    ('BR-RO', 'RO', 'Rondônia', 'BR'),
    ('BR-RR', 'RR', 'Roraima', 'BR'),
    ('BR-SC', 'SC', 'Santa Catarina', 'BR'),
    ('BR-SP', 'SP', 'São Paulo', 'BR'),
    ('BR-SE', 'SE', 'Sergipe', 'BR'),
    ('BR-TO', 'TO', 'Tocantins', 'BR'),

    -- Estados americanos principais
    ('US-CA', 'CA', 'California', 'US'),
    ('US-NY', 'NY', 'New York', 'US'),
    ('US-TX', 'TX', 'Texas', 'US'),
    ('US-FL', 'FL', 'Florida', 'US'),
    ('US-IL', 'IL', 'Illinois', 'US'),

    -- Províncias argentinas principais
    ('AR-BA', 'BA', 'Buenos Aires', 'AR'),
    ('AR-CF', 'CF', 'Capital Federal', 'AR'),
    ('AR-CB', 'CB', 'Córdoba', 'AR'),
    ('AR-SF', 'SF', 'Santa Fe', 'AR'),

    -- Províncias chinesas principais
    ('CN-BJ', 'BJ', 'Beijing', 'CN'),
    ('CN-SH', 'SH', 'Shanghai', 'CN'),
    ('CN-GD', 'GD', 'Guangdong', 'CN'),
    ('CN-JS', 'JS', 'Jiangsu', 'CN');

    -- Inserir agências emissoras principais
    INSERT INTO agencia_emissora (codigo, sigla, nome) VALUES
    -- Principais agências de rating e identificação
    ('DUNS', 'DUNS', 'Dun & Bradstreet (DUNS Number)'),
    ('LEI', 'LEI', 'Legal Entity Identifier (LEI)'),
    ('SWIFT', 'SWIFT', 'Society for Worldwide Interbank Financial Telecommunication'),
    ('PAYDEX', 'PAYDEX', 'Dun & Bradstreet PAYDEX Score'),
    ('FICO', 'FICO', 'Fair Isaac Corporation Score'),
    ('EIN', 'EIN', 'Employer Identification Number (ERS/IRS)'),
    ('CIK', 'CIK', 'Central Index Key (SEC)'),
    ('GIIN', 'GIIN', 'Global Intermediary Identification Number'),
    ('ISIN', 'ISIN', 'International Securities Identification Number'),
    ('CUSIP', 'CUSIP', 'Committee on Uniform Securities Identification Procedures'),

    -- Agências governamentais brasileiras
    ('RFB', 'RFB', 'Receita Federal do Brasil'),
    ('CNPJ', 'CNPJ', 'Cadastro Nacional da Pessoa Jurídica'),
    ('CPF', 'CPF', 'Cadastro de Pessoas Físicas'),

    -- Agências internacionais
    ('VAT', 'VAT', 'Value Added Tax Number (Europa)'),
    ('NIE', 'NIE', 'Número de Identificación de Extranjero (Espanha)'),
    ('RFC', 'RFC', 'Registro Federal de Contribuyentes (México)'),
    ('ABN', 'ABN', 'Australian Business Number'),
    ('GST', 'GST', 'Goods and Services Tax Number'),
    ('TIN', 'TIN', 'Taxpayer Identification Number'),

    -- Organizações internacionais
    ('UN', 'UN', 'United Nations Global Compact'),
    ('ISO', 'ISO', 'International Organization for Standardization'),
    ('WTO', 'WTO', 'World Trade Organization'),
    ('WCO', 'WCO', 'World Customs Organization');
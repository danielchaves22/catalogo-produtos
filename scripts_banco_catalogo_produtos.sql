-- Criar tabela de registro de usuários autenticados
CREATE TABLE IF NOT EXISTS usuario_catalogo (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    legacy_id INT UNSIGNED NOT NULL,
    username VARCHAR(255) NOT NULL,
    nome VARCHAR(255) NOT NULL,
    super_user_id INT UNSIGNED NOT NULL,
    role VARCHAR(10) NOT NULL,
    ultimo_login DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE INDEX uk_usuario_catalogo_username (username)
);

-- Tabela de permissões de subusuários
CREATE TABLE IF NOT EXISTS usuario_permissao (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    usuario_catalogo_id INT UNSIGNED NOT NULL,
    codigo VARCHAR(255) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE INDEX uk_usuario_codigo (usuario_catalogo_id, codigo),
    CONSTRAINT fk_usuario_permissao_usuario FOREIGN KEY (usuario_catalogo_id) REFERENCES usuario_catalogo(id) ON DELETE CASCADE
);

-- Criar tabela de certificados
CREATE TABLE IF NOT EXISTS certificado (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    super_user_id INT UNSIGNED NOT NULL,
    nome VARCHAR(255) NOT NULL,
    pfx_path VARCHAR(255) NOT NULL,
    senha VARCHAR(255),
    criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_cert_super_user_id (super_user_id)
);

-- Tabela de mensagens para notificações dos superusuários
CREATE TABLE IF NOT EXISTS mensagem (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    super_user_id INT UNSIGNED NOT NULL,
    titulo VARCHAR(255) NOT NULL,
    conteudo TEXT NOT NULL,
    categoria ENUM('ATUALIZACAO_SISCOMEX', 'IMPORTACAO_CONCLUIDA') NOT NULL DEFAULT 'ATUALIZACAO_SISCOMEX',
    metadados JSON NULL,
    lida TINYINT(1) NOT NULL DEFAULT 0,
    criada_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    lida_em DATETIME NULL,
    PRIMARY KEY (id),
    INDEX idx_mensagem_super_user_id (super_user_id),
    INDEX idx_mensagem_lida (lida),
    INDEX idx_mensagem_criada_em (criada_em)
);

CREATE TABLE IF NOT EXISTS catalogo (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    nome VARCHAR(255) NOT NULL,
    cpf_cnpj VARCHAR(20),
    ultima_alteracao DATETIME NOT NULL,
    numero INT UNSIGNED NOT NULL,
    status ENUM('ATIVO', 'INATIVO') NOT NULL DEFAULT 'ATIVO',
    ambiente ENUM('HOMOLOGACAO', 'PRODUCAO') NOT NULL DEFAULT 'HOMOLOGACAO',
    super_user_id INT UNSIGNED NOT NULL,
    certificado_id INT UNSIGNED,
    PRIMARY KEY (id),
    UNIQUE INDEX idx_numero (numero),
    INDEX idx_super_user_id (super_user_id),
    INDEX idx_certificado_id (certificado_id),
    CONSTRAINT fk_catalogo_certificado FOREIGN KEY (certificado_id) REFERENCES certificado(id)
);

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
        catalogo_id INT UNSIGNED NOT NULL,

        -- Dados básicos
        pais_codigo VARCHAR(10) NOT NULL,
        tin VARCHAR(50),
        nome VARCHAR(255) NOT NULL,
        email VARCHAR(255),
        codigo_interno VARCHAR(100),
        numero INT UNSIGNED NOT NULL,

        -- Endereço
        codigo_postal VARCHAR(50),
        logradouro VARCHAR(500),
        cidade VARCHAR(255),
        subdivisao_codigo VARCHAR(20),

        -- Controle do sistema
        codigo VARCHAR(50), -- Código gerado pelo SISCOMEX
        versao INT UNSIGNED NOT NULL DEFAULT 1,
        situacao ENUM('RASCUNHO', 'ATIVADO', 'DESATIVADO') NOT NULL DEFAULT 'RASCUNHO',
        data_inclusao DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        data_ultima_alteracao DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        data_referencia DATETIME, -- Para inclusão retroativa

        PRIMARY KEY (id),
        FOREIGN KEY (catalogo_id) REFERENCES catalogo(id),
        FOREIGN KEY (pais_codigo) REFERENCES pais(codigo),
        FOREIGN KEY (subdivisao_codigo) REFERENCES subdivisao(codigo),
        INDEX idx_catalogo_id (catalogo_id),
        UNIQUE INDEX idx_operador_estrangeiro_numero (numero)
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

    CREATE TABLE IF NOT EXISTS ncm_cache (
        id INT PRIMARY KEY AUTO_INCREMENT,
        codigo VARCHAR(8) UNIQUE NOT NULL,
        descricao VARCHAR(255),
        -- Metadados de sincronização
        data_ultima_sincronizacao TIMESTAMP,
        hash_estrutura VARCHAR(64), -- MD5/SHA da estrutura
        versao_estrutura INT,
        -- Dados para UI
        unidade_medida VARCHAR(20),
        aliquota_ii DECIMAL(5,2)
    );

    CREATE TABLE IF NOT EXISTS atributos_cache (
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

    CREATE TABLE IF NOT EXISTS atributo_versao (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        ncm_codigo VARCHAR(8) NOT NULL,
        modalidade VARCHAR(50) NULL,
        versao INT NOT NULL,
        criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uk_ncm_modalidade_versao_normalizado (ncm_codigo, modalidade, versao)
    );

    CREATE TABLE IF NOT EXISTS atributo (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        versao_id INT UNSIGNED NOT NULL,
        codigo VARCHAR(100) NOT NULL,
        nome VARCHAR(255) NOT NULL,
        tipo VARCHAR(50) NOT NULL,
        obrigatorio TINYINT(1) NOT NULL,
        multivalorado TINYINT(1) NOT NULL,
        orientacao_preenchimento TEXT NULL,
        validacoes_json JSON NULL,
        descricao_condicao TEXT NULL,
        condicao_json JSON NULL,
        parent_codigo VARCHAR(100) NULL,
        condicionante_codigo VARCHAR(100) NULL,
        ordem INT NOT NULL,
        parent_id INT UNSIGNED NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uk_versao_codigo (versao_id, codigo),
        INDEX idx_atributo_versao (versao_id),
        CONSTRAINT fk_atributo_versao FOREIGN KEY (versao_id) REFERENCES atributo_versao(id) ON DELETE CASCADE,
        CONSTRAINT fk_atributo_parent FOREIGN KEY (parent_id) REFERENCES atributo(id)
    );

    CREATE TABLE IF NOT EXISTS atributo_dominio_normalizado (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        atributo_id INT UNSIGNED NOT NULL,
        codigo VARCHAR(100) NOT NULL,
        descricao VARCHAR(255) NULL,
        ordem INT NOT NULL,
        PRIMARY KEY (id),
        INDEX idx_atributo_dominio (atributo_id),
        CONSTRAINT fk_atributo_dominio_atributo FOREIGN KEY (atributo_id) REFERENCES atributo(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS produto (
        id INT PRIMARY KEY AUTO_INCREMENT,
        catalogo_id INT UNSIGNED NOT NULL,
        codigo VARCHAR(50) DEFAULT NULL,
        versao INT NOT NULL DEFAULT 1,
        status ENUM('PENDENTE', 'APROVADO', 'PROCESSANDO', 'TRANSMITIDO', 'ERRO') DEFAULT 'PENDENTE',
        situacao ENUM('RASCUNHO', 'ATIVADO', 'DESATIVADO') NOT NULL DEFAULT 'RASCUNHO',
        ncm_codigo VARCHAR(8) NOT NULL,
        modalidade VARCHAR(50),
        denominacao VARCHAR(120) NOT NULL,
        descricao TEXT NOT NULL,
        numero INT UNSIGNED NOT NULL,
        -- Rastreabilidade
        atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        criado_por VARCHAR(100),
        -- Versionamento de estrutura
        versao_estrutura_atributos INT,
        versao_atributo_id INT UNSIGNED NULL,
        INDEX idx_ncm (ncm_codigo),
        INDEX idx_catalogo (catalogo_id),
        INDEX idx_situacao (situacao),
        FOREIGN KEY (catalogo_id) REFERENCES catalogo(id),
        UNIQUE KEY uk_catalogo_codigo (catalogo_id, codigo),
        UNIQUE INDEX idx_numero (numero),
        CONSTRAINT fk_produto_versao_atributo FOREIGN KEY (versao_atributo_id) REFERENCES atributo_versao(id)
    );

    CREATE TABLE IF NOT EXISTS produto_resumo_dashboard (
        produto_id INT NOT NULL,
        catalogo_id INT UNSIGNED NOT NULL,
        atributos_total INT NOT NULL DEFAULT 0,
        obrigatorios_pendentes INT NOT NULL DEFAULT 0,
        validos_transmissao INT NOT NULL DEFAULT 0,
        atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (produto_id),
        INDEX idx_produto_resumo_catalogo (catalogo_id),
        CONSTRAINT fk_produto_resumo_produto FOREIGN KEY (produto_id) REFERENCES produto(id) ON DELETE CASCADE,
        CONSTRAINT fk_produto_resumo_catalogo FOREIGN KEY (catalogo_id) REFERENCES catalogo(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS produto_atributo (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        produto_id INT NOT NULL,
        atributo_id INT UNSIGNED NOT NULL,
        atributo_versao_id INT UNSIGNED NOT NULL,
        validado_em DATETIME NULL,
        erros_validacao JSON NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uk_produto_atributo (produto_id, atributo_id),
        CONSTRAINT fk_produto_atributo_produto FOREIGN KEY (produto_id) REFERENCES produto(id) ON DELETE CASCADE,
        CONSTRAINT fk_produto_atributo_versao FOREIGN KEY (atributo_versao_id) REFERENCES atributo_versao(id),
        CONSTRAINT fk_produto_atributo_atributo FOREIGN KEY (atributo_id) REFERENCES atributo(id)
    );

    CREATE TABLE IF NOT EXISTS produto_atributo_valor (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        produto_atributo_id INT UNSIGNED NOT NULL,
        valor_json JSON NOT NULL,
        ordem INT NOT NULL DEFAULT 0,
        PRIMARY KEY (id),
        INDEX idx_produto_atributo_valor (produto_atributo_id),
        CONSTRAINT fk_produto_valor_atributo FOREIGN KEY (produto_atributo_id) REFERENCES produto_atributo(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS ncm_atributo_valor_grupo (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        super_user_id INT UNSIGNED NOT NULL,
        ncm_codigo VARCHAR(8) NOT NULL,
        modalidade VARCHAR(10) NULL,
        atributo_versao_id INT UNSIGNED NOT NULL,
        criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        criado_por VARCHAR(255) NULL,
        atualizado_por VARCHAR(255) NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uk_superuser_ncm_modalidade (super_user_id, ncm_codigo, modalidade),
        INDEX idx_ncm_valores_padrao_super_user (super_user_id),
        CONSTRAINT fk_grupo_versao FOREIGN KEY (atributo_versao_id) REFERENCES atributo_versao(id)
    );

    CREATE TABLE IF NOT EXISTS ncm_atributo_valor (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        grupo_id INT UNSIGNED NOT NULL,
        atributo_id INT UNSIGNED NOT NULL,
        valor_json JSON NOT NULL,
        ordem INT NOT NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uk_grupo_atributo_ordem (grupo_id, atributo_id, ordem),
        CONSTRAINT fk_ncm_valor_grupo FOREIGN KEY (grupo_id) REFERENCES ncm_atributo_valor_grupo(id) ON DELETE CASCADE,
        CONSTRAINT fk_ncm_valor_atributo FOREIGN KEY (atributo_id) REFERENCES atributo(id)
    );

    CREATE TABLE IF NOT EXISTS ncm_atributo_valor_catalogo (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        grupo_id INT UNSIGNED NOT NULL,
        catalogo_id INT UNSIGNED NOT NULL,
        criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uk_valor_padrao_catalogo (grupo_id, catalogo_id),
        INDEX idx_nvpc_catalogo (catalogo_id),
        CONSTRAINT fk_nvpc_grupo FOREIGN KEY (grupo_id) REFERENCES ncm_atributo_valor_grupo(id) ON DELETE CASCADE,
        CONSTRAINT fk_nvpc_catalogo FOREIGN KEY (catalogo_id) REFERENCES catalogo(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS codigo_interno_produto (
        id INT PRIMARY KEY AUTO_INCREMENT,
        produto_id INT NOT NULL,
        codigo VARCHAR(50) NOT NULL,
        FOREIGN KEY (produto_id) REFERENCES produto(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS operador_estrangeiro_produto (
        id INT PRIMARY KEY AUTO_INCREMENT,
        pais_codigo VARCHAR(10) NOT NULL,
        conhecido BOOLEAN NOT NULL,
        operador_estrangeiro_id INT UNSIGNED NULL,
        produto_id INT NOT NULL,
        FOREIGN KEY (pais_codigo) REFERENCES pais(codigo),
        FOREIGN KEY (operador_estrangeiro_id) REFERENCES operador_estrangeiro(id),
        FOREIGN KEY (produto_id) REFERENCES produto(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS async_job (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        tipo ENUM('IMPORTACAO_PRODUTO', 'EXCLUSAO_MASSIVA', 'ALTERACAO_ATRIBUTOS', 'AJUSTE_ESTRUTURA', 'EXPORTACAO_PRODUTO', 'EXPORTACAO_FABRICANTE', 'TRANSMISSAO_PRODUTO') NOT NULL,
        status ENUM('PENDENTE', 'PROCESSANDO', 'CONCLUIDO', 'FALHO', 'CANCELADO') NOT NULL DEFAULT 'PENDENTE',
        tentativas INT UNSIGNED NOT NULL DEFAULT 0,
        max_tentativas INT UNSIGNED NOT NULL DEFAULT 3,
        prioridade INT NOT NULL DEFAULT 0,
        payload JSON NULL,
        locked_at DATETIME NULL,
        heartbeat_at DATETIME NULL,
        finalizado_em DATETIME NULL,
        criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        INDEX idx_async_job_status (status),
        INDEX idx_async_job_tipo (tipo)
    );

    CREATE TABLE IF NOT EXISTS async_job_file (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        job_id INT UNSIGNED NOT NULL,
        nome VARCHAR(255) NOT NULL,
        conteudo_base64 LONGTEXT NULL,
        storage_path VARCHAR(512) NULL,
        storage_provider VARCHAR(64) NULL,
        expira_em DATETIME NULL,
        criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE INDEX uk_async_job_file_job (job_id),
        CONSTRAINT fk_async_job_file_job FOREIGN KEY (job_id) REFERENCES async_job(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS async_job_log (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        job_id INT UNSIGNED NOT NULL,
        status ENUM('PENDENTE', 'PROCESSANDO', 'CONCLUIDO', 'FALHO', 'CANCELADO') NOT NULL,
        mensagem TEXT NULL,
        criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        INDEX idx_async_job_log_job (job_id),
        CONSTRAINT fk_async_job_log_job FOREIGN KEY (job_id) REFERENCES async_job(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS produto_transmissao (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        super_user_id INT UNSIGNED NOT NULL,
        catalogo_id INT UNSIGNED NOT NULL,
        usuario_catalogo_id INT UNSIGNED NULL,
        async_job_id INT UNSIGNED NULL,
        modalidade ENUM('PRODUTOS') NOT NULL DEFAULT 'PRODUTOS',
        origem_tipo ENUM('MANUAL', 'AJUSTE_ESTRUTURA') NOT NULL DEFAULT 'MANUAL',
        origem_contexto_json JSON NULL,
        status ENUM('AGUARDANDO_CONFIRMACAO', 'EM_FILA', 'PROCESSANDO', 'INTERROMPIDA', 'CONCLUIDO', 'FALHO', 'PARCIAL', 'CANCELADA') NOT NULL DEFAULT 'AGUARDANDO_CONFIRMACAO',
        total_itens INT UNSIGNED NOT NULL DEFAULT 0,
        total_sucesso INT UNSIGNED NOT NULL DEFAULT 0,
        total_erro INT UNSIGNED NOT NULL DEFAULT 0,
        selecao_json JSON NULL,
        enfileirada_em DATETIME NULL,
        payload_envio_path VARCHAR(512) NULL,
        payload_envio_expira_em DATETIME NULL,
        payload_envio_tamanho INT UNSIGNED NULL,
        payload_envio_provider VARCHAR(64) NULL,
        payload_retorno_path VARCHAR(512) NULL,
        payload_retorno_expira_em DATETIME NULL,
        payload_retorno_tamanho INT UNSIGNED NULL,
        payload_retorno_provider VARCHAR(64) NULL,
        iniciado_em DATETIME NULL,
        concluido_em DATETIME NULL,
        criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE INDEX uk_transmissao_job (async_job_id),
        INDEX idx_transmissao_super_user (super_user_id),
        INDEX idx_transmissao_catalogo (catalogo_id),
        CONSTRAINT fk_transmissao_super_user FOREIGN KEY (super_user_id) REFERENCES comex(idv32),
        CONSTRAINT fk_transmissao_catalogo FOREIGN KEY (catalogo_id) REFERENCES catalogo(id),
        CONSTRAINT fk_transmissao_usuario_catalogo FOREIGN KEY (usuario_catalogo_id) REFERENCES usuario_catalogo(id),
        CONSTRAINT fk_transmissao_job FOREIGN KEY (async_job_id) REFERENCES async_job(id)
    );

    CREATE TABLE IF NOT EXISTS produto_transmissao_bloco (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        transmissao_id INT UNSIGNED NOT NULL,
        ordem INT UNSIGNED NOT NULL,
        status ENUM('PENDENTE', 'PROCESSANDO', 'INTERROMPIDO', 'CONCLUIDO', 'FALHO', 'PARCIAL') NOT NULL DEFAULT 'PENDENTE',
        total_itens INT UNSIGNED NOT NULL DEFAULT 0,
        total_sucesso INT UNSIGNED NOT NULL DEFAULT 0,
        total_erro INT UNSIGNED NOT NULL DEFAULT 0,
        mensagem TEXT NULL,
        iniciado_em DATETIME NULL,
        concluido_em DATETIME NULL,
        criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE INDEX uk_transmissao_bloco_ordem (transmissao_id, ordem),
        INDEX idx_transmissao_bloco_transmissao (transmissao_id),
        CONSTRAINT fk_transmissao_bloco_transmissao FOREIGN KEY (transmissao_id) REFERENCES produto_transmissao(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS produto_transmissao_item (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        transmissao_id INT UNSIGNED NOT NULL,
        bloco_id INT UNSIGNED NULL,
        produto_id INT UNSIGNED NOT NULL,
        ordem_execucao INT UNSIGNED NULL,
        operacao ENUM('INCLUSAO', 'NOVA_VERSAO') NOT NULL DEFAULT 'INCLUSAO',
        status ENUM('PENDENTE', 'PROCESSANDO', 'SUCESSO', 'ERRO') NOT NULL DEFAULT 'PENDENTE',
        mensagem TEXT NULL,
        retorno_codigo VARCHAR(255) NULL,
        retorno_versao INT UNSIGNED NULL,
        retorno_situacao VARCHAR(64) NULL,
        criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        INDEX idx_transmissao_item_transmissao (transmissao_id),
        INDEX idx_transmissao_item_bloco (bloco_id),
        INDEX idx_transmissao_item_produto (produto_id),
        INDEX idx_transmissao_item_ordem (transmissao_id, ordem_execucao),
        CONSTRAINT fk_transmissao_item_transmissao FOREIGN KEY (transmissao_id) REFERENCES produto_transmissao(id) ON DELETE CASCADE,
        CONSTRAINT fk_transmissao_item_bloco FOREIGN KEY (bloco_id) REFERENCES produto_transmissao_bloco(id) ON DELETE SET NULL,
        CONSTRAINT fk_transmissao_item_produto FOREIGN KEY (produto_id) REFERENCES produto(id)
    );

    CREATE TABLE IF NOT EXISTS importacao_produto (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        super_user_id INT UNSIGNED NOT NULL,
        usuario_catalogo_id INT UNSIGNED NULL,
        catalogo_id INT UNSIGNED NOT NULL,
        modalidade VARCHAR(50) NOT NULL,
        nome_arquivo VARCHAR(255),
        situacao ENUM('EM_ANDAMENTO', 'CONCLUIDA', 'CONCLUIDA_INCOMPLETA', 'REVERTIDA') NOT NULL DEFAULT 'EM_ANDAMENTO',
        resultado ENUM('PENDENTE', 'SUCESSO', 'ATENCAO') NOT NULL DEFAULT 'PENDENTE',
        total_registros INT UNSIGNED NOT NULL DEFAULT 0,
        total_criados INT UNSIGNED NOT NULL DEFAULT 0,
        total_com_atencao INT UNSIGNED NOT NULL DEFAULT 0,
        total_com_erro INT UNSIGNED NOT NULL DEFAULT 0,
        iniciado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        finalizado_em DATETIME NULL,
        async_job_id INT UNSIGNED NULL,
        PRIMARY KEY (id),
        INDEX idx_importacao_super_user (super_user_id),
        INDEX idx_importacao_catalogo (catalogo_id),
        UNIQUE INDEX uk_importacao_async_job (async_job_id),
        -- Integridade com o superusuário garantida via aplicação, conforme catálogo
        CONSTRAINT fk_importacao_produto_catalogo FOREIGN KEY (catalogo_id) REFERENCES catalogo(id),
        CONSTRAINT fk_importacao_produto_usuario FOREIGN KEY (usuario_catalogo_id) REFERENCES usuario_catalogo(id),
        CONSTRAINT fk_importacao_produto_async_job FOREIGN KEY (async_job_id) REFERENCES async_job(id)
    );

    CREATE TABLE IF NOT EXISTS importacao_produto_item (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        importacao_id INT UNSIGNED NOT NULL,
        linha_planilha INT NOT NULL,
        ncm VARCHAR(8),
        denominacao VARCHAR(255),
        codigos_internos TEXT,
        resultado ENUM('SUCESSO', 'ATENCAO', 'ERRO') NOT NULL,
        mensagens JSON NULL,
        possui_erro_impeditivo TINYINT(1) NOT NULL DEFAULT 0,
        possui_alerta TINYINT(1) NOT NULL DEFAULT 0,
        produto_id INT UNSIGNED NULL,
        criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        INDEX idx_importacao_item_importacao (importacao_id),
        INDEX idx_importacao_item_resultado (resultado),
        CONSTRAINT fk_importacao_produto_item_importacao FOREIGN KEY (importacao_id) REFERENCES importacao_produto(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS produto_exportacao (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        super_user_id INT UNSIGNED NOT NULL,
        usuario_catalogo_id INT UNSIGNED NULL,
        todos_filtrados TINYINT(1) NOT NULL DEFAULT 0,
        filtros_json JSON NULL,
        ids_selecionados_json JSON NULL,
        ids_deselecionados_json JSON NULL,
        busca VARCHAR(255) NULL,
        arquivo_nome VARCHAR(255) NULL,
        arquivo_path VARCHAR(512) NULL,
        arquivo_expira_em DATETIME NULL,
        arquivo_tamanho INT UNSIGNED NULL,
        total_itens INT UNSIGNED NULL,
        async_job_id INT UNSIGNED NULL,
        criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE INDEX uk_exportacao_job (async_job_id),
        INDEX idx_exportacao_super_user (super_user_id),
        CONSTRAINT fk_exportacao_super_user FOREIGN KEY (super_user_id) REFERENCES comex(idv32),
        CONSTRAINT fk_exportacao_usuario_catalogo FOREIGN KEY (usuario_catalogo_id) REFERENCES usuario_catalogo(id),
        CONSTRAINT fk_exportacao_job FOREIGN KEY (async_job_id) REFERENCES async_job(id)
    );

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

    -- FUNCTIONS e TRIGGERS

    -- Função para gerar números aleatórios de 6 dígitos
    DROP FUNCTION IF EXISTS generate_unique_random_numero;

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
            -- Gerar número entre 100000 e 999999 (6 dígitos)
            SET random_num = FLOOR(1000000 + RAND() * 9000000);
            
            -- Verificar se já existe
            IF NOT EXISTS (SELECT 1 FROM catalogo WHERE numero = random_num) THEN
                SET is_unique = TRUE;
            END IF;
            
            SET attempt_count = attempt_count + 1;
        END WHILE;
        
        -- Se não conseguiu um número único após várias tentativas, usar fallback
        IF NOT is_unique THEN
            -- Fallback: Pegar o maior número existente e adicionar 1
            SELECT IFNULL(MAX(numero), 1000000) + 1 INTO random_num FROM catalogo;
        END IF;
        
        RETURN random_num;
    END$$

    DELIMITER ;

    -- Trigger para inserir o número automático antes do INSERT
    DROP TRIGGER IF EXISTS before_catalogo_insert;

    DELIMITER $$

    CREATE TRIGGER before_catalogo_insert
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

    -- Função para gerar números aleatórios de 6 dígitos para produtos
    DROP FUNCTION IF EXISTS generate_unique_random_produto_numero;

    DELIMITER $$

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

    DELIMITER ;

    -- Trigger para inserir o número automático antes do INSERT na tabela produto
    DROP TRIGGER IF EXISTS before_produto_insert;

    DELIMITER $$

    CREATE TRIGGER before_produto_insert
    BEFORE INSERT ON produto
    FOR EACH ROW
    BEGIN
        IF NEW.numero IS NULL OR NEW.numero = 0 THEN
            SET NEW.numero = generate_unique_random_produto_numero();
        END IF;
    END$$

    DELIMITER ;

    -- Função para gerar números aleatórios de 6 dígitos para operadores estrangeiros
    DROP FUNCTION IF EXISTS generate_unique_random_operador_numero;

    DELIMITER $$

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

    DELIMITER ;

    -- Trigger para inserir o número automático antes do INSERT na tabela operador_estrangeiro
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


    -- Scripts de dados iniciais para Operador Estrangeiro
    -- Execute após criar as tabelas

    -- Inserir lista completa de países ISO 3166-1 alpha-2
    INSERT INTO pais (codigo, sigla, nome) VALUES
    ('XX', 'XX', 'A DESIGNAR'),
    ('AD', 'AD', 'Andorra'),
    ('AE', 'AE', 'Emirados Árabes Unidos'),
    ('AF', 'AF', 'Afeganistão'),
    ('AG', 'AG', 'Antígua e Barbuda'),
    ('AI', 'AI', 'Anguila'),
    ('AL', 'AL', 'Albânia'),
    ('AM', 'AM', 'Armênia'),
    ('AO', 'AO', 'Angola'),
    ('AQ', 'AQ', 'Antártida'),
    ('AR', 'AR', 'Argentina'),
    ('AS', 'AS', 'Samoa Americana'),
    ('AT', 'AT', 'Áustria'),
    ('AU', 'AU', 'Austrália'),
    ('AW', 'AW', 'Aruba'),
    ('AX', 'AX', 'Ilhas Aland'),
    ('AZ', 'AZ', 'Azerbaijão'),
    ('BA', 'BA', 'Bósnia e Herzegovina'),
    ('BB', 'BB', 'Barbados'),
    ('BD', 'BD', 'Bangladesh'),
    ('BE', 'BE', 'Bélgica'),
    ('BF', 'BF', 'Burquina Faso'),
    ('BG', 'BG', 'Bulgária'),
    ('BH', 'BH', 'Barein'),
    ('BI', 'BI', 'Burundi'),
    ('BJ', 'BJ', 'Benin'),
    ('BL', 'BL', 'São Bartolomeu'),
    ('BM', 'BM', 'Bermudas'),
    ('BN', 'BN', 'Brunei'),
    ('BO', 'BO', 'Bolívia'),
    ('BQ', 'BQ', 'Países Baixos Caribenhos'),
    ('BR', 'BR', 'Brasil'),
    ('BS', 'BS', 'Bahamas'),
    ('BT', 'BT', 'Butão'),
    ('BV', 'BV', 'Ilha Bouvet'),
    ('BW', 'BW', 'Botsuana'),
    ('BY', 'BY', 'Bielorrússia'),
    ('BZ', 'BZ', 'Belize'),
    ('CA', 'CA', 'Canadá'),
    ('CC', 'CC', 'Ilhas Cocos (Keeling)'),
    ('CD', 'CD', 'Congo - Kinshasa'),
    ('CF', 'CF', 'República Centro-Africana'),
    ('CG', 'CG', 'República do Congo'),
    ('CH', 'CH', 'Suíça'),
    ('CI', 'CI', 'Costa do Marfim'),
    ('CK', 'CK', 'Ilhas Cook'),
    ('CL', 'CL', 'Chile'),
    ('CM', 'CM', 'Camarões'),
    ('CN', 'CN', 'China'),
    ('CO', 'CO', 'Colômbia'),
    ('CR', 'CR', 'Costa Rica'),
    ('CU', 'CU', 'Cuba'),
    ('CV', 'CV', 'Cabo Verde'),
    ('CW', 'CW', 'Curaçao'),
    ('CX', 'CX', 'Ilha Christmas'),
    ('CY', 'CY', 'Chipre'),
    ('CZ', 'CZ', 'Tchéquia'),
    ('DE', 'DE', 'Alemanha'),
    ('DJ', 'DJ', 'Djibuti'),
    ('DK', 'DK', 'Dinamarca'),
    ('DM', 'DM', 'Dominica'),
    ('DO', 'DO', 'República Dominicana'),
    ('DZ', 'DZ', 'Argélia'),
    ('EC', 'EC', 'Equador'),
    ('EE', 'EE', 'Estônia'),
    ('EG', 'EG', 'Egito'),
    ('EH', 'EH', 'Saara Ocidental'),
    ('ER', 'ER', 'Eritreia'),
    ('ES', 'ES', 'Espanha'),
    ('ET', 'ET', 'Etiópia'),
    ('FI', 'FI', 'Finlândia'),
    ('FJ', 'FJ', 'Fiji'),
    ('FK', 'FK', 'Ilhas Malvinas'),
    ('FM', 'FM', 'Micronésia'),
    ('FO', 'FO', 'Ilhas Faroé'),
    ('FR', 'FR', 'França'),
    ('GA', 'GA', 'Gabão'),
    ('GB', 'GB', 'Reino Unido'),
    ('GD', 'GD', 'Granada'),
    ('GE', 'GE', 'Geórgia'),
    ('GF', 'GF', 'Guiana Francesa'),
    ('GG', 'GG', 'Guernsey'),
    ('GH', 'GH', 'Gana'),
    ('GI', 'GI', 'Gibraltar'),
    ('GL', 'GL', 'Groenlândia'),
    ('GM', 'GM', 'Gâmbia'),
    ('GN', 'GN', 'Guiné'),
    ('GP', 'GP', 'Guadalupe'),
    ('GQ', 'GQ', 'Guiné Equatorial'),
    ('GR', 'GR', 'Grécia'),
    ('GS', 'GS', 'Ilhas Geórgia do Sul e Sandwich do Sul'),
    ('GT', 'GT', 'Guatemala'),
    ('GU', 'GU', 'Guam'),
    ('GW', 'GW', 'Guiné-Bissau'),
    ('GY', 'GY', 'Guiana'),
    ('HK', 'HK', 'Hong Kong, RAE da China'),
    ('HM', 'HM', 'Ilhas Heard e McDonald'),
    ('HN', 'HN', 'Honduras'),
    ('HR', 'HR', 'Croácia'),
    ('HT', 'HT', 'Haiti'),
    ('HU', 'HU', 'Hungria'),
    ('ID', 'ID', 'Indonésia'),
    ('IE', 'IE', 'Irlanda'),
    ('IL', 'IL', 'Israel'),
    ('IM', 'IM', 'Ilha de Man'),
    ('IN', 'IN', 'Índia'),
    ('IO', 'IO', 'Território Britânico do Oceano Índico'),
    ('IQ', 'IQ', 'Iraque'),
    ('IR', 'IR', 'Irã'),
    ('IS', 'IS', 'Islândia'),
    ('IT', 'IT', 'Itália'),
    ('JE', 'JE', 'Jersey'),
    ('JM', 'JM', 'Jamaica'),
    ('JO', 'JO', 'Jordânia'),
    ('JP', 'JP', 'Japão'),
    ('KE', 'KE', 'Quênia'),
    ('KG', 'KG', 'Quirguistão'),
    ('KH', 'KH', 'Camboja'),
    ('KI', 'KI', 'Quiribati'),
    ('KM', 'KM', 'Comores'),
    ('KN', 'KN', 'São Cristóvão e Névis'),
    ('KP', 'KP', 'Coreia do Norte'),
    ('KR', 'KR', 'Coreia do Sul'),
    ('KW', 'KW', 'Kuwait'),
    ('KY', 'KY', 'Ilhas Cayman'),
    ('KZ', 'KZ', 'Cazaquistão'),
    ('LA', 'LA', 'Laos'),
    ('LB', 'LB', 'Líbano'),
    ('LC', 'LC', 'Santa Lúcia'),
    ('LI', 'LI', 'Liechtenstein'),
    ('LK', 'LK', 'Sri Lanka'),
    ('LR', 'LR', 'Libéria'),
    ('LS', 'LS', 'Lesoto'),
    ('LT', 'LT', 'Lituânia'),
    ('LU', 'LU', 'Luxemburgo'),
    ('LV', 'LV', 'Letônia'),
    ('LY', 'LY', 'Líbia'),
    ('MA', 'MA', 'Marrocos'),
    ('MC', 'MC', 'Mônaco'),
    ('MD', 'MD', 'Moldávia'),
    ('ME', 'ME', 'Montenegro'),
    ('MF', 'MF', 'São Martinho'),
    ('MG', 'MG', 'Madagascar'),
    ('MH', 'MH', 'Ilhas Marshall'),
    ('MK', 'MK', 'Macedônia do Norte'),
    ('ML', 'ML', 'Mali'),
    ('MM', 'MM', 'Mianmar (Birmânia)'),
    ('MN', 'MN', 'Mongólia'),
    ('MO', 'MO', 'Macau, RAE da China'),
    ('MP', 'MP', 'Ilhas Marianas do Norte'),
    ('MQ', 'MQ', 'Martinica'),
    ('MR', 'MR', 'Mauritânia'),
    ('MS', 'MS', 'Montserrat'),
    ('MT', 'MT', 'Malta'),
    ('MU', 'MU', 'Maurício'),
    ('MV', 'MV', 'Maldivas'),
    ('MW', 'MW', 'Malaui'),
    ('MX', 'MX', 'México'),
    ('MY', 'MY', 'Malásia'),
    ('MZ', 'MZ', 'Moçambique'),
    ('NA', 'NA', 'Namíbia'),
    ('NC', 'NC', 'Nova Caledônia'),
    ('NE', 'NE', 'Níger'),
    ('NF', 'NF', 'Ilha Norfolk'),
    ('NG', 'NG', 'Nigéria'),
    ('NI', 'NI', 'Nicarágua'),
    ('NL', 'NL', 'Países Baixos'),
    ('NO', 'NO', 'Noruega'),
    ('NP', 'NP', 'Nepal'),
    ('NR', 'NR', 'Nauru'),
    ('NU', 'NU', 'Niue'),
    ('NZ', 'NZ', 'Nova Zelândia'),
    ('OM', 'OM', 'Omã'),
    ('PA', 'PA', 'Panamá'),
    ('PE', 'PE', 'Peru'),
    ('PF', 'PF', 'Polinésia Francesa'),
    ('PG', 'PG', 'Papua-Nova Guiné'),
    ('PH', 'PH', 'Filipinas'),
    ('PK', 'PK', 'Paquistão'),
    ('PL', 'PL', 'Polônia'),
    ('PM', 'PM', 'São Pedro e Miquelão'),
    ('PN', 'PN', 'Ilhas Pitcairn'),
    ('PR', 'PR', 'Porto Rico'),
    ('PS', 'PS', 'Territórios palestinos'),
    ('PT', 'PT', 'Portugal'),
    ('PW', 'PW', 'Palau'),
    ('PY', 'PY', 'Paraguai'),
    ('QA', 'QA', 'Catar'),
    ('RE', 'RE', 'Reunião'),
    ('RO', 'RO', 'Romênia'),
    ('RS', 'RS', 'Sérvia'),
    ('RU', 'RU', 'Rússia'),
    ('RW', 'RW', 'Ruanda'),
    ('SA', 'SA', 'Arábia Saudita'),
    ('SB', 'SB', 'Ilhas Salomão'),
    ('SC', 'SC', 'Seicheles'),
    ('SD', 'SD', 'Sudão'),
    ('SE', 'SE', 'Suécia'),
    ('SG', 'SG', 'Singapura'),
    ('SH', 'SH', 'Santa Helena'),
    ('SI', 'SI', 'Eslovênia'),
    ('SJ', 'SJ', 'Svalbard e Jan Mayen'),
    ('SK', 'SK', 'Eslováquia'),
    ('SL', 'SL', 'Serra Leoa'),
    ('SM', 'SM', 'San Marino'),
    ('SN', 'SN', 'Senegal'),
    ('SO', 'SO', 'Somália'),
    ('SR', 'SR', 'Suriname'),
    ('SS', 'SS', 'Sudão do Sul'),
    ('ST', 'ST', 'São Tomé e Príncipe'),
    ('SV', 'SV', 'El Salvador'),
    ('SX', 'SX', 'Sint Maarten'),
    ('SY', 'SY', 'Síria'),
    ('SZ', 'SZ', 'Essuatíni'),
    ('TC', 'TC', 'Ilhas Turcas e Caicos'),
    ('TD', 'TD', 'Chade'),
    ('TF', 'TF', 'Territórios Franceses do Sul'),
    ('TG', 'TG', 'Togo'),
    ('TH', 'TH', 'Tailândia'),
    ('TJ', 'TJ', 'Tadjiquistão'),
    ('TK', 'TK', 'Tokelau'),
    ('TL', 'TL', 'Timor-Leste'),
    ('TM', 'TM', 'Turcomenistão'),
    ('TN', 'TN', 'Tunísia'),
    ('TO', 'TO', 'Tonga'),
    ('TR', 'TR', 'Turquia'),
    ('TT', 'TT', 'Trinidad e Tobago'),
    ('TV', 'TV', 'Tuvalu'),
    ('TW', 'TW', 'Taiwan'),
    ('TZ', 'TZ', 'Tanzânia'),
    ('UA', 'UA', 'Ucrânia'),
    ('UG', 'UG', 'Uganda'),
    ('UM', 'UM', 'Ilhas Menores Distantes dos EUA'),
    ('US', 'US', 'Estados Unidos'),
    ('UY', 'UY', 'Uruguai'),
    ('UZ', 'UZ', 'Uzbequistão'),
    ('VA', 'VA', 'Cidade do Vaticano'),
    ('VC', 'VC', 'São Vicente e Granadinas'),
    ('VE', 'VE', 'Venezuela'),
    ('VG', 'VG', 'Ilhas Virgens Britânicas'),
    ('VI', 'VI', 'Ilhas Virgens Americanas'),
    ('VN', 'VN', 'Vietnã'),
    ('VU', 'VU', 'Vanuatu'),
    ('WF', 'WF', 'Wallis e Futuna'),
    ('WS', 'WS', 'Samoa'),
    ('YE', 'YE', 'Iêmen'),
    ('YT', 'YT', 'Mayotte'),
    ('ZA', 'ZA', 'África do Sul'),
    ('ZM', 'ZM', 'Zâmbia'),
    ('ZW', 'ZW', 'Zimbábue');

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
    ('CN-JS', 'JS', 'Jiangsu', 'CN'),
    ('CN-HN', 'HN', 'Hunan', 'CN'),
    ('CN-JX', 'JX', 'Jiangxi', 'CN'),
    ('CN-QH', 'QH', 'Qinghai', 'CN'),
    ('CN-ZJ', 'ZJ', 'Zhejiang', 'CN'),

    -- SubdivisÃµes americanas adicionais
    ('US-GA', 'GA', 'Georgia', 'US'),

    -- SubdivisÃµes da Coreia do Sul
    ('KR-11', '11', 'Seoul', 'KR'),
    ('KR-41', '41', 'Gyeonggi-do', 'KR'),

    -- SubdivisÃµes do JapÃ£o
    ('JP-07', '07', 'Fukushima', 'JP'),
    ('JP-13', '13', 'Tokyo', 'JP'),

    -- SubdivisÃµes adicionais observadas na importaÃ§Ã£o SISCOMEX
    ('DE-BY', 'BY', 'Bayern', 'DE'),
    ('EC-G', 'G', 'Guayas', 'EC'),
    ('FR-92', '92', 'Hauts-de-Seine', 'FR'),
    ('IT-65', '65', 'Abruzzo', 'IT'),
    ('MX-JAL', 'JAL', 'Jalisco', 'MX'),
    ('PH-CAV', 'CAV', 'Cavite', 'PH'),
    ('SG-01', '01', 'Central Singapore', 'SG'),
    ('SG-05', '05', 'South West', 'SG'),
    ('TW-KHH', 'KHH', 'Kaohsiung', 'TW'),
    ('VN-21', '21', 'Thanh Hoa', 'VN');

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

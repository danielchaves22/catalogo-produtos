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
        codigo_siscomex CHAR(3) NULL,
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
        tipo ENUM(
            'IMPORTACAO_PRODUTO',
            'EXCLUSAO_MASSIVA',
            'ALTERACAO_ATRIBUTOS',
            'AJUSTE_ESTRUTURA',
            'APLICACAO_AJUSTE_ESTRUTURA',
            'AJUSTE_ESTRUTURA_CATALOGO',
            'CORRECAO_STATUS_AJUSTE_ESTRUTURA',
            'EXPORTACAO_PRODUTO',
            'EXPORTACAO_FABRICANTE',
            'TRANSMISSAO_PRODUTO'
        ) NOT NULL,
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
    INSERT INTO pais (codigo, codigo_siscomex, sigla, nome) VALUES
    ('XX', '994', 'XX', 'A DESIGNAR'),
    ('AD', '037', 'AD', 'Andorra'),
    ('AE', '244', 'AE', 'Emirados Árabes Unidos'),
    ('AF', '013', 'AF', 'Afeganistão'),
    ('AG', '043', 'AG', 'Antígua e Barbuda'),
    ('AI', '041', 'AI', 'Anguila'),
    ('AL', '017', 'AL', 'Albânia'),
    ('AM', '064', 'AM', 'Armênia'),
    ('AO', '040', 'AO', 'Angola'),
    ('AQ', NULL, 'AQ', 'Antártida'),
    ('AR', '063', 'AR', 'Argentina'),
    ('AS', '691', 'AS', 'Samoa Americana'),
    ('AT', '072', 'AT', 'Áustria'),
    ('AU', '069', 'AU', 'Austrália'),
    ('AW', '065', 'AW', 'Aruba'),
    ('AX', NULL, 'AX', 'Ilhas Aland'),
    ('AZ', '073', 'AZ', 'Azerbaijão'),
    ('BA', '098', 'BA', 'Bósnia e Herzegovina'),
    ('BB', '083', 'BB', 'Barbados'),
    ('BD', '081', 'BD', 'Bangladesh'),
    ('BE', '087', 'BE', 'Bélgica'),
    ('BF', '031', 'BF', 'Burquina Faso'),
    ('BG', '111', 'BG', 'Bulgária'),
    ('BH', '080', 'BH', 'Barein'),
    ('BI', '115', 'BI', 'Burundi'),
    ('BJ', '229', 'BJ', 'Benin'),
    ('BL', NULL, 'BL', 'São Bartolomeu'),
    ('BM', '090', 'BM', 'Bermudas'),
    ('BN', '108', 'BN', 'Brunei'),
    ('BO', '097', 'BO', 'Bolívia'),
    ('BQ', '099', 'BQ', 'Países Baixos Caribenhos'),
    ('BR', '105', 'BR', 'Brasil'),
    ('BS', '077', 'BS', 'Bahamas'),
    ('BT', '119', 'BT', 'Butão'),
    ('BV', '102', 'BV', 'Ilha Bouvet'),
    ('BW', '101', 'BW', 'Botsuana'),
    ('BY', '085', 'BY', 'Bielorrússia'),
    ('BZ', '088', 'BZ', 'Belize'),
    ('CA', '149', 'CA', 'Canadá'),
    ('CC', '165', 'CC', 'Ilhas Cocos (Keeling)'),
    ('CD', '888', 'CD', 'Congo - Kinshasa'),
    ('CF', '640', 'CF', 'República Centro-Africana'),
    ('CG', '177', 'CG', 'República do Congo'),
    ('CH', '767', 'CH', 'Suíça'),
    ('CI', '193', 'CI', 'Costa do Marfim'),
    ('CK', '183', 'CK', 'Ilhas Cook'),
    ('CL', '158', 'CL', 'Chile'),
    ('CM', '145', 'CM', 'Camarões'),
    ('CN', '160', 'CN', 'China'),
    ('CO', '169', 'CO', 'Colômbia'),
    ('CR', '196', 'CR', 'Costa Rica'),
    ('CU', '199', 'CU', 'Cuba'),
    ('CV', '127', 'CV', 'Cabo Verde'),
    ('CW', '200', 'CW', 'Curaçao'),
    ('CX', '511', 'CX', 'Ilha Christmas'),
    ('CY', '163', 'CY', 'Chipre'),
    ('CZ', '791', 'CZ', 'Tchéquia'),
    ('DE', '023', 'DE', 'Alemanha'),
    ('DJ', '783', 'DJ', 'Djibuti'),
    ('DK', '232', 'DK', 'Dinamarca'),
    ('DM', '235', 'DM', 'Dominica'),
    ('DO', '647', 'DO', 'República Dominicana'),
    ('DZ', '059', 'DZ', 'Argélia'),
    ('EC', '239', 'EC', 'Equador'),
    ('EE', '251', 'EE', 'Estônia'),
    ('EG', '240', 'EG', 'Egito'),
    ('EH', '685', 'EH', 'Saara Ocidental'),
    ('ER', '243', 'ER', 'Eritreia'),
    ('ES', '245', 'ES', 'Espanha'),
    ('ET', '253', 'ET', 'Etiópia'),
    ('FI', '271', 'FI', 'Finlândia'),
    ('FJ', '870', 'FJ', 'Fiji'),
    ('FK', '255', 'FK', 'Ilhas Malvinas'),
    ('FM', '499', 'FM', 'Micronésia'),
    ('FO', '259', 'FO', 'Ilhas Faroé'),
    ('FR', '275', 'FR', 'França'),
    ('GA', '281', 'GA', 'Gabão'),
    ('GB', '628', 'GB', 'Reino Unido'),
    ('GD', '297', 'GD', 'Granada'),
    ('GE', '291', 'GE', 'Geórgia'),
    ('GF', '325', 'GF', 'Guiana Francesa'),
    ('GG', '321', 'GG', 'Guernsey'),
    ('GH', '289', 'GH', 'Gana'),
    ('GI', '293', 'GI', 'Gibraltar'),
    ('GL', '305', 'GL', 'Groenlândia'),
    ('GM', '285', 'GM', 'Gâmbia'),
    ('GN', '329', 'GN', 'Guiné'),
    ('GP', '309', 'GP', 'Guadalupe'),
    ('GQ', '331', 'GQ', 'Guiné Equatorial'),
    ('GR', '301', 'GR', 'Grécia'),
    ('GS', NULL, 'GS', 'Ilhas Geórgia do Sul e Sandwich do Sul'),
    ('GT', '317', 'GT', 'Guatemala'),
    ('GU', '313', 'GU', 'Guam'),
    ('GW', '334', 'GW', 'Guiné-Bissau'),
    ('GY', '337', 'GY', 'Guiana'),
    ('HK', '351', 'HK', 'Hong Kong, RAE da China'),
    ('HM', NULL, 'HM', 'Ilhas Heard e McDonald'),
    ('HN', '345', 'HN', 'Honduras'),
    ('HR', '195', 'HR', 'Croácia'),
    ('HT', '341', 'HT', 'Haiti'),
    ('HU', '355', 'HU', 'Hungria'),
    ('ID', '365', 'ID', 'Indonésia'),
    ('IE', '375', 'IE', 'Irlanda'),
    ('IL', '383', 'IL', 'Israel'),
    ('IM', '359', 'IM', 'Ilha de Man'),
    ('IN', '361', 'IN', 'Índia'),
    ('IO', '782', 'IO', 'Território Britânico do Oceano Índico'),
    ('IQ', '369', 'IQ', 'Iraque'),
    ('IR', '372', 'IR', 'Irã'),
    ('IS', '379', 'IS', 'Islândia'),
    ('IT', '386', 'IT', 'Itália'),
    ('JE', '393', 'JE', 'Jersey'),
    ('JM', '391', 'JM', 'Jamaica'),
    ('JO', '403', 'JO', 'Jordânia'),
    ('JP', '399', 'JP', 'Japão'),
    ('KE', '623', 'KE', 'Quênia'),
    ('KG', '625', 'KG', 'Quirguistão'),
    ('KH', '141', 'KH', 'Camboja'),
    ('KI', '411', 'KI', 'Quiribati'),
    ('KM', '173', 'KM', 'Comores'),
    ('KN', '695', 'KN', 'São Cristóvão e Névis'),
    ('KP', '187', 'KP', 'Coreia do Norte'),
    ('KR', '190', 'KR', 'Coreia do Sul'),
    ('KW', '198', 'KW', 'Kuwait'),
    ('KY', '137', 'KY', 'Ilhas Cayman'),
    ('KZ', '153', 'KZ', 'Cazaquistão'),
    ('LA', '420', 'LA', 'Laos'),
    ('LB', '431', 'LB', 'Líbano'),
    ('LC', '715', 'LC', 'Santa Lúcia'),
    ('LI', '440', 'LI', 'Liechtenstein'),
    ('LK', '750', 'LK', 'Sri Lanka'),
    ('LR', '434', 'LR', 'Libéria'),
    ('LS', '426', 'LS', 'Lesoto'),
    ('LT', '442', 'LT', 'Lituânia'),
    ('LU', '445', 'LU', 'Luxemburgo'),
    ('LV', '427', 'LV', 'Letônia'),
    ('LY', '438', 'LY', 'Líbia'),
    ('MA', '474', 'MA', 'Marrocos'),
    ('MC', '495', 'MC', 'Mônaco'),
    ('MD', '494', 'MD', 'Moldávia'),
    ('ME', '498', 'ME', 'Montenegro'),
    ('MF', '698', 'MF', 'São Martinho'),
    ('MG', '450', 'MG', 'Madagascar'),
    ('MH', '476', 'MH', 'Ilhas Marshall'),
    ('MK', '449', 'MK', 'Macedônia do Norte'),
    ('ML', '464', 'ML', 'Mali'),
    ('MM', '093', 'MM', 'Mianmar (Birmânia)'),
    ('MN', '497', 'MN', 'Mongólia'),
    ('MO', '447', 'MO', 'Macau, RAE da China'),
    ('MP', '472', 'MP', 'Ilhas Marianas do Norte'),
    ('MQ', '477', 'MQ', 'Martinica'),
    ('MR', '488', 'MR', 'Mauritânia'),
    ('MS', '501', 'MS', 'Montserrat'),
    ('MT', '467', 'MT', 'Malta'),
    ('MU', '485', 'MU', 'Maurício'),
    ('MV', '461', 'MV', 'Maldivas'),
    ('MW', '458', 'MW', 'Malaui'),
    ('MX', '493', 'MX', 'México'),
    ('MY', '455', 'MY', 'Malásia'),
    ('MZ', '505', 'MZ', 'Moçambique'),
    ('NA', '507', 'NA', 'Namíbia'),
    ('NC', '542', 'NC', 'Nova Caledônia'),
    ('NE', '525', 'NE', 'Níger'),
    ('NF', '535', 'NF', 'Ilha Norfolk'),
    ('NG', '528', 'NG', 'Nigéria'),
    ('NI', '521', 'NI', 'Nicarágua'),
    ('NL', '573', 'NL', 'Países Baixos'),
    ('NO', '538', 'NO', 'Noruega'),
    ('NP', '517', 'NP', 'Nepal'),
    ('NR', '508', 'NR', 'Nauru'),
    ('NU', '531', 'NU', 'Niue'),
    ('NZ', '548', 'NZ', 'Nova Zelândia'),
    ('OM', '556', 'OM', 'Omã'),
    ('PA', '580', 'PA', 'Panamá'),
    ('PE', '589', 'PE', 'Peru'),
    ('PF', '599', 'PF', 'Polinésia Francesa'),
    ('PG', '545', 'PG', 'Papua-Nova Guiné'),
    ('PH', '267', 'PH', 'Filipinas'),
    ('PK', '576', 'PK', 'Paquistão'),
    ('PL', '603', 'PL', 'Polônia'),
    ('PM', '700', 'PM', 'São Pedro e Miquelão'),
    ('PN', '593', 'PN', 'Ilhas Pitcairn'),
    ('PR', '611', 'PR', 'Porto Rico'),
    ('PS', '578', 'PS', 'Territórios palestinos'),
    ('PT', '607', 'PT', 'Portugal'),
    ('PW', '575', 'PW', 'Palau'),
    ('PY', '586', 'PY', 'Paraguai'),
    ('QA', '154', 'QA', 'Catar'),
    ('RE', '660', 'RE', 'Reunião'),
    ('RO', '670', 'RO', 'Romênia'),
    ('RS', '737', 'RS', 'Sérvia'),
    ('RU', '676', 'RU', 'Rússia'),
    ('RW', '675', 'RW', 'Ruanda'),
    ('SA', '053', 'SA', 'Arábia Saudita'),
    ('SB', '677', 'SB', 'Ilhas Salomão'),
    ('SC', '731', 'SC', 'Seicheles'),
    ('SD', '759', 'SD', 'Sudão'),
    ('SE', '764', 'SE', 'Suécia'),
    ('SG', '741', 'SG', 'Singapura'),
    ('SH', '710', 'SH', 'Santa Helena'),
    ('SI', '246', 'SI', 'Eslovênia'),
    ('SJ', '755', 'SJ', 'Svalbard e Jan Mayen'),
    ('SK', '247', 'SK', 'Eslováquia'),
    ('SL', '735', 'SL', 'Serra Leoa'),
    ('SM', '697', 'SM', 'San Marino'),
    ('SN', '728', 'SN', 'Senegal'),
    ('SO', '748', 'SO', 'Somália'),
    ('SR', '770', 'SR', 'Suriname'),
    ('SS', '760', 'SS', 'Sudão do Sul'),
    ('ST', '720', 'ST', 'São Tomé e Príncipe'),
    ('SV', '687', 'SV', 'El Salvador'),
    ('SX', '699', 'SX', 'Sint Maarten'),
    ('SY', '744', 'SY', 'Síria'),
    ('SZ', '754', 'SZ', 'Essuatíni'),
    ('TC', '823', 'TC', 'Ilhas Turcas e Caicos'),
    ('TD', '788', 'TD', 'Chade'),
    ('TF', NULL, 'TF', 'Territórios Franceses do Sul'),
    ('TG', '800', 'TG', 'Togo'),
    ('TH', '776', 'TH', 'Tailândia'),
    ('TJ', '772', 'TJ', 'Tadjiquistão'),
    ('TK', '805', 'TK', 'Tokelau'),
    ('TL', '795', 'TL', 'Timor-Leste'),
    ('TM', '824', 'TM', 'Turcomenistão'),
    ('TN', '820', 'TN', 'Tunísia'),
    ('TO', '810', 'TO', 'Tonga'),
    ('TR', '827', 'TR', 'Turquia'),
    ('TT', '815', 'TT', 'Trinidad e Tobago'),
    ('TV', '828', 'TV', 'Tuvalu'),
    ('TW', '161', 'TW', 'Taiwan'),
    ('TZ', '780', 'TZ', 'Tanzânia'),
    ('UA', '831', 'UA', 'Ucrânia'),
    ('UG', '833', 'UG', 'Uganda'),
    ('UM', '566', 'UM', 'Ilhas Menores Distantes dos EUA'),
    ('US', '249', 'US', 'Estados Unidos'),
    ('UY', '845', 'UY', 'Uruguai'),
    ('UZ', '847', 'UZ', 'Uzbequistão'),
    ('VA', '848', 'VA', 'Cidade do Vaticano'),
    ('VC', '705', 'VC', 'São Vicente e Granadinas'),
    ('VE', '850', 'VE', 'Venezuela'),
    ('VG', '863', 'VG', 'Ilhas Virgens Britânicas'),
    ('VI', '866', 'VI', 'Ilhas Virgens Americanas'),
    ('VN', '858', 'VN', 'Vietnã'),
    ('VU', '551', 'VU', 'Vanuatu'),
    ('WF', '875', 'WF', 'Wallis e Futuna'),
    ('WS', '690', 'WS', 'Samoa'),
    ('YE', '357', 'YE', 'Iêmen'),
    ('YT', NULL, 'YT', 'Mayotte'),
    ('ZA', '756', 'ZA', 'África do Sul'),
    ('ZM', '890', 'ZM', 'Zâmbia'),
    ('ZW', '665', 'ZW', 'Zimbábue');

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

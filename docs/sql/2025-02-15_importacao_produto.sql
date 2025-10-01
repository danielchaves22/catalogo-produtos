-- Cria tabelas para controle de importação de produtos via planilha
CREATE TABLE IF NOT EXISTS importacao_produto (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    super_user_id INT UNSIGNED NOT NULL,
    usuario_catalogo_id INT UNSIGNED NULL,
    catalogo_id INT UNSIGNED NOT NULL,
    modalidade VARCHAR(50) NOT NULL,
    nome_arquivo VARCHAR(255),
    situacao ENUM('EM_ANDAMENTO', 'CONCLUIDA') NOT NULL DEFAULT 'EM_ANDAMENTO',
    resultado ENUM('PENDENTE', 'SUCESSO', 'ATENCAO') NOT NULL DEFAULT 'PENDENTE',
    total_registros INT UNSIGNED NOT NULL DEFAULT 0,
    total_criados INT UNSIGNED NOT NULL DEFAULT 0,
    total_com_atencao INT UNSIGNED NOT NULL DEFAULT 0,
    total_com_erro INT UNSIGNED NOT NULL DEFAULT 0,
    iniciado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finalizado_em DATETIME NULL,
    PRIMARY KEY (id),
    INDEX idx_importacao_super_user (super_user_id),
    INDEX idx_importacao_catalogo (catalogo_id),
    -- Integridade com superusuário será validada pela aplicação
    CONSTRAINT fk_importacao_produto_catalogo FOREIGN KEY (catalogo_id) REFERENCES catalogo(id),
    CONSTRAINT fk_importacao_produto_usuario FOREIGN KEY (usuario_catalogo_id) REFERENCES usuario_catalogo(id)
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
    CONSTRAINT fk_importacao_produto_item_importacao FOREIGN KEY (importacao_id) REFERENCES importacao_produto(id) ON DELETE CASCADE,
    CONSTRAINT fk_importacao_produto_item_produto FOREIGN KEY (produto_id) REFERENCES produto(id)
);

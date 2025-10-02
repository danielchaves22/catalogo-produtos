-- Script incremental para criação da tabela de mensagens
CREATE TABLE IF NOT EXISTS mensagem (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    super_user_id INT UNSIGNED NOT NULL,
    titulo VARCHAR(255) NOT NULL,
    conteudo TEXT NOT NULL,
    categoria ENUM('ATUALIZACAO_SISCOMEX') NOT NULL DEFAULT 'ATUALIZACAO_SISCOMEX',
    lida TINYINT(1) NOT NULL DEFAULT 0,
    criada_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    lida_em DATETIME NULL,
    PRIMARY KEY (id),
    INDEX idx_mensagem_super_user_id (super_user_id),
    INDEX idx_mensagem_lida (lida),
    INDEX idx_mensagem_criada_em (criada_em)
);

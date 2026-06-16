ALTER TABLE produto_transmissao
    MODIFY COLUMN status ENUM(
        'AGUARDANDO_CONFIRMACAO',
        'EM_FILA',
        'PROCESSANDO',
        'INTERROMPIDA',
        'CONCLUIDO',
        'FALHO',
        'PARCIAL',
        'CANCELADA'
    ) NOT NULL DEFAULT 'AGUARDANDO_CONFIRMACAO';

ALTER TABLE produto_transmissao
    ADD COLUMN enfileirada_em DATETIME NULL AFTER selecao_json;

CREATE TABLE produto_transmissao_bloco (
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

ALTER TABLE produto_transmissao_item
    ADD COLUMN bloco_id INT UNSIGNED NULL AFTER transmissao_id,
    ADD COLUMN ordem_execucao INT UNSIGNED NULL AFTER produto_id,
    ADD INDEX idx_transmissao_item_bloco (bloco_id),
    ADD INDEX idx_transmissao_item_ordem (transmissao_id, ordem_execucao),
    ADD CONSTRAINT fk_transmissao_item_bloco FOREIGN KEY (bloco_id) REFERENCES produto_transmissao_bloco(id) ON DELETE SET NULL;

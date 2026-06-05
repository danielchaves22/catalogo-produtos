-- Execute este script no schema configurado em CATALOG_SCHEMA_NAME.
-- Exemplo local: USE catprod;

ALTER TABLE produto_transmissao
    MODIFY COLUMN status ENUM(
        'AGUARDANDO_CONFIRMACAO',
        'EM_FILA',
        'PROCESSANDO',
        'CONCLUIDO',
        'FALHO',
        'PARCIAL',
        'CANCELADA'
    ) NOT NULL DEFAULT 'AGUARDANDO_CONFIRMACAO';

-- Execute este script no schema configurado em CATALOG_SCHEMA_NAME.
-- Exemplo local: USE catprod;

ALTER TABLE produto_transmissao_item
    ADD COLUMN operacao ENUM('INCLUSAO', 'NOVA_VERSAO') NOT NULL DEFAULT 'INCLUSAO' AFTER produto_id;

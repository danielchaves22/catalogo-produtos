-- Execute este script no schema configurado em CATALOG_SCHEMA_NAME.
-- Exemplo local: USE catprod;

ALTER TABLE produto_transmissao
    ADD COLUMN origem_tipo ENUM('MANUAL', 'AJUSTE_ESTRUTURA') NOT NULL DEFAULT 'MANUAL' AFTER modalidade,
    ADD COLUMN origem_contexto_json JSON NULL AFTER origem_tipo;

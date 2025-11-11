ALTER TABLE atributo_preenchimento_massa
    ADD COLUMN modo_atribuicao VARCHAR(32) NOT NULL DEFAULT 'TODOS_COM_EXCECOES' AFTER modalidade,
    ADD COLUMN produtos_selecionados_json JSON NULL AFTER produtos_excecao_json;

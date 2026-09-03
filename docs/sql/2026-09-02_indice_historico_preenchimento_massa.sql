ALTER TABLE atributo_preenchimento_massa
  ADD INDEX idx_attr_massa_super_user_criado (super_user_id, criado_em, id);

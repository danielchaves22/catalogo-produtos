ALTER TABLE `operador_estrangeiro`
  ADD COLUMN `super_user_id` INT NOT NULL,
  ADD INDEX `idx_super_user_id` (`super_user_id`),
  ADD CONSTRAINT `operador_estrangeiro_super_user_id_fkey` FOREIGN KEY (`super_user_id`) REFERENCES `comex`(`idv32`);

-- Preenche super_user_id utilizando o CNPJ raiz do catálogo vinculado
UPDATE operador_estrangeiro oe
JOIN catalogo c ON SUBSTRING(c.cpf_cnpj,1,8) = oe.cnpj_raiz_responsavel
SET oe.super_user_id = c.super_user_id
WHERE oe.super_user_id IS NULL;

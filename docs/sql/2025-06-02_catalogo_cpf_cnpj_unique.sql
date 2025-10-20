-- Garante unicidade de CPF/CNPJ por superusuário no catálogo
-- Justificativa: evita duplicidade de catálogos para o mesmo documento na camada de banco.

ALTER TABLE catalogo
    ADD CONSTRAINT uk_superuser_cpf_cnpj UNIQUE (super_user_id, cpf_cnpj);

-- CreateTable
CREATE TABLE `comex` (
    `idv32` INTEGER NOT NULL,
    `username` VARCHAR(191) NOT NULL,
    `senha` VARCHAR(191) NOT NULL,
    `nomecompleto` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `comex_username_key`(`username`),
    PRIMARY KEY (`idv32`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `comex_subsessoes` (
    `Id` INTEGER NOT NULL AUTO_INCREMENT,
    `idv32_comex` INTEGER NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `senha` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `comex_subsessoes_email_key`(`email`),
    PRIMARY KEY (`Id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `catalogo` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nome` VARCHAR(191) NOT NULL,
    `cpf_cnpj` VARCHAR(191) NULL,
    `ultima_alteracao` DATETIME(3) NOT NULL,
    `numero` INTEGER NOT NULL,
    `status` ENUM('ATIVO', 'INATIVO') NOT NULL,
    `super_user_id` INTEGER NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pais` (
    `codigo` VARCHAR(191) NOT NULL,
    `sigla` VARCHAR(191) NOT NULL,
    `nome` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`codigo`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `agencia_emissora` (
    `codigo` VARCHAR(191) NOT NULL,
    `sigla` VARCHAR(191) NOT NULL,
    `nome` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`codigo`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `subdivisao` (
    `codigo` VARCHAR(191) NOT NULL,
    `sigla` VARCHAR(191) NOT NULL,
    `nome` VARCHAR(191) NOT NULL,
    `pais_codigo` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`codigo`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `operador_estrangeiro` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `catalogo_id` INTEGER NOT NULL,
    `pais_codigo` VARCHAR(191) NOT NULL,
    `tin` VARCHAR(191) NULL,
    `nome` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NULL,
    `codigo_interno` VARCHAR(191) NULL,
    `codigo_postal` VARCHAR(191) NULL,
    `logradouro` VARCHAR(191) NULL,
    `cidade` VARCHAR(191) NULL,
    `subdivisao_codigo` VARCHAR(191) NULL,
    `codigo` VARCHAR(191) NULL,
    `versao` INTEGER NOT NULL DEFAULT 1,
    `situacao` ENUM('ATIVO', 'INATIVO', 'DESATIVADO') NOT NULL DEFAULT 'ATIVO',
    `data_inclusao` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `data_ultima_alteracao` DATETIME(3) NOT NULL,
    `data_referencia` DATETIME(3) NULL,

    INDEX `idx_catalogo_id`(`catalogo_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `identificacao_adicional` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `operador_estrangeiro_id` INTEGER NOT NULL,
    `numero` VARCHAR(191) NOT NULL,
    `agencia_emissora_codigo` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ncm_cache` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `codigo` VARCHAR(191) NOT NULL,
    `descricao` VARCHAR(191) NULL,
    `data_ultima_sincronizacao` DATETIME(3) NULL,
    `hash_estrutura` VARCHAR(191) NULL,
    `versao_estrutura` INTEGER NULL,
    `unidade_medida` VARCHAR(191) NULL,
    `aliquota_ii` DECIMAL(65, 30) NULL,

    UNIQUE INDEX `ncm_cache_codigo_key`(`codigo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `atributos_cache` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `ncm_codigo` VARCHAR(191) NOT NULL,
    `modalidade` VARCHAR(191) NOT NULL,
    `estrutura_json` JSON NOT NULL,
    `data_sincronizacao` DATETIME(3) NULL,
    `versao` INTEGER NULL,
    `hash_estrutura` VARCHAR(191) NULL,
    `vigencia_inicio` DATETIME(3) NULL,
    `vigencia_fim` DATETIME(3) NULL,

    UNIQUE INDEX `atributos_cache_ncm_codigo_modalidade_versao_key`(`ncm_codigo`, `modalidade`, `versao`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `produto` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `codigo` VARCHAR(191) NULL,
    `versao` INTEGER NOT NULL,
    `status` ENUM('PENDENTE', 'APROVADO', 'PROCESSANDO', 'TRANSMITIDO', 'ERRO') NOT NULL,
    `situacao` ENUM('RASCUNHO', 'ATIVADO', 'DESATIVADO') NOT NULL DEFAULT 'RASCUNHO',
    `ncm_codigo` VARCHAR(191) NOT NULL,
    `modalidade` VARCHAR(191) NULL,
    `denominacao` VARCHAR(191) NOT NULL,
    `descricao` VARCHAR(191) NOT NULL,
    `catalogo_id` INTEGER NOT NULL,
    `criado_em` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `atualizado_em` DATETIME(3) NOT NULL,
    `criado_por` VARCHAR(191) NULL,
    `versao_estrutura_atributos` INTEGER NULL,

    UNIQUE INDEX `produto_codigo_key`(`codigo`),
    INDEX `idx_ncm`(`ncm_codigo`),
    INDEX `idx_catalogo`(`catalogo_id`),
    UNIQUE INDEX `produto_codigo_versao_key`(`codigo`, `versao`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `produto_atributos` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `produto_id` INTEGER NOT NULL,
    `valores_json` JSON NOT NULL,
    `estrutura_snapshot_json` JSON NULL,
    `validado_em` DATETIME(3) NULL,
    `erros_validacao` JSON NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `codigo_interno_produto` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `produto_id` INTEGER NOT NULL,
    `codigo` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `codigo_interno_produto_produto_id_codigo_key`(`produto_id`, `codigo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `operador_estrangeiro_produto` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `pais_codigo` VARCHAR(191) NOT NULL,
    `conhecido` BOOLEAN NOT NULL,
    `operador_estrangeiro_id` INTEGER NULL,
    `produto_id` INTEGER NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `comex_subsessoes` ADD CONSTRAINT `comex_subsessoes_idv32_comex_fkey` FOREIGN KEY (`idv32_comex`) REFERENCES `comex`(`idv32`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `subdivisao` ADD CONSTRAINT `subdivisao_pais_codigo_fkey` FOREIGN KEY (`pais_codigo`) REFERENCES `pais`(`codigo`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `operador_estrangeiro` ADD CONSTRAINT `operador_estrangeiro_catalogo_id_fkey` FOREIGN KEY (`catalogo_id`) REFERENCES `catalogo`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `operador_estrangeiro` ADD CONSTRAINT `operador_estrangeiro_pais_codigo_fkey` FOREIGN KEY (`pais_codigo`) REFERENCES `pais`(`codigo`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `operador_estrangeiro` ADD CONSTRAINT `operador_estrangeiro_subdivisao_codigo_fkey` FOREIGN KEY (`subdivisao_codigo`) REFERENCES `subdivisao`(`codigo`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `identificacao_adicional` ADD CONSTRAINT `identificacao_adicional_operador_estrangeiro_id_fkey` FOREIGN KEY (`operador_estrangeiro_id`) REFERENCES `operador_estrangeiro`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `identificacao_adicional` ADD CONSTRAINT `identificacao_adicional_agencia_emissora_codigo_fkey` FOREIGN KEY (`agencia_emissora_codigo`) REFERENCES `agencia_emissora`(`codigo`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `atributos_cache` ADD CONSTRAINT `atributos_cache_ncm_codigo_fkey` FOREIGN KEY (`ncm_codigo`) REFERENCES `ncm_cache`(`codigo`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `produto` ADD CONSTRAINT `produto_catalogo_id_fkey` FOREIGN KEY (`catalogo_id`) REFERENCES `catalogo`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `produto_atributos` ADD CONSTRAINT `produto_atributos_produto_id_fkey` FOREIGN KEY (`produto_id`) REFERENCES `produto`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `codigo_interno_produto` ADD CONSTRAINT `codigo_interno_produto_produto_id_fkey` FOREIGN KEY (`produto_id`) REFERENCES `produto`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `operador_estrangeiro_produto` ADD CONSTRAINT `operador_estrangeiro_produto_pais_codigo_fkey` FOREIGN KEY (`pais_codigo`) REFERENCES `pais`(`codigo`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `operador_estrangeiro_produto` ADD CONSTRAINT `operador_estrangeiro_produto_operador_estrangeiro_id_fkey` FOREIGN KEY (`operador_estrangeiro_id`) REFERENCES `operador_estrangeiro`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `operador_estrangeiro_produto` ADD CONSTRAINT `operador_estrangeiro_produto_produto_id_fkey` FOREIGN KEY (`produto_id`) REFERENCES `produto`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;


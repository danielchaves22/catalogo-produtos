CREATE TABLE `atributo_versao` (
  `id` int NOT NULL AUTO_INCREMENT,
  `ncm_codigo` varchar(8) NOT NULL,
  `modalidade` varchar(20) DEFAULT NULL,
  `versao` int NOT NULL,
  `criado_em` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_ncm_modalidade_versao_normalizado` (`ncm_codigo`, `modalidade`, `versao`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `atributo` (
  `id` int NOT NULL AUTO_INCREMENT,
  `versao_id` int NOT NULL,
  `codigo` varchar(100) NOT NULL,
  `nome` varchar(255) NOT NULL,
  `tipo` varchar(50) NOT NULL,
  `obrigatorio` tinyint(1) NOT NULL,
  `multivalorado` tinyint(1) NOT NULL,
  `orientacao_preenchimento` text,
  `validacoes_json` json,
  `descricao_condicao` text,
  `condicao_json` json,
  `parent_codigo` varchar(100) DEFAULT NULL,
  `condicionante_codigo` varchar(100) DEFAULT NULL,
  `ordem` int NOT NULL,
  `parent_id` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_versao_codigo` (`versao_id`, `codigo`),
  KEY `idx_atributo_versao` (`versao_id`),
  KEY `idx_atributo_parent` (`parent_id`),
  CONSTRAINT `fk_atributo_versao` FOREIGN KEY (`versao_id`) REFERENCES `atributo_versao` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_atributo_parent` FOREIGN KEY (`parent_id`) REFERENCES `atributo` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `atributo_dominio_normalizado` (
  `id` int NOT NULL AUTO_INCREMENT,
  `atributo_id` int NOT NULL,
  `codigo` varchar(100) NOT NULL,
  `descricao` varchar(255) DEFAULT NULL,
  `ordem` int NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_atributo_dominio` (`atributo_id`),
  CONSTRAINT `fk_dominio_atributo` FOREIGN KEY (`atributo_id`) REFERENCES `atributo` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `produto_atributo` (
  `id` int NOT NULL AUTO_INCREMENT,
  `produto_id` int NOT NULL,
  `atributo_id` int NOT NULL,
  `atributo_versao_id` int NOT NULL,
  `validado_em` datetime DEFAULT NULL,
  `erros_validacao` json DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_produto_atributo` (`produto_id`, `atributo_id`),
  KEY `idx_produto_atributo_produto` (`produto_id`),
  KEY `idx_produto_atributo_versao` (`atributo_versao_id`),
  CONSTRAINT `fk_produto_atributo_produto` FOREIGN KEY (`produto_id`) REFERENCES `produto` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_produto_atributo_atributo` FOREIGN KEY (`atributo_id`) REFERENCES `atributo` (`id`),
  CONSTRAINT `fk_produto_atributo_versao` FOREIGN KEY (`atributo_versao_id`) REFERENCES `atributo_versao` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `produto_atributo_valor` (
  `id` int NOT NULL AUTO_INCREMENT,
  `produto_atributo_id` int NOT NULL,
  `valor_json` json NOT NULL,
  `ordem` int NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `idx_produto_atributo_valor` (`produto_atributo_id`),
  CONSTRAINT `fk_produto_valor_atributo` FOREIGN KEY (`produto_atributo_id`) REFERENCES `produto_atributo` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `ncm_atributo_valor_grupo` (
  `id` int NOT NULL AUTO_INCREMENT,
  `super_user_id` int NOT NULL,
  `ncm_codigo` varchar(8) NOT NULL,
  `modalidade` varchar(20) DEFAULT NULL,
  `atributo_versao_id` int NOT NULL,
  `criado_em` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `atualizado_em` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `criado_por` varchar(255) DEFAULT NULL,
  `atualizado_por` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_superuser_ncm_modalidade` (`super_user_id`, `ncm_codigo`, `modalidade`),
  CONSTRAINT `fk_ncm_grupo_super_user` FOREIGN KEY (`super_user_id`) REFERENCES `user` (`id`),
  CONSTRAINT `fk_ncm_grupo_versao` FOREIGN KEY (`atributo_versao_id`) REFERENCES `atributo_versao` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `ncm_atributo_valor` (
  `id` int NOT NULL AUTO_INCREMENT,
  `grupo_id` int NOT NULL,
  `atributo_id` int NOT NULL,
  `valor_json` json NOT NULL,
  `ordem` int NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_grupo_atributo_ordem` (`grupo_id`, `atributo_id`, `ordem`),
  CONSTRAINT `fk_ncm_valor_grupo` FOREIGN KEY (`grupo_id`) REFERENCES `ncm_atributo_valor_grupo` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ncm_valor_atributo` FOREIGN KEY (`atributo_id`) REFERENCES `atributo` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `ncm_atributo_valor_catalogo` (
  `id` int NOT NULL AUTO_INCREMENT,
  `grupo_id` int NOT NULL,
  `catalogo_id` int NOT NULL,
  `criado_em` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_valor_padrao_catalogo` (`grupo_id`, `catalogo_id`),
  KEY `idx_nvpc_catalogo` (`catalogo_id`),
  CONSTRAINT `fk_ncm_catalogo_grupo` FOREIGN KEY (`grupo_id`) REFERENCES `ncm_atributo_valor_grupo` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ncm_catalogo_catalogo` FOREIGN KEY (`catalogo_id`) REFERENCES `catalogo` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

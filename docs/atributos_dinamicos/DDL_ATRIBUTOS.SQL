CREATE TABLE `atributo` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `codigo` varchar(50) DEFAULT NULL,
  `nome` varchar(255) DEFAULT NULL,
  `nome_apresentacao` varchar(255) DEFAULT NULL,
  `forma_preenchimento` varchar(50) DEFAULT NULL,
  `data_inicio_vigencia` date DEFAULT NULL,
  `data_fim_vigencia` date DEFAULT NULL,
  `objetivos` text,
  `orgaos` text,
  `atributo_condicionante` tinyint(1) DEFAULT NULL,
  `multivalorado` tinyint(1) DEFAULT NULL,
  `orientacao_preenchimento` text,
  `tamanho_maximo` int(11) DEFAULT NULL,
  `definicao` text,
  `casas_decimais` int(11) DEFAULT NULL,
  `brid` varchar(50) DEFAULT NULL,
  `mascara` varchar(50) DEFAULT NULL,
  `parent_codigo` varchar(50) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=168430 DEFAULT CHARSET=utf8mb4;

CREATE TABLE `atributo_condicionado` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `atributo_codigo` varchar(50) DEFAULT NULL,
  `codigo` varchar(50) DEFAULT NULL,
  `nome` varchar(255) DEFAULT NULL,
  `nome_apresentacao` varchar(255) DEFAULT NULL,
  `forma_preenchimento` varchar(50) DEFAULT NULL,
  `obrigatorio` tinyint(1) DEFAULT NULL,
  `data_inicio_vigencia` date DEFAULT NULL,
  `data_fim_vigencia` date DEFAULT NULL,
  `objetivos` text,
  `orgaos` text,
  `atributo_condicionante` tinyint(1) DEFAULT NULL,
  `multivalorado` tinyint(1) DEFAULT NULL,
  `tamanho_maximo` int(11) DEFAULT NULL,
  `orientacao_preenchimento` text,
  `casas_decimais` int(11) DEFAULT NULL,
  `definicao` text,
  `mascara` varchar(50) DEFAULT NULL,
  `descricao_condicao` text,
  `data_inicio_vigencia_con` date DEFAULT NULL,
  `data_fim_vigencia_con` date DEFAULT NULL,
  `obrigatorio_con` tinyint(1) DEFAULT NULL,
  `multivalorado_con` tinyint(1) DEFAULT NULL,
  `condicao` text,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=41555 DEFAULT CHARSET=utf8mb4;

CREATE TABLE `atributo_dominio` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `codigo` varchar(50) DEFAULT NULL,
  `descricao` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `atributo_codigo` varchar(50) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=754410 DEFAULT CHARSET=utf8mb4;

CREATE TABLE `atributo_vinculo` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `codigo_ncm` varchar(8) DEFAULT NULL,
  `codigo` varchar(50) DEFAULT NULL,
  `modalidade` varchar(50) DEFAULT NULL,
  `obrigatorio` tinyint(1) DEFAULT NULL,
  `multivalorado` tinyint(1) DEFAULT NULL,
  `data_inicio_vigencia` date DEFAULT NULL,
  `data_fim_vigencia` date DEFAULT NULL,
  `informacao_adicional` text,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3859679 DEFAULT CHARSET=utf8mb4;





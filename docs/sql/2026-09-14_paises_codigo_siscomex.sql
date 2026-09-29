-- Código aduaneiro dos países usado pelo Portal Único Siscomex.
-- Fonte de referência: https://balanca.mdic.gov.br/balanca/bd/tabelas/PAIS.csv
-- Obtida em 2026-09-14; 281 registros; ISO-8859-1;
-- SHA-256: da1c1aab0061173d4b5c8f51f79dd9c1083259b1a9ab17b818127d6be3eda07d
-- A vigência foi cruzada com a Tabela 06 de Países do eSocial/RFB:
-- https://www.gov.br/esocial/pt-br/documentacao-tecnica/leiautes-esocial-versao-s-1-3-nt-07-2026/tabelas.html
-- AQ, AX, BL, GS, HM, TF e YT permanecem NULL: os códigos de referência constam
-- extintos desde 2023-01-15 e não há substituto oficial indicado para eles.
-- O cadastro ISO2 atual e os nomes existentes são preservados.
-- Este incremental atualiza somente países já existentes; não cria registros em pais.

SET @pais_codigo_siscomex_ddl := (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'pais'
        AND column_name = 'codigo_siscomex'
    ),
    'SELECT 1',
    'ALTER TABLE pais ADD COLUMN codigo_siscomex CHAR(3) NULL AFTER codigo'
  )
);
PREPARE stmt FROM @pais_codigo_siscomex_ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

DROP TEMPORARY TABLE IF EXISTS tmp_pais_codigo_siscomex;

CREATE TEMPORARY TABLE tmp_pais_codigo_siscomex (
    codigo VARCHAR(10) NOT NULL PRIMARY KEY,
    codigo_siscomex CHAR(3) NULL,
    sigla VARCHAR(10) NOT NULL,
    nome VARCHAR(255) NOT NULL
);

INSERT INTO tmp_pais_codigo_siscomex (codigo, codigo_siscomex, sigla, nome) VALUES
    ('XX', '994', 'XX', 'A DESIGNAR'),
    ('AD', '037', 'AD', 'Andorra'),
    ('AE', '244', 'AE', 'Emirados Árabes Unidos'),
    ('AF', '013', 'AF', 'Afeganistão'),
    ('AG', '043', 'AG', 'Antígua e Barbuda'),
    ('AI', '041', 'AI', 'Anguila'),
    ('AL', '017', 'AL', 'Albânia'),
    ('AM', '064', 'AM', 'Armênia'),
    ('AO', '040', 'AO', 'Angola'),
    ('AQ', NULL, 'AQ', 'Antártida'),
    ('AR', '063', 'AR', 'Argentina'),
    ('AS', '691', 'AS', 'Samoa Americana'),
    ('AT', '072', 'AT', 'Áustria'),
    ('AU', '069', 'AU', 'Austrália'),
    ('AW', '065', 'AW', 'Aruba'),
    ('AX', NULL, 'AX', 'Ilhas Aland'),
    ('AZ', '073', 'AZ', 'Azerbaijão'),
    ('BA', '098', 'BA', 'Bósnia e Herzegovina'),
    ('BB', '083', 'BB', 'Barbados'),
    ('BD', '081', 'BD', 'Bangladesh'),
    ('BE', '087', 'BE', 'Bélgica'),
    ('BF', '031', 'BF', 'Burquina Faso'),
    ('BG', '111', 'BG', 'Bulgária'),
    ('BH', '080', 'BH', 'Barein'),
    ('BI', '115', 'BI', 'Burundi'),
    ('BJ', '229', 'BJ', 'Benin'),
    ('BL', NULL, 'BL', 'São Bartolomeu'),
    ('BM', '090', 'BM', 'Bermudas'),
    ('BN', '108', 'BN', 'Brunei'),
    ('BO', '097', 'BO', 'Bolívia'),
    ('BQ', '099', 'BQ', 'Países Baixos Caribenhos'),
    ('BR', '105', 'BR', 'Brasil'),
    ('BS', '077', 'BS', 'Bahamas'),
    ('BT', '119', 'BT', 'Butão'),
    ('BV', '102', 'BV', 'Ilha Bouvet'),
    ('BW', '101', 'BW', 'Botsuana'),
    ('BY', '085', 'BY', 'Bielorrússia'),
    ('BZ', '088', 'BZ', 'Belize'),
    ('CA', '149', 'CA', 'Canadá'),
    ('CC', '165', 'CC', 'Ilhas Cocos (Keeling)'),
    ('CD', '888', 'CD', 'Congo - Kinshasa'),
    ('CF', '640', 'CF', 'República Centro-Africana'),
    ('CG', '177', 'CG', 'República do Congo'),
    ('CH', '767', 'CH', 'Suíça'),
    ('CI', '193', 'CI', 'Costa do Marfim'),
    ('CK', '183', 'CK', 'Ilhas Cook'),
    ('CL', '158', 'CL', 'Chile'),
    ('CM', '145', 'CM', 'Camarões'),
    ('CN', '160', 'CN', 'China'),
    ('CO', '169', 'CO', 'Colômbia'),
    ('CR', '196', 'CR', 'Costa Rica'),
    ('CU', '199', 'CU', 'Cuba'),
    ('CV', '127', 'CV', 'Cabo Verde'),
    ('CW', '200', 'CW', 'Curaçao'),
    ('CX', '511', 'CX', 'Ilha Christmas'),
    ('CY', '163', 'CY', 'Chipre'),
    ('CZ', '791', 'CZ', 'Tchéquia'),
    ('DE', '023', 'DE', 'Alemanha'),
    ('DJ', '783', 'DJ', 'Djibuti'),
    ('DK', '232', 'DK', 'Dinamarca'),
    ('DM', '235', 'DM', 'Dominica'),
    ('DO', '647', 'DO', 'República Dominicana'),
    ('DZ', '059', 'DZ', 'Argélia'),
    ('EC', '239', 'EC', 'Equador'),
    ('EE', '251', 'EE', 'Estônia'),
    ('EG', '240', 'EG', 'Egito'),
    ('EH', '685', 'EH', 'Saara Ocidental'),
    ('ER', '243', 'ER', 'Eritreia'),
    ('ES', '245', 'ES', 'Espanha'),
    ('ET', '253', 'ET', 'Etiópia'),
    ('FI', '271', 'FI', 'Finlândia'),
    ('FJ', '870', 'FJ', 'Fiji'),
    ('FK', '255', 'FK', 'Ilhas Malvinas'),
    ('FM', '499', 'FM', 'Micronésia'),
    ('FO', '259', 'FO', 'Ilhas Faroé'),
    ('FR', '275', 'FR', 'França'),
    ('GA', '281', 'GA', 'Gabão'),
    ('GB', '628', 'GB', 'Reino Unido'),
    ('GD', '297', 'GD', 'Granada'),
    ('GE', '291', 'GE', 'Geórgia'),
    ('GF', '325', 'GF', 'Guiana Francesa'),
    ('GG', '321', 'GG', 'Guernsey'),
    ('GH', '289', 'GH', 'Gana'),
    ('GI', '293', 'GI', 'Gibraltar'),
    ('GL', '305', 'GL', 'Groenlândia'),
    ('GM', '285', 'GM', 'Gâmbia'),
    ('GN', '329', 'GN', 'Guiné'),
    ('GP', '309', 'GP', 'Guadalupe'),
    ('GQ', '331', 'GQ', 'Guiné Equatorial'),
    ('GR', '301', 'GR', 'Grécia'),
    ('GS', NULL, 'GS', 'Ilhas Geórgia do Sul e Sandwich do Sul'),
    ('GT', '317', 'GT', 'Guatemala'),
    ('GU', '313', 'GU', 'Guam'),
    ('GW', '334', 'GW', 'Guiné-Bissau'),
    ('GY', '337', 'GY', 'Guiana'),
    ('HK', '351', 'HK', 'Hong Kong, RAE da China'),
    ('HM', NULL, 'HM', 'Ilhas Heard e McDonald'),
    ('HN', '345', 'HN', 'Honduras'),
    ('HR', '195', 'HR', 'Croácia'),
    ('HT', '341', 'HT', 'Haiti'),
    ('HU', '355', 'HU', 'Hungria'),
    ('ID', '365', 'ID', 'Indonésia'),
    ('IE', '375', 'IE', 'Irlanda'),
    ('IL', '383', 'IL', 'Israel'),
    ('IM', '359', 'IM', 'Ilha de Man'),
    ('IN', '361', 'IN', 'Índia'),
    ('IO', '782', 'IO', 'Território Britânico do Oceano Índico'),
    ('IQ', '369', 'IQ', 'Iraque'),
    ('IR', '372', 'IR', 'Irã'),
    ('IS', '379', 'IS', 'Islândia'),
    ('IT', '386', 'IT', 'Itália'),
    ('JE', '393', 'JE', 'Jersey'),
    ('JM', '391', 'JM', 'Jamaica'),
    ('JO', '403', 'JO', 'Jordânia'),
    ('JP', '399', 'JP', 'Japão'),
    ('KE', '623', 'KE', 'Quênia'),
    ('KG', '625', 'KG', 'Quirguistão'),
    ('KH', '141', 'KH', 'Camboja'),
    ('KI', '411', 'KI', 'Quiribati'),
    ('KM', '173', 'KM', 'Comores'),
    ('KN', '695', 'KN', 'São Cristóvão e Névis'),
    ('KP', '187', 'KP', 'Coreia do Norte'),
    ('KR', '190', 'KR', 'Coreia do Sul'),
    ('KW', '198', 'KW', 'Kuwait'),
    ('KY', '137', 'KY', 'Ilhas Cayman'),
    ('KZ', '153', 'KZ', 'Cazaquistão'),
    ('LA', '420', 'LA', 'Laos'),
    ('LB', '431', 'LB', 'Líbano'),
    ('LC', '715', 'LC', 'Santa Lúcia'),
    ('LI', '440', 'LI', 'Liechtenstein'),
    ('LK', '750', 'LK', 'Sri Lanka'),
    ('LR', '434', 'LR', 'Libéria'),
    ('LS', '426', 'LS', 'Lesoto'),
    ('LT', '442', 'LT', 'Lituânia'),
    ('LU', '445', 'LU', 'Luxemburgo'),
    ('LV', '427', 'LV', 'Letônia'),
    ('LY', '438', 'LY', 'Líbia'),
    ('MA', '474', 'MA', 'Marrocos'),
    ('MC', '495', 'MC', 'Mônaco'),
    ('MD', '494', 'MD', 'Moldávia'),
    ('ME', '498', 'ME', 'Montenegro'),
    ('MF', '698', 'MF', 'São Martinho'),
    ('MG', '450', 'MG', 'Madagascar'),
    ('MH', '476', 'MH', 'Ilhas Marshall'),
    ('MK', '449', 'MK', 'Macedônia do Norte'),
    ('ML', '464', 'ML', 'Mali'),
    ('MM', '093', 'MM', 'Mianmar (Birmânia)'),
    ('MN', '497', 'MN', 'Mongólia'),
    ('MO', '447', 'MO', 'Macau, RAE da China'),
    ('MP', '472', 'MP', 'Ilhas Marianas do Norte'),
    ('MQ', '477', 'MQ', 'Martinica'),
    ('MR', '488', 'MR', 'Mauritânia'),
    ('MS', '501', 'MS', 'Montserrat'),
    ('MT', '467', 'MT', 'Malta'),
    ('MU', '485', 'MU', 'Maurício'),
    ('MV', '461', 'MV', 'Maldivas'),
    ('MW', '458', 'MW', 'Malaui'),
    ('MX', '493', 'MX', 'México'),
    ('MY', '455', 'MY', 'Malásia'),
    ('MZ', '505', 'MZ', 'Moçambique'),
    ('NA', '507', 'NA', 'Namíbia'),
    ('NC', '542', 'NC', 'Nova Caledônia'),
    ('NE', '525', 'NE', 'Níger'),
    ('NF', '535', 'NF', 'Ilha Norfolk'),
    ('NG', '528', 'NG', 'Nigéria'),
    ('NI', '521', 'NI', 'Nicarágua'),
    ('NL', '573', 'NL', 'Países Baixos'),
    ('NO', '538', 'NO', 'Noruega'),
    ('NP', '517', 'NP', 'Nepal'),
    ('NR', '508', 'NR', 'Nauru'),
    ('NU', '531', 'NU', 'Niue'),
    ('NZ', '548', 'NZ', 'Nova Zelândia'),
    ('OM', '556', 'OM', 'Omã'),
    ('PA', '580', 'PA', 'Panamá'),
    ('PE', '589', 'PE', 'Peru'),
    ('PF', '599', 'PF', 'Polinésia Francesa'),
    ('PG', '545', 'PG', 'Papua-Nova Guiné'),
    ('PH', '267', 'PH', 'Filipinas'),
    ('PK', '576', 'PK', 'Paquistão'),
    ('PL', '603', 'PL', 'Polônia'),
    ('PM', '700', 'PM', 'São Pedro e Miquelão'),
    ('PN', '593', 'PN', 'Ilhas Pitcairn'),
    ('PR', '611', 'PR', 'Porto Rico'),
    ('PS', '578', 'PS', 'Territórios palestinos'),
    ('PT', '607', 'PT', 'Portugal'),
    ('PW', '575', 'PW', 'Palau'),
    ('PY', '586', 'PY', 'Paraguai'),
    ('QA', '154', 'QA', 'Catar'),
    ('RE', '660', 'RE', 'Reunião'),
    ('RO', '670', 'RO', 'Romênia'),
    ('RS', '737', 'RS', 'Sérvia'),
    ('RU', '676', 'RU', 'Rússia'),
    ('RW', '675', 'RW', 'Ruanda'),
    ('SA', '053', 'SA', 'Arábia Saudita'),
    ('SB', '677', 'SB', 'Ilhas Salomão'),
    ('SC', '731', 'SC', 'Seicheles'),
    ('SD', '759', 'SD', 'Sudão'),
    ('SE', '764', 'SE', 'Suécia'),
    ('SG', '741', 'SG', 'Singapura'),
    ('SH', '710', 'SH', 'Santa Helena'),
    ('SI', '246', 'SI', 'Eslovênia'),
    ('SJ', '755', 'SJ', 'Svalbard e Jan Mayen'),
    ('SK', '247', 'SK', 'Eslováquia'),
    ('SL', '735', 'SL', 'Serra Leoa'),
    ('SM', '697', 'SM', 'San Marino'),
    ('SN', '728', 'SN', 'Senegal'),
    ('SO', '748', 'SO', 'Somália'),
    ('SR', '770', 'SR', 'Suriname'),
    ('SS', '760', 'SS', 'Sudão do Sul'),
    ('ST', '720', 'ST', 'São Tomé e Príncipe'),
    ('SV', '687', 'SV', 'El Salvador'),
    ('SX', '699', 'SX', 'Sint Maarten'),
    ('SY', '744', 'SY', 'Síria'),
    ('SZ', '754', 'SZ', 'Essuatíni'),
    ('TC', '823', 'TC', 'Ilhas Turcas e Caicos'),
    ('TD', '788', 'TD', 'Chade'),
    ('TF', NULL, 'TF', 'Territórios Franceses do Sul'),
    ('TG', '800', 'TG', 'Togo'),
    ('TH', '776', 'TH', 'Tailândia'),
    ('TJ', '772', 'TJ', 'Tadjiquistão'),
    ('TK', '805', 'TK', 'Tokelau'),
    ('TL', '795', 'TL', 'Timor-Leste'),
    ('TM', '824', 'TM', 'Turcomenistão'),
    ('TN', '820', 'TN', 'Tunísia'),
    ('TO', '810', 'TO', 'Tonga'),
    ('TR', '827', 'TR', 'Turquia'),
    ('TT', '815', 'TT', 'Trinidad e Tobago'),
    ('TV', '828', 'TV', 'Tuvalu'),
    ('TW', '161', 'TW', 'Taiwan'),
    ('TZ', '780', 'TZ', 'Tanzânia'),
    ('UA', '831', 'UA', 'Ucrânia'),
    ('UG', '833', 'UG', 'Uganda'),
    ('UM', '566', 'UM', 'Ilhas Menores Distantes dos EUA'),
    ('US', '249', 'US', 'Estados Unidos'),
    ('UY', '845', 'UY', 'Uruguai'),
    ('UZ', '847', 'UZ', 'Uzbequistão'),
    ('VA', '848', 'VA', 'Cidade do Vaticano'),
    ('VC', '705', 'VC', 'São Vicente e Granadinas'),
    ('VE', '850', 'VE', 'Venezuela'),
    ('VG', '863', 'VG', 'Ilhas Virgens Britânicas'),
    ('VI', '866', 'VI', 'Ilhas Virgens Americanas'),
    ('VN', '858', 'VN', 'Vietnã'),
    ('VU', '551', 'VU', 'Vanuatu'),
    ('WF', '875', 'WF', 'Wallis e Futuna'),
    ('WS', '690', 'WS', 'Samoa'),
    ('YE', '357', 'YE', 'Iêmen'),
    ('YT', NULL, 'YT', 'Mayotte'),
    ('ZA', '756', 'ZA', 'África do Sul'),
    ('ZM', '890', 'ZM', 'Zâmbia'),
    ('ZW', '665', 'ZW', 'Zimbábue');

UPDATE pais AS p
INNER JOIN tmp_pais_codigo_siscomex AS m ON m.codigo = p.codigo
SET p.codigo_siscomex = m.codigo_siscomex;

-- Esperado: 250 mapeamentos, 250 países encontrados, 243 códigos preenchidos e distintos.
SELECT
    COUNT(*) AS total_mapeamentos,
    SUM(p.codigo IS NOT NULL) AS total_paises_encontrados,
    SUM(p.codigo_siscomex IS NOT NULL) AS total_codigos_siscomex,
    COUNT(DISTINCT p.codigo_siscomex) AS total_codigos_siscomex_distintos
FROM tmp_pais_codigo_siscomex AS m
LEFT JOIN pais AS p ON p.codigo = m.codigo;

-- Esperado: zero registros. Qualquer linha indica que o seed de países está incompleto.
SELECT m.codigo, m.sigla, m.nome
FROM tmp_pais_codigo_siscomex AS m
LEFT JOIN pais AS p ON p.codigo = m.codigo
WHERE p.codigo IS NULL
ORDER BY m.codigo;

-- Esperado: exatamente AQ, AX, BL, GS, HM, TF e YT.
SELECT p.codigo, p.sigla, p.nome, p.codigo_siscomex
FROM pais AS p
INNER JOIN tmp_pais_codigo_siscomex AS m ON m.codigo = p.codigo
WHERE p.codigo_siscomex IS NULL
ORDER BY p.codigo;

-- Esperado: zero registros.
SELECT p.codigo, p.codigo_siscomex
FROM pais AS p
INNER JOIN tmp_pais_codigo_siscomex AS m ON m.codigo = p.codigo
WHERE p.codigo_siscomex IS NOT NULL
  AND p.codigo_siscomex NOT REGEXP '^[0-9]{3}$';

DROP TEMPORARY TABLE tmp_pais_codigo_siscomex;

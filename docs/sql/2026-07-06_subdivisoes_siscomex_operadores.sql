INSERT INTO subdivisao (codigo, sigla, nome, pais_codigo) VALUES
    ('CN-HN', 'HN', 'Hunan', 'CN'),
    ('CN-JX', 'JX', 'Jiangxi', 'CN'),
    ('CN-QH', 'QH', 'Qinghai', 'CN'),
    ('CN-ZJ', 'ZJ', 'Zhejiang', 'CN'),
    ('DE-BY', 'BY', 'Bayern', 'DE'),
    ('EC-G', 'G', 'Guayas', 'EC'),
    ('FR-92', '92', 'Hauts-de-Seine', 'FR'),
    ('IT-65', '65', 'Abruzzo', 'IT'),
    ('JP-07', '07', 'Fukushima', 'JP'),
    ('JP-13', '13', 'Tokyo', 'JP'),
    ('KR-11', '11', 'Seoul', 'KR'),
    ('KR-41', '41', 'Gyeonggi-do', 'KR'),
    ('MX-JAL', 'JAL', 'Jalisco', 'MX'),
    ('PH-CAV', 'CAV', 'Cavite', 'PH'),
    ('SG-01', '01', 'Central Singapore', 'SG'),
    ('SG-05', '05', 'South West', 'SG'),
    ('TW-KHH', 'KHH', 'Kaohsiung', 'TW'),
    ('US-GA', 'GA', 'Georgia', 'US'),
    ('VN-21', '21', 'Thanh Hoa', 'VN')
ON DUPLICATE KEY UPDATE
    sigla = VALUES(sigla),
    nome = VALUES(nome),
    pais_codigo = VALUES(pais_codigo);

-- Inclui/atualiza pais especial para "A DESIGNAR"
INSERT INTO pais (codigo, sigla, nome)
VALUES ('XX', 'XX', 'A DESIGNAR')
ON DUPLICATE KEY UPDATE
    sigla = VALUES(sigla),
    nome = VALUES(nome);

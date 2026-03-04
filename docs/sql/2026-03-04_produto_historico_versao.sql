CREATE TABLE IF NOT EXISTS produto_historico_versao (
  id INT AUTO_INCREMENT PRIMARY KEY,
  produto_id INT NOT NULL,
  versao_siscomex INT NOT NULL,
  tipo_evento VARCHAR(30) NOT NULL,
  resumo TEXT NULL,
  delta_json JSON NULL,
  snapshot_json JSON NULL,
  is_checkpoint TINYINT(1) NOT NULL DEFAULT 0,
  transmissao_id INT NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_hist_produto
    FOREIGN KEY (produto_id) REFERENCES produto(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_hist_transmissao
    FOREIGN KEY (transmissao_id) REFERENCES produto_transmissao(id)
    ON DELETE SET NULL,
  CONSTRAINT uk_hist_produto_versao
    UNIQUE (produto_id, versao_siscomex)
);

CREATE INDEX idx_hist_produto_versao
  ON produto_historico_versao (produto_id, versao_siscomex);

CREATE INDEX idx_hist_produto_data
  ON produto_historico_versao (produto_id, criado_em);

CREATE INDEX idx_hist_transmissao
  ON produto_historico_versao (transmissao_id);

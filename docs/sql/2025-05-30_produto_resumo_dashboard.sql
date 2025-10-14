CREATE TABLE IF NOT EXISTS produto_resumo_dashboard (
  produto_id INT NOT NULL,
  catalogo_id INT NOT NULL,
  atributos_total INT NOT NULL DEFAULT 0,
  obrigatorios_pendentes INT NOT NULL DEFAULT 0,
  validos_transmissao INT NOT NULL DEFAULT 0,
  atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (produto_id),
  INDEX idx_produto_resumo_catalogo (catalogo_id),
  CONSTRAINT fk_produto_resumo_produto FOREIGN KEY (produto_id) REFERENCES produto(id) ON DELETE CASCADE,
  CONSTRAINT fk_produto_resumo_catalogo FOREIGN KEY (catalogo_id) REFERENCES catalogo(id) ON DELETE CASCADE
);

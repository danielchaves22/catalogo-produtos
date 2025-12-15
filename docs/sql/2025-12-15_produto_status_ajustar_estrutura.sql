-- Adiciona novo status AJUSTAR_ESTRUTURA ao enum ProdutoStatus
-- Este status indica que a estrutura de atributos do produto está divergente do SISCOMEX
-- e precisa ser ajustada antes de ser transmitida novamente

ALTER TABLE produto
  MODIFY status ENUM('AJUSTAR_ESTRUTURA', 'PENDENTE', 'APROVADO', 'PROCESSANDO', 'TRANSMITIDO', 'ERRO') NOT NULL;

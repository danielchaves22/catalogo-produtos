ALTER TABLE atributo_preenchimento_massa
  ADD COLUMN async_job_id INT NULL UNIQUE;

ALTER TABLE atributo_preenchimento_massa
  ADD CONSTRAINT fk_atributo_preenchimento_massa_async_job
    FOREIGN KEY (async_job_id) REFERENCES async_job (id);

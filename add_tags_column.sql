-- Adiciona a coluna "tags" na tabela "clientes" como tipo jsonb com valor padrão de array vazio '[]'
ALTER TABLE clientes ADD COLUMN tags jsonb DEFAULT '[]'::jsonb;

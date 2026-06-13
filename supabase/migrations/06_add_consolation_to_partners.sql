-- Adicionar colunas de consolação na tabela partners
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS minor_prizes TEXT;
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS consolation_fee NUMERIC DEFAULT 0;

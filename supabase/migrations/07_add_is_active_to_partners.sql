-- Adiciona a coluna is_active para pausar/abrir o estabelecimento
ALTER TABLE public.partners ADD COLUMN is_active BOOLEAN DEFAULT true;

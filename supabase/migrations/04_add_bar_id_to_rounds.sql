ALTER TABLE public.rounds
ADD COLUMN IF NOT EXISTS bar_id UUID REFERENCES public.bars(id) ON DELETE CASCADE;

-- Atualizar as rodadas existentes para ter o bar_id preenchido com base na tabela prizes
UPDATE public.rounds r
SET bar_id = p.bar_id
FROM public.prizes p
WHERE r.prize_id = p.id;

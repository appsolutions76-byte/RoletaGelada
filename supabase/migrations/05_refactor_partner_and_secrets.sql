-- Renomear a tabela 'bars' para 'partners'
ALTER TABLE public.bars RENAME TO partners;

-- Renomear os relacionamentos em 'prizes'
ALTER TABLE public.prizes RENAME COLUMN bar_id TO partner_id;

-- Renomear os relacionamentos em 'rounds'
ALTER TABLE public.rounds RENAME COLUMN bar_id TO partner_id;

-- Ajustar a trigger 'handle_new_bar' para o novo nome da tabela
CREATE OR REPLACE FUNCTION public.handle_new_partner()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.partners (id, name)
  VALUES (new.id, COALESCE(new.raw_user_meta_data->>'bar_name', new.raw_user_meta_data->>'partner_name', 'Parceiro Novo'));
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_partner();

-- Remover a função antiga
DROP FUNCTION IF EXISTS public.handle_new_bar();

-- Atualizar Políticas RLS para 'partners'
ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Leitura livre bars" ON public.partners;
DROP POLICY IF EXISTS "Bars can update own data" ON public.partners;
CREATE POLICY "Leitura livre partners" ON public.partners FOR SELECT USING (true);
CREATE POLICY "Partners can update own data" ON public.partners FOR UPDATE USING (auth.uid() = id);

-- Atualizar Políticas RLS para 'prizes' (o check auth.uid() = bar_id vira partner_id)
DROP POLICY IF EXISTS "Bars insert own prizes" ON public.prizes;
DROP POLICY IF EXISTS "Bars update own prizes" ON public.prizes;
DROP POLICY IF EXISTS "Bars delete own prizes" ON public.prizes;
CREATE POLICY "Partners insert own prizes" ON public.prizes FOR INSERT WITH CHECK (auth.uid() = partner_id);
CREATE POLICY "Partners update own prizes" ON public.prizes FOR UPDATE USING (auth.uid() = partner_id);
CREATE POLICY "Partners delete own prizes" ON public.prizes FOR DELETE USING (auth.uid() = partner_id);

-- Criar a tabela 'partner_secrets' para isolar os tokens (Segurança Máxima)
CREATE TABLE public.partner_secrets (
    partner_id UUID PRIMARY KEY REFERENCES public.partners(id) ON DELETE CASCADE,
    mp_access_token TEXT,
    mp_refresh_token TEXT,
    mp_user_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ativar RLS, mas NÃO adicionar políticas públicas de SELECT
ALTER TABLE public.partner_secrets ENABLE ROW LEVEL SECURITY;
-- Edge functions acessam via service_role, ignorando RLS.
-- Opcionalmente, permitir que o próprio parceiro atualize ou visualize? NÃO. Backend gerencia.

-- Mover os dados existentes de 'partners' para 'partner_secrets'
INSERT INTO public.partner_secrets (partner_id, mp_access_token, mp_refresh_token, mp_user_id)
SELECT id, mp_access_token, mp_refresh_token, mp_user_id
FROM public.partners
WHERE mp_access_token IS NOT NULL OR mp_refresh_token IS NOT NULL;

-- Adicionar o campo booleano em 'partners' para indicar conexão
ALTER TABLE public.partners ADD COLUMN mp_connected BOOLEAN DEFAULT false;

-- Marcar como true os que já têm token
UPDATE public.partners SET mp_connected = true WHERE mp_access_token IS NOT NULL;

-- Remover as colunas sensíveis da tabela pública
ALTER TABLE public.partners DROP COLUMN mp_access_token;
ALTER TABLE public.partners DROP COLUMN mp_refresh_token;
ALTER TABLE public.partners DROP COLUMN mp_user_id;


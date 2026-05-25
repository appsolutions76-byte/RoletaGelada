-- 1. Tabelas Globais (Plataforma)
CREATE TABLE public.platform_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform_fee_percentage NUMERIC(5, 4) NOT NULL DEFAULT 0.3333,
    markup_multiplier NUMERIC(5, 2) NOT NULL DEFAULT 1.50
);

-- 2. Tabelas do Bar (Vinculada ao Supabase Auth)
CREATE TABLE public.bars (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    mp_access_token TEXT,
    mp_refresh_token TEXT,
    mp_user_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Prêmios Cadastrados pelo Bar
CREATE TABLE public.prizes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bar_id UUID NOT NULL REFERENCES public.bars(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    bet_amount NUMERIC(10, 2) NOT NULL,
    prize_cost NUMERIC(10, 2) NOT NULL,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Cofre Virtual (Por Prêmio)
CREATE TABLE public.vaults (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prize_id UUID NOT NULL REFERENCES public.prizes(id) ON DELETE CASCADE,
    accumulated_balance NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    CONSTRAINT unique_prize_vault UNIQUE(prize_id)
);

-- 5. Rodadas
CREATE TYPE round_status AS ENUM ('pending', 'paid', 'spinning', 'completed');

CREATE TABLE public.rounds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prize_id UUID NOT NULL REFERENCES public.prizes(id) ON DELETE CASCADE,
    player_name TEXT,
    bet_amount NUMERIC(10, 2) NOT NULL,
    status round_status NOT NULL DEFAULT 'pending',
    result TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Configuração inicial
INSERT INTO public.platform_settings (platform_fee_percentage, markup_multiplier) VALUES (0.3333, 1.50);

---------------------------------------------------
-- SEGURANÇA E POLÍTICAS RLS (ROW LEVEL SECURITY)
---------------------------------------------------
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bars ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prizes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rounds ENABLE ROW LEVEL SECURITY;

-- Plataforma: Leitura livre, Update restrito ao email do Dono
CREATE POLICY "Leitura livre platform_settings" ON public.platform_settings FOR SELECT USING (true);
CREATE POLICY "Update restrito ao dono" ON public.platform_settings FOR UPDATE USING (auth.jwt() ->> 'email' = 'appsolutions76@gmail.com');

-- Bares: Leitura livre (para o catálogo), Update apenas se for o próprio dono logado
CREATE POLICY "Leitura livre bars" ON public.bars FOR SELECT USING (true);
CREATE POLICY "Bars can update own data" ON public.bars FOR UPDATE USING (auth.uid() = id);

-- Prêmios: Leitura livre, Inserção e Update restrito ao dono do bar
CREATE POLICY "Leitura livre prizes" ON public.prizes FOR SELECT USING (true);
CREATE POLICY "Bars insert own prizes" ON public.prizes FOR INSERT WITH CHECK (auth.uid() = bar_id);
CREATE POLICY "Bars update own prizes" ON public.prizes FOR UPDATE USING (auth.uid() = bar_id);
CREATE POLICY "Bars delete own prizes" ON public.prizes FOR DELETE USING (auth.uid() = bar_id);

-- Rounds: Qualquer um pode ler e iniciar uma rodada
CREATE POLICY "Leitura livre rounds" ON public.rounds FOR SELECT USING (true);
CREATE POLICY "Insert publico rounds" ON public.rounds FOR INSERT WITH CHECK (true);

-- Vaults: Bloqueado para o público (Editado apenas via Edge Functions com Service Role)
-- A Edge Function usa a chave de admin, que ignora RLS.

---------------------------------------------------
-- GATILHOS (TRIGGERS) PARA CADASTRO DE BARES
---------------------------------------------------
-- Quando um bar cria a conta (Sign Up), cria a linha automaticamente na tabela bars
CREATE OR REPLACE FUNCTION public.handle_new_bar()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.bars (id, name)
  VALUES (new.id, COALESCE(new.raw_user_meta_data->>'bar_name', 'Bar Novo'));
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_bar();

-- Realtime para as rodadas
ALTER PUBLICATION supabase_realtime ADD TABLE public.rounds;

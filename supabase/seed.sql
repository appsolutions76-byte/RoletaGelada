-- Inserir Usuário de Teste na tabela auth.users (necessário devido à chave estrangeira)
INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  'authenticated',
  'authenticated',
  'partner@teste.com',
  '{"partner_name":"Parceiro Local de Teste"}'
) ON CONFLICT (id) DO NOTHING;

-- O trigger on_auth_user_created cria a linha na tabela partners automaticamente. 
-- Portanto, marcamos a linha existente como conectada:
UPDATE public.partners 
SET mp_connected = true
WHERE id = '11111111-1111-1111-1111-111111111111';

INSERT INTO public.partner_secrets (partner_id, mp_access_token)
VALUES ('11111111-1111-1111-1111-111111111111', 'TEST-TOKEN')
ON CONFLICT (partner_id) DO UPDATE SET mp_access_token = 'TEST-TOKEN';

-- Inserir Prêmio de Teste
INSERT INTO public.prizes (id, partner_id, name, bet_amount, prize_cost, active)
VALUES ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'Cerveja de Teste', 2.00, 5.00, true)
ON CONFLICT (id) DO NOTHING;

-- Inserir Vault para o prêmio (o saldo inicial não será 0 para que possamos testar a vitória)
-- Vamos colocar saldo 10.00 para permitir pelo menos 1 vitória de teste (custo do prêmio = 5 * 1.5 = 7.5)
INSERT INTO public.vaults (prize_id, accumulated_balance) 
VALUES ('22222222-2222-2222-2222-222222222222', 10.00)
ON CONFLICT (prize_id) DO NOTHING;

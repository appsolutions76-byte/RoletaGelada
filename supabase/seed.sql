-- Inserir Bar de teste
INSERT INTO public.bars (id, name, mp_access_token, beer_cost) 
VALUES ('11111111-1111-1111-1111-111111111111', 'Bar Local de Teste', 'TEST-TOKEN', 5.00);

-- Inserir Vault para o bar (o saldo inicial não será 0 para que possamos testar a vitória)
-- Vamos colocar saldo 10.00 para permitir pelo menos 1 vitória de teste (custo do prêmio = 5 * 1.5 = 7.5)
INSERT INTO public.vaults (bar_id, accumulated_balance) 
VALUES ('11111111-1111-1111-1111-111111111111', 10.00);

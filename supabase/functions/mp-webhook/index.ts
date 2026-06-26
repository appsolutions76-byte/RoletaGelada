import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url);
    const topic = url.searchParams.get("topic") || url.searchParams.get("type");
    const id = url.searchParams.get("id") || url.searchParams.get("data.id");
    const externalRef = url.searchParams.get("external_reference");

    // Allow mock testing from frontend using external_reference
    if (topic === "payment" && (id || externalRef)) {
      const supabaseClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );

      // Lê o corpo do webhook enviado pelo Mercado Pago
      const body = await req.json().catch(() => ({}));
      
      let roundId = null;
      let betAmount = 0;

      // O Mercado Pago pode mandar a external_reference diretamente no payload em alguns casos
      if (body.additional_info && body.additional_info.external_reference) {
          roundId = body.additional_info.external_reference;
          betAmount = body.transaction_amount;
      } else {
         // Se não vier no corpo, na vida real você precisaria buscar o pagamento na API do MP
         // usando o token do parceiro. Como não temos o token do parceiro fácil aqui (precisaria do roundId para achar o parceiro),
         // vamos assumir que o frontend já confirmou ou buscar pela external_reference se vier na URL.
         
         // Para simplificar o MVP e garantir o funcionamento: 
         // O Mercado Pago também permite que mandemos parâmetros customizados na notification_url.
         // Mas como padrão, pegamos do corpo. Se não tiver, saímos.
         roundId = url.searchParams.get("external_reference");
      }

      if (roundId) {
          const { data: round } = await supabaseClient.from('rounds').select('*, prizes(*)').eq('id', roundId).single();
          
          if (round && round.status === 'pending') {
              // Pegar o id do pagamento
              let paymentId = url.searchParams.get("data.id") || url.searchParams.get("id");
              if (!paymentId && body.data && body.data.id) paymentId = body.data.id;

              let isPaid = false;

              if (paymentId) {
                  // Obter token do parceiro para consultar API
                  const { data: secret } = await supabaseClient.from('partner_secrets').select('mp_access_token').eq('partner_id', round.partner_id).single();
                  if (secret && secret.mp_access_token) {
                      const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
                          headers: { Authorization: `Bearer ${secret.mp_access_token}` }
                      });
                      const mpData = await mpRes.json();
                      if (mpData.status === 'approved') {
                          isPaid = true;
                      }
                  }
              } else {
                  // Fallback para mock/teste do botão amarelo
                  // SÓ APROVA se o parceiro tiver um token MOCK configurado!
                  const { data: secret } = await supabaseClient.from('partner_secrets').select('mp_access_token').eq('partner_id', round.partner_id).single();
                  if (secret && secret.mp_access_token) {
                      const t = secret.mp_access_token.toUpperCase();
                      if (t.includes('TESTE') || t.includes('TEST-TOKEN') || t.length < 15) {
                          isPaid = true;
                      }
                  }
              }

              if (isPaid) {
                  // 1. Marca como pago atomicamente para evitar que webhooks duplicados creditem o cofre 2x
                  const { data: updatedRounds } = await supabaseClient
                      .from('rounds')
                      .update({status: 'paid'})
                      .eq('id', round.id)
                      .eq('status', 'pending')
                      .select();
                  
                  // Se retornou algo, significa que fomos nós que alteramos de pending para paid
                  if (updatedRounds && updatedRounds.length > 0) {
                      // 2. Incrementa o cofre do prêmio com a parte do parceiro (ex: 70% do bet_amount)
                      const { data: settings } = await supabaseClient.from('platform_settings').select('platform_fee_percentage').limit(1).single();
                      const platformFee = settings && settings.platform_fee_percentage ? Number(settings.platform_fee_percentage) : 0;
                      const partnerShare = 1 - platformFee;
                      const amountForVault = Number(round.bet_amount) * partnerShare;

                      const { data: vault } = await supabaseClient.from('vaults').select('*').eq('prize_id', round.prize_id).single();
                      
                      if (vault) {
                         await supabaseClient.from('vaults').update({accumulated_balance: Number(vault.accumulated_balance) + amountForVault}).eq('id', vault.id);
                      } else {
                         await supabaseClient.from('vaults').insert([{prize_id: round.prize_id, accumulated_balance: amountForVault}]);
                      }
                  }
              }
          }
      }
    }

    return new Response("OK", { status: 200, headers: corsHeaders });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }
})

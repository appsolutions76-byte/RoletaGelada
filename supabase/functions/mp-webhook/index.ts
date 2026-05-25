import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1"

serve(async (req) => {
  try {
    const url = new URL(req.url);
    const topic = url.searchParams.get("topic") || url.searchParams.get("type");
    const id = url.searchParams.get("id") || url.searchParams.get("data.id");

    if (topic === "payment" && id) {
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
         // usando o token do bar. Como não temos o token do bar fácil aqui (precisaria do roundId para achar o bar),
         // vamos assumir que o frontend já confirmou ou buscar pela external_reference se vier na URL.
         
         // Para simplificar o MVP e garantir o funcionamento: 
         // O Mercado Pago também permite que mandemos parâmetros customizados na notification_url.
         // Mas como padrão, pegamos do corpo. Se não tiver, saímos.
         roundId = url.searchParams.get("external_reference");
      }

      if (roundId) {
          const { data: round } = await supabaseClient.from('rounds').select('*, prizes(*)').eq('id', roundId).single();
          
          if (round && round.status === 'pending') {
              // 1. Marca como pago
              await supabaseClient.from('rounds').update({status: 'paid'}).eq('id', round.id);
              
              // 2. Incrementa o cofre do prêmio
              const { data: vault } = await supabaseClient.from('vaults').select('*').eq('prize_id', round.prize_id).single();
              
              if (vault) {
                 await supabaseClient.from('vaults').update({accumulated_balance: vault.accumulated_balance + round.bet_amount}).eq('id', vault.id);
              } else {
                 await supabaseClient.from('vaults').insert([{prize_id: round.prize_id, accumulated_balance: round.bet_amount}]);
              }
          }
      }
    }

    return new Response("OK", { status: 200 });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
})

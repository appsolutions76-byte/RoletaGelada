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
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error("Missing Authorization header");
    
    const token = authHeader.replace('Bearer ', '');

    // Cliente com poderes administrativos para burlar RLS (já que rounds não tem UPDATE publico)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Verifica a identidade real do garçom/dono do bar
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
    if (authError || !user) throw new Error("Unauthorized");

    const { round_id, action } = await req.json()
    if (!round_id) throw new Error("round_id is required");

    // Busca a rodada
    const { data: round, error: roundError } = await supabaseAdmin
      .from('rounds')
      .select('*, prizes(*)')
      .eq('id', round_id)
      .single();

    if (roundError || !round) throw new Error("Código inválido ou rodada não encontrada.");

    // Verifica se a rodada pertence ao bar que está logado
    // Em prêmios menores, o bar_id está direto na round (novo fix). Se não, pega do prize.
    const barId = round.bar_id || (round.prizes ? round.prizes.bar_id : null);
    if (barId !== user.id) throw new Error("Este prêmio NÃO pertence ao seu bar!");

    // O status tem que estar completo (girou a roleta)
    if (round.status !== 'completed') throw new Error("Esta rodada ainda não foi finalizada pelo cliente.");

    const resultText = round.result || "Prêmio Desconhecido";

    // Verifica se JÁ FOI RESGATADO
    if (resultText.startsWith('REDEEMED|')) {
        const parts = resultText.split('|');
        const date = new Date(parts[1]).toLocaleString('pt-BR');
        return new Response(JSON.stringify({ 
            success: false, 
            already_redeemed: true, 
            message: `GOLPE! Prêmio já entregue em ${date}`,
            prize: parts[2]
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Se a ação for apenas CHECAR (Scan initial)
    if (action === 'check') {
        return new Response(JSON.stringify({ 
            success: true, 
            already_redeemed: false, 
            prize: resultText 
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Se a ação for CONFIRMAR ENTREGA
    if (action === 'redeem') {
        const newResult = `REDEEMED|${new Date().toISOString()}|${resultText}`;
        const { error: updateError } = await supabaseAdmin
            .from('rounds')
            .update({ result: newResult })
            .eq('id', round_id);

        if (updateError) throw updateError;

        return new Response(JSON.stringify({ 
            success: true, 
            message: 'Prêmio entregue com sucesso!' 
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    throw new Error("Invalid action");

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

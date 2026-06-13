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

    // Verifica a identidade real do parceiro
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
    if (authError || !user) throw new Error("Unauthorized");

    const { round_id, action } = await req.json()
    if (!round_id) throw new Error("round_id is required");

    let target_round_id = round_id;
    
    // Se o round_id tiver 4 caracteres, é um shortcode manual digitado
    if (round_id.length === 4) {
        const shortcode = round_id.toLowerCase();
        const startUuid = `${shortcode}0000-0000-0000-0000-000000000000`;
        const endUuid   = `${shortcode}ffff-ffff-ffff-ffff-ffffffffffff`;

        const { data: searchRounds, error: searchErr } = await supabaseAdmin
            .from('rounds')
            .select('id')
            .gte('id', startUuid)
            .lte('id', endUuid)
            .limit(1);

        if (searchErr || !searchRounds || searchRounds.length === 0) {
            throw new Error("Código manual não encontrado nas rodadas. Verifique se digitou corretamente.");
        }
        target_round_id = searchRounds[0].id;
    }

    // Busca a rodada
    const { data: round, error: roundError } = await supabaseAdmin
      .from('rounds')
      .select('*, prizes(*)')
      .eq('id', target_round_id)
      .single();

    if (roundError || !round) throw new Error("Código inválido ou rodada não encontrada.");

    // Verifica se a rodada pertence ao parceiro que está logado
    const partnerId = round.partner_id || (round.prizes ? round.prizes.partner_id : null);
    if (partnerId !== user.id) throw new Error("Este prêmio NÃO pertence ao seu painel!");

    // O status tem que estar completo (girou a roleta)
    if (round.status !== 'completed') throw new Error("Esta rodada ainda não foi finalizada pelo cliente.");

    const resultText = round.result || "Prêmio Desconhecido";

    // Verifica se JÁ FOI RESGATADO
    if (resultText.startsWith('REDEEMED|')) {
        const parts = resultText.split('|');
        return new Response(JSON.stringify({ 
            success: false, 
            already_redeemed: true, 
            redeemed_at: parts[1],
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
            .eq('id', target_round_id);

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

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
    const { round_id, action, angle } = await req.json()

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: round, error: roundError } = await supabaseClient
      .from('rounds')
      .select('*, prizes (*)')
      .eq('id', round_id)
      .single()

    if (roundError || !round) throw new Error('Round not found')
    // Apenas para testes, vamos permitir girar mesmo pendente se for chamado direto.
    // if (round.status !== 'paid') throw new Error('Not paid')

    const { data: settings } = await supabaseClient.from('platform_settings').select('*').single()
    
    // Obter Cofre
    const { data: vault } = await supabaseClient
      .from('vaults')
      .select('*')
      .eq('prize_id', round.prize_id)
      .single()

    const currentBalance = vault ? Number(vault.accumulated_balance) : 0;
    const prizeCost = Number(round.prizes.prize_cost);
    const targetBalance = prizeCost * Number(settings.markup_multiplier); // Ex: 10 * 1.5 = 15

    if (action === 'start') {
      let difficulty = 'hard';
      if (currentBalance >= targetBalance) {
        difficulty = 'easy';
      }
      return new Response(JSON.stringify({ difficulty }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }})
    }

    if (action === 'stop') {
      let won = false;
      
      // Ignora o ângulo do frontend para proteção total do caixa (Slip Mechanic / Skill Stop Illusion)
      if (currentBalance >= targetBalance) {
        const chance = Math.random();
        if (chance <= 0.15) { // 15% de chance de ganhar quando a trava libera
          won = true;
        }
      }

      if (won) {
        // Deduz o custo da cerveja do cofre
        if (vault) {
          await supabaseClient
            .from('vaults')
            .update({ accumulated_balance: currentBalance - targetBalance }) // Reseta pagando o custo e lucro
            .eq('id', vault.id);
        } else {
          await supabaseClient
            .from('vaults')
            .insert({ prize_id: round.prize_id, accumulated_balance: 0 }); 
        }
          
        await supabaseClient.from('rounds').update({ status: 'completed', result: 'WON' }).eq('id', round.id);
        
        return new Response(JSON.stringify({ prize: round.prizes.name, status: 'WON' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }})
      } else {
        await supabaseClient.from('rounds').update({ status: 'completed', result: 'LOST' }).eq('id', round.id);
        return new Response(JSON.stringify({ prize: 'NADA', status: 'LOST' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }})
      }
    }
    
    return new Response(JSON.stringify({ error: 'Invalid action' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }})

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }})
  }
})

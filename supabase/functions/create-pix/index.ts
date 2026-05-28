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
    const { prize_id, player_name } = await req.json()

    if (!prize_id) {
      return new Response(JSON.stringify({ error: 'Missing prize_id' }), { status: 400, headers: { ...corsHeaders } })
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 1. Fetch Prize, Bar and Platform Settings
    const { data: prize, error: prizeError } = await supabaseClient
      .from('prizes')
      .select('*, bars(*)')
      .eq('id', prize_id)
      .single()

    if (prizeError || !prize) throw new Error('Prize not found')

    const { data: settings, error: settingsError } = await supabaseClient
      .from('platform_settings')
      .select('*')
      .limit(1)
      .single()
      
    if (settingsError || !settings) throw new Error('Settings not found')

    // 2. Calculate Total Bet (Reverted to base bet as per new requirement)
    const totalBetAmount = Number(prize.bet_amount);

    // 3. Create Round
    const { data: round, error: roundError } = await supabaseClient
      .from('rounds')
      .insert([{ 
          prize_id, 
          bar_id: prize.bar_id, // Novo campo corrigindo o bug do Conta Real
          player_name: player_name || 'Anônimo', 
          bet_amount: totalBetAmount, 
          status: 'pending' 
      }])
      .select()
      .single()

    if (roundError) throw roundError;

    // 4. Split Math
    const mpAccessToken = Deno.env.get('MP_ACCESS_TOKEN'); // Platform token
    
    // Calculate application_fee based on the ORIGINAL bet_amount and platform fee percentage
    const platformFee = Number((totalBetAmount * settings.platform_fee_percentage).toFixed(2));
    
    // O resto vai pro dono do bar (O MP faz isso automaticamente ao passarmos a application_fee)
    // O pagamento é feito usando o token do Bar (Marketplace payment)
    const barToken = prize.bars.mp_access_token;

    if (!barToken) {
      return new Response(JSON.stringify({ error: 'Este bar não configurou o Mercado Pago ainda.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const paymentData: any = {
      transaction_amount: Number(totalBetAmount.toFixed(2)),
      description: `Roleta Gelada: ${prize.name}`,
      payment_method_id: "pix",
      payer: { email: "cliente@roletagelada.com" },
      external_reference: round.id,
      notification_url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/mp-webhook`,
      application_fee: platformFee // Aqui cobramos a taxa gota a gota!
    };

    // 4. Mock para Testes
    if (barToken === 'TEST-TOKEN') {
      // Simular um atraso da API
      await new Promise(resolve => setTimeout(resolve, 1000));
      return new Response(JSON.stringify({ 
        round_id: round.id,
        qr_code: `MOCK_QR_CODE_FOR_ROUND_${round.id}`
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const mpResponse = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${barToken}`, // <- IMPORTANTE: Pix gerado no token do Bar!
        'Content-Type': 'application/json',
        'X-Idempotency-Key': crypto.randomUUID()
      },
      body: JSON.stringify(paymentData)
    });

    const mpData = await mpResponse.json();
    if (!mpResponse.ok) throw new Error(`MP Error: ${JSON.stringify(mpData)}`);

    return new Response(JSON.stringify({ 
      round_id: round.id,
      qr_code: mpData.point_of_interaction?.transaction_data?.qr_code || 'QR_CODE_NOT_FOUND'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

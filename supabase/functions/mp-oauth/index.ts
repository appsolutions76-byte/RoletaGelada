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
    const code = url.searchParams.get("code");
    const partnerId = url.searchParams.get("state"); // Passamos o ID do parceiro no parâmetro state do OAuth

    if (!code || !partnerId) {
        return new Response("Missing code or state", { status: 400 });
    }

    const clientId = Deno.env.get('MP_CLIENT_ID');
    const clientSecret = Deno.env.get('MP_CLIENT_SECRET');
    const redirectUri = `${Deno.env.get('SUPABASE_URL')}/functions/v1/mp-oauth`;

    // Trocar código por Token
    const mpResponse = await fetch('https://api.mercadopago.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: new URLSearchParams({
        'client_id': clientId ?? '',
        'client_secret': clientSecret ?? '',
        'grant_type': 'authorization_code',
        'code': code,
        'redirect_uri': redirectUri
      })
    });

    const data = await mpResponse.json();

    if (!mpResponse.ok) {
        throw new Error(JSON.stringify(data));
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Salvar token em partner_secrets
    const { error: secretsError } = await supabaseClient
      .from('partner_secrets')
      .upsert({
          partner_id: partnerId,
          mp_access_token: data.access_token,
          mp_refresh_token: data.refresh_token,
          mp_user_id: data.user_id?.toString()
      }, { onConflict: 'partner_id' });

    if (secretsError) throw secretsError;

    // Atualizar status de conexão na tabela pública de parceiros
    const { error: partnerError } = await supabaseClient
      .from('partners')
      .update({ mp_connected: true })
      .eq('id', partnerId);

    if (partnerError) throw partnerError;

    return new Response("Mercado Pago vinculado com sucesso! Pode fechar esta aba e voltar ao painel.", {
      headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' },
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

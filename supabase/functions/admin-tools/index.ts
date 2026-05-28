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

    // Cria cliente com Service Role para ter poderes administrativos
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Verifica a identidade real do chamador
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
    if (authError || !user || user.email !== 'appsolutions76@gmail.com') {
      return new Response(JSON.stringify({ error: 'Unauthorized. Somente o Master pode executar esta ação.' }), { status: 401, headers: corsHeaders })
    }

    const { action, payload } = await req.json()

    if (action === 'delete_partner') {
        const { bar_id } = payload;
        if (!bar_id) throw new Error("bar_id is required");
        
        if (bar_id === user.id) {
            // É a conta Master (acabou na tabela de bars por acidente). Apenas deleta de bars, NÃO do auth!
            const { error: barError } = await supabaseAdmin.from('bars').delete().eq('id', bar_id);
            if (barError) throw barError;
        } else {
            // Deleta o usuário da tabela auth.users (causa cascade delete na tabela bars)
            const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(bar_id);
            if (deleteError) {
                // Se falhar (ex: user não existe no auth.users), força a deleção na tabela bars
                const { error: barError } = await supabaseAdmin.from('bars').delete().eq('id', bar_id);
                if (barError) throw deleteError;
            }
        }

        return new Response(JSON.stringify({ success: true, message: 'Parceiro excluído com sucesso.' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    } 
    else if (action === 'reset_all_stats') {
        // Zera rodadas e cofres, mas mantém os bares e prêmios configurados
        const { error: roundError } = await supabaseAdmin.from('rounds').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        if (roundError) throw roundError;

        const { error: vaultError } = await supabaseAdmin.from('vaults').update({ accumulated_balance: 0 }).neq('id', '00000000-0000-0000-0000-000000000000');
        if (vaultError) throw vaultError;

        return new Response(JSON.stringify({ success: true, message: 'Estatísticas zeradas com sucesso.' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    }
    else {
        throw new Error("Invalid action");
    }

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

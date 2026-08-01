import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Verificar usuário chamador
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: "Token inválido" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const callerId = userData.user.id;

    // Verificar se é admin
    const { data: membroCaller } = await supabaseAdmin
      .from("membros_equipe")
      .select("papel, equipe_id")
      .eq("user_id", callerId)
      .eq("papel", "admin")
      .eq("ativo", true)
      .maybeSingle();

    if (!membroCaller) {
      return new Response(JSON.stringify({ error: "Somente administradores podem alterar dados de outros usuários" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const { target_user_id, nova_senha, novo_username, nome } = await req.json();

    if (!target_user_id) {
      return new Response(JSON.stringify({ error: "target_user_id é obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Verificar se o usuário alvo pertence à mesma equipe
    const { data: membroAlvo } = await supabaseAdmin
      .from("membros_equipe")
      .select("id, username, email")
      .eq("user_id", target_user_id)
      .eq("equipe_id", membroCaller.equipe_id)
      .eq("ativo", true)
      .maybeSingle();

    if (!membroAlvo) {
      return new Response(JSON.stringify({ error: "Usuário não encontrado na equipe" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const updates: Record<string, string> = {};

    // Atualizar senha
    if (nova_senha) {
      if (nova_senha.length < 6) {
        return new Response(JSON.stringify({ error: "A senha deve ter pelo menos 6 caracteres" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      updates.password = nova_senha;
    }

    // Atualizar username (também atualiza o email fictício no auth)
    if (novo_username) {
      const usernameRegex = /^[a-z0-9._-]+$/;
      if (!usernameRegex.test(novo_username)) {
        return new Response(JSON.stringify({ error: "Nome de usuário inválido" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // Verificar se username já existe em outro membro
      const { data: existente } = await supabaseAdmin
        .from("membros_equipe")
        .select("id")
        .eq("username", novo_username)
        .neq("id", membroAlvo.id)
        .maybeSingle();

      if (existente) {
        return new Response(JSON.stringify({ error: "Nome de usuário já está em uso" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const dominio = Deno.env.get("TRACTAR_DOMINIO") ?? "tractar.app";
      updates.email = novo_username + "@" + dominio;
    }

    // Atualizar dados na tabela membros_equipe
    const updateData: any = {};
    if (novo_username) {
      updateData.username = novo_username;
      updateData.email = updates.email;
    }
    if (nome) {
      updateData.nome = nome;
    }
    if (Object.keys(updateData).length > 0) {
      await supabaseAdmin
        .from("membros_equipe")
        .update(updateData)
        .eq("id", membroAlvo.id);
    }

    // Aplicar atualizações no auth
    if (Object.keys(updates).length > 0) {
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
        target_user_id,
        updates
      );
      if (updateError) {
        return new Response(JSON.stringify({ error: "Erro ao atualizar: " + updateError.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    return new Response(JSON.stringify({ success: true, mensagem: "Dados atualizados com sucesso!" }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: "Erro interno: " + err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});

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

    // Verificar usuário pelo token
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(
      authHeader.replace("Bearer ", "")
    );

    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: "Token inválido" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const callerId = userData.user.id;

    // Buscar equipe e papel do usuário que está chamando
    const { data: membroCaller, error: membroError } = await supabaseAdmin
      .from("membros_equipe")
      .select("papel, equipe_id")
      .eq("user_id", callerId)
      .eq("ativo", true)
      .maybeSingle();

    if (membroError || !membroCaller) {
      return new Response(JSON.stringify({ error: "Usuário não pertence a nenhuma equipe" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (membroCaller.papel !== "admin") {
      return new Response(JSON.stringify({ error: "Somente administradores podem criar usuários" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const { nome, username, senha, papel } = await req.json();

    if (!nome || !username || !senha || !papel) {
      return new Response(JSON.stringify({ error: "Campos obrigatórios: nome, username, senha, papel" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const usernameRegex = /^[a-z0-9._-]+$/;
    if (!usernameRegex.test(username)) {
      return new Response(JSON.stringify({ error: "Nome de usuário inválido. Use apenas letras minúsculas, números, ponto, hífen ou underscore." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const dominio = Deno.env.get("TRACTAR_DOMINIO") ?? "tractar.app";
    const emailFicticio = username + "@" + dominio;

    // Verificar se username já existe
    const { data: existente } = await supabaseAdmin
      .from("membros_equipe")
      .select("id")
      .eq("username", username)
      .maybeSingle();

    if (existente) {
      return new Response(JSON.stringify({ error: "Nome de usuário já está em uso." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Criar usuário
    const { data: novoUser, error: errUser } = await supabaseAdmin.auth.admin.createUser({
      email: emailFicticio,
      password: senha,
      email_confirm: true,
      user_metadata: { nome, username }
    });

    if (errUser) {
      return new Response(JSON.stringify({ error: errUser.message }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Vincular à mesma equipe do admin
    const { error: errMembro } = await supabaseAdmin
      .from("membros_equipe")
      .insert({
        user_id: novoUser.user.id,
        equipe_id: membroCaller.equipe_id,
        papel,
        nome,
        email: emailFicticio,
        username
      });

    if (errMembro) {
      await supabaseAdmin.auth.admin.deleteUser(novoUser.user.id);
      return new Response(JSON.stringify({ error: "Erro ao vincular usuário à equipe: " + errMembro.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({
      success: true,
      user_id: novoUser.user.id,
      mensagem: nome + " foi adicionado à equipe. Login: " + username
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: "Erro interno: " + err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});

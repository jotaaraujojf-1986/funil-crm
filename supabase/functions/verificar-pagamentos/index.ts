import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async () => {
  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  const hoje = new Date().toISOString().slice(0, 10);

  const { data: equipes, error: errEquipes } = await admin
    .from("equipes")
    .select("id,nome")
    .eq("ativo", true);

  if (errEquipes) {
    console.error("Erro ao buscar equipes:", errEquipes);
    return new Response(JSON.stringify({ error: errEquipes.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }

  let suspensas = 0, avisos = 0, ok = 0;

  for (const eq of (equipes || [])) {
    const { data: pags, error: errPags } = await admin
      .from("pagamentos")
      .select("id,data_vencimento,status")
      .eq("equipe_id", eq.id)
      .in("status", ["pendente", "atrasado"])
      .order("data_vencimento", { ascending: false })
      .limit(1);

    if (errPags) {
      console.error(`Erro ao buscar pagamentos para equipe ${eq.id}:`, errPags);
      continue;
    }

    if (!pags || pags.length === 0) {
      ok++;
      continue;
    }

    const p = pags[0];
    const diasRestantes = Math.ceil((new Date(p.data_vencimento).getTime() - new Date(hoje).getTime()) / 86400000);

    if (diasRestantes < -3) {
      await admin.from("equipes").update({ ativo: false }).eq("id", eq.id);
      await admin.from("pagamentos").update({ status: "atrasado" }).eq("id", p.id);
      suspensas++;
    } else if (diasRestantes <= 0) {
      await admin.from("pagamentos").update({ status: "atrasado" }).eq("id", p.id);
      avisos++;
    } else {
      ok++;
    }
  }

  return new Response(JSON.stringify({ suspensas, avisos, ok }), {
    headers: { "Content-Type": "application/json" }
  });
});

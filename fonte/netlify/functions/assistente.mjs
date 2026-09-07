/* Função do Netlify que conversa com a API da Anthropic.
 *
 * A chave NUNCA vai para o navegador: ela fica numa variável de ambiente
 * do Netlify, e só este código, que roda no servidor, a enxerga.
 *
 * Para ligar:
 *   1. Pegue uma chave em console.anthropic.com (API Keys).
 *   2. No Netlify: Site configuration > Environment variables > Add.
 *      Key:   ANTHROPIC_API_KEY
 *      Value: a chave, começando com sk-ant-
 *   3. Publique de novo o site.
 */

const MODELO = "claude-sonnet-5";
const LIMITE_ENTRADA = 24000;   // caracteres, para conter custo por chamada
const PROJETO = "cadencia-7c1f1";
/* Contas com acesso liberado sem assinatura. O e-mail vem do token já
   validado pelo Google, então não dá para forjar. */
const DONOS = ["joseeduardo1616@gmail.com"];

/* Confere quem está pedindo antes de gastar créditos.
   O navegador manda o token do Firebase; aqui ele é validado direto com o
   Google, e só então olhamos se a assinatura está em dia. Sem isso qualquer
   visitante do site gastaria a conta do dono. */
async function assinanteValido(idToken, apiKey) {
  if (!idToken) return { ok: false, motivo: "Entre na sua conta para usar o assistente." };
  try {
    const v = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });
    if (!v.ok) return { ok: false, motivo: "Sua sessão expirou. Entre de novo." };
    const dados = await v.json();
    const u = (dados.users || [])[0];
    if (!u || !u.localId) return { ok: false, motivo: "Não consegui confirmar sua conta." };
    if (u.email && DONOS.indexOf(String(u.email).toLowerCase()) >= 0) {
      return { ok: true, uid: u.localId, dono: true };
    }

    const doc = await fetch(
      `https://firestore.googleapis.com/v1/projects/${PROJETO}/databases/(default)/documents/assinaturas/${u.localId}`,
      { headers: { Authorization: `Bearer ${idToken}` } });
    if (!doc.ok) return { ok: false, motivo: "O assistente faz parte do plano completo." };
    const j = await doc.json();
    const ate = Number(((j.fields || {}).validoAte || {}).doubleValue || 0);
    if (ate <= Date.now()) return { ok: false, motivo: "Sua assinatura não está ativa." };
    return { ok: true, uid: u.localId };
  } catch (e) {
    return { ok: false, motivo: "Não consegui verificar sua assinatura." };
  }
}

export default async (req) => {
  if (req.method !== "POST") {
    return Response.json({ erro: "Método não permitido." }, { status: 405 });
  }

  const chave = process.env.ANTHROPIC_API_KEY;
  if (!chave) {
    return Response.json({
      erro: "A chave da API não está configurada no Netlify. Cadastre ANTHROPIC_API_KEY nas variáveis de ambiente e publique de novo.",
    }, { status: 500 });
  }

  let corpo;
  try {
    corpo = await req.json();
  } catch (e) {
    return Response.json({ erro: "Pedido inválido." }, { status: 400 });
  }

  const apiKeyFirebase = process.env.FIREBASE_API_KEY;
  if (apiKeyFirebase) {
    const check = await assinanteValido(corpo.token, apiKeyFirebase);
    if (!check.ok) return Response.json({ erro: check.motivo }, { status: 402 });
  }

  const mensagens = Array.isArray(corpo.mensagens) ? corpo.mensagens.slice(-14) : [];
  if (mensagens.length === 0) {
    return Response.json({ erro: "Nenhuma mensagem enviada." }, { status: 400 });
  }

  const contexto = String(corpo.contexto || "").slice(0, LIMITE_ENTRADA);
  const instrucoes = String(corpo.instrucoes || "").slice(0, 6000);

  const limpas = mensagens
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map((m) => ({ role: m.role, content: m.content.slice(0, 6000) }));

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": chave,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODELO,
        max_tokens: 1400,
        system: `${instrucoes}\n\n=== DADOS ATUAIS DO PAINEL ===\n${contexto}`,
        messages: limpas,
      }),
    });

    if (!r.ok) {
      const detalhe = await r.text().catch(() => "");
      let real = "";
      try { real = (JSON.parse(detalhe).error || {}).message || ""; } catch (e) { /* texto puro */ }

      /* Mostrar o motivo real ajuda muito mais do que adivinhar. O 400 tanto
         pode ser modelo inexistente quanto conversa longa demais. */
      const msg = r.status === 401 || r.status === 403
        ? "A chave da API foi recusada. Confira o valor de ANTHROPIC_API_KEY no Netlify."
        : r.status === 429 ? "Muitos pedidos seguidos. Espere alguns segundos."
        : r.status === 529 ? "O serviço está sobrecarregado. Tente de novo em instantes."
        : real ? `A API recusou o pedido: ${real}`
        : `O serviço respondeu com erro ${r.status}.`;
      console.error("anthropic", r.status, detalhe.slice(0, 500));
      return Response.json({ erro: msg }, { status: 502 });
    }

    const j = await r.json();
    const texto = (j.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    if (!texto) return Response.json({ erro: "Resposta vazia." }, { status: 502 });
    return Response.json({ texto });
  } catch (e) {
    console.error("falha", e);
    return Response.json({ erro: "Não consegui alcançar o serviço." }, { status: 502 });
  }
};

export const config = { path: "/.netlify/functions/assistente" };

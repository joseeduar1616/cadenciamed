/* Função do Netlify que conversa com a IA.
 *
 * A chave NUNCA vai para o navegador: ela fica numa variável de ambiente do
 * Netlify, e só este código, que roda no servidor, a enxerga.
 *
 * Funciona com dois provedores. Quem manda é a variável de ambiente que
 * existir; não precisa mexer no código para trocar:
 *
 *   GEMINI_API_KEY      → usa o Gemini, do Google
 *   ANTHROPIC_API_KEY   → usa o Claude, da Anthropic
 *
 * Se as duas estiverem cadastradas, o Gemini é o escolhido, por ser o que
 * tem camada gratuita. Para forçar um deles, cadastre também:
 *
 *   IA_PROVEDOR = gemini   (ou anthropic)
 *
 * Para pegar as chaves:
 *   Gemini    → aistudio.google.com/apikey  (tem plano gratuito)
 *   Anthropic → console.anthropic.com       (pré-pago, sem plano gratuito)
 *
 * Depois, no Netlify: Site configuration > Environment variables > Add, e
 * publique de novo o site.
 */

/* Dá para trocar o modelo sem mexer no código, pelas variáveis
   GEMINI_MODELO e ANTHROPIC_MODELO. */
const GEMINI_MODELO = process.env.GEMINI_MODELO || "gemini-2.5-flash";
const ANTHROPIC_MODELO = process.env.ANTHROPIC_MODELO || "claude-sonnet-5";

const LIMITE_ENTRADA = 24000;   // caracteres, para conter custo por chamada
const MAX_SAIDA = 1400;
/* Contas com acesso liberado sem assinatura. O e-mail vem do token já
   validado pelo Google, então não dá para forjar. */
const DONOS = ["joseeduardo1616@gmail.com"];

/* Confere quem está pedindo antes de gastar a cota.
   O assistente é só do administrador: a cota da IA é paga pela conta dele,
   então liberar para todo assinante seria abrir a torneira. O navegador
   esconde a aba, mas quem protege de verdade é esta função, porque o
   endereço dela é público e o e-mail vem do token validado com o Google. */
async function podeUsar(idToken, apiKey) {
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
    return { ok: false, motivo: "O assistente está disponível apenas para o administrador." };
  } catch (e) {
    return { ok: false, motivo: "Não consegui verificar sua conta." };
  }
}

/* Traduz o erro do provedor para uma frase que o estudante entenda, sem
   esconder o motivo real, que é o que costuma resolver mais rápido. */
function recado(status, real, provedor) {
  const ondePagar = provedor === "gemini"
    ? "Confira a cota da chave em aistudio.google.com."
    : "Confira o saldo em console.anthropic.com, em Plans & Billing.";
  if (status === 401 || status === 403) {
    return provedor === "gemini"
      ? "A chave do Gemini foi recusada. Confira GEMINI_API_KEY no Netlify e se a API está ativa no projeto."
      : "A chave da API foi recusada. Confira o valor de ANTHROPIC_API_KEY no Netlify.";
  }
  if (status === 429) return `Cota esgotada ou pedidos demais seguidos. Espere um pouco. ${ondePagar}`;
  if (status === 503 || status === 529) return "O serviço está sobrecarregado. Tente de novo em instantes.";
  if (real) return `A IA recusou o pedido: ${real}`;
  return `O serviço respondeu com erro ${status}.`;
}

/* ── Gemini ─────────────────────────────────────────────────────────────
   O Gemini chama de "model" o que a Anthropic chama de "assistant", e as
   instruções do sistema vão num campo separado, não no meio da conversa. */
async function chamarGemini(chave, { sistema, mensagens }) {
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODELO}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": chave },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: sistema }] },
        contents: mensagens.map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        })),
        generationConfig: { maxOutputTokens: MAX_SAIDA },
      }),
    });

  if (!r.ok) {
    const detalhe = await r.text().catch(() => "");
    let real = "";
    try { real = (JSON.parse(detalhe).error || {}).message || ""; } catch (e) { /* texto puro */ }
    console.error("gemini", r.status, detalhe.slice(0, 500));
    return { erro: recado(r.status, real, "gemini") };
  }

  const j = await r.json();
  const c = (j.candidates || [])[0];

  /* O Gemini responde 200 mesmo quando corta por filtro de conteúdo ou por
     falta de espaço, e aí não vem texto nenhum. Sem tratar isso o estudante
     veria só "resposta vazia" e não saberia o que fazer. */
  if (!c) {
    const bloqueio = ((j.promptFeedback || {}).blockReason) || "";
    return { erro: bloqueio ? `O Gemini bloqueou o pedido (${bloqueio}).` : "A IA não respondeu nada." };
  }
  const texto = ((c.content || {}).parts || [])
    .map((p) => p.text || "").join("").trim();
  if (!texto) {
    if (c.finishReason === "MAX_TOKENS") return { erro: "A resposta ficou longa demais e foi cortada. Pergunte de novo, mais específico." };
    if (c.finishReason === "SAFETY") return { erro: "O Gemini bloqueou a resposta por política de conteúdo." };
    return { erro: "A IA devolveu uma resposta vazia." };
  }
  return { texto };
}

/* ── Anthropic ──────────────────────────────────────────────────────── */
async function chamarAnthropic(chave, { sistema, mensagens }) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": chave,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODELO,
      max_tokens: MAX_SAIDA,
      system: sistema,
      messages: mensagens,
    }),
  });

  if (!r.ok) {
    const detalhe = await r.text().catch(() => "");
    let real = "";
    try { real = (JSON.parse(detalhe).error || {}).message || ""; } catch (e) { /* texto puro */ }
    console.error("anthropic", r.status, detalhe.slice(0, 500));
    return { erro: recado(r.status, real, "anthropic") };
  }

  const j = await r.json();
  const texto = (j.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  if (!texto) return { erro: "A IA devolveu uma resposta vazia." };
  return { texto };
}

/* Qual provedor usar, olhando só o que está cadastrado no Netlify. */
function escolherProvedor() {
  const pedido = String(process.env.IA_PROVEDOR || "").toLowerCase();
  const gem = process.env.GEMINI_API_KEY;
  const ant = process.env.ANTHROPIC_API_KEY;
  if (pedido === "gemini") return gem ? { nome: "gemini", chave: gem } : null;
  if (pedido === "anthropic") return ant ? { nome: "anthropic", chave: ant } : null;
  /* sem preferência: o Gemini vem primeiro por ter camada gratuita */
  if (gem) return { nome: "gemini", chave: gem };
  if (ant) return { nome: "anthropic", chave: ant };
  return null;
}

export default async (req) => {
  const provedor = escolherProvedor();

  /* Abrir o endereço da função no navegador mostra qual IA está ligada.
     Serve para conferir, depois de publicar, se a chave chegou mesmo até
     aqui: no Netlify a variável de ambiente só vale depois de publicar de
     novo, e precisa estar no escopo das funções. Nenhuma chave é mostrada,
     só o nome do provedor e do modelo. */
  if (req.method === "GET") {
    return Response.json({
      provedor: provedor ? provedor.nome : "nenhum",
      modelo: !provedor ? null : provedor.nome === "gemini" ? GEMINI_MODELO : ANTHROPIC_MODELO,
      chaves: {
        GEMINI_API_KEY: !!process.env.GEMINI_API_KEY,
        ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
        FIREBASE_API_KEY: !!process.env.FIREBASE_API_KEY,
        IA_PROVEDOR: process.env.IA_PROVEDOR || null,
      },
    });
  }

  if (req.method !== "POST") {
    return Response.json({ erro: "Método não permitido." }, { status: 405 });
  }

  if (!provedor) {
    return Response.json({
      erro: "A chave da IA não está configurada no Netlify. Cadastre GEMINI_API_KEY (ou ANTHROPIC_API_KEY) nas variáveis de ambiente e publique de novo.",
    }, { status: 500 });
  }

  let corpo;
  try {
    corpo = await req.json();
  } catch (e) {
    return Response.json({ erro: "Pedido inválido." }, { status: 400 });
  }

  /* Sem FIREBASE_API_KEY não há como saber quem está pedindo, e aí o certo
     é recusar. Antes a checagem era pulada nesse caso, o que deixava o
     endereço da função aberto para qualquer pessoa gastar a cota. */
  const apiKeyFirebase = process.env.FIREBASE_API_KEY;
  if (!apiKeyFirebase) {
    return Response.json({
      erro: "Falta FIREBASE_API_KEY no Netlify. Sem ela não dá para confirmar quem está pedindo, e o assistente fica desligado.",
    }, { status: 500 });
  }
  const check = await podeUsar(corpo.token, apiKeyFirebase);
  if (!check.ok) return Response.json({ erro: check.motivo }, { status: 403 });

  const mensagens = Array.isArray(corpo.mensagens) ? corpo.mensagens.slice(-14) : [];
  if (mensagens.length === 0) {
    return Response.json({ erro: "Nenhuma mensagem enviada." }, { status: 400 });
  }

  const contexto = String(corpo.contexto || "").slice(0, LIMITE_ENTRADA);
  const instrucoes = String(corpo.instrucoes || "").slice(0, 6000);
  const sistema = `${instrucoes}\n\n=== DADOS ATUAIS DO PAINEL ===\n${contexto}`;

  const limpas = mensagens
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map((m) => ({ role: m.role, content: m.content.slice(0, 6000) }));

  /* A conversa precisa começar por uma fala do estudante: os dois provedores
     recusam um histórico que abre com a resposta da IA. */
  while (limpas.length && limpas[0].role === "assistant") limpas.shift();
  if (limpas.length === 0) {
    return Response.json({ erro: "Nenhuma mensagem enviada." }, { status: 400 });
  }

  try {
    const r = provedor.nome === "gemini"
      ? await chamarGemini(provedor.chave, { sistema, mensagens: limpas })
      : await chamarAnthropic(provedor.chave, { sistema, mensagens: limpas });

    if (r.erro) return Response.json({ erro: r.erro }, { status: 502 });
    return Response.json({ texto: r.texto });
  } catch (e) {
    console.error("falha", provedor.nome, e);
    return Response.json({ erro: "Não consegui alcançar o serviço da IA." }, { status: 502 });
  }
};

export const config = { path: "/.netlify/functions/assistente" };

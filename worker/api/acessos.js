/* Painel de acessos do administrador · Cloudflare Pages Functions
 *
 * Só o e-mail cadastrado em DONOS consegue usar. A identidade vem do token
 * do Firebase, conferido direto com o Google, então não adianta forjar o
 * e-mail no navegador. A gravação usa a conta de serviço, que é a única
 * coisa capaz de escrever na coleção de assinaturas.
 */
import {
  json, corpoJson, quemPede, ehDono, contaDeServico, tokenDeAcesso,
  gravarAssinatura, BASE_FIRESTORE, DIAS,
} from "./_comum.js";

async function uidPeloEmail(token, email) {
  const r = await fetch(`${BASE_FIRESTORE}:runQuery`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: "emails" }],
        where: {
          fieldFilter: {
            field: { fieldPath: "email" }, op: "EQUAL",
            value: { stringValue: String(email).toLowerCase().trim() },
          },
        },
        limit: 1,
      },
    }),
  });
  if (!r.ok) return null;
  const j = await r.json();
  const doc = (j || []).find((x) => x.document);
  return doc ? doc.document.name.split("/").pop() : null;
}

export async function onRequest({ request, env }) {
  if (request.method !== "POST") return json({ erro: "Método não permitido." }, 405);

  if (!env.FIREBASE_API_KEY || !env.FIREBASE_SERVICE_ACCOUNT) {
    return json({ erro: "Faltam FIREBASE_API_KEY ou FIREBASE_SERVICE_ACCOUNT nas variáveis do site." }, 500);
  }

  const corpo = await corpoJson(request);
  if (!corpo) return json({ erro: "Pedido inválido." }, 400);

  const pedinte = await quemPede(corpo.token, env.FIREBASE_API_KEY);
  if (!pedinte) return json({ erro: "Sessão inválida. Entre de novo." }, 401);
  if (!ehDono(pedinte.email)) {
    return json({ erro: "Só a conta do dono pode liberar acessos." }, 403);
  }

  const conta = contaDeServico(env);
  if (!conta) return json({ erro: "Conta de serviço inválida." }, 500);

  let token;
  try { token = await tokenDeAcesso(conta); }
  catch (e) { return json({ erro: "Não consegui autenticar no banco." }, 500); }

  const acao = String(corpo.acao || "listar");

  /* ── lista quem tem acesso ─────────────────────────────────────────── */
  if (acao === "listar") {
    const r = await fetch(`${BASE_FIRESTORE}/assinaturas?pageSize=300`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return json({ erro: "Não consegui ler a lista." }, 500);
    const j = await r.json();
    const lista = (j.documents || []).map((d) => {
      const f = d.fields || {};
      return {
        uid: d.name.split("/").pop(),
        email: (f.email && f.email.stringValue) || "",
        plano: (f.plano && f.plano.stringValue) || "",
        validoAte: Number((f.validoAte && f.validoAte.doubleValue) || 0),
        cortesia: !!(f.cortesia && f.cortesia.booleanValue),
      };
    }).sort((a, b) => b.validoAte - a.validoAte);
    return json({ lista });
  }

  const email = String(corpo.email || "").toLowerCase().trim();
  if (!email) return json({ erro: "Informe o e-mail." }, 400);

  const uid = await uidPeloEmail(token, email);
  if (!uid) {
    return json({
      erro: "Não achei conta com esse e-mail. A pessoa precisa criar a conta no site antes.",
    }, 404);
  }

  /* ── tira o acesso ─────────────────────────────────────────────────── */
  if (acao === "revogar") {
    const r = await fetch(`${BASE_FIRESTORE}/assinaturas/${uid}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return json({ erro: "Não consegui remover." }, 500);
    return json({ ok: true, mensagem: `Acesso de ${email} removido.` });
  }

  /* ── libera ────────────────────────────────────────────────────────── */
  const plano = DIAS[corpo.plano] ? corpo.plano : "mensal";
  const ate = Date.now() + DIAS[plano] * 86400000;
  const gravou = await gravarAssinatura(token, uid, {
    plano: { stringValue: plano },
    email: { stringValue: email },
    validoAte: { doubleValue: ate },
    cortesia: { booleanValue: true },
    liberadoPor: { stringValue: pedinte.email },
    atualizadoEm: { doubleValue: Date.now() },
  });
  if (!gravou) return json({ erro: "Não consegui gravar." }, 500);

  return json({
    ok: true,
    mensagem: plano === "vitalicio"
      ? `${email} liberado sem prazo.`
      : `${email} liberado até ${new Date(ate).toLocaleDateString("pt-BR")}.`,
  });
}

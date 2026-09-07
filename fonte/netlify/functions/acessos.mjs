/* Painel de acessos do dono.
 *
 * Só o e-mail cadastrado em DONOS consegue usar. A identidade vem do token
 * do Firebase, conferido direto com o Google, então não adianta forjar o
 * e-mail no navegador. A gravação usa a conta de serviço, que é a única
 * coisa capaz de escrever na coleção de assinaturas.
 *
 * Variáveis de ambiente: FIREBASE_SERVICE_ACCOUNT e FIREBASE_API_KEY.
 */

const PROJETO = "cadencia-7c1f1";
const DONOS = ["joseeduardo1616@gmail.com"];
const DIAS = { mensal: 31, anual: 366, vitalicio: 36500 };

async function tokenDeAcesso(conta) {
  const agora = Math.floor(Date.now() / 1000);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const base = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({
    iss: conta.client_email,
    scope: "https://www.googleapis.com/auth/datastore",
    aud: "https://oauth2.googleapis.com/token",
    iat: agora, exp: agora + 3600,
  })}`;

  const { createSign } = await import("node:crypto");
  const s = createSign("RSA-SHA256");
  s.update(base); s.end();
  const assinatura = s.sign(conta.private_key).toString("base64url");

  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${base}.${assinatura}`,
    }),
  });
  if (!r.ok) throw new Error("token recusado");
  return (await r.json()).access_token;
}

const BASE = `https://firestore.googleapis.com/v1/projects/${PROJETO}/databases/(default)/documents`;

async function uidPeloEmail(token, email) {
  const r = await fetch(`${BASE}:runQuery`, {
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
  if (!doc) return null;
  return doc.document.name.split("/").pop();
}

/* Confere quem está pedindo e devolve o e-mail já validado */
async function quemPede(idToken, apiKey) {
  if (!idToken) return null;
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  if (!r.ok) return null;
  const j = await r.json();
  const u = (j.users || [])[0];
  return u && u.email ? String(u.email).toLowerCase() : null;
}

export default async (req) => {
  if (req.method !== "POST") return Response.json({ erro: "Método não permitido." }, { status: 405 });

  const apiKey = process.env.FIREBASE_API_KEY;
  const bruto = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!apiKey || !bruto) {
    return Response.json({ erro: "Faltam FIREBASE_API_KEY ou FIREBASE_SERVICE_ACCOUNT no Netlify." }, { status: 500 });
  }

  let corpo;
  try { corpo = await req.json(); } catch (e) { return Response.json({ erro: "Pedido inválido." }, { status: 400 }); }

  const pedinte = await quemPede(corpo.token, apiKey);
  if (!pedinte) return Response.json({ erro: "Sessão inválida. Entre de novo." }, { status: 401 });
  if (DONOS.indexOf(pedinte) < 0) {
    return Response.json({ erro: "Só a conta do dono pode liberar acessos." }, { status: 403 });
  }

  let conta;
  try { conta = JSON.parse(bruto); } catch (e) { return Response.json({ erro: "Conta de serviço inválida." }, { status: 500 }); }

  let token;
  try { token = await tokenDeAcesso(conta); }
  catch (e) { return Response.json({ erro: "Não consegui autenticar no banco." }, { status: 500 }); }

  const acao = String(corpo.acao || "listar");

  /* ── lista quem tem acesso ───────────────────────────────────── */
  if (acao === "listar") {
    const r = await fetch(`${BASE}/assinaturas?pageSize=300`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return Response.json({ erro: "Não consegui ler a lista." }, { status: 500 });
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
    return Response.json({ lista });
  }

  const email = String(corpo.email || "").toLowerCase().trim();
  if (!email) return Response.json({ erro: "Informe o e-mail." }, { status: 400 });

  const uid = await uidPeloEmail(token, email);
  if (!uid) {
    return Response.json({
      erro: "Não achei conta com esse e-mail. A pessoa precisa criar a conta no site antes.",
    }, { status: 404 });
  }

  /* ── tira o acesso ───────────────────────────────────────────── */
  if (acao === "revogar") {
    const r = await fetch(`${BASE}/assinaturas/${uid}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return Response.json({ erro: "Não consegui remover." }, { status: 500 });
    return Response.json({ ok: true, mensagem: `Acesso de ${email} removido.` });
  }

  /* ── libera ──────────────────────────────────────────────────── */
  const plano = DIAS[corpo.plano] ? corpo.plano : "mensal";
  const validoAte = Date.now() + DIAS[plano] * 86400000;
  const r = await fetch(`${BASE}/assinaturas/${uid}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      fields: {
        plano: { stringValue: plano },
        email: { stringValue: email },
        validoAte: { doubleValue: validoAte },
        cortesia: { booleanValue: true },
        liberadoPor: { stringValue: pedinte },
        atualizadoEm: { doubleValue: Date.now() },
      },
    }),
  });
  if (!r.ok) return Response.json({ erro: "Não consegui gravar." }, { status: 500 });

  const ate = new Date(validoAte).toLocaleDateString("pt-BR");
  return Response.json({
    ok: true,
    mensagem: plano === "vitalicio"
      ? `${email} liberado sem prazo.`
      : `${email} liberado até ${ate}.`,
  });
};

export const config = { path: "/.netlify/functions/acessos" };

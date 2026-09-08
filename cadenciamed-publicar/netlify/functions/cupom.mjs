/* Resgate de cupom.
 *
 * Quem confere o código é este arquivo, no servidor. O navegador só manda o
 * que a pessoa digitou: se a conferência fosse no front-end, bastaria abrir
 * o código-fonte da página para descobrir os cupons.
 *
 * A liberação grava em assinaturas/{uid} com a conta de serviço, que é a
 * única coisa capaz de escrever nessa coleção. As regras do Firestore
 * deixam o cliente apenas ler.
 *
 * Variáveis de ambiente: FIREBASE_API_KEY e FIREBASE_SERVICE_ACCOUNT.
 *
 * Para trocar os cupons sem mexer no código, cadastre CUPONS no Netlify, no
 * formato "codigo:plano,codigo:plano". Planos: mensal, anual, vitalicio.
 * Enquanto essa variável não existir, valem os dois cupons abaixo.
 */

const PROJETO = "cadencia-7c1f1";
const DIAS = { mensal: 31, anual: 366, vitalicio: 36500 };

const CUPONS_PADRAO = "secdamocada:anual,medeasysoft:anual";

/* Devolve { codigo: plano }, tudo em minúsculas e sem espaço em volta. */
function lerCupons() {
  const bruto = process.env.CUPONS || CUPONS_PADRAO;
  const fora = {};
  for (const parte of String(bruto).split(",")) {
    const [cod, plano] = parte.split(":").map((x) => String(x || "").trim().toLowerCase());
    if (!cod) continue;
    fora[cod] = DIAS[plano] ? plano : "anual";
  }
  return fora;
}

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

/* Confere a identidade direto com o Google, então não adianta forjar. */
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
  if (!u || !u.localId) return null;
  return { uid: u.localId, email: u.email ? String(u.email).toLowerCase() : "" };
}

const BASE = `https://firestore.googleapis.com/v1/projects/${PROJETO}/databases/(default)/documents`;

export default async (req) => {
  if (req.method !== "POST") {
    return Response.json({ erro: "Método não permitido." }, { status: 405 });
  }

  const apiKey = process.env.FIREBASE_API_KEY;
  const bruto = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!apiKey || !bruto) {
    return Response.json({
      erro: "Faltam FIREBASE_API_KEY ou FIREBASE_SERVICE_ACCOUNT no Netlify.",
    }, { status: 500 });
  }

  let corpo;
  try { corpo = await req.json(); }
  catch (e) { return Response.json({ erro: "Pedido inválido." }, { status: 400 }); }

  const pessoa = await quemPede(corpo.token, apiKey);
  if (!pessoa) {
    return Response.json({ erro: "Entre na sua conta antes de resgatar o cupom." }, { status: 401 });
  }

  const codigo = String(corpo.codigo || "").trim().toLowerCase();
  if (!codigo) return Response.json({ erro: "Escreva o código do cupom." }, { status: 400 });

  const plano = lerCupons()[codigo];
  if (!plano) {
    /* Sem dizer se o código existe mas expirou, ou se nunca existiu: quanto
       menos pista, menos vale a pena ficar tentando adivinhar. */
    return Response.json({ erro: "Cupom inválido." }, { status: 404 });
  }

  let conta;
  try { conta = JSON.parse(bruto); }
  catch (e) { return Response.json({ erro: "Conta de serviço inválida." }, { status: 500 }); }

  let token;
  try { token = await tokenDeAcesso(conta); }
  catch (e) { return Response.json({ erro: "Não consegui autenticar no banco." }, { status: 500 }); }

  /* Já tem plano em dia? Então o cupom não é gasto à toa. */
  const atual = await fetch(`${BASE}/assinaturas/${pessoa.uid}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (atual.ok) {
    const j = await atual.json().catch(() => null);
    const ate = Number((((j || {}).fields || {}).validoAte || {}).doubleValue || 0);
    if (ate > Date.now()) {
      return Response.json({ ok: true, jaTinha: true, mensagem: "Seu acesso já está liberado." });
    }
  }

  const validoAte = Date.now() + DIAS[plano] * 86400000;
  const r = await fetch(`${BASE}/assinaturas/${pessoa.uid}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      fields: {
        plano: { stringValue: plano },
        email: { stringValue: pessoa.email },
        validoAte: { doubleValue: validoAte },
        cortesia: { booleanValue: true },
        cupom: { stringValue: codigo },
        atualizadoEm: { doubleValue: Date.now() },
      },
    }),
  });
  if (!r.ok) return Response.json({ erro: "Não consegui liberar. Tente de novo." }, { status: 500 });

  const ate = new Date(validoAte).toLocaleDateString("pt-BR");
  return Response.json({
    ok: true,
    mensagem: plano === "vitalicio"
      ? "Cupom aceito. Acesso liberado sem prazo."
      : `Cupom aceito. Acesso liberado até ${ate}.`,
  });
};

export const config = { path: "/.netlify/functions/cupom" };

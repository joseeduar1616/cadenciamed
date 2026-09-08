/* Recebe o aviso de compra da Kiwify ou da Hotmart e libera o acesso.
 *
 * Escreve em assinaturas/{uid} no Firestore usando uma conta de serviço.
 * O aplicativo só consegue LER essa coleção, então ninguém se promove a
 * assinante mexendo no navegador.
 *
 * Variáveis de ambiente necessárias no Netlify:
 *   FIREBASE_SERVICE_ACCOUNT  o JSON da conta de serviço, em uma linha
 *   WEBHOOK_SEGREDO           um texto que você inventa e repete na
 *                             plataforma, para ninguém falsificar compras
 *
 * Onde pegar a conta de serviço:
 *   Firebase > engrenagem > Configurações do projeto > Contas de serviço
 *   > Gerar nova chave privada. Abre um .json; cole o conteúdo inteiro.
 */

const PROJETO = "cadencia-7c1f1";
const DIAS = { mensal: 31, anual: 366 };

/* ── autenticação com a conta de serviço, sem bibliotecas ───────────── */
async function tokenDeAcesso(conta) {
  const agora = Math.floor(Date.now() / 1000);
  const cabecalho = { alg: "RS256", typ: "JWT" };
  const corpo = {
    iss: conta.client_email,
    scope: "https://www.googleapis.com/auth/datastore",
    aud: "https://oauth2.googleapis.com/token",
    iat: agora,
    exp: agora + 3600,
  };
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const base = `${b64(cabecalho)}.${b64(corpo)}`;

  const { createSign } = await import("node:crypto");
  const assinador = createSign("RSA-SHA256");
  assinador.update(base);
  assinador.end();
  const assinatura = assinador.sign(conta.private_key).toString("base64url");

  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${base}.${assinatura}`,
    }),
  });
  if (!r.ok) throw new Error("token recusado: " + (await r.text()).slice(0, 200));
  return (await r.json()).access_token;
}

/* ── acha o usuário do Firebase pelo e-mail da compra ───────────────── */
async function uidPeloEmail(token, email) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJETO}/databases/(default)/documents:runQuery`;
  const r = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: "emails" }],
        where: {
          fieldFilter: {
            field: { fieldPath: "email" },
            op: "EQUAL",
            value: { stringValue: email.toLowerCase() },
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
  const partes = doc.document.name.split("/");
  return partes[partes.length - 1];
}

async function gravarAssinatura(token, uid, plano, email) {
  const dias = DIAS[plano] || DIAS.mensal;
  const validoAte = Date.now() + dias * 86400000;
  const url = `https://firestore.googleapis.com/v1/projects/${PROJETO}/databases/(default)/documents/assinaturas/${uid}`;
  const r = await fetch(url, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      fields: {
        plano: { stringValue: plano },
        email: { stringValue: email },
        validoAte: { doubleValue: validoAte },
        atualizadoEm: { doubleValue: Date.now() },
      },
    }),
  });
  if (!r.ok) throw new Error("gravação falhou: " + (await r.text()).slice(0, 200));
  return validoAte;
}

/* ── lê o aviso nos formatos da Kiwify e da Hotmart ─────────────────── */
function interpretar(corpo) {
  // Kiwify
  if (corpo.Customer || corpo.order_status) {
    const email = (corpo.Customer && corpo.Customer.email) || corpo.customer_email || "";
    const status = String(corpo.order_status || corpo.webhook_event_type || "").toLowerCase();
    const nome = String((corpo.Product && corpo.Product.product_name) || corpo.product_name || "").toLowerCase();
    return {
      email,
      pago: /paid|approved|aprovad/.test(status),
      cancelado: /refunded|chargeback|canceled|cancelad/.test(status),
      plano: /anual|ano|year/.test(nome) ? "anual" : "mensal",
    };
  }
  // Hotmart
  if (corpo.data || corpo.event) {
    const d = corpo.data || {};
    const comprador = d.buyer || {};
    const prod = d.product || {};
    const ev = String(corpo.event || "").toUpperCase();
    return {
      email: comprador.email || "",
      pago: ev === "PURCHASE_APPROVED" || ev === "PURCHASE_COMPLETE",
      cancelado: /REFUND|CHARGEBACK|CANCEL/.test(ev),
      plano: /anual|ano|year/.test(String(prod.name || "").toLowerCase()) ? "anual" : "mensal",
    };
  }
  return null;
}

export default async (req) => {
  if (req.method !== "POST") return new Response("Método não permitido", { status: 405 });

  const segredo = process.env.WEBHOOK_SEGREDO;
  if (segredo) {
    const url = new URL(req.url);
    const enviado = url.searchParams.get("segredo") || req.headers.get("x-segredo") || "";
    if (enviado !== segredo) return new Response("não autorizado", { status: 401 });
  }

  const bruto = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!bruto) return new Response("conta de serviço ausente", { status: 500 });

  let conta;
  try { conta = JSON.parse(bruto); } catch (e) { return new Response("conta de serviço inválida", { status: 500 }); }

  let corpo;
  try { corpo = await req.json(); } catch (e) { return new Response("corpo inválido", { status: 400 }); }

  const info = interpretar(corpo);
  if (!info || !info.email) return new Response("formato não reconhecido", { status: 200 });
  if (!info.pago) return new Response("evento ignorado", { status: 200 });

  try {
    const token = await tokenDeAcesso(conta);
    const uid = await uidPeloEmail(token, info.email);
    if (!uid) {
      console.error("compra sem conta correspondente:", info.email);
      return new Response("conta não encontrada para esse e-mail", { status: 200 });
    }
    const ate = await gravarAssinatura(token, uid, info.plano, info.email.toLowerCase());
    console.log("assinatura liberada", info.email, info.plano, new Date(ate).toISOString());
    return new Response("ok", { status: 200 });
  } catch (e) {
    console.error("falha", e && e.message);
    return new Response("erro interno", { status: 500 });
  }
};

export const config = { path: "/.netlify/functions/compra" };

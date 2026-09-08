/* Aviso de compra (webhook da Kiwify ou Hotmart) · Cloudflare Pages Functions
 *
 * Quem chama aqui é a plataforma de pagamento, não o navegador. Por isso a
 * proteção é um segredo na URL, e não o token do Firebase: cadastre
 * WEBHOOK_SEGREDO nas variáveis do site e use o endereço
 *   https://SEU-SITE/api/compra?segredo=O_QUE_VOCE_CADASTROU
 * Sem o segredo cadastrado, qualquer um poderia liberar assinatura de graça.
 *
 * A gravação usa a conta de serviço, a única capaz de escrever em
 * assinaturas/{uid}.
 */
import {
  contaDeServico, tokenDeAcesso, gravarAssinatura, BASE_FIRESTORE, DIAS,
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

/* ── lê o aviso nos formatos da Kiwify e da Hotmart ────────────────────── */
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

export async function onRequest({ request, env }) {
  if (request.method !== "POST") return new Response("Método não permitido", { status: 405 });

  /* Sem segredo cadastrado, este endereço libera assinatura para quem
     mandar um aviso de compra forjado — e ele é público. Antes o código
     seguia em frente nesse caso, o que só se percebe quando alguém descobre.
     Agora recusa, e o erro diz o que falta. */
  const segredo = env.WEBHOOK_SEGREDO;
  if (!segredo) {
    console.error("compra: WEBHOOK_SEGREDO não cadastrado");
    return new Response(
      "WEBHOOK_SEGREDO não cadastrado nas variáveis do Worker. Sem ele "
      + "qualquer pessoa liberaria assinatura de graça, então o aviso de "
      + "compra fica recusado.", { status: 500 });
  }
  const url = new URL(request.url);
  const enviado = url.searchParams.get("segredo") || request.headers.get("x-segredo") || "";
  if (enviado !== segredo) return new Response("não autorizado", { status: 401 });

  const conta = contaDeServico(env);
  if (!conta) return new Response("conta de serviço ausente ou inválida", { status: 500 });

  let corpo;
  try { corpo = await request.json(); }
  catch (e) { return new Response("corpo inválido", { status: 400 }); }

  const info = interpretar(corpo);
  /* Respostas 200 de propósito: a plataforma de pagamento reenvia o aviso
     quando recebe erro, e não adianta insistir num evento que não interessa. */
  if (!info || !info.email) return new Response("formato não reconhecido", { status: 200 });
  if (!info.pago && !info.cancelado) return new Response("evento ignorado", { status: 200 });

  try {
    const token = await tokenDeAcesso(conta);
    const uid = await uidPeloEmail(token, info.email);
    if (!uid) {
      console.error("compra sem conta correspondente:", info.email);
      return new Response("conta não encontrada para esse e-mail", { status: 200 });
    }

    /* Reembolso e chargeback já vinham interpretados, mas nada era feito com
       eles: quem pedia o dinheiro de volta ficava com o acesso do mesmo
       jeito, até o prazo vencer. */
    if (info.cancelado) {
      const r = await fetch(`${BASE_FIRESTORE}/assinaturas/${uid}`, {
        method: "DELETE", headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) return new Response("erro ao remover", { status: 500 });
      console.log("assinatura removida por estorno", info.email);
      return new Response("ok", { status: 200 });
    }

    const ate = Date.now() + DIAS[info.plano] * 86400000;
    const gravou = await gravarAssinatura(token, uid, {
      plano: { stringValue: info.plano },
      email: { stringValue: info.email.toLowerCase() },
      validoAte: { doubleValue: ate },
      cortesia: { booleanValue: false },
      atualizadoEm: { doubleValue: Date.now() },
    });
    if (!gravou) return new Response("erro ao gravar", { status: 500 });
    console.log("assinatura liberada", info.email, info.plano, new Date(ate).toISOString());
    return new Response("ok", { status: 200 });
  } catch (e) {
    console.error("falha", e && e.message);
    return new Response("erro interno", { status: 500 });
  }
}

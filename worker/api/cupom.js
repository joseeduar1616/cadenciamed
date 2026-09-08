/* Resgate de cupom · Cloudflare Pages Functions
 *
 * Quem confere o código é este arquivo, no servidor. O navegador só manda o
 * que a pessoa digitou: se a conferência fosse no front-end, bastaria abrir
 * o código-fonte da página para descobrir todos os cupons.
 *
 * A liberação grava em assinaturas/{uid} com a conta de serviço, que é a
 * única coisa capaz de escrever nessa coleção.
 *
 * Para trocar os cupons sem mexer no código, cadastre CUPONS nas variáveis
 * do site, no formato "codigo:plano,codigo:plano". Planos: mensal, anual,
 * vitalicio. Enquanto essa variável não existir, valem os dois abaixo.
 */
import {
  json, corpoJson, quemPede, contaDeServico, tokenDeAcesso,
  gravarAssinatura, validoAte, DIAS,
} from "./_comum.js";

const CUPONS_PADRAO = "secdamocada:anual,medeasysoft:anual";

function lerCupons(env) {
  const fora = {};
  for (const parte of String(env.CUPONS || CUPONS_PADRAO).split(",")) {
    const [cod, plano] = parte.split(":").map((x) => String(x || "").trim().toLowerCase());
    if (!cod) continue;
    fora[cod] = DIAS[plano] ? plano : "anual";
  }
  return fora;
}

export async function onRequest({ request, env }) {
  if (request.method !== "POST") return json({ erro: "Método não permitido." }, 405);

  if (!env.FIREBASE_API_KEY || !env.FIREBASE_SERVICE_ACCOUNT) {
    return json({ erro: "Faltam FIREBASE_API_KEY ou FIREBASE_SERVICE_ACCOUNT nas variáveis do site." }, 500);
  }

  const corpo = await corpoJson(request);
  if (!corpo) return json({ erro: "Pedido inválido." }, 400);

  const pessoa = await quemPede(corpo.token, env.FIREBASE_API_KEY);
  if (!pessoa) return json({ erro: "Entre na sua conta antes de resgatar o cupom." }, 401);

  const codigo = String(corpo.codigo || "").trim().toLowerCase();
  if (!codigo) return json({ erro: "Escreva o código do cupom." }, 400);

  const plano = lerCupons(env)[codigo];
  /* Sem dizer se o código existe mas expirou, ou se nunca existiu: quanto
     menos pista, menos vale a pena ficar tentando adivinhar. */
  if (!plano) return json({ erro: "Cupom inválido." }, 404);

  const conta = contaDeServico(env);
  if (!conta) return json({ erro: "Conta de serviço inválida." }, 500);

  let token;
  try { token = await tokenDeAcesso(conta); }
  catch (e) { return json({ erro: "Não consegui autenticar no banco." }, 500); }

  /* Já tem plano em dia? Então o cupom não é gasto à toa. */
  if (await validoAte(token, pessoa.uid) > Date.now()) {
    return json({ ok: true, jaTinha: true, mensagem: "Seu acesso já está liberado." });
  }

  const ate = Date.now() + DIAS[plano] * 86400000;
  const gravou = await gravarAssinatura(token, pessoa.uid, {
    plano: { stringValue: plano },
    email: { stringValue: pessoa.email },
    validoAte: { doubleValue: ate },
    cortesia: { booleanValue: true },
    cupom: { stringValue: codigo },
    atualizadoEm: { doubleValue: Date.now() },
  });
  if (!gravou) return json({ erro: "Não consegui liberar. Tente de novo." }, 500);

  return json({
    ok: true,
    mensagem: plano === "vitalicio"
      ? "Cupom aceito. Acesso liberado sem prazo."
      : `Cupom aceito. Acesso liberado até ${new Date(ate).toLocaleDateString("pt-BR")}.`,
  });
}

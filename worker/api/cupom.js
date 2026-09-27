/* Resgate de cupom · Cloudflare Pages Functions
 *
 * Quem confere o código é este arquivo, no servidor. O navegador só manda o
 * que a pessoa digitou: se a conferência fosse no front-end, bastaria abrir
 * o código-fonte da página para descobrir todos os cupons.
 *
 * A liberação grava em assinaturas/{uid} com a conta de serviço, que é a
 * única coisa capaz de escrever nessa coleção.
 *
 * Os cupons moram no banco, em cupons/{codigo}, e são criados pelo painel
 * do dono (Gestão de Acessos). Nenhum código fica escrito aqui: este
 * arquivo vai para um repositório, e cupom escrito em código é cupom que
 * qualquer pessoa com acesso ao código resgata.
 *
 * A variável CUPONS, cadastrada como segredo no Cloudflare no formato
 * "codigo:plano,codigo:plano", continua valendo como reserva. Planos:
 * semanal, mensal, anual, vitalicio — e mentor, que não libera plano
 * nenhum: dá o papel de mentor (a aba Mentor).
 */
import {
  json, corpoJson, quemPede, contaDeServico, tokenDeAcesso,
  gravarAssinatura, validoAte, validadeDoPlano, concederMentor, DIAS,
  BASE_FIRESTORE,
} from "./_comum.js";

/* O cupom que dá o papel de mentor em vez de um plano. */
const PLANO_MENTOR = "mentor";

function lerCupons(env) {
  const fora = {};
  for (const parte of String(env.CUPONS || "").split(",")) {
    const [cod, plano] = parte.split(":").map((x) => String(x || "").trim().toLowerCase());
    if (!cod) continue;
    fora[cod] = DIAS[plano] || plano === PLANO_MENTOR ? plano : "anual";
  }
  return fora;
}

/* Um cupom criado pelo painel do dono. Null quando não existe — aí quem
   responde é a variável de ambiente. */
async function cupomDoBanco(token, codigo) {
  const r = await fetch(`${BASE_FIRESTORE}/cupons/${encodeURIComponent(codigo)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) return null;
  const j = await r.json().catch(() => null);
  const f = (j || {}).fields || {};
  const num = (v) => Number((v || {}).doubleValue || (v || {}).integerValue || 0);
  const plano = (f.plano || {}).stringValue || "";
  return plano ? { plano, usos: num(f.usos), maxUsos: num(f.maxUsos) } : null;
}

/* Conta mais um uso. Best-effort de propósito: se esta gravação falhar, a
   pessoa já recebeu o acesso e seria pior desfazer isso do que perder uma
   unidade na contagem. */
async function contarUso(token, codigo, usos) {
  await fetch(`${BASE_FIRESTORE}/cupons/${encodeURIComponent(codigo)}?updateMask.fieldPaths=usos`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields: { usos: { doubleValue: usos + 1 } } }),
  }).catch(() => {});
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

  const conta = contaDeServico(env);
  if (!conta) return json({ erro: "Conta de serviço inválida." }, 500);

  let token;
  try { token = await tokenDeAcesso(conta); }
  catch (e) { return json({ erro: "Não consegui autenticar no banco." }, 500); }

  /* O banco primeiro, a variável de ambiente depois: os cupons criados
     pelo painel moram em cupons/{codigo}, e CUPONS é só reserva. */
  const doBanco = await cupomDoBanco(token, codigo);
  const plano = doBanco ? doBanco.plano : lerCupons(env)[codigo];
  /* Sem dizer se o código existe mas expirou, ou se nunca existiu: quanto
     menos pista, menos vale a pena ficar tentando adivinhar. */
  if (!plano) return json({ erro: "Cupom inválido." }, 404);
  /* Cupom de parceria costuma ter cota. Zero quer dizer sem limite, que é
     o caso do cupom de divulgação. */
  if (doBanco && doBanco.maxUsos > 0 && doBanco.usos >= doBanco.maxUsos) {
    return json({ erro: "Esse cupom já foi todo usado." }, 410);
  }

  /* Cupom de mentor não passa pela assinatura: não expira, não ocupa
     lugar de plano pago, e resgatar de novo não faz nada de errado. */
  if (plano === PLANO_MENTOR) {
    const deu = await concederMentor(token, pessoa.uid, pessoa.email);
    if (!deu) return json({ erro: "Não consegui liberar. Tente de novo." }, 500);
    if (doBanco) await contarUso(token, codigo, doBanco.usos);
    return json({ ok: true, mentor: true, mensagem: "Cupom aceito! Agora você é mentor(a) — a aba Mentor apareceu no menu." });
  }

  /* Já tem plano em dia? Então o cupom não é gasto à toa. */
  if (await validoAte(token, pessoa.uid) > Date.now()) {
    return json({ ok: true, jaTinha: true, mensagem: "Seu acesso já está liberado." });
  }

  const ate = validadeDoPlano(plano);
  const gravou = await gravarAssinatura(token, pessoa.uid, {
    plano: { stringValue: plano },
    email: { stringValue: pessoa.email },
    validoAte: { doubleValue: ate },
    cortesia: { booleanValue: true },
    cupom: { stringValue: codigo },
    atualizadoEm: { doubleValue: Date.now() },
  });
  if (gravou && doBanco) await contarUso(token, codigo, doBanco.usos);
  if (!gravou) return json({ erro: "Não consegui liberar. Tente de novo." }, 500);

  return json({
    ok: true,
    mensagem: plano === "vitalicio"
      ? "Cupom aceito. Acesso liberado sem prazo."
      : `Cupom aceito. Acesso liberado até ${new Date(ate).toLocaleDateString("pt-BR")}.`,
  });
}

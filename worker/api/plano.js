/* Qual é o meu plano · rota /api/plano
 *
 * Existe porque a página não pode depender de conseguir ler
 * assinaturas/{uid} por conta própria.
 *
 * O caminho normal é o navegador ler essa coleção direto do Firestore, e
 * ele funciona — desde que as regras publicadas liberem a leitura do
 * próprio documento. Quando não liberam, o Firestore recusa em silêncio: o
 * cupom foi aceito, a assinatura está gravada, e mesmo assim o site mostra
 * a tela de pagamento, sem nada explicando por quê. Foi exatamente o que
 * aconteceu.
 *
 * Aqui quem lê é a conta de serviço, que passa por cima das regras. Então
 * esta rota responde certo mesmo com as regras erradas, e ainda diz qual
 * é o caso, para o problema aparecer em vez de virar tela de pagamento.
 *
 * Isto não afrouxa nada: cada rota paga continua conferindo o acesso por
 * conta própria, no servidor. Esta aqui só informa a tela.
 */
import {
  json, corpoJson, quemPede, ehDono, contaDeServico, tokenDeAcesso,
  BASE_FIRESTORE,
} from "./_comum.js";

const texto = (v) => (v && v.stringValue) || "";
const numero = (v) => Number((v && (v.doubleValue || v.integerValue)) || 0);

export async function onRequest({ request, env }) {
  if (request.method !== "POST") return json({ erro: "Método não permitido." }, 405);

  if (!env.FIREBASE_API_KEY || !env.FIREBASE_SERVICE_ACCOUNT) {
    return json({ erro: "Faltam FIREBASE_API_KEY ou FIREBASE_SERVICE_ACCOUNT nas variáveis do site." }, 500);
  }

  const corpo = await corpoJson(request);
  if (!corpo) return json({ erro: "Pedido inválido." }, 400);

  const pessoa = await quemPede(corpo.token, env.FIREBASE_API_KEY);
  if (!pessoa) return json({ erro: "Sessão inválida. Entre de novo." }, 401);

  /* O dono não tem assinatura gravada, e não deveria precisar de uma. */
  if (ehDono(pessoa.email)) {
    return json({ ok: true, pro: true, plano: "dono", validoAte: 0 });
  }

  const conta = contaDeServico(env);
  if (!conta) return json({ erro: "Conta de serviço inválida." }, 500);

  let token;
  try { token = await tokenDeAcesso(conta); }
  catch (e) { return json({ erro: "Não consegui autenticar no banco." }, 500); }

  const r = await fetch(`${BASE_FIRESTORE}/assinaturas/${pessoa.uid}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  /* 404 é conta sem assinatura, que é uma resposta legítima. Qualquer outro
     erro é problema do banco, e dizer "sem plano" nesse caso mandaria para
     a tela de pagamento quem já pagou. */
  if (r.status === 404) return json({ ok: true, pro: false, plano: "", validoAte: 0 });
  if (!r.ok) return json({ erro: "Não consegui conferir seu plano agora." }, 502);

  const j = await r.json().catch(() => null);
  const f = (j || {}).fields || {};
  const validoAte = numero(f.validoAte);

  return json({
    ok: true,
    pro: validoAte > Date.now(),
    plano: texto(f.plano),
    validoAte,
    cortesia: !!((f.cortesia || {}).booleanValue),
  });
}

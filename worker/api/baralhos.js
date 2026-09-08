/* Baralhos publicados pelo dono · rota /api/baralhos
 *
 * O dono publica um baralho dele; quem assina copia para a própria conta e
 * a partir daí os cartões são dele, com o próprio agendamento. Não é uma
 * pasta compartilhada: é uma cópia, e é de propósito — duas pessoas
 * estudando o mesmo cartão têm intervalos de revisão diferentes.
 *
 * O navegador não lê nem escreve na coleção direto. Publicar é só do dono, e
 * baixar é só de quem tem plano em dia, e as duas coisas se conferem aqui.
 */
import {
  json, corpoJson, quemPede, ehDono, contaDeServico, tokenDeAcesso,
  validoAte, BASE_FIRESTORE,
} from "./_comum.js";

/* O Firestore recusa documento acima de 1 MiB. O corte é bem antes disso,
   com margem para os outros campos, e a mensagem diz o que fazer em vez de
   deixar a gravação falhar com erro cru. */
const MAX_CARTOES = 500;
const MAX_BYTES = 800000;

export function apelidoBaralho(pasta, baralho) {
  const limpo = (x) => String(x || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${limpo(pasta) || "sem-pasta"}--${limpo(baralho) || "geral"}`.slice(0, 90);
}

/* O apelido entra no endereço do Firestore, e endereço com ".." é
   normalizado antes de sair: "publicos/x/../../usuarios/alguem" vira
   "usuarios/alguem". Como baixar é aberto a qualquer assinante, isso daria a
   leitura dos dados de estudo de outra pessoa a quem soubesse o uid dela.
   Por isso o que vem do navegador só passa se tiver a forma que o
   apelidoBaralho produz. */
export const apelidoValido = (s) => /^[a-z0-9-]{1,90}$/.test(String(s || ""));

const texto = (v) => (v && v.stringValue) || "";
const numero = (v) => Number((v && (v.doubleValue || v.integerValue)) || 0);

/* Só o que faz sentido viajar. As imagens ficam de fora: elas moram no
   IndexedDB de cada aparelho, então o que viajaria seria um nome de arquivo
   que não existe do outro lado, e o cartão apareceria com um buraco. */
export function limparParaPublicar(cartoes, comBaralho) {
  const fora = [];
  for (const c of cartoes || []) {
    if (!c || typeof c !== "object") continue;
    const frente = String(c.frente || "").replace(/\[\[img:[^\]]+\]\]/g, "").trim();
    const verso = String(c.verso || "").replace(/\[\[img:[^\]]+\]\]/g, "").trim();
    if (!frente || !verso) continue;
    const limpo = {
      frente: frente.slice(0, 400),
      verso: verso.slice(0, 800),
      subjectId: c.subjectId ? String(c.subjectId).slice(0, 40) : null,
    };
    /* Publicando uma pasta, cada cartão leva o baralho dele: é isso que
       permite recriar a pasta com a divisão original do outro lado. Num
       baralho só, esse campo seria sempre o mesmo e não vale o espaço. */
    if (comBaralho) limpo.baralho = String(c.baralho || "").slice(0, 40) || null;
    fora.push(limpo);
    if (fora.length >= MAX_CARTOES) break;
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
  if (!pessoa) return json({ erro: "Entre na sua conta." }, 401);

  const conta = contaDeServico(env);
  if (!conta) return json({ erro: "Conta de serviço inválida." }, 500);

  let token;
  try { token = await tokenDeAcesso(conta); }
  catch (e) { return json({ erro: "Não consegui autenticar no banco." }, 500); }

  const dono = ehDono(pessoa.email);
  const acao = String(corpo.acao || "listar");

  /* ── o que está publicado ──────────────────────────────────────────
     Quem não assina não vê a lista: o conteúdo faz parte do plano. */
  if (acao === "listar") {
    if (!dono && await validoAte(token, pessoa.uid) <= Date.now()) {
      return json({ ok: true, baralhos: [], precisaPlano: true });
    }
    const r = await fetch(`${BASE_FIRESTORE}/publicos?pageSize=100`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return json({ erro: "Não consegui ler a lista." }, 500);
    const j = await r.json().catch(() => null);
    const baralhos = ((j || {}).documents || []).map((d) => {
      const f = d.fields || {};
      return {
        slug: d.name.split("/").pop(),
        nome: texto(f.nome),
        pasta: texto(f.pasta),
        tipo: texto(f.tipo) === "pasta" ? "pasta" : "baralho",
        baralhos: numero(f.baralhos),
        total: numero(f.total),
        atualizadoEm: numero(f.atualizadoEm),
      };
    }).sort((a, b) => b.atualizadoEm - a.atualizadoEm);
    return json({ ok: true, baralhos });
  }

  /* ── baixar para a própria conta ───────────────────────────────────── */
  if (acao === "baixar") {
    if (!dono && await validoAte(token, pessoa.uid) <= Date.now()) {
      return json({ erro: "Os baralhos publicados fazem parte do plano completo." }, 403);
    }
    const slug = String(corpo.slug || "");
    if (!apelidoValido(slug)) return json({ erro: "Baralho inválido." }, 400);
    const r = await fetch(`${BASE_FIRESTORE}/publicos/${slug}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return json({ erro: "Esse baralho não está mais publicado." }, 404);
    const f = ((await r.json().catch(() => null)) || {}).fields || {};
    let cartoes = [];
    try { cartoes = JSON.parse(texto(f.cartoes) || "[]"); } catch (e) { cartoes = []; }
    return json({
      ok: true,
      nome: texto(f.nome), pasta: texto(f.pasta),
      tipo: texto(f.tipo) === "pasta" ? "pasta" : "baralho",
      cartoes: Array.isArray(cartoes) ? cartoes : [],
    });
  }

  /* Daqui para baixo só o dono. A aba esconde os botões de quem não é, mas
     quem protege de verdade é esta linha. */
  if (!dono) return json({ erro: "Só a conta do dono publica baralhos." }, 403);

  /* ── publicar ──────────────────────────────────────────────────────
     Um baralho, ou a pasta inteira. Na pasta, cada cartão leva o baralho
     dele, e quem copia recebe a pasta já dividida do mesmo jeito. */
  if (acao === "publicar") {
    const ehPasta = corpo.tipo === "pasta";
    const pasta = String(corpo.pasta || "").slice(0, 40);
    const nome = ehPasta ? pasta : String(corpo.baralho || "").slice(0, 40);
    if (!nome) return json({ erro: ehPasta ? "Informe a pasta." : "Informe o baralho." }, 400);

    const cartoes = limparParaPublicar(corpo.cartoes, ehPasta);
    if (!cartoes.length) {
      return json({
        erro: `Essa ${ehPasta ? "pasta" : "baralho"} não tem cartão com frente e verso preenchidos.`,
      }, 400);
    }
    const serializado = JSON.stringify(cartoes);
    if (serializado.length > MAX_BYTES) {
      return json({
        erro: `${ehPasta ? "Essa pasta" : "Esse baralho"} é grande demais para publicar de uma vez `
          + `(${cartoes.length} cartões). ` + (ehPasta
            ? "Publique os baralhos de dentro dela um a um."
            : "Divida em baralhos menores."),
      }, 413);
    }

    /* A pasta e um baralho de mesmo nome dentro dela não podem cair no
       mesmo endereço, senão um sobrescreveria o outro. */
    const slug = ehPasta
      ? apelidoBaralho("pasta", pasta)
      : apelidoBaralho(pasta, nome);
    const quantosBaralhos = ehPasta
      ? new Set(cartoes.map((c) => c.baralho || "")).size : 1;

    const r = await fetch(`${BASE_FIRESTORE}/publicos/${slug}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        fields: {
          nome: { stringValue: nome },
          pasta: { stringValue: pasta },
          tipo: { stringValue: ehPasta ? "pasta" : "baralho" },
          baralhos: { doubleValue: quantosBaralhos },
          total: { doubleValue: cartoes.length },
          cartoes: { stringValue: serializado },
          publicadoPor: { stringValue: pessoa.email },
          atualizadoEm: { doubleValue: Date.now() },
        },
      }),
    });
    if (!r.ok) return json({ erro: "Não consegui publicar." }, 500);
    return json({
      ok: true, slug,
      mensagem: `"${nome}" publicad${ehPasta ? "a" : "o"} com ${cartoes.length} cartõe${cartoes.length === 1 ? "" : "s"}`
        + (ehPasta ? ` em ${quantosBaralhos} baralho${quantosBaralhos === 1 ? "" : "s"}` : "") + "."
        + (cartoes.length < (corpo.cartoes || []).length
          ? " Cartões sem frente ou verso, e as imagens, ficaram de fora." : ""),
    });
  }

  /* ── despublicar ───────────────────────────────────────────────────── */
  if (acao === "despublicar") {
    const slug = String(corpo.slug || "");
    if (!apelidoValido(slug)) return json({ erro: "Baralho inválido." }, 400);
    const r = await fetch(`${BASE_FIRESTORE}/publicos/${slug}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return json({ erro: "Não consegui despublicar." }, 500);
    /* Quem já copiou continua com os cartões: eles viraram cópia na conta
       de cada um, e tirar do ar não desfaz isso. */
    return json({ ok: true, mensagem: "Baralho tirado do ar. Quem já copiou continua com os cartões." });
  }

  return json({ erro: "Ação desconhecida." }, 400);
}

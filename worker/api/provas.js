/* Provas publicadas por código · rota /api/provas
 *
 * O dono comenta uma prova, publica com um código que ele escolhe
 * ("provoes71"), e quem digitar esse código na aba Provas recebe a prova
 * comentada inteira, sem precisar mandar arquivo nenhum nem gastar IA.
 *
 * Por que passa pelo servidor, e não pelo Firestore direto:
 *
 * O código É a chave. Quem sabe o código entra; quem não sabe, não. Se o
 * navegador pudesse ler a coleção por conta própria, bastaria abrir o
 * console e listar tudo para ter todas as provas sem código nenhum — e o
 * código deixaria de valer alguma coisa. Aqui a leitura é de uma prova por
 * vez, pelo código exato, com a conta de serviço.
 *
 * E publicar é só do dono, conferido pelo e-mail do token do Firebase, que
 * o navegador não tem como forjar.
 *
 * Uma prova comentada é grande — enunciado reescrito, alternativas e um
 * comentário para cada uma, vezes o número de questões — e o Firestore
 * recusa documento acima de 1 MiB. Por isso as questões vão em pedaços
 * numerados, num subdocumento cada, e o documento principal guarda só a
 * ficha da prova. Provas de sessenta questões passariam do limite num
 * documento só.
 */
import {
  json, corpoJson, quemPede, ehDono, contaDeServico, tokenDeAcesso,
  validoAte, BASE_FIRESTORE,
} from "./_comum.js";

/* O código é o que a pessoa digita, então ele não distingue maiúscula de
   minúscula nem acento: quem recebe "PROVÕES71" num story escreve de
   qualquer jeito, e todas as formas têm de levar ao mesmo lugar. */
export function normalizarCodigo(bruto) {
  return String(bruto || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 40);
}

/* O código entra no endereço do documento no Firestore. Endereço com ".."
   é normalizado antes de sair — "provas/x/../../usuarios/alguem" vira
   "usuarios/alguem" —, e como resgatar é aberto a qualquer pessoa logada,
   isso entregaria os dados de estudo de quem tivesse o uid conhecido.
   Só letras e números passam, que é o que normalizarCodigo produz. */
export const codigoValido = (c) => /^[a-z0-9]{3,40}$/.test(String(c || ""));

/* Quantas questões por pedaço. Cada questão comentada tem uns 2 KB; vinte
   delas ficam bem abaixo do teto de 1 MiB do Firestore, com folga para
   questão longa. */
const POR_PEDACO = 20;
const MAX_QUESTOES = 400;
const MAX_PEDACOS = Math.ceil(MAX_QUESTOES / POR_PEDACO);

const texto = (v) => (v && v.stringValue) || "";
const numero = (v) => Number((v && (v.doubleValue || v.integerValue)) || 0);

/* ── a questão, do jeito que ela pode ser gravada ─────────────────────
 *
 * Mesma regra da rota que comenta a prova: meia questão é pior que questão
 * nenhuma. Uma questão sem comentário de toda alternativa é uma questão de
 * gabarito, que é o que a pessoa já tinha antes de receber a prova. */
function questaoLimpa(q) {
  if (!q || typeof q !== "object") return null;
  const enunciado = String(q.enunciado || "").trim().slice(0, 4000);
  if (!enunciado) return null;

  const alternativas = (Array.isArray(q.alternativas) ? q.alternativas : [])
    .filter((a) => typeof a === "string" && a.trim())
    .map((a) => a.trim().slice(0, 600));
  if (alternativas.length < 2) return null;

  const comentarios = (Array.isArray(q.comentarios) ? q.comentarios : [])
    .map((c) => String(c || "").trim().slice(0, 3000));
  if (comentarios.length !== alternativas.length) return null;
  if (comentarios.some((c) => !c)) return null;

  const certa = Math.round(Number(q.certa));
  if (!Number.isFinite(certa) || certa < 0 || certa >= alternativas.length) return null;

  return {
    numero: Math.max(0, Math.round(Number(q.numero) || 0)),
    assunto: String(q.assunto || "").trim().slice(0, 120),
    enunciado, alternativas, certa, comentarios,
    fonte: String(q.fonte || "").trim().slice(0, 300),
    seguranca: ["alta", "media", "baixa"].indexOf(String(q.seguranca)) >= 0
      ? String(q.seguranca) : "media",
    avisos: String(q.avisos || "").trim().slice(0, 600),
  };
}

const enderecoProva = (codigo) => `${BASE_FIRESTORE}/provas/${encodeURIComponent(codigo)}`;
const enderecoPedaco = (codigo, n) =>
  `${BASE_FIRESTORE}/provas/${encodeURIComponent(codigo)}/questoes/${n}`;

async function lerDoc(token, url) {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) return null;
  return r.json().catch(() => null);
}

async function gravarDoc(token, url, fields) {
  const r = await fetch(url, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields }),
  });
  return r.ok;
}

async function apagarDoc(token, url) {
  await fetch(url, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } })
    .catch(() => null);
}

export async function onRequest({ request, env }) {
  if (request.method !== "POST") return json({ erro: "Método não permitido." }, 405);

  if (!env.FIREBASE_API_KEY || !env.FIREBASE_SERVICE_ACCOUNT) {
    return json({ erro: "Faltam FIREBASE_API_KEY ou FIREBASE_SERVICE_ACCOUNT nas variáveis do site." }, 500);
  }

  const corpo = await corpoJson(request);
  if (!corpo) return json({ erro: "Pedido inválido." }, 400);

  if (!corpo.token) return json({ erro: "Entre na sua conta." }, 403);
  const pessoa = await quemPede(corpo.token, env.FIREBASE_API_KEY);
  if (!pessoa) return json({ erro: "Sua sessão expirou. Entre de novo." }, 403);

  const conta = contaDeServico(env);
  if (!conta) return json({ erro: "Conta de serviço inválida." }, 500);
  let servico;
  try { servico = await tokenDeAcesso(conta); }
  catch (e) { return json({ erro: "Não consegui autenticar no banco." }, 500); }

  const dono = ehDono(pessoa.email);
  const acao = String(corpo.acao || "").trim();
  const codigo = normalizarCodigo(corpo.codigo);

  /* ── resgatar: qualquer pessoa logada, com o código na mão ────────── */
  if (acao === "resgatar") {
    if (!codigoValido(codigo)) {
      return json({ erro: "Esse código não parece certo. Confira as letras e os números." }, 400);
    }
    const doc = await lerDoc(servico, enderecoProva(codigo));
    const f = (doc || {}).fields;
    /* A mesma resposta para código errado e para código que não existe:
       dizer "esse código existe, mas..." convidaria a adivinhar códigos. */
    if (!f) return json({ erro: "Não achei prova com esse código." }, 404);

    const pedacos = Math.max(0, Math.min(MAX_PEDACOS, numero(f.pedacos)));
    const questoes = [];
    for (let i = 0; i < pedacos; i++) {
      const p = await lerDoc(servico, enderecoPedaco(codigo, i));
      const lista = (((p || {}).fields || {}).questoes || {}).arrayValue;
      for (const item of (lista && lista.values) || []) {
        try { questoes.push(JSON.parse(texto(item))); } catch (e) { /* pedaço ilegível */ }
      }
    }
    if (!questoes.length) return json({ erro: "Essa prova está vazia." }, 404);

    return json({
      ok: true,
      codigo,
      prova: texto(f.prova),
      descricao: texto(f.descricao),
      questoes,
    });
  }

  /* ── daqui para baixo, só o dono ──────────────────────────────────── */
  if (!dono) return json({ erro: "Só o dono do site publica provas." }, 403);

  if (acao === "publicar") {
    if (!codigoValido(codigo)) {
      return json({
        erro: "O código precisa ter de 3 a 40 letras ou números, sem espaço nem símbolo.",
      }, 400);
    }

    const cruas = Array.isArray(corpo.questoes) ? corpo.questoes : [];
    const questoes = cruas.map(questaoLimpa).filter(Boolean).slice(0, MAX_QUESTOES);
    if (!questoes.length) {
      return json({ erro: "Nenhuma questão inteira para publicar." }, 400);
    }

    /* Republicar com o mesmo código substitui a prova. Os pedaços velhos
       que sobrariam são apagados: sem isso, publicar uma prova menor por
       cima de uma maior deixaria as questões antigas penduradas, e elas
       voltariam na próxima leitura. */
    const antes = await lerDoc(servico, enderecoProva(codigo));
    const pedacosAntigos = Math.max(0, Math.min(MAX_PEDACOS, numero(((antes || {}).fields || {}).pedacos)));

    const pedacos = [];
    for (let i = 0; i < questoes.length; i += POR_PEDACO) {
      pedacos.push(questoes.slice(i, i + POR_PEDACO));
    }

    for (let i = 0; i < pedacos.length; i++) {
      const ok = await gravarDoc(servico, enderecoPedaco(codigo, i), {
        questoes: {
          arrayValue: { values: pedacos[i].map((q) => ({ stringValue: JSON.stringify(q) })) },
        },
      });
      if (!ok) return json({ erro: "Não consegui gravar a prova. Ela pode ser grande demais." }, 502);
    }
    for (let i = pedacos.length; i < pedacosAntigos; i++) {
      await apagarDoc(servico, enderecoPedaco(codigo, i));
    }

    const gravou = await gravarDoc(servico, enderecoProva(codigo), {
      prova: { stringValue: String(corpo.prova || "").trim().slice(0, 120) },
      descricao: { stringValue: String(corpo.descricao || "").trim().slice(0, 300) },
      questoes: { integerValue: String(questoes.length) },
      pedacos: { integerValue: String(pedacos.length) },
      publicadoEm: { doubleValue: Date.now() },
      publicadoPor: { stringValue: String(pessoa.email || "") },
    });
    if (!gravou) return json({ erro: "Não consegui gravar a ficha da prova." }, 502);

    return json({
      ok: true, codigo, questoes: questoes.length,
      descartadas: cruas.length - questoes.length,
    });
  }

  if (acao === "listar") {
    const r = await fetch(`${BASE_FIRESTORE}/provas?pageSize=200`, {
      headers: { Authorization: `Bearer ${servico}` },
    });
    if (!r.ok) return json({ ok: true, provas: [] });
    const j = await r.json().catch(() => null);
    const provas = ((j || {}).documents || []).map((d) => {
      const f = d.fields || {};
      return {
        codigo: String(d.name || "").split("/").pop(),
        prova: texto(f.prova),
        descricao: texto(f.descricao),
        questoes: numero(f.questoes),
        publicadoEm: numero(f.publicadoEm),
      };
    }).sort((a, b) => b.publicadoEm - a.publicadoEm);
    return json({ ok: true, provas });
  }

  if (acao === "despublicar") {
    if (!codigoValido(codigo)) return json({ erro: "Código inválido." }, 400);
    const doc = await lerDoc(servico, enderecoProva(codigo));
    const pedacos = Math.max(0, Math.min(MAX_PEDACOS, numero(((doc || {}).fields || {}).pedacos)));
    for (let i = 0; i < pedacos; i++) await apagarDoc(servico, enderecoPedaco(codigo, i));
    await apagarDoc(servico, enderecoProva(codigo));
    return json({ ok: true });
  }

  return json({ erro: "Ação desconhecida." }, 400);
}

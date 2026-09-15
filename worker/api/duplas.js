/* Amizade direta e duelo de questões · rota /api/duplas
 *
 * Duas coisas que a sala de amigos não resolve:
 *
 * 1. Estudar junto com UMA pessoa, sem combinar nome e senha de sala. Aqui
 *    a pessoa é achada pelo e-mail com que ela criou a conta, e a ligação
 *    só existe depois que ela aceita. Convite que vira amizade sozinho é
 *    convite que qualquer um usa para aparecer na tela dos outros.
 *
 * 2. O duelo: duas pessoas respondendo as mesmas questões ao mesmo tempo,
 *    com um relógio por questão. As questões saem de um material que
 *    alguém mandou, pela IA, e ficam guardadas no próprio duelo — as duas
 *    pessoas têm de ver exatamente as mesmas, na mesma ordem.
 *
 * Quem corrige é o SERVIDOR. A resposta certa nunca é mandada para o
 * navegador antes de a questão fechar: se fosse, bastaria abrir a aba de
 * rede para gabaritar o duelo inteiro.
 */
import {
  json, corpoJson, quemPede, contaDeServico, tokenDeAcesso, BASE_FIRESTORE,
} from "./_comum.js";

const MAX_AMIGOS = 60;
const MAX_QUESTOES = 30;
const MIN_SEG = 30;
const MAX_SEG = 60;

const texto = (v) => (v && v.stringValue) || "";
const numero = (v) => Number((v && (v.doubleValue || v.integerValue)) || 0);
const booleano = (v) => !!(v && v.booleanValue);
const lista = (v) => (((v && v.arrayValue) || {}).values || []);
const mapa = (v) => ((v && v.mapValue) || {}).fields || {};

/* O par sempre na mesma ordem, para a amizade ter um endereço só. Sem
   isto, A→B e B→A virariam dois documentos e cada lado veria um estado
   diferente da mesma amizade. */
const idDaDupla = (a, b) => [a, b].sort().join("_");

async function lerDoc(token, caminho) {
  const r = await fetch(`${BASE_FIRESTORE}/${caminho}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) return null;
  const j = await r.json().catch(() => null);
  return (j || {}).fields || null;
}

async function gravarDoc(token, caminho, fields) {
  const r = await fetch(`${BASE_FIRESTORE}/${caminho}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields }),
  });
  return r.ok;
}

async function apagarDoc(token, caminho) {
  await fetch(`${BASE_FIRESTORE}/${caminho}`, {
    method: "DELETE", headers: { Authorization: `Bearer ${token}` },
  }).catch(() => {});
}

/* Quem é a pessoa deste e-mail. A coleção "emails" é escrita pelo próprio
   dono da conta quando ele entra (ver useNuvem, no parte3.jsx). */
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
  const j = await r.json().catch(() => null);
  const doc = (j || []).find((x) => x.document);
  return doc ? doc.document.name.split("/").pop() : null;
}

async function perfisDe(token, uids) {
  if (!uids.length) return {};
  const base = BASE_FIRESTORE.replace(/^https:\/\/[^/]+\/v\d+\//, "");
  const r = await fetch(`${BASE_FIRESTORE}:batchGet`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ documents: uids.slice(0, MAX_AMIGOS).map((u) => `${base}/perfis/${u}`) }),
  });
  if (!r.ok) return {};
  const j = await r.json().catch(() => null);
  const fora = {};
  for (const item of j || []) {
    if (!item || !item.found) continue;
    const f = item.found.fields || {};
    fora[item.found.name.split("/").pop()] = {
      nome: texto(f.nome),
      presencaEm: numero(f.presencaEm),
      presencaMin: numero(f.presencaMin),
    };
  }
  return fora;
}

/* As duplas de quem está perguntando, dos dois lados. */
async function duplasDe(token, uid) {
  const r = await fetch(`${BASE_FIRESTORE}:runQuery`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: "duplas" }],
        where: {
          fieldFilter: {
            field: { fieldPath: "gente" }, op: "ARRAY_CONTAINS",
            value: { stringValue: uid },
          },
        },
        limit: MAX_AMIGOS,
      },
    }),
  });
  if (!r.ok) return [];
  const j = await r.json().catch(() => null);
  return (j || []).filter((x) => x.document).map((x) => {
    const f = x.document.fields || {};
    return {
      id: x.document.name.split("/").pop(),
      gente: lista(f.gente).map(texto),
      quemConvidou: texto(f.quemConvidou),
      aceita: booleano(f.aceita),
      em: numero(f.em),
      focoInicio: numero(f.focoInicio),
      focoMin: numero(f.focoMin),
      focoPor: texto(f.focoPor),
    };
  });
}

const camposDaDupla = (d) => ({
  gente: { arrayValue: { values: d.gente.map((x) => ({ stringValue: x })) } },
  quemConvidou: { stringValue: d.quemConvidou },
  aceita: { booleanValue: !!d.aceita },
  em: { doubleValue: d.em || Date.now() },
  focoInicio: { doubleValue: d.focoInicio || 0 },
  focoMin: { doubleValue: d.focoMin || 0 },
  focoPor: { stringValue: d.focoPor || "" },
});

/* O foco combinado, como a tela precisa: quanto falta, em segundos.
   Vencido é o mesmo que não existir — ninguém precisa desligar. */
function focoDaDupla(d) {
  const fim = (d.focoInicio || 0) + (d.focoMin || 0) * 60000;
  const resta = fim - Date.now();
  if (!d.focoInicio || !d.focoMin || resta <= 0) return null;
  return { por: d.focoPor || "", minutos: d.focoMin, inicio: d.focoInicio, restaSeg: Math.ceil(resta / 1000) };
}

/* ── duelo ────────────────────────────────────────────────────────────
 *
 * Um documento por duelo, com as questões dentro. A resposta certa fica
 * guardada aqui e NUNCA sai para o navegador antes de a questão fechar:
 * mandar junto seria entregar o gabarito a quem abrisse a aba de rede.
 */
function questaoParaTela(q, indice, mostrarGabarito) {
  return {
    n: indice + 1,
    enunciado: q.enunciado,
    alternativas: q.alternativas,
    ...(mostrarGabarito ? { certa: q.certa, porque: q.porque } : {}),
  };
}

function lerDuelo(f) {
  if (!f) return null;
  return {
    gente: lista(f.gente).map(texto),
    quemCriou: texto(f.quemCriou),
    tema: texto(f.tema),
    segundos: numero(f.segundos),
    comecouEm: numero(f.comecouEm),
    questoes: lista(f.questoes).map((v) => {
      const m = mapa(v);
      return {
        enunciado: texto(m.enunciado),
        alternativas: lista(m.alternativas).map(texto),
        certa: numero(m.certa),
        porque: texto(m.porque),
      };
    }),
    /* respostas: "uid:indice" → { escolha, em } */
    respostas: Object.entries(mapa(f.respostas)).reduce((acc, [k, v]) => {
      const m = mapa(v);
      acc[k] = { escolha: numero(m.escolha), em: numero(m.em) };
      return acc;
    }, {}),
  };
}

const camposDoDuelo = (d) => ({
  gente: { arrayValue: { values: d.gente.map((x) => ({ stringValue: x })) } },
  quemCriou: { stringValue: d.quemCriou },
  tema: { stringValue: d.tema },
  segundos: { doubleValue: d.segundos },
  comecouEm: { doubleValue: d.comecouEm },
  questoes: {
    arrayValue: {
      values: d.questoes.map((q) => ({
        mapValue: {
          fields: {
            enunciado: { stringValue: q.enunciado },
            alternativas: { arrayValue: { values: q.alternativas.map((a) => ({ stringValue: a })) } },
            certa: { doubleValue: q.certa },
            porque: { stringValue: q.porque || "" },
          },
        },
      })),
    },
  },
  respostas: {
    mapValue: {
      fields: Object.entries(d.respostas).reduce((m, [k, v]) => {
        m[k] = { mapValue: { fields: { escolha: { doubleValue: v.escolha }, em: { doubleValue: v.em } } } };
        return m;
      }, {}),
    },
  },
});

/* Em que questão o duelo está, pelo relógio. É o servidor que decide, e
   não cada navegador: dois relógios diferentes fariam uma pessoa ainda
   respondendo a questão que a outra já viu o gabarito. */
function ondeEstamos(d) {
  if (!d.comecouEm) return { indice: 0, restaSeg: d.segundos, acabou: false };
  const passou = (Date.now() - d.comecouEm) / 1000;
  const indice = Math.floor(passou / d.segundos);
  if (indice >= d.questoes.length) return { indice: d.questoes.length, restaSeg: 0, acabou: true };
  return { indice, restaSeg: Math.ceil(d.segundos - (passou % d.segundos)), acabou: false };
}

function placarDoDuelo(d, perfis) {
  return d.gente.map((uid) => {
    let acertos = 0;
    let respondidas = 0;
    d.questoes.forEach((q, i) => {
      const r = d.respostas[`${uid}:${i}`];
      if (!r) return;
      respondidas += 1;
      if (r.escolha === q.certa) acertos += 1;
    });
    return { uid, nome: (perfis[uid] && perfis[uid].nome) || "Alguém", acertos, respondidas };
  }).sort((a, b) => b.acertos - a.acertos);
}

export async function onRequest({ request, env }) {
  if (request.method !== "POST") return json({ erro: "Método não permitido." }, 405);
  if (!env.FIREBASE_API_KEY || !env.FIREBASE_SERVICE_ACCOUNT) {
    return json({ erro: "Faltam FIREBASE_API_KEY ou FIREBASE_SERVICE_ACCOUNT nas variáveis do site." }, 500);
  }

  const corpo = await corpoJson(request);
  if (!corpo) return json({ erro: "Pedido inválido." }, 400);
  const pessoa = await quemPede(corpo.token, env.FIREBASE_API_KEY);
  if (!pessoa) return json({ erro: "Entre na sua conta para usar esta função." }, 401);

  const conta = contaDeServico(env);
  if (!conta) return json({ erro: "Conta de serviço inválida." }, 500);
  let token;
  try { token = await tokenDeAcesso(conta); }
  catch (e) { return json({ erro: "Não consegui autenticar no banco." }, 500); }

  const acao = String(corpo.acao || "listar");

  /* ── amizades ────────────────────────────────────────────────────── */
  if (acao === "listar") {
    const duplas = await duplasDe(token, pessoa.uid);
    const outros = duplas.map((d) => d.gente.find((u) => u !== pessoa.uid)).filter(Boolean);
    const perfis = await perfisDe(token, outros);
    const agora = Date.now();
    return json({
      ok: true,
      duplas: duplas.map((d) => {
        const outro = d.gente.find((u) => u !== pessoa.uid) || "";
        const p = perfis[outro] || {};
        const vivo = !!p.presencaEm && (agora - p.presencaEm) < 150000;
        return {
          id: d.id,
          uid: outro,
          nome: p.nome || "Alguém",
          aceita: d.aceita,
          euConvidei: d.quemConvidou === pessoa.uid,
          estudando: vivo,
          minutos: vivo ? Math.max(0, Math.round((p.presencaMin || 0) + (agora - p.presencaEm) / 60000)) : 0,
          foco: focoDaDupla(d),
        };
      }),
    });
  }

  if (acao === "convidar") {
    const email = String(corpo.email || "").toLowerCase().trim();
    if (!email) return json({ erro: "Escreva o e-mail da pessoa." }, 400);
    if (email === String(pessoa.email || "").toLowerCase()) {
      return json({ erro: "Esse é o seu próprio e-mail." }, 400);
    }
    const outro = await uidPeloEmail(token, email);
    /* Sem dizer se a conta existe: responder "não achei" para um e-mail e
       "convite enviado" para outro transforma esta rota num jeito de
       descobrir quem tem conta no site. */
    if (!outro) {
      return json({ ok: true, mensagem: "Convite enviado. Ele aparece para a pessoa quando ela entrar." });
    }
    const id = idDaDupla(pessoa.uid, outro);
    const ja = await lerDoc(token, `duplas/${id}`);
    if (ja) return json({ ok: true, mensagem: "Vocês já estão ligados, ou o convite já foi enviado." });
    const gravou = await gravarDoc(token, `duplas/${id}`, camposDaDupla({
      gente: [pessoa.uid, outro], quemConvidou: pessoa.uid, aceita: false, em: Date.now(),
    }));
    if (!gravou) return json({ erro: "Não consegui enviar o convite." }, 502);
    return json({ ok: true, mensagem: "Convite enviado." });
  }

  if (acao === "aceitar" || acao === "remover") {
    const id = String(corpo.id || "").slice(0, 80);
    const f = await lerDoc(token, `duplas/${id}`);
    if (!f) return json({ erro: "Esse convite já não existe." }, 404);
    const gente = lista(f.gente).map(texto);
    if (gente.indexOf(pessoa.uid) < 0) return json({ erro: "Isso não é seu." }, 403);

    if (acao === "remover") {
      await apagarDoc(token, `duplas/${id}`);
      return json({ ok: true, mensagem: "Pronto." });
    }
    /* Quem convidou não aceita o próprio convite: senão o convite vira
       amizade sozinho e a outra pessoa nunca escolheu nada. */
    if (texto(f.quemConvidou) === pessoa.uid) {
      return json({ erro: "Quem aceita é a outra pessoa." }, 403);
    }
    const gravou = await gravarDoc(token, `duplas/${id}`, camposDaDupla({
      gente, quemConvidou: texto(f.quemConvidou), aceita: true, em: numero(f.em),
      focoInicio: numero(f.focoInicio), focoMin: numero(f.focoMin), focoPor: texto(f.focoPor),
    }));
    if (!gravou) return json({ erro: "Não consegui aceitar agora." }, 502);
    return json({ ok: true, mensagem: "Agora vocês estudam juntos." });
  }

  if (acao === "focar") {
    const id = String(corpo.id || "").slice(0, 80);
    const minutos = Math.round(Number(corpo.minutos) || 0);
    if (minutos && (minutos < 5 || minutos > 180)) {
      return json({ erro: "O foco em conjunto vai de 5 a 180 minutos." }, 400);
    }
    const f = await lerDoc(token, `duplas/${id}`);
    if (!f) return json({ erro: "Essa dupla não existe." }, 404);
    const gente = lista(f.gente).map(texto);
    if (gente.indexOf(pessoa.uid) < 0) return json({ erro: "Isso não é seu." }, 403);
    if (!booleano(f.aceita)) return json({ erro: "O convite ainda não foi aceito." }, 400);
    const meu = (await perfisDe(token, [pessoa.uid]))[pessoa.uid] || {};
    const d = {
      gente, quemConvidou: texto(f.quemConvidou), aceita: true, em: numero(f.em),
      focoInicio: minutos ? Date.now() : 0,
      focoMin: minutos,
      focoPor: minutos ? String(meu.nome || "").slice(0, 40) : "",
    };
    if (!await gravarDoc(token, `duplas/${id}`, camposDaDupla(d))) {
      return json({ erro: "Não consegui combinar o foco." }, 502);
    }
    return json({ ok: true, foco: focoDaDupla(d) });
  }

  /* ── duelo ───────────────────────────────────────────────────────── */
  if (acao === "duelo-criar") {
    const id = String(corpo.id || "").slice(0, 80);
    const f = await lerDoc(token, `duplas/${id}`);
    if (!f) return json({ erro: "Essa dupla não existe." }, 404);
    const gente = lista(f.gente).map(texto);
    if (gente.indexOf(pessoa.uid) < 0) return json({ erro: "Isso não é seu." }, 403);
    if (!booleano(f.aceita)) return json({ erro: "O convite ainda não foi aceito." }, 400);

    const segundos = Math.round(Number(corpo.segundos) || 0);
    if (segundos < MIN_SEG || segundos > MAX_SEG) {
      return json({ erro: `O tempo por questão vai de ${MIN_SEG} a ${MAX_SEG} segundos.` }, 400);
    }
    const questoes = (Array.isArray(corpo.questoes) ? corpo.questoes : [])
      .filter((q) => q && typeof q.enunciado === "string" && Array.isArray(q.alternativas)
        && q.alternativas.length >= 2)
      .slice(0, MAX_QUESTOES)
      .map((q) => ({
        enunciado: String(q.enunciado).slice(0, 400),
        alternativas: q.alternativas.slice(0, 5).map((a) => String(a).slice(0, 200)),
        certa: Math.max(0, Math.min(q.alternativas.length - 1, Math.round(Number(q.certa) || 0))),
        porque: String(q.porque || "").slice(0, 300),
      }));
    if (!questoes.length) return json({ erro: "Nenhuma questão para disputar." }, 400);

    const d = {
      gente, quemCriou: pessoa.uid, tema: String(corpo.tema || "").slice(0, 60),
      segundos, comecouEm: Date.now(), questoes, respostas: {},
    };
    if (!await gravarDoc(token, `duelos/${id}`, camposDoDuelo(d))) {
      return json({ erro: "Não consegui começar o duelo." }, 502);
    }
    return json({ ok: true });
  }

  if (acao === "duelo-estado" || acao === "duelo-responder") {
    const id = String(corpo.id || "").slice(0, 80);
    const d = lerDuelo(await lerDoc(token, `duelos/${id}`));
    if (!d) return json({ ok: true, duelo: null });
    if (d.gente.indexOf(pessoa.uid) < 0) return json({ erro: "Isso não é seu." }, 403);

    const onde = ondeEstamos(d);

    if (acao === "duelo-responder") {
      const n = Math.round(Number(corpo.n));
      const escolha = Math.round(Number(corpo.escolha));
      /* Só vale responder a questão que está aberta AGORA, e só uma vez.
         O relógio é do servidor: sem isso dava para responder tudo no fim,
         com calma, depois de ver o gabarito de cada uma. */
      if (n !== onde.indice || onde.acabou) {
        return json({ erro: "Essa questão já fechou." }, 409);
      }
      const chave = `${pessoa.uid}:${n}`;
      if (!d.respostas[chave]) {
        d.respostas[chave] = { escolha, em: Date.now() };
        await gravarDoc(token, `duelos/${id}`, camposDoDuelo(d));
      }
    }

    const perfis = await perfisDe(token, d.gente);
    const minhas = {};
    d.questoes.forEach((q, i) => {
      const r = d.respostas[`${pessoa.uid}:${i}`];
      if (r) minhas[i] = r.escolha;
    });

    return json({
      ok: true,
      duelo: {
        tema: d.tema,
        segundos: d.segundos,
        total: d.questoes.length,
        indice: onde.indice,
        restaSeg: onde.restaSeg,
        acabou: onde.acabou,
        /* O gabarito só desce depois que a questão fecha. Antes disso ele
           não existe para o navegador. */
        questao: onde.acabou ? null : questaoParaTela(d.questoes[onde.indice], onde.indice, false),
        minhas,
        placar: placarDoDuelo(d, perfis),
        /* No fim, o gabarito inteiro, que é quando ele vira estudo. */
        gabarito: onde.acabou
          ? d.questoes.map((q, i) => questaoParaTela(q, i, true))
          : null,
      },
    });
  }

  if (acao === "duelo-apagar") {
    const id = String(corpo.id || "").slice(0, 80);
    const d = lerDuelo(await lerDoc(token, `duelos/${id}`));
    if (d && d.gente.indexOf(pessoa.uid) < 0) return json({ erro: "Isso não é seu." }, 403);
    await apagarDoc(token, `duelos/${id}`);
    return json({ ok: true });
  }

  return json({ erro: "Ação desconhecida." }, 400);
}

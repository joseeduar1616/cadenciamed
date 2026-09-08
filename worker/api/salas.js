/* Salas de amigos · rota /api/salas
 *
 * Uma sala é um nome mais uma senha. Quem confere a senha é este arquivo, no
 * servidor: se a conferência fosse no navegador, bastaria abrir o código da
 * página para entrar em qualquer sala.
 *
 * A senha nunca é guardada. Fica gravado o PBKDF2 dela com um sal sorteado
 * por sala, e é esse resultado que a conferência compara — quem conseguisse
 * ler o banco continuaria sem as senhas.
 *
 * As estatísticas de cada pessoa ficam em perfis/{uid}, que o próprio dono
 * escreve. O ranking é montado aqui porque só o servidor tem como ler o
 * perfil dos outros: pelas regras do Firestore, o navegador lê apenas o seu.
 */
import {
  json, corpoJson, quemPede, contaDeServico, tokenDeAcesso, BASE_FIRESTORE,
} from "./_comum.js";

const MAX_MEMBROS = 60;
const ITERACOES = 100000;

/* "Plantão da Madrugada!" vira "plantao-da-madrugada", que é o que
   identifica a sala. Assim quem digita com outra caixa ou sem acento entra
   na mesma sala em vez de criar uma quase igual. */
export function apelido(nome) {
  return String(nome || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

const paraB64 = (bytes) => {
  let bruto = "";
  const b = new Uint8Array(bytes);
  for (let i = 0; i < b.length; i++) bruto += String.fromCharCode(b[i]);
  return btoa(bruto);
};

async function embaralhar(senha, salB64) {
  const sal = Uint8Array.from(atob(salB64), (c) => c.charCodeAt(0));
  const base = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(senha), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: sal, iterations: ITERACOES, hash: "SHA-256" }, base, 256);
  return paraB64(bits);
}

/* Comparação em tempo constante: sair no primeiro byte diferente conta,
   pelo tempo de resposta, quanto do palpite estava certo. */
function iguais(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

const texto = (v) => (v && v.stringValue) || "";
const numero = (v) => Number((v && (v.doubleValue || v.integerValue)) || 0);
const lista = (v) => (((v && v.arrayValue) || {}).values || []).map(texto).filter(Boolean);

async function lerSala(token, slug) {
  const r = await fetch(`${BASE_FIRESTORE}/salas/${slug}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) return null;
  const j = await r.json().catch(() => null);
  const f = (j || {}).fields || {};
  return {
    slug,
    nome: texto(f.nome) || slug,
    sal: texto(f.sal),
    hash: texto(f.hash),
    dono: texto(f.dono),
    criadaEm: numero(f.criadaEm),
    membros: lista(f.membros),
  };
}

/* Grava a sala inteira. Duas pessoas entrando no mesmo instante podem
   perder uma das duas entradas, porque cada uma lê a lista e regrava o que
   leu. Numa sala de amigos isso custa clicar em "entrar" de novo, então
   não vale a complicação de uma transação do Firestore. */
async function gravarSala(token, sala) {
  const r = await fetch(`${BASE_FIRESTORE}/salas/${sala.slug}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      fields: {
        nome: { stringValue: sala.nome },
        sal: { stringValue: sala.sal },
        hash: { stringValue: sala.hash },
        dono: { stringValue: sala.dono },
        criadaEm: { doubleValue: sala.criadaEm },
        membros: { arrayValue: { values: sala.membros.map((x) => ({ stringValue: x })) } },
      },
    }),
  });
  return r.ok;
}

/* Lê os perfis de todo mundo da sala numa chamada só.
 *
 * O batchGet não recebe URL: recebe o nome do documento, que começa em
 * "projects/". Mandar o endereço https inteiro faz o Firestore recusar a
 * chamada, e o ranking volta vazio sem dizer por quê. */
const NOME_BASE = BASE_FIRESTORE.replace(/^https:\/\/[^/]+\/v\d+\//, "");

async function perfisDe(token, uids) {
  if (!uids.length) return {};
  const r = await fetch(`${BASE_FIRESTORE}:batchGet`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      documents: uids.slice(0, MAX_MEMBROS).map((u) => `${NOME_BASE}/perfis/${u}`),
    }),
  });
  if (!r.ok) return {};
  const j = await r.json().catch(() => null);
  const fora = {};
  for (const item of j || []) {
    if (!item || !item.found) continue;
    const uid = item.found.name.split("/").pop();
    const f = item.found.fields || {};
    fora[uid] = {
      nome: texto(f.nome),
      minutos: numero(f.minutos),
      questoes: numero(f.questoes),
      acertos: numero(f.acertos),
      atualizadoEm: numero(f.atualizadoEm),
    };
  }
  return fora;
}

function montarRanking(sala, perfis, eu) {
  const linhas = sala.membros.map((uid) => {
    const p = perfis[uid] || {};
    const questoes = Math.max(0, Math.round(p.questoes || 0));
    const acertos = Math.min(questoes, Math.max(0, Math.round(p.acertos || 0)));
    return {
      uid,
      nome: p.nome || "sem nome",
      /* Horas líquidas: só o tempo lançado em sessão, sem contar pausa. */
      minutos: Math.max(0, Math.round(p.minutos || 0)),
      questoes,
      acertos,
      pct: questoes ? Math.round((acertos / questoes) * 100) : null,
      atualizadoEm: p.atualizadoEm || 0,
      souEu: uid === eu,
      dono: uid === sala.dono,
    };
  });
  linhas.sort((a, b) => b.minutos - a.minutos || b.questoes - a.questoes);
  return linhas.map((x, i) => ({ ...x, posicao: i + 1 }));
}

export async function onRequest({ request, env }) {
  if (request.method !== "POST") return json({ erro: "Método não permitido." }, 405);

  if (!env.FIREBASE_API_KEY || !env.FIREBASE_SERVICE_ACCOUNT) {
    return json({ erro: "Faltam FIREBASE_API_KEY ou FIREBASE_SERVICE_ACCOUNT nas variáveis do site." }, 500);
  }

  const corpo = await corpoJson(request);
  if (!corpo) return json({ erro: "Pedido inválido." }, 400);

  const pessoa = await quemPede(corpo.token, env.FIREBASE_API_KEY);
  if (!pessoa) return json({ erro: "Entre na sua conta para usar as salas." }, 401);

  const conta = contaDeServico(env);
  if (!conta) return json({ erro: "Conta de serviço inválida." }, 500);

  let token;
  try { token = await tokenDeAcesso(conta); }
  catch (e) { return json({ erro: "Não consegui autenticar no banco." }, 500); }

  const acao = String(corpo.acao || "minhas");

  /* ── as salas de quem está pedindo ─────────────────────────────────── */
  if (acao === "minhas") {
    const r = await fetch(`${BASE_FIRESTORE}:runQuery`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: "salas" }],
          where: {
            fieldFilter: {
              field: { fieldPath: "membros" }, op: "ARRAY_CONTAINS",
              value: { stringValue: pessoa.uid },
            },
          },
          limit: 20,
        },
      }),
    });
    if (!r.ok) return json({ erro: "Não consegui ler suas salas." }, 500);
    const j = await r.json().catch(() => null);
    const salas = (j || []).filter((x) => x.document).map((x) => {
      const f = x.document.fields || {};
      return {
        slug: x.document.name.split("/").pop(),
        nome: texto(f.nome),
        membros: lista(f.membros).length,
      };
    });
    return json({ salas });
  }

  const slug = apelido(corpo.nome);
  if (!slug || slug.length < 2) {
    return json({ erro: "O nome da sala precisa ter pelo menos 2 letras ou números." }, 400);
  }

  /* ── cria ──────────────────────────────────────────────────────────── */
  if (acao === "criar") {
    const senha = String(corpo.senha || "");
    if (senha.length < 4) return json({ erro: "A senha precisa ter pelo menos 4 caracteres." }, 400);

    if (await lerSala(token, slug)) {
      return json({ erro: "Já existe uma sala com esse nome. Escolha outro, ou entre nela com a senha." }, 409);
    }

    const sal = paraB64(crypto.getRandomValues(new Uint8Array(16)));
    const sala = {
      slug,
      nome: String(corpo.nome).trim().slice(0, 40),
      sal,
      hash: await embaralhar(senha, sal),
      dono: pessoa.uid,
      criadaEm: Date.now(),
      membros: [pessoa.uid],
    };
    if (!await gravarSala(token, sala)) return json({ erro: "Não consegui criar a sala." }, 500);
    return json({ ok: true, slug, nome: sala.nome, mensagem: `Sala "${sala.nome}" criada.` });
  }

  const sala = await lerSala(token, slug);
  if (!sala) return json({ erro: "Não achei sala com esse nome." }, 404);

  /* ── entra ─────────────────────────────────────────────────────────── */
  if (acao === "entrar") {
    if (sala.membros.indexOf(pessoa.uid) < 0) {
      const tentativa = await embaralhar(String(corpo.senha || ""), sala.sal);
      /* Sem dizer se errou o nome ou a senha: a diferença entre as duas
         mensagens já conta que a sala existe. */
      if (!iguais(tentativa, sala.hash)) return json({ erro: "Nome ou senha errados." }, 403);
      if (sala.membros.length >= MAX_MEMBROS) {
        return json({ erro: `Esta sala já tem ${MAX_MEMBROS} pessoas, que é o limite.` }, 409);
      }
      sala.membros = [...sala.membros, pessoa.uid];
      if (!await gravarSala(token, sala)) return json({ erro: "Não consegui entrar." }, 500);
    }
    return json({ ok: true, slug, nome: sala.nome, mensagem: `Você está em "${sala.nome}".` });
  }

  /* Daqui para baixo só quem já é da sala. */
  if (sala.membros.indexOf(pessoa.uid) < 0) {
    return json({ erro: "Você não está nesta sala." }, 403);
  }

  /* ── sai ───────────────────────────────────────────────────────────── */
  if (acao === "sair") {
    sala.membros = sala.membros.filter((x) => x !== pessoa.uid);
    if (!sala.membros.length) {
      /* Sala vazia é sala que ninguém mais abre, e o nome fica preso. */
      await fetch(`${BASE_FIRESTORE}/salas/${slug}`, {
        method: "DELETE", headers: { Authorization: `Bearer ${token}` },
      });
      return json({ ok: true, mensagem: "Você saiu, e a sala foi encerrada por ficar vazia." });
    }
    /* Quem criou a sala saiu: a pessoa mais antiga que ficou assume, senão
       ninguém consegue mais encerrar a sala. */
    if (sala.dono === pessoa.uid) sala.dono = sala.membros[0];
    if (!await gravarSala(token, sala)) return json({ erro: "Não consegui sair." }, 500);
    return json({ ok: true, mensagem: `Você saiu de "${sala.nome}".` });
  }

  /* ── ranking ───────────────────────────────────────────────────────── */
  if (acao === "ranking") {
    const perfis = await perfisDe(token, sala.membros);
    return json({
      ok: true,
      sala: { slug, nome: sala.nome, souDono: sala.dono === pessoa.uid },
      ranking: montarRanking(sala, perfis, pessoa.uid),
    });
  }

  return json({ erro: "Ação desconhecida." }, 400);
}

/* Cronograma do Notion · rota /api/notion
 *
 * Liga a conta de quem usa o site à conta do Notion dela, e lê de lá o
 * MEDPlanner: uma linha por semana, com o tema, a data, o que já foi feito
 * e quais revisões foram cumpridas.
 *
 * A troca do código pelo token acontece aqui, no servidor, porque ela exige
 * o segredo da integração. Fazer isso no navegador significaria publicar o
 * segredo dentro da página, e qualquer pessoa que abrisse o código-fonte
 * poderia se passar pelo aplicativo.
 *
 * O token de cada pessoa fica em notion/{uid}, coleção que as regras do
 * Firestore fecham para o navegador: quem grava e quem lê é a conta de
 * serviço. Ele dá acesso de leitura ao Notion de quem conectou, então não
 * pode voltar para a página em nenhuma resposta.
 */
import {
  json, corpoJson, quemPede, contaDeServico, tokenDeAcesso, BASE_FIRESTORE,
} from "./_comum.js";

const NOTION = "https://api.notion.com/v1";

/* A versão vai em toda chamada. Sem ela o Notion recusa; com uma versão
   fixa, uma mudança futura da API não muda o formato debaixo do site sem
   aviso. */
const VERSAO_NOTION = "2022-06-28";

/* Uma cópia do MEDPlanner tem cerca de 45 linhas, uma por semana. O limite
   existe para o caso de alguém apontar para um banco enorme por engano. */
const MAX_LINHAS = 400;

const texto = (v) => (v && v.stringValue) || "";

/* ── o que cada coluna do MEDPlanner vira aqui ─────────────────────────
 *
 * A busca é pelo nome da coluna sem acento e sem caixa, porque cada cópia
 * do planner é editada à mão e "1 MÊS" acaba virando "1 mes" na de alguém.
 * O que não estiver na lista é ignorado: o planner de cada pessoa tem
 * colunas próprias, e adivinhar o significado delas daria importação
 * errada em vez de importação incompleta. */
const SEM_ACENTO = (s) => String(s || "")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toUpperCase().replace(/\s+/g, " ").trim();

const CAIXAS = {
  "AULA": "aula",
  "APOSTILAS": "apostilas",
  "QTS PRE": "qtsPre",
  "QTS POS": "qtsPos",
  "SMARTCARDS": "cards",
  "TREINO AVANCADO": "treino",
};

/* Os cinco degraus do planner, em dias, que são os mesmos da escada
   Cadência do app: uma semana, um mês, dois, quatro e seis meses. */
const REVISOES = {
  "1 SEMANA": 7,
  "1 MES": 30,
  "2 MESES": 60,
  "4 MESES": 120,
  "6 MESES": 180,
};

/* O desempenho vira o mesmo número que o app já usa em marks.perf. */
const DESEMPENHO = {
  "≥ 80%": 1, ">= 80%": 1, "MAIOR OU IGUAL A 80%": 1,
  "61 - 79%": 2, "61 A 79%": 2, "61-79%": 2,
  "≤ 60%": 3, "<= 60%": 3, "MENOR OU IGUAL A 60%": 3,
};

const TEMAS = { "AULA PRINCIPAL": "tema", "AULAS BONUS": "bonus" };

/* ── leitura de uma propriedade do Notion ──────────────────────────────
 *
 * O Notion devolve cada coluna com um formato próprio conforme o tipo. Só
 * os tipos que o planner usa são lidos; qualquer outro vira vazio, em vez
 * de virar "[object Object]" no meio do cronograma de alguém. */
function valorDe(p) {
  if (!p || !p.type) return null;
  if (p.type === "checkbox") return !!p.checkbox;
  if (p.type === "date") return p.date && p.date.start ? String(p.date.start).slice(0, 10) : null;
  if (p.type === "number") return typeof p.number === "number" ? p.number : null;
  if (p.type === "select") return p.select ? p.select.name : "";
  if (p.type === "status") return p.status ? p.status.name : "";
  if (p.type === "multi_select") return (p.multi_select || []).map((x) => x.name);
  if (p.type === "title") return (p.title || []).map((t) => t.plain_text || "").join("");
  if (p.type === "rich_text") return (p.rich_text || []).map((t) => t.plain_text || "").join("");
  return null;
}

/* Uma página do banco vira uma linha do cronograma. */
export function lerLinha(pagina) {
  const props = (pagina && pagina.properties) || {};
  const linha = {
    id: String((pagina && pagina.id) || ""),
    semana: "", tema: "", bonus: "", data: null, areas: [], perf: 0,
    aula: false, apostilas: false, qtsPre: false, qtsPos: false,
    cards: false, treino: false,
    revisoes: [],
  };

  for (const nome of Object.keys(props)) {
    const p = props[nome];
    const chave = SEM_ACENTO(nome);
    const v = valorDe(p);

    if (p.type === "title") { linha.semana = String(v || "").trim(); continue; }
    if (CAIXAS[chave] && p.type === "checkbox") { linha[CAIXAS[chave]] = !!v; continue; }
    if (REVISOES[chave] && p.type === "checkbox") {
      if (v) linha.revisoes.push(REVISOES[chave]);
      continue;
    }
    if (TEMAS[chave]) { linha[TEMAS[chave]] = String(v || "").trim(); continue; }
    if (chave === "DATA" && p.type === "date") { linha.data = v; continue; }
    if (chave === "AREA" && p.type === "multi_select") { linha.areas = v || []; continue; }
    if (chave === "DESEMPENHO") {
      linha.perf = DESEMPENHO[String(v || "")] || DESEMPENHO[SEM_ACENTO(v)] || 0;
      continue;
    }
  }

  linha.revisoes.sort((a, b) => a - b);
  return linha;
}

/* ── token de quem conectou ────────────────────────────────────────────
 *
 * Guardado em notion/{uid}. Fica só aqui: nenhuma resposta desta rota
 * devolve o token, nem por engano, porque com ele qualquer pessoa leria o
 * Notion inteiro de quem conectou. */
async function lerConexao(token, uid) {
  const r = await fetch(`${BASE_FIRESTORE}/notion/${uid}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) return null;
  const j = await r.json().catch(() => null);
  const f = (j || {}).fields || {};
  const acesso = texto(f.acesso);
  if (!acesso) return null;
  return { acesso, oficina: texto(f.oficina), banco: texto(f.banco) };
}

async function gravarConexao(token, uid, dados) {
  const r = await fetch(`${BASE_FIRESTORE}/notion/${uid}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      fields: {
        acesso: { stringValue: dados.acesso },
        oficina: { stringValue: dados.oficina || "" },
        banco: { stringValue: dados.banco || "" },
        em: { doubleValue: Date.now() },
      },
    }),
  });
  return r.ok;
}

/* ── chamadas ao Notion ────────────────────────────────────────────── */
async function pedirAoNotion(acesso, caminho, corpo) {
  const r = await fetch(`${NOTION}${caminho}`, {
    method: corpo ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${acesso}`,
      "Notion-Version": VERSAO_NOTION,
      "Content-Type": "application/json",
    },
    ...(corpo ? { body: JSON.stringify(corpo) } : {}),
  });
  const j = await r.json().catch(() => null);
  return { ok: r.ok, status: r.status, corpo: j };
}

/* O nome que aparece na lista de bancos. */
const tituloDoBanco = (b) => ((b && b.title) || [])
  .map((t) => t.plain_text || "").join("").trim() || "sem nome";

/* Lê o banco inteiro, virando as páginas. */
async function lerBanco(acesso, banco) {
  const linhas = [];
  let cursor = null;
  do {
    const r = await pedirAoNotion(acesso, `/databases/${banco}/query`, {
      page_size: 100, ...(cursor ? { start_cursor: cursor } : {}),
    });
    if (!r.ok) return { erro: r };
    for (const p of (r.corpo.results || [])) linhas.push(lerLinha(p));
    cursor = r.corpo.has_more ? r.corpo.next_cursor : null;
  } while (cursor && linhas.length < MAX_LINHAS);
  return { linhas: linhas.slice(0, MAX_LINHAS) };
}

/* Mensagem que serve para quem está olhando a tela, e não o console. */
function explicar(r) {
  if (r.status === 401) return "O Notion recusou a conexão. Conecte de novo, por favor.";
  if (r.status === 404) return "Não achei esse cronograma no seu Notion. Confira se ele está compartilhado com o Cadência Med.";
  if (r.status === 429) return "O Notion pediu para esperar um pouco. Tente de novo em alguns instantes.";
  const m = r.corpo && r.corpo.message;
  return m ? `O Notion respondeu: ${m}` : "Não consegui falar com o Notion.";
}

export async function onRequest({ request, env }) {
  if (request.method !== "POST") return json({ erro: "Método não permitido." }, 405);

  if (!env.FIREBASE_API_KEY || !env.FIREBASE_SERVICE_ACCOUNT) {
    return json({ erro: "Faltam FIREBASE_API_KEY ou FIREBASE_SERVICE_ACCOUNT nas variáveis do site." }, 500);
  }

  const corpo = await corpoJson(request);
  if (!corpo) return json({ erro: "Pedido inválido." }, 400);

  const pessoa = await quemPede(corpo.token, env.FIREBASE_API_KEY);
  if (!pessoa) return json({ erro: "Entre na sua conta para ligar o Notion." }, 401);

  const conta = contaDeServico(env);
  if (!conta) return json({ erro: "Conta de serviço inválida." }, 500);

  let token;
  try { token = await tokenDeAcesso(conta); }
  catch (e) { return json({ erro: "Não consegui autenticar no banco." }, 500); }

  const acao = String(corpo.acao || "estado");
  const configurado = !!(env.NOTION_CLIENT_ID && env.NOTION_CLIENT_SECRET);
  const conexao = await lerConexao(token, pessoa.uid);

  /* ── como está a ligação ───────────────────────────────────────────── */
  if (acao === "estado") {
    return json({
      ok: true,
      configurado,
      ligado: !!conexao,
      oficina: conexao ? conexao.oficina : "",
      banco: conexao ? conexao.banco : "",
    });
  }

  if (!configurado) {
    return json({
      erro: "O Notion ainda não foi configurado neste site. Falta cadastrar NOTION_CLIENT_ID e NOTION_CLIENT_SECRET nas variáveis do Worker.",
    }, 503);
  }

  /* ── para onde mandar quem vai autorizar ───────────────────────────── */
  if (acao === "inicio") {
    /* O endereço de volta é escolhido aqui e conferido pelo Notion contra o
       que está cadastrado na integração. Aceitar o que o navegador mandasse
       deixaria alguém receber o código de autorização em outro site. */
    const volta = env.NOTION_REDIRECT || "https://cadenciamed.com.br/notion";
    const u = new URL("https://api.notion.com/v1/oauth/authorize");
    u.searchParams.set("client_id", env.NOTION_CLIENT_ID);
    u.searchParams.set("response_type", "code");
    u.searchParams.set("owner", "user");
    u.searchParams.set("redirect_uri", volta);
    return json({ ok: true, endereco: u.toString() });
  }

  /* ── troca do código pelo token ────────────────────────────────────── */
  if (acao === "conectar") {
    const codigo = String(corpo.codigo || "").trim();
    if (!codigo) return json({ erro: "Faltou o código do Notion." }, 400);

    const volta = env.NOTION_REDIRECT || "https://cadenciamed.com.br/notion";
    const cabecalho = btoa(`${env.NOTION_CLIENT_ID}:${env.NOTION_CLIENT_SECRET}`);
    const r = await fetch(`${NOTION}/oauth/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${cabecalho}`,
        "Notion-Version": VERSAO_NOTION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        grant_type: "authorization_code", code: codigo, redirect_uri: volta,
      }),
    });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j || !j.access_token) {
      return json({ erro: explicar({ status: r.status, corpo: j }) }, 400);
    }

    if (!await gravarConexao(token, pessoa.uid, {
      acesso: j.access_token,
      oficina: String(j.workspace_name || "").slice(0, 80),
      banco: conexao ? conexao.banco : "",
    })) {
      return json({ erro: "Não consegui guardar a conexão." }, 500);
    }
    return json({ ok: true, oficina: String(j.workspace_name || "") });
  }

  if (acao === "desligar") {
    await fetch(`${BASE_FIRESTORE}/notion/${pessoa.uid}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${token}` },
    });
    return json({ ok: true, mensagem: "O Notion foi desligado da sua conta." });
  }

  /* Daqui para baixo precisa de conexão. */
  if (!conexao) return json({ erro: "Ligue sua conta do Notion antes." }, 400);

  /* ── quais cronogramas foram compartilhados ────────────────────────── */
  if (acao === "bancos") {
    const r = await pedirAoNotion(conexao.acesso, "/search", {
      filter: { property: "object", value: "database" }, page_size: 50,
    });
    if (!r.ok) return json({ erro: explicar(r) }, 502);
    const bancos = (r.corpo.results || []).map((b) => ({
      id: String(b.id || ""), nome: tituloDoBanco(b),
    })).filter((b) => b.id);
    return json({ ok: true, bancos, escolhido: conexao.banco });
  }

  /* ── o cronograma em si ────────────────────────────────────────────── */
  if (acao === "cronograma") {
    const escolhido = String(corpo.banco || conexao.banco || "").trim();
    if (!escolhido) return json({ erro: "Escolha qual cronograma do Notion importar." }, 400);

    const r = await lerBanco(conexao.acesso, escolhido);
    if (r.erro) return json({ erro: explicar(r.erro) }, 502);

    /* Guarda a escolha para a próxima importação não perguntar de novo. */
    if (escolhido !== conexao.banco) {
      await gravarConexao(token, pessoa.uid, { ...conexao, banco: escolhido });
    }
    return json({ ok: true, banco: escolhido, linhas: r.linhas });
  }

  return json({ erro: "Ação desconhecida." }, 400);
}

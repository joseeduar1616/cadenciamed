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
 *
 * O recado da sala fica em salas/{slug}/mensagens/log, num documento só, com
 * as últimas mensagens numa lista. Uma coleção com uma mensagem por documento
 * cresceria para sempre e precisaria de faxina; assim a própria gravação
 * descarta o que passou do limite, e apagar a sala apaga o histórico junto.
 */
import {
  json, corpoJson, quemPede, contaDeServico, tokenDeAcesso, BASE_FIRESTORE,
} from "./_comum.js";

const MAX_MEMBROS = 60;
const ITERACOES = 100000;

/* Quantas mensagens a sala guarda e o tamanho de cada uma. O recado é para
   combinar horário e dar força, não para virar arquivo de conversa. */
const MAX_MENSAGENS = 80;
const MAX_LETRAS = 400;

/* Por quanto tempo um sinal de "estou estudando" continua valendo.
 *
 * O app manda um sinal a cada 45 segundos. Fechar a aba não avisa ninguém,
 * então quem sai fica marcado como estudando até este prazo vencer — daí a
 * folga ser curta, só o suficiente para um sinal perdido não apagar a
 * marca de quem continua na mesa. */
const VALIDADE_PRESENCA = 150000;

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

/* ── duas famílias de sala, em coleções separadas ─────────────────────
 *
 * "salas" é o estudo, "salasTreino" é a academia e "salasSimulado" é a
 * disputa de acerto em simulado. São mundos diferentes: quem estuda com
 * você não é necessariamente quem treina com você, nem quem faz os mesmos
 * simulados que você, e misturar obrigaria cada grupo a ver o placar dos
 * outros dois.
 *
 * Coleção separada, e não um campo "tipo" dentro da mesma: assim o nome da
 * sala pode se repetir entre as duas (dá para ter "Turma 2026" nas duas
 * sem uma atrapalhar a outra) e uma consulta nunca alcança a outra família
 * por engano. */
const COLECAO = (tipo) => {
  const t = String(tipo || "");
  if (t === "treino") return "salasTreino";
  if (t === "simulado") return "salasSimulado";
  return "salas";
};

async function lerSala(token, col, slug) {
  const r = await fetch(`${BASE_FIRESTORE}/${col}/${slug}`, {
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
    /* Estudar juntos: um cronômetro só, combinado pela sala. Fica na
       própria sala e não em coleção nova porque é um dado só, vale para
       todo mundo ao mesmo tempo e morre quando o tempo acaba. */
    focoInicio: numero(f.focoInicio),
    focoMin: numero(f.focoMin),
    focoPor: texto(f.focoPor),
    /* O link da Jam do Spotify. O site não cria Jam nenhuma: não existe
       API pública para isso. Quem cria é o app do Spotify, e aqui só mora
       o link para a sala inteira abrir o mesmo. */
    jamUrl: texto(f.jamUrl),
    jamPor: texto(f.jamPor),
    jamEm: numero(f.jamEm),
  };
}

/* Grava a sala inteira. Duas pessoas entrando no mesmo instante podem
   perder uma das duas entradas, porque cada uma lê a lista e regrava o que
   leu. Numa sala de amigos isso custa clicar em "entrar" de novo, então
   não vale a complicação de uma transação do Firestore. */
async function gravarSala(token, col, sala) {
  const r = await fetch(`${BASE_FIRESTORE}/${col}/${sala.slug}`, {
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
        focoInicio: { doubleValue: sala.focoInicio || 0 },
        focoMin: { doubleValue: sala.focoMin || 0 },
        focoPor: { stringValue: sala.focoPor || "" },
        jamUrl: { stringValue: sala.jamUrl || "" },
        jamPor: { stringValue: sala.jamPor || "" },
        jamEm: { doubleValue: sala.jamEm || 0 },
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
      atualizadoEm: numero(f.atualizadoEm),
      oculto: !!((f.oculto || {}).booleanValue),
      /* Último sinal de vida de quem está com o cronômetro andando, e
         quantos minutos já tinha corrido quando o sinal saiu. */
      presencaEm: numero(f.presencaEm),
      presencaMin: numero(f.presencaMin),
      total: { minutos: numero(f.minutos), questoes: numero(f.questoes), acertos: numero(f.acertos) },
      /* O dia é o recorte mais curto e o que mais muda: é o que responde
         "quem já começou hoje", que é a pergunta que faz alguém abrir a aba
         de manhã. Vem com a data junto, como os outros, senão o número de
         ontem passaria por número de hoje para quem não abriu o app ainda. */
      dia: {
        chave: texto(f.diaChave),
        minutos: numero(f.diaMinutos),
        questoes: numero(f.diaQuestoes),
        acertos: numero(f.diaAcertos),
      },
      semana: {
        chave: texto(f.semanaChave),
        minutos: numero(f.semanaMinutos),
        questoes: numero(f.semanaQuestoes),
        acertos: numero(f.semanaAcertos),
      },
      mes: {
        chave: texto(f.mesChave),
        minutos: numero(f.mesMinutos),
        questoes: numero(f.mesQuestoes),
        acertos: numero(f.mesAcertos),
      },
    };
  }
  return fora;
}

/* ── recados da sala ──────────────────────────────────────────────────
 *
 * Tudo num documento só, salas/{slug}/mensagens/log, com uma lista das
 * últimas mensagens. Duas pessoas mandando no mesmo instante podem perder
 * uma das duas, porque cada chamada lê a lista e regrava o que leu — é o
 * mesmo acerto já feito na lista de membros, e o preço é digitar de novo.
 */
const CAMINHO_RECADOS = (col, slug) => `${BASE_FIRESTORE}/${col}/${slug}/mensagens/log`;

const mapa = (v) => ((v && v.mapValue) || {}).fields || {};

async function lerRecados(token, col, slug) {
  const r = await fetch(CAMINHO_RECADOS(col, slug), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) return [];                       // 404 é sala sem conversa ainda
  const j = await r.json().catch(() => null);
  const f = (j || {}).fields || {};
  const itens = (((f.itens || {}).arrayValue || {}).values || []).map((v) => {
    const m = mapa(v);
    return {
      uid: texto(m.uid),
      nome: texto(m.nome),
      texto: texto(m.texto),
      em: numero(m.em),
    };
  });
  return itens.filter((x) => x.texto);
}

async function gravarRecados(token, col, slug, itens) {
  const r = await fetch(CAMINHO_RECADOS(col, slug), {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      fields: {
        itens: {
          arrayValue: {
            values: itens.map((x) => ({
              mapValue: {
                fields: {
                  uid: { stringValue: x.uid },
                  nome: { stringValue: x.nome },
                  texto: { stringValue: x.texto },
                  em: { doubleValue: x.em },
                },
              },
            })),
          },
        },
      },
    }),
  });
  return r.ok;
}

/* Apagar a sala não apaga o que está pendurado nela: no Firestore, a
   subcoleção sobrevive ao documento pai e ficaria de herança para a próxima
   sala de mesmo nome. */
async function apagarRecados(token, col, slug) {
  await fetch(CAMINHO_RECADOS(col, slug), {
    method: "DELETE", headers: { Authorization: `Bearer ${token}` },
  }).catch(() => {});
}

/* ── competição de treino ─────────────────────────────────────────────
 *
 * A mesma sala serve para as duas coisas: quem estuda junto costuma ser
 * quem treina junto, e uma segunda sala só para academia seria mais um
 * nome e mais uma senha para combinar.
 *
 * A divisão em dois documentos é por causa da foto. O mural
 * (salas/{slug}/treinos/mural) guarda só o que a lista precisa mostrar —
 * quem, quando, quanto tempo, quantas séries —, e cada foto mora sozinha
 * em salas/{slug}/fotos/{id}. Assim a lista abre leve e a foto só desce
 * quando alguém olha; com tudo junto, trinta treinos com foto estourariam
 * o teto de um megabyte por documento do Firestore, e o mural inteiro
 * deixaria de carregar por causa do último treino postado.
 *
 * A foto fica visível só para quem está na sala: quem lê o mural é a
 * rota, que já sabe quem está pedindo, e o navegador não alcança a
 * coleção direto.
 */
const CAMINHO_MURAL = (col, slug) => `${BASE_FIRESTORE}/${col}/${slug}/treinos/mural`;
const CAMINHO_FOTO = (col, slug, id) => `${BASE_FIRESTORE}/${col}/${slug}/fotos/${id}`;
const MAX_TREINOS = 60;
/* Uma foto de treino reduzida no navegador dá uns 100 KB em base64. O teto
   aqui é folga para foto grande, e barreira para quem tentar mandar um
   arquivo inteiro por aqui: o documento do Firestore não passa de 1 MB. */
const MAX_FOTO_B64 = 700000;

async function lerMural(token, col, slug) {
  const r = await fetch(CAMINHO_MURAL(col, slug), { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) return [];                       // 404 é sala sem treino ainda
  const j = await r.json().catch(() => null);
  const f = (j || {}).fields || {};
  return (((f.itens || {}).arrayValue || {}).values || []).map((v) => {
    const m = mapa(v);
    return {
      id: texto(m.id),
      uid: texto(m.uid),
      nome: texto(m.nome),
      texto: texto(m.texto),
      treino: texto(m.treino),
      minutos: numero(m.minutos),
      series: numero(m.series),
      volume: numero(m.volume),
      temFoto: texto(m.temFoto) === "1",
      dia: texto(m.dia),
      em: numero(m.em),
    };
  }).filter((x) => x.id);
}

async function gravarMural(token, col, slug, itens) {
  const r = await fetch(CAMINHO_MURAL(col, slug), {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      fields: {
        itens: {
          arrayValue: {
            values: itens.map((x) => ({
              mapValue: {
                fields: {
                  id: { stringValue: x.id },
                  uid: { stringValue: x.uid },
                  nome: { stringValue: x.nome },
                  texto: { stringValue: x.texto },
                  treino: { stringValue: x.treino },
                  minutos: { doubleValue: x.minutos },
                  series: { doubleValue: x.series },
                  volume: { doubleValue: x.volume },
                  temFoto: { stringValue: x.temFoto ? "1" : "" },
                  dia: { stringValue: x.dia },
                  em: { doubleValue: x.em },
                },
              },
            })),
          },
        },
      },
    }),
  });
  return r.ok;
}

async function gravarFoto(token, col, slug, id, b64) {
  const r = await fetch(CAMINHO_FOTO(col, slug, id), {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields: { b64: { stringValue: b64 } } }),
  });
  return r.ok;
}

async function lerFoto(token, col, slug, id) {
  const r = await fetch(CAMINHO_FOTO(col, slug, id), { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) return "";
  const j = await r.json().catch(() => null);
  return texto(((j || {}).fields || {}).b64);
}

async function apagarFoto(token, col, slug, id) {
  await fetch(CAMINHO_FOTO(col, slug, id), {
    method: "DELETE", headers: { Authorization: `Bearer ${token}` },
  }).catch(() => {});
}

/* ── simulados da sala ────────────────────────────────────────────────
 *
 * Um documento só, salas/{slug}/simulados/lista, com os simulados da sala
 * e o resultado de cada pessoa dentro de cada um.
 *
 * A regra que dá nome à coisa: só vê o resultado dos outros quem lançou o
 * próprio. E ela vive AQUI, no servidor, não na tela. Esconder no
 * navegador não esconderia nada — bastaria abrir a aba de rede para ler o
 * número de todo mundo. Quem não lançou recebe uma resposta que nem traz
 * os números, e não uma resposta completa com um cadeado desenhado por
 * cima.
 *
 * É uma troca, e é de propósito: sem ela o simulado da sala viraria um
 * lugar onde se observa o desempenho alheio sem expor o próprio.
 */
const CAMINHO_SIMULADOS = (col, slug) => `${BASE_FIRESTORE}/${col}/${slug}/simulados/lista`;
const MAX_SIMULADOS = 40;

async function lerSimulados(token, col, slug) {
  const r = await fetch(CAMINHO_SIMULADOS(col, slug), { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) return [];
  const j = await r.json().catch(() => null);
  const f = (j || {}).fields || {};
  return (((f.itens || {}).arrayValue || {}).values || []).map((v) => {
    const m = mapa(v);
    const res = mapa(m.resultados);
    const resultados = {};
    for (const [uid, val] of Object.entries(res)) {
      const rm = mapa(val);
      resultados[uid] = { acertos: numero(rm.acertos), em: numero(rm.em) };
    }
    return {
      id: texto(m.id),
      nome: texto(m.nome),
      data: texto(m.data),
      total: numero(m.total),
      porQuem: texto(m.porQuem),
      criadoEm: numero(m.criadoEm),
      resultados,
    };
  }).filter((x) => x.id);
}

async function gravarSimulados(token, col, slug, itens) {
  const r = await fetch(CAMINHO_SIMULADOS(col, slug), {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      fields: {
        itens: {
          arrayValue: {
            values: itens.map((x) => ({
              mapValue: {
                fields: {
                  id: { stringValue: x.id },
                  nome: { stringValue: x.nome },
                  data: { stringValue: x.data },
                  total: { doubleValue: x.total },
                  porQuem: { stringValue: x.porQuem },
                  criadoEm: { doubleValue: x.criadoEm },
                  resultados: {
                    mapValue: {
                      fields: Object.entries(x.resultados).reduce((m, [uid, v]) => {
                        m[uid] = {
                          mapValue: {
                            fields: {
                              acertos: { doubleValue: v.acertos },
                              em: { doubleValue: v.em },
                            },
                          },
                        };
                        return m;
                      }, {}),
                    },
                  },
                },
              },
            })),
          },
        },
      },
    }),
  });
  return r.ok;
}

/* Um simulado como a tela precisa dele, para uma pessoa.
 *
 * Quem ainda não lançou recebe só o próprio vazio e quantas pessoas já
 * lançaram — o suficiente para saber que há gente lá, e nada do resultado
 * de ninguém. */
function simuladoParaMim(sim, perfis, eu) {
  const meu = sim.resultados[eu] || null;
  const base = {
    id: sim.id, nome: sim.nome, data: sim.data, total: sim.total,
    porQuem: sim.porQuem, criadoEm: sim.criadoEm,
    quantos: Object.keys(sim.resultados).length,
    meu: meu ? { acertos: meu.acertos, pct: sim.total ? Math.round((meu.acertos / sim.total) * 100) : null } : null,
  };
  if (!meu) return { ...base, liberado: false, linhas: [] };

  const linhas = Object.entries(sim.resultados).map(([uid, v]) => ({
    uid,
    nome: (perfis[uid] && perfis[uid].nome) || "Alguém",
    acertos: v.acertos,
    pct: sim.total ? Math.round((v.acertos / sim.total) * 100) : null,
    souEu: uid === eu,
  })).sort((a, b) => b.acertos - a.acertos);
  let n = 0;
  return { ...base, liberado: true, linhas: linhas.map((x) => ({ ...x, posicao: (n += 1) })) };
}

/* O placar da academia. Conta treino, tempo e séries dos últimos 7 dias,
   que é o recorte em que dá para virar o jogo — igual ao do estudo. */
function placarDeTreino(itens, membros, perfis, eu, desde) {
  const por = new Map();
  for (const uid of membros) {
    por.set(uid, {
      uid,
      nome: (perfis[uid] && perfis[uid].nome) || "Alguém",
      treinos: 0, minutos: 0, series: 0, volume: 0,
      souEu: uid === eu,
    });
  }
  for (const t of itens) {
    if (t.em < desde) continue;
    const linha = por.get(t.uid);
    if (!linha) continue;                      // quem saiu da sala não pontua
    linha.treinos += 1;
    linha.minutos += t.minutos;
    linha.series += t.series;
    linha.volume += t.volume;
  }
  const linhas = [...por.values()].sort((a, b) => b.treinos - a.treinos
    || b.series - a.series || b.minutos - a.minutos);
  let n = 0;
  return linhas.map((x) => ({ ...x, posicao: x.treinos ? (n += 1) : null }));
}

/* ── de que semana e de que mês estamos falando ────────────────────────
 *
 * O recorte precisa ser o mesmo para todo mundo da sala, então quem decide é
 * o servidor, no fuso de quem usa o app. Deixar cada navegador decidir faria
 * duas pessoas compararem semanas diferentes sem perceber. */
const FUSO_APP = "America/Sao_Paulo";

function hojeNoFuso() {
  /* en-CA formata como AAAA-MM-DD, que é o formato usado no app inteiro. */
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO_APP, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

/* Segunda-feira da semana daquela data, igual ao weekStart do app. */
function inicioDaSemana(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

export function recorteAtual(periodo) {
  const hoje = hojeNoFuso();
  if (periodo === "hoje") return { campo: "dia", chave: hoje, rotulo: "hoje" };
  if (periodo === "mes") return { campo: "mes", chave: hoje.slice(0, 7), rotulo: "neste mês" };
  if (periodo === "total") return { campo: "total", chave: null, rotulo: "desde sempre" };
  return { campo: "semana", chave: inicioDaSemana(hoje), rotulo: "nesta semana" };
}

export function montarRanking(sala, perfis, eu, periodo, agora = Date.now()) {
  const recorte = recorteAtual(periodo);
  const doDia = recorteAtual("hoje");

  const linhas = sala.membros.map((uid) => {
    const p = perfis[uid] || {};
    const bloco = p[recorte.campo] || {};
    /* Quem escolheu não mostrar continua na sala, sem números. Eles nem
       chegam aqui: o app dessa pessoa grava zerado. */
    const escondido = !!p.oculto;

    /* Números de outra semana não valem para esta. Acontece com quem estudou
       muito e não abriu o app desde então: sem esta conferência, essa pessoa
       lideraria a semana atual com o resultado da anterior. */
    const vale = !escondido && (recorte.chave === null || bloco.chave === recorte.chave);

    const questoes = vale ? Math.max(0, Math.round(bloco.questoes || 0)) : 0;
    const acertos = vale ? Math.min(questoes, Math.max(0, Math.round(bloco.acertos || 0))) : 0;

    /* Estudando agora.
     *
     * O sinal só vale por um tempo curto: quem fecha a aba não avisa. E os
     * minutos em andamento ficam de fora do ranking de propósito — eles
     * entram quando a sessão é lançada, e somar aqui contaria duas vezes o
     * mesmo tempo enquanto o cronômetro anda. */
    const vivo = !escondido && !!p.presencaEm
      && (agora - p.presencaEm) >= 0 && (agora - p.presencaEm) < VALIDADE_PRESENCA;
    const agoraMin = vivo
      ? Math.max(0, Math.round((p.presencaMin || 0) + (agora - p.presencaEm) / 60000))
      : 0;

    /* O dia vai junto em qualquer recorte: na tela ele aparece ao lado do
       número da semana, para dar de olho quem já estudou hoje sem trocar de
       aba. Quando o recorte escolhido já é o dia, é o mesmo número. */
    const hoje = (p.dia || {}).chave === doDia.chave && !escondido
      ? {
        minutos: Math.max(0, Math.round(p.dia.minutos || 0)),
        questoes: Math.max(0, Math.round(p.dia.questoes || 0)),
      }
      : { minutos: 0, questoes: 0 };

    return {
      uid,
      nome: p.nome || "sem nome",
      /* Horas líquidas: só o tempo lançado em sessão, sem contar pausa. */
      minutos: vale ? Math.max(0, Math.round(bloco.minutos || 0)) : 0,
      hoje,
      questoes,
      acertos,
      pct: questoes ? Math.round((acertos / questoes) * 100) : null,
      atualizadoEm: p.atualizadoEm || 0,
      /* Diferencia "não estudou" de "não abriu o app no recorte", que na tela
         são coisas bem diferentes. */
      oculto: escondido,
      foraDoRecorte: !escondido && !vale && !!p.atualizadoEm,
      estudando: vivo,
      agoraMin,
      souEu: uid === eu,
      dono: uid === sala.dono,
    };
  });

  /* Quem não mostra fica no fim, e sem posição: aparecer em último com
     zero horas seria expor uma escolha de privacidade como se fosse
     desempenho ruim. */
  linhas.sort((a, b) => (a.oculto ? 1 : 0) - (b.oculto ? 1 : 0)
    || b.minutos - a.minutos || b.questoes - a.questoes);
  let n = 0;
  return {
    recorte,
    linhas: linhas.map((x) => ({ ...x, posicao: x.oculto ? null : (n += 1) })),
  };
}

/* O foco em conjunto como a tela precisa dele: quanto falta, em segundos.
   Vencido é o mesmo que não existir — assim ninguém precisa desligar. */
function focoDaSala(sala) {
  const fim = (sala.focoInicio || 0) + (sala.focoMin || 0) * 60000;
  const resta = fim - Date.now();
  if (!sala.focoInicio || !sala.focoMin || resta <= 0) return null;
  return {
    por: sala.focoPor || "", minutos: sala.focoMin,
    inicio: sala.focoInicio, restaSeg: Math.ceil(resta / 1000),
  };
}

/* Só endereço do próprio Spotify. Sem isto, o campo viraria um jeito de
   mandar qualquer link para a sala inteira de uma vez. */
function ehLinkDoSpotify(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    return u.hostname === "open.spotify.com" || u.hostname === "spotify.link"
      || u.hostname === "www.spotify.link";
  } catch (e) { return false; }
}

function jamDaSala(sala) {
  if (!sala.jamUrl) return null;
  return { url: sala.jamUrl, por: sala.jamPor || "", em: sala.jamEm || 0 };
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

  /* Em qual família de sala esta chamada mexe: estudo (padrão) ou treino.
     Vem do pedido porque as duas telas são diferentes e cada uma sabe da
     sua; o servidor não tem como adivinhar, e errar aqui faria a aba de
     treino escrever no mural do estudo. */
  const col = COLECAO(corpo.tipo);

  /* ── as salas de quem está pedindo ─────────────────────────────────── */
  if (acao === "minhas") {
    const r = await fetch(`${BASE_FIRESTORE}:runQuery`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: col }],
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

    if (await lerSala(token, col, slug)) {
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
    if (!await gravarSala(token, col, sala)) return json({ erro: "Não consegui criar a sala." }, 500);
    return json({ ok: true, slug, nome: sala.nome, mensagem: `Sala "${sala.nome}" criada.` });
  }

  const sala = await lerSala(token, col, slug);
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
      if (!await gravarSala(token, col, sala)) return json({ erro: "Não consegui entrar." }, 500);
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
      await apagarRecados(token, col, slug);
      /* O mural e as fotos são subcoleções: sobrevivem ao documento da
         sala e ficariam de herança para a próxima sala de mesmo nome. */
      for (const t of await lerMural(token, col, slug)) {
        if (t.temFoto) await apagarFoto(token, col, slug, t.id);
      }
      await fetch(CAMINHO_MURAL(col, slug), {
        method: "DELETE", headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
      await fetch(CAMINHO_SIMULADOS(col, slug), {
        method: "DELETE", headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
      await fetch(`${BASE_FIRESTORE}/${col}/${slug}`, {
        method: "DELETE", headers: { Authorization: `Bearer ${token}` },
      });
      return json({ ok: true, mensagem: "Você saiu, e a sala foi encerrada por ficar vazia." });
    }
    /* Quem criou a sala saiu: a pessoa mais antiga que ficou assume, senão
       ninguém consegue mais encerrar a sala. */
    if (sala.dono === pessoa.uid) sala.dono = sala.membros[0];
    if (!await gravarSala(token, col, sala)) return json({ erro: "Não consegui sair." }, 500);
    return json({ ok: true, mensagem: `Você saiu de "${sala.nome}".` });
  }

  /* ── estudar juntos ────────────────────────────────────────────────
   *
   * Um cronômetro só, combinado pela sala: quem entra vê quanto falta e
   * começa o próprio Foco no mesmo instante. Só isso, e de propósito: o
   * que faz estudar junto funcionar é começar e parar na mesma hora, não
   * uma chamada de vídeo.
   *
   * Termina sozinho quando o tempo acaba — o navegador compara a hora, e
   * ninguém precisa "desligar". É o mesmo motivo de a presença ter hora
   * em vez de um aviso de saída: fechar a aba não avisa ninguém. */
  if (acao === "focar") {
    const minutos = Math.round(Number(corpo.minutos) || 0);
    /* Até doze horas. O teto existe para o número não virar absurdo (um
       relógio de mil horas fica na sala para sempre), mas quem quer marcar
       um domingo inteiro de estudo consegue. */
    if (minutos && (minutos < 5 || minutos > 720)) {
      return json({ erro: "O foco em conjunto vai de 5 minutos a 12 horas." }, 400);
    }
    /* O nome vem do perfil, não do pedido: aceitar o nome que o navegador
       manda deixaria qualquer pessoa da sala assinar como outra. */
    const meu = (await perfisDe(token, [pessoa.uid]))[pessoa.uid] || {};
    sala.focoInicio = minutos ? Date.now() : 0;
    sala.focoMin = minutos;
    sala.focoPor = minutos ? String(meu.nome || "").slice(0, 40) : "";
    if (!await gravarSala(token, col, sala)) return json({ erro: "Não consegui combinar o foco agora." }, 502);
    return json({ ok: true, foco: focoDaSala(sala) });
  }

  /* ── a Jam do Spotify ──────────────────────────────────────────────
   *
   * O site NÃO cria Jam: o Spotify não tem API pública para isso. Quem
   * cria é o app do Spotify, no aparelho de quem começou; aqui mora só o
   * link, para a sala inteira abrir o mesmo. Guardar outro endereço
   * qualquer aqui viraria um jeito de mandar link para a sala toda, então
   * só passa endereço do próprio Spotify. */
  if (acao === "jam") {
    const url = String(corpo.url || "").trim().slice(0, 300);
    if (url && !ehLinkDoSpotify(url)) {
      return json({ erro: "Cole um link do Spotify (open.spotify.com ou spotify.link)." }, 400);
    }
    const meu = (await perfisDe(token, [pessoa.uid]))[pessoa.uid] || {};
    sala.jamUrl = url;
    sala.jamPor = url ? String(meu.nome || "").slice(0, 40) : "";
    sala.jamEm = url ? Date.now() : 0;
    if (!await gravarSala(token, col, sala)) return json({ erro: "Não consegui guardar o link agora." }, 502);
    return json({ ok: true, jam: jamDaSala(sala) });
  }

  /* ── competição de treino ──────────────────────────────────────────
   *
   * Postar é o que pontua, e é isso que faz o placar funcionar: ninguém
   * consegue somar treino sem dizer para a sala que treinou. Os números
   * (tempo, séries, volume) vêm do que o app registrou no aparelho, então
   * são conferíveis por quem os leu; a foto é a prova social, como no
   * GymRats, e não entra em conta nenhuma.
   */
  if (acao === "treino-postar") {
    const meu = (await perfisDe(token, [pessoa.uid]))[pessoa.uid] || {};
    const foto = String(corpo.foto || "");
    if (foto.length > MAX_FOTO_B64) {
      return json({ erro: "Essa foto ficou grande demais. Tente de novo com uma foto menor." }, 400);
    }
    const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const item = {
      id,
      uid: pessoa.uid,
      nome: String(meu.nome || "").slice(0, 40),
      texto: String(corpo.texto || "").replace(/\s+/g, " ").trim().slice(0, 200),
      treino: String(corpo.treino || "").replace(/\s+/g, " ").trim().slice(0, 40),
      minutos: Math.max(0, Math.min(600, Math.round(Number(corpo.minutos) || 0))),
      series: Math.max(0, Math.min(400, Math.round(Number(corpo.series) || 0))),
      volume: Math.max(0, Math.min(500000, Math.round(Number(corpo.volume) || 0))),
      temFoto: !!foto,
      dia: hojeNoFuso(),
      em: Date.now(),
    };
    /* A foto vai primeiro: se ela falhar, o mural não fica com um treino
       que promete foto e não tem. */
    if (foto && !await gravarFoto(token, col, slug, id, foto)) {
      return json({ erro: "Não consegui guardar a foto agora." }, 502);
    }
    const antes = await lerMural(token, col, slug);
    const depois = [...antes, item].slice(-MAX_TREINOS);
    /* O mural guarda os últimos, e a foto do que saiu vai junto: senão a
       coleção de fotos cresceria para sempre, invisível. */
    for (const velho of antes.slice(0, Math.max(0, antes.length + 1 - MAX_TREINOS))) {
      if (velho.temFoto) await apagarFoto(token, col, slug, velho.id);
    }
    if (!await gravarMural(token, col, slug, depois)) {
      if (foto) await apagarFoto(token, col, slug, id);
      return json({ erro: "Não consegui postar o treino agora." }, 502);
    }
    return json({ ok: true, treino: item });
  }

  if (acao === "treino-mural") {
    const itens = await lerMural(token, col, slug);
    const perfis = await perfisDe(token, sala.membros);
    const desde = Date.now() - 7 * 86400000;
    return json({
      ok: true,
      mural: itens.slice().reverse(),
      placar: placarDeTreino(itens, sala.membros, perfis, pessoa.uid, desde),
    });
  }

  /* A foto desce sozinha, uma por vez: é o que mantém o mural leve. */
  if (acao === "treino-foto") {
    const id = String(corpo.id || "").slice(0, 40);
    if (!id) return json({ erro: "Faltou dizer qual treino." }, 400);
    return json({ ok: true, foto: await lerFoto(token, col, slug, id) });
  }

  if (acao === "treino-apagar") {
    const id = String(corpo.id || "").slice(0, 40);
    const itens = await lerMural(token, col, slug);
    const alvo = itens.find((x) => x.id === id);
    if (!alvo) return json({ erro: "Esse treino já não está no mural." }, 404);
    /* Só quem postou, ou quem criou a sala. Deixar qualquer pessoa apagar
       treino dos outros transformaria o mural em briga. */
    if (alvo.uid !== pessoa.uid && sala.dono !== pessoa.uid) {
      return json({ erro: "Só quem postou pode apagar." }, 403);
    }
    if (alvo.temFoto) await apagarFoto(token, col, slug, id);
    if (!await gravarMural(token, col, slug, itens.filter((x) => x.id !== id))) {
      return json({ erro: "Não consegui apagar agora." }, 502);
    }
    return json({ ok: true });
  }

  /* ── simulados da sala ─────────────────────────────────────────────
   *
   * Só vê o resultado dos outros quem lançou o próprio, e quem decide isso
   * é esta rota. Filtrar na tela não filtraria nada: o número já teria
   * chegado ao navegador.
   */
  if (acao === "sim-listar") {
    const itens = await lerSimulados(token, col, slug);
    const perfis = await perfisDe(token, sala.membros);
    return json({
      ok: true,
      simulados: itens
        .slice()
        .sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : b.criadoEm - a.criadoEm))
        .map((x) => simuladoParaMim(x, perfis, pessoa.uid)),
    });
  }

  if (acao === "sim-criar") {
    /* "titulo", e não "nome": corpo.nome já é o nome da sala em toda esta
       rota, e reaproveitar a chave trocaria um pelo outro em silêncio. */
    const nome = String(corpo.titulo || "").replace(/\s+/g, " ").trim().slice(0, 60);
    const total = Math.round(Number(corpo.total) || 0);
    if (!nome) return json({ erro: "Dê um nome ao simulado." }, 400);
    if (!(total >= 1 && total <= 500)) return json({ erro: "Quantas questões tinha o simulado? (1 a 500)" }, 400);
    const itens = await lerSimulados(token, col, slug);
    if (itens.length >= MAX_SIMULADOS) {
      return json({ erro: `A sala já tem ${MAX_SIMULADOS} simulados. Apague algum antes de criar outro.` }, 400);
    }
    const meu = (await perfisDe(token, [pessoa.uid]))[pessoa.uid] || {};
    const novo = {
      id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
      nome,
      data: String(corpo.data || "").slice(0, 10) || hojeNoFuso(),
      total,
      porQuem: String(meu.nome || "").slice(0, 40),
      criadoEm: Date.now(),
      resultados: {},
    };
    if (!await gravarSimulados(token, col, slug, [...itens, novo])) {
      return json({ erro: "Não consegui criar o simulado agora." }, 502);
    }
    return json({ ok: true, id: novo.id });
  }

  if (acao === "sim-lancar") {
    const id = String(corpo.id || "").slice(0, 40);
    const itens = await lerSimulados(token, col, slug);
    const alvo = itens.find((x) => x.id === id);
    if (!alvo) return json({ erro: "Esse simulado não está mais na sala." }, 404);
    const acertos = Math.round(Number(corpo.acertos));
    if (!(acertos >= 0 && acertos <= alvo.total)) {
      return json({ erro: `Os acertos vão de 0 a ${alvo.total}.` }, 400);
    }
    alvo.resultados[pessoa.uid] = { acertos, em: Date.now() };
    if (!await gravarSimulados(token, col, slug, itens)) {
      return json({ erro: "Não consegui lançar o resultado agora." }, 502);
    }
    const perfis = await perfisDe(token, sala.membros);
    return json({ ok: true, simulado: simuladoParaMim(alvo, perfis, pessoa.uid) });
  }

  if (acao === "sim-apagar") {
    const id = String(corpo.id || "").slice(0, 40);
    const itens = await lerSimulados(token, col, slug);
    const alvo = itens.find((x) => x.id === id);
    if (!alvo) return json({ erro: "Esse simulado já não está na sala." }, 404);
    /* Apagar um simulado apaga o resultado de todo mundo junto, então só
       quem criou a sala pode. Deixar qualquer pessoa apagar o placar em que
       está perdendo seria o fim da graça. */
    if (sala.dono !== pessoa.uid) {
      return json({ erro: "Só quem criou a sala pode apagar um simulado." }, 403);
    }
    if (!await gravarSimulados(token, col, slug, itens.filter((x) => x.id !== id))) {
      return json({ erro: "Não consegui apagar agora." }, 502);
    }
    return json({ ok: true });
  }

  /* ── ranking ───────────────────────────────────────────────────────── */
  if (acao === "ranking") {
    const perfis = await perfisDe(token, sala.membros);
    const { recorte, linhas } = montarRanking(sala, perfis, pessoa.uid, corpo.periodo);
    return json({
      ok: true,
      sala: {
        slug, nome: sala.nome, souDono: sala.dono === pessoa.uid,
        periodo: recorte.campo, rotulo: recorte.rotulo,
      },
      ranking: linhas,
      foco: focoDaSala(sala),
      jam: jamDaSala(sala),
    });
  }

  /* ── recados ───────────────────────────────────────────────────────── */
  if (acao === "recados") {
    return json({ ok: true, recados: await lerRecados(token, col, slug) });
  }

  if (acao === "dizer") {
    /* Uma linha só: quebra de linha aqui é espaço, senão uma mensagem
       esticada empurra a conversa inteira para fora da tela. */
    const escrito = String(corpo.texto || "").replace(/\s+/g, " ").trim().slice(0, MAX_LETRAS);
    if (!escrito) return json({ erro: "Escreva alguma coisa antes de mandar." }, 400);

    /* O nome vem do perfil, não do pedido: aceitar o nome que o navegador
       manda deixaria qualquer pessoa da sala assinar como outra. */
    const meu = (await perfisDe(token, [pessoa.uid]))[pessoa.uid] || {};

    const antes = await lerRecados(token, col, slug);
    const itens = [...antes, {
      uid: pessoa.uid,
      nome: (meu.nome || "sem nome").slice(0, 40),
      texto: escrito,
      em: Date.now(),
    }].slice(-MAX_MENSAGENS);

    if (!await gravarRecados(token, col, slug, itens)) {
      return json({ erro: "Não consegui mandar sua mensagem." }, 500);
    }
    return json({ ok: true, recados: itens });
  }

  return json({ erro: "Ação desconhecida." }, 400);
}

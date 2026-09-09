/* Aba Mentor · rota /api/mentor
 *
 * Quem vira mentor resgata o cupom "mentor1612" (ou é dono, via DONOS, em
 * _comum.js) — isso é conferido em cupom.js, que grava mentores/{uid}. Aqui
 * só entra quem já tem esse papel.
 *
 * O mentor conhece os alunos pelo e-mail com que eles se cadastraram, nunca
 * pelo uid. A ligação usa a mesma coleção emails/{uid} que o aviso de
 * compra já usa para achar quem pagou (uidPeloEmail, em _comum.js).
 *
 * Os dados de estudo de cada pessoa moram inteiros num campo só,
 * usuarios/{uid}.dados, como texto JSON (é o mesmo formato que o
 * localStorage do navegador) — só existe para quem tem o plano pago com a
 * nuvem ligada (useNuvem, no parte3.jsx). O mentor lê e grava esse texto
 * inteiro pela conta de serviço, a mesma usada em toda rota deste servidor,
 * porque as regras do Firestore não deixam ninguém ler o documento de
 * outra pessoa. Cada ação confere antes que o aluno pedido está mesmo na
 * lista deste mentor — sem isso bastaria saber o uid de alguém para
 * mexer nos dados dela.
 *
 * Gravar de novo o documento inteiro (e não só os campos mudados) casa com
 * o resto do app: o navegador do aluno, se estiver com a aba aberta, ouve
 * esse mesmo documento (onSnapshot) e aplica a mudança na hora — é o mesmo
 * caminho que já existe para sincronizar entre aparelhos, só que a
 * gravação agora pode vir do mentor em vez do próprio aluno.
 */
import {
  json, corpoJson, quemPede, contaDeServico, tokenDeAcesso, uidPeloEmail,
  ehDono, BASE_FIRESTORE,
} from "./_comum.js";

const MAX_ALUNOS = 60;

/* Mesma lista de fonte/base.jsx (BLOCK_IDS). Duplicada aqui porque o
   servidor não carrega o app do navegador — mudar uma exige mudar a
   outra, e são raras. */
const TIPOS_BLOCO = ["Plantão", "Enfermaria", "Aula", "Estudo", "Questões", "Descanso", "Pessoal"];

const hoje = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

const texto = (v) => (v && v.stringValue) || "";
const numero = (v) => Number((v && (v.doubleValue || v.integerValue)) || 0);
const mapa = (v) => ((v && v.mapValue) || {}).fields || {};

async function lerMentor(token, uid) {
  const r = await fetch(`${BASE_FIRESTORE}/mentores/${uid}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) return null;
  const j = await r.json().catch(() => null);
  const f = (j || {}).fields || {};
  const alunos = (((f.alunos || {}).arrayValue || {}).values || []).map((v) => {
    const m = mapa(v);
    return { uid: texto(m.uid), email: texto(m.email), adicionadoEm: numero(m.adicionadoEm) };
  });
  return { email: texto(f.email), desde: numero(f.desde), alunos };
}

function gravarMentor(token, uid, mentor) {
  return fetch(`${BASE_FIRESTORE}/mentores/${uid}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      fields: {
        email: { stringValue: mentor.email },
        desde: { doubleValue: mentor.desde },
        alunos: {
          arrayValue: {
            values: mentor.alunos.map((a) => ({
              mapValue: {
                fields: {
                  uid: { stringValue: a.uid },
                  email: { stringValue: a.email },
                  adicionadoEm: { doubleValue: a.adicionadoEm },
                },
              },
            })),
          },
        },
      },
    }),
  }).then((r) => r.ok);
}

/* Confere quem pediu já é mentor. O dono ganha na hora, mesmo sem ter
   resgatado o cupom — e se ainda não tem o documento, cria um vazio, para
   sempre haver onde gravar a lista de alunos. */
async function garantirMentor(token, pessoa) {
  const atual = await lerMentor(token, pessoa.uid);
  if (atual) return atual;
  if (!ehDono(pessoa.email)) return null;
  const novo = { email: pessoa.email, desde: Date.now(), alunos: [] };
  await gravarMentor(token, pessoa.uid, novo);
  return novo;
}

async function lerDadosAluno(token, uid) {
  const r = await fetch(`${BASE_FIRESTORE}/usuarios/${uid}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) return null;
  const j = await r.json().catch(() => null);
  const bruto = texto(((j || {}).fields || {}).dados);
  if (!bruto) return null;
  try { return JSON.parse(bruto); } catch (e) { return null; }
}

function gravarDadosAluno(token, uid, dados) {
  return fetch(`${BASE_FIRESTORE}/usuarios/${uid}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      fields: {
        dados: { stringValue: JSON.stringify(dados) },
        atualizadoEm: { doubleValue: Date.now() },
        /* Nunca igual ao id de aparelho de ninguém (parte3.jsx, idDispositivo):
           é o que faz o navegador do aluno, se estiver com a aba aberta,
           aceitar esta gravação em vez de ignorá-la por achar que foi ele
           mesmo quem gravou. */
        dispositivo: { stringValue: "mentor" },
      },
    }),
  }).then((r) => r.ok);
}

export async function onRequest({ request, env }) {
  if (request.method !== "POST") return json({ erro: "Método não permitido." }, 405);

  if (!env.FIREBASE_API_KEY || !env.FIREBASE_SERVICE_ACCOUNT) {
    return json({ erro: "Faltam FIREBASE_API_KEY ou FIREBASE_SERVICE_ACCOUNT nas variáveis do site." }, 500);
  }

  const corpo = await corpoJson(request);
  if (!corpo) return json({ erro: "Pedido inválido." }, 400);

  const pessoa = await quemPede(corpo.token, env.FIREBASE_API_KEY);
  if (!pessoa) return json({ erro: "Entre na sua conta para usar a aba Mentor." }, 401);

  const conta = contaDeServico(env);
  if (!conta) return json({ erro: "Conta de serviço inválida." }, 500);

  let token;
  try { token = await tokenDeAcesso(conta); }
  catch (e) { return json({ erro: "Não consegui autenticar no banco." }, 500); }

  const acao = String(corpo.acao || "status");

  if (acao === "status") {
    const mentor = await garantirMentor(token, pessoa);
    return json({ ok: true, mentor: !!mentor, alunos: mentor ? mentor.alunos : [] });
  }

  const mentor = await garantirMentor(token, pessoa);
  if (!mentor) return json({ erro: "Sua conta não tem o papel de mentor." }, 403);

  /* ── adicionar e remover aluno ─────────────────────────────────────── */
  if (acao === "adicionar") {
    const email = String(corpo.email || "").trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ erro: "Escreva um e-mail válido." }, 400);
    }
    if (email === pessoa.email) return json({ erro: "Você não pode se adicionar como seu próprio aluno." }, 400);
    if (mentor.alunos.some((a) => a.email === email)) {
      return json({ erro: "Esse aluno já está na sua lista." }, 409);
    }
    if (mentor.alunos.length >= MAX_ALUNOS) {
      return json({ erro: `Você já tem ${MAX_ALUNOS} alunos, que é o limite.` }, 409);
    }
    const alunoUid = await uidPeloEmail(token, email);
    if (!alunoUid) {
      return json({
        erro: "Não achei conta com esse e-mail. A pessoa precisa ter se cadastrado no Cadência antes de ser adicionada.",
      }, 404);
    }
    mentor.alunos = [...mentor.alunos, { uid: alunoUid, email, adicionadoEm: Date.now() }];
    if (!await gravarMentor(token, pessoa.uid, mentor)) return json({ erro: "Não consegui adicionar." }, 500);
    return json({ ok: true, alunos: mentor.alunos, mensagem: `${email} adicionado(a) à sua lista.` });
  }

  if (acao === "remover") {
    const uidAlvo = String(corpo.uid || "");
    mentor.alunos = mentor.alunos.filter((a) => a.uid !== uidAlvo);
    if (!await gravarMentor(token, pessoa.uid, mentor)) return json({ erro: "Não consegui remover." }, 500);
    return json({ ok: true, alunos: mentor.alunos });
  }

  /* Daqui para baixo, toda ação mexe com um aluno específico — conferir que
     ele está na lista deste mentor é o que impede ler ou mudar dados de
     quem não é aluno dele. */
  const uidAlvo = String(corpo.uid || "");
  const aluno = mentor.alunos.find((a) => a.uid === uidAlvo);
  if (!aluno) return json({ erro: "Esse aluno não está na sua lista." }, 403);

  if (acao === "aluno") {
    const dados = await lerDadosAluno(token, uidAlvo);
    if (!dados) {
      return json({
        ok: true, encontrado: false,
        mensagem: "Esse aluno ainda não tem dados na nuvem. Peça para ele assinar o plano e abrir o app pelo menos uma vez.",
      });
    }
    return json({
      ok: true, encontrado: true,
      aluno: {
        nome: (dados.profile && dados.profile.name) || "",
        examDate: (dados.profile && dados.profile.examDate) || "",
        marks: dados.marks || {},
        routine: dados.routine || [],
        tasks: dados.tasks || [],
        sessions: (dados.sessions || []).slice(0, 200),
      },
    });
  }

  if (acao === "rotina") {
    const lista = Array.isArray(corpo.rotina) ? corpo.rotina : null;
    if (!lista || lista.length > 200) return json({ erro: "Rotina inválida." }, 400);
    const limpa = lista.map((b) => ({
      id: String((b && b.id) || "").slice(0, 40) || `m${Math.random().toString(36).slice(2, 10)}`,
      day: Math.min(6, Math.max(0, Math.floor(Number(b && b.day) || 0))),
      label: String((b && b.label) || "").slice(0, 60),
      type: TIPOS_BLOCO.indexOf(b && b.type) >= 0 ? b.type : "Estudo",
      start: /^\d{2}:\d{2}$/.test((b && b.start) || "") ? b.start : "07:00",
      end: /^\d{2}:\d{2}$/.test((b && b.end) || "") ? b.end : "08:00",
    }));
    const dados = await lerDadosAluno(token, uidAlvo);
    if (!dados) return json({ erro: "Esse aluno ainda não tem dados na nuvem." }, 404);
    dados.routine = limpa;
    if (!await gravarDadosAluno(token, uidAlvo, dados)) return json({ erro: "Não consegui salvar a rotina." }, 500);
    return json({ ok: true, mensagem: "Rotina do aluno atualizada." });
  }

  if (acao === "tarefas") {
    const lista = Array.isArray(corpo.tarefas) ? corpo.tarefas : null;
    if (!lista || lista.length > 300) return json({ erro: "Lista de metas inválida." }, 400);
    const limpa = lista
      .map((t) => ({
        id: String((t && t.id) || "").slice(0, 40) || `m${Math.random().toString(36).slice(2, 10)}`,
        text: String((t && t.text) || "").slice(0, 200),
        done: !!(t && t.done),
      }))
      .filter((t) => t.text);
    const dados = await lerDadosAluno(token, uidAlvo);
    if (!dados) return json({ erro: "Esse aluno ainda não tem dados na nuvem." }, 404);
    dados.tasks = limpa;
    if (!await gravarDadosAluno(token, uidAlvo, dados)) return json({ erro: "Não consegui salvar as metas." }, 500);
    return json({ ok: true, mensagem: "Metas do aluno atualizadas." });
  }

  if (acao === "marcar") {
    const materiaId = String(corpo.materiaId || "");
    if (!materiaId) return json({ erro: "Falta dizer qual matéria." }, 400);
    const feito = !!corpo.feito;
    const dados = await lerDadosAluno(token, uidAlvo);
    if (!dados) return json({ erro: "Esse aluno ainda não tem dados na nuvem." }, 404);
    const marks = { ...(dados.marks || {}) };
    const atual = marks[materiaId] || {};
    marks[materiaId] = { ...atual, aula: feito, date: feito && !atual.date ? hoje() : atual.date };
    dados.marks = marks;
    if (!await gravarDadosAluno(token, uidAlvo, dados)) return json({ erro: "Não consegui salvar." }, 500);
    return json({ ok: true, mensagem: "Currículo do aluno atualizado." });
  }

  return json({ erro: "Ação desconhecida." }, 400);
}

/* Olha o histórico dos dados de uma conta no banco, e traz uma versão de volta.
 *
 * O Firestore guarda 7 dias de histórico (PITR, ligado pelo fluxo
 * firestore.yml). Este script lê o documento usuarios/{uid} como ele estava
 * em vários momentos dessa semana e imprime só um resumo de cada um: quando
 * foi gravado, por qual aparelho, quantas aulas, sessões, horas, questões e
 * cartões tinha. Nunca imprime o conteúdo.
 *
 * Com QUANDO definido (um instante em minuto cheio, ex. 2026-10-27T12:00:00Z),
 * grava a versão daquele momento de volta no documento, depois de guardar a
 * atual em usuarios/{uid}/copias/{instante}, para dar para desfazer.
 *
 * Roda no GitHub Actions (recuperar-dados.yml), com a conta de serviço.
 *
 *   TOKEN=... EMAIL=quem@email.com node recuperar-dados.mjs
 *   TOKEN=... EMAIL=quem@email.com QUANDO=2026-10-27T12:00:00Z node recuperar-dados.mjs
 */
const PROJETO = process.env.PROJETO || "cadencia-7c1f1";
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJETO}/databases/(default)/documents`;
const TOKEN = process.env.TOKEN;
const EMAIL = String(process.env.EMAIL || "").toLowerCase().trim();
const QUANDO = String(process.env.QUANDO || "").trim();
if (!TOKEN || !EMAIL) { console.error("Faltam TOKEN e EMAIL."); process.exit(2); }

const cab = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };
const MIN = 60000;

async function uidPeloEmail(email) {
  const r = await fetch(`${BASE}:runQuery`, {
    method: "POST", headers: cab,
    body: JSON.stringify({ structuredQuery: {
      from: [{ collectionId: "emails" }],
      where: { fieldFilter: { field: { fieldPath: "email" }, op: "EQUAL", value: { stringValue: email } } },
      limit: 1,
    } }),
  });
  if (!r.ok) throw new Error(`emails: HTTP ${r.status} ${await r.text()}`);
  const doc = (await r.json()).find((x) => x.document);
  return doc ? doc.document.name.split("/").pop() : null;
}

const texto = (v) => (v && v.stringValue) || "";
const numero = (v) => Number((v && (v.doubleValue || v.integerValue)) || 0);

async function lerEm(uid, quando) {
  const q = quando ? `?readTime=${encodeURIComponent(quando)}` : "";
  const r = await fetch(`${BASE}/usuarios/${uid}${q}`, { headers: cab });
  if (r.status === 404) return { existe: false };
  if (!r.ok) return { erro: `HTTP ${r.status} ${(await r.text()).slice(0, 200)}` };
  const f = ((await r.json()).fields) || {};
  return { existe: true, dados: texto(f.dados), atualizadoEm: numero(f.atualizadoEm), dispositivo: texto(f.dispositivo) };
}

/* O mesmo resumo que o app mostra na lista de versões (resumirDados). */
function resumir(dados) {
  let d;
  try { d = JSON.parse(dados); } catch (e) { return { ilegivel: true }; }
  const sessoes = (d && d.sessions) || [];
  const ultima = sessoes.map((s) => String(s.date || s.dia || "")).filter(Boolean).sort().pop() || "";
  return {
    aulas: Object.values((d && d.marks) || {}).filter((m) => m && m.aula).length,
    revisoes: Object.values((d && d.reviews) || {}).reduce((a, r) => a + Object.keys((r && r.done) || {}).length, 0),
    sessoes: sessoes.length,
    horas: Math.round(sessoes.reduce((a, x) => a + (Number(x.minutes) || 0), 0) / 60),
    questoes: sessoes.reduce((a, x) => a + (Number(x.questions) || 0), 0),
    cartoes: ((d && d.flash) || []).length,
    ultimaSessao: ultima,
    mentoriaPlano: !!(d && d.mentoria && d.mentoria.plano),
  };
}

const iso = (ms) => (ms ? new Date(ms).toISOString().replace(/\.\d+Z$/, "Z") : "-");
const minutoCheio = (ms) => new Date(Math.floor(ms / MIN) * MIN).toISOString().replace(/\.\d+Z$/, "Z");

function linha(rotulo, v) {
  if (v.erro) return `${rotulo}  ERRO ${v.erro}`;
  if (!v.existe) return `${rotulo}  (documento não existia)`;
  const r = resumir(v.dados);
  if (r.ilegivel) return `${rotulo}  gravado ${iso(v.atualizadoEm)}  ${v.dados.length} bytes  (JSON ilegível)`;
  return `${rotulo}  gravado ${iso(v.atualizadoEm)}  aparelho ${v.dispositivo.slice(0, 6) || "-"}  ${Math.round(v.dados.length / 1024)} KB  `
    + `aulas ${r.aulas}  revisões ${r.revisoes}  sessões ${r.sessoes} (${r.horas}h)  questões ${r.questoes}  cartões ${r.cartoes}  `
    + `última sessão ${r.ultimaSessao || "-"}  mentoria ${r.mentoriaPlano ? "sim" : "não"}`;
}

const uid = await uidPeloEmail(EMAIL);
if (!uid) { console.error(`Não achei conta para ${EMAIL} na coleção emails.`); process.exit(1); }
console.log(`Conta ${EMAIL} → uid ${uid}\n`);

const agora = Date.now();
const atual = await lerEm(uid, "");
console.log(linha("AGORA               ", atual));

/* De 2 em 2 horas nas últimas 24h, depois de 6 em 6 até 7 dias. */
const passos = [];
for (let h = 2; h <= 24; h += 2) passos.push(h);
for (let h = 30; h <= 166; h += 6) passos.push(h);
for (const h of passos) {
  const q = minutoCheio(agora - h * 3600000);
  // eslint-disable-next-line no-await-in-loop
  const v = await lerEm(uid, q);
  console.log(linha(`${String(h).padStart(3)}h atrás ${q}`, v));
}

if (!QUANDO) { console.log("\nSó leitura. Para trazer uma versão de volta, rode de novo com QUANDO=<instante>."); process.exit(0); }

const alvo = await lerEm(uid, QUANDO);
if (!alvo.existe || alvo.erro) { console.error(`Não consegui ler a versão de ${QUANDO}: ${alvo.erro || "não existia"}`); process.exit(1); }
console.log(`\nVoltando para ${QUANDO}:\n${linha("ESCOLHIDA           ", alvo)}`);

/* Guarda a atual antes de escrever por cima. */
if (atual.existe) {
  const copia = minutoCheio(agora).replace(/[:]/g, "-");
  const r = await fetch(`${BASE}/usuarios/${uid}/copias/${copia}`, {
    method: "PATCH", headers: cab,
    body: JSON.stringify({ fields: {
      dados: { stringValue: atual.dados },
      atualizadoEm: { doubleValue: atual.atualizadoEm },
      dispositivo: { stringValue: atual.dispositivo },
      motivo: { stringValue: `antes de voltar para ${QUANDO}` },
      guardadoEm: { doubleValue: agora },
    } }),
  });
  if (!r.ok) { console.error(`Não consegui guardar a cópia da versão atual: HTTP ${r.status}`); process.exit(1); }
  console.log(`Versão atual guardada em usuarios/${uid}/copias/${copia}`);
}

const r = await fetch(`${BASE}/usuarios/${uid}?updateMask.fieldPaths=dados&updateMask.fieldPaths=atualizadoEm&updateMask.fieldPaths=dispositivo`, {
  method: "PATCH", headers: cab,
  body: JSON.stringify({ fields: {
    dados: { stringValue: alvo.dados },
    atualizadoEm: { doubleValue: Date.now() },
    dispositivo: { stringValue: `recuperacao-${QUANDO}` },
  } }),
});
if (!r.ok) { console.error(`Não consegui gravar a versão escolhida: HTTP ${r.status} ${await r.text()}`); process.exit(1); }
console.log("Pronto: a conta voltou para a versão escolhida. Ao abrir o site, o aparelho baixa essa versão.");

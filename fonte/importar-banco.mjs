/* Põe no banco de questões as questões autorais do Cadência Med.
 *
 * As questões autorais não saíram de prova de banca: são escritas pelo
 * Cadência Med, com base em diretrizes, e aparecem na tela marcadas como
 * autorais. Como este repositório é público, o texto delas mora aqui só
 * cifrado (fonte/banco-autoral/*.cifra): a chave do lote vai cifrada com a
 * chave pública da conta de serviço do Firebase, e só quem tem a chave
 * privada (o segredo FIREBASE_SERVICE_ACCOUNT, o mesmo que já grava no
 * banco) consegue abrir. O log nunca imprime conteúdo.
 *
 * Cada lote aberto é { "questoes": [ { numero, area, esp, tema, enunciado,
 * alternativas[5], comentarios[5], certa, fonte, seguranca, avisos } ] }.
 * O numero vira o id (banco/autoral-{numero}), então mandar de novo o mesmo
 * número substitui a questão, sem duplicar.
 *
 * Formato do .cifra (JSON): { chave: RSA-OAEP-SHA256(chave AES) em base64,
 * iv, tag, dados: AES-256-GCM(lote) em base64 }.
 *
 * Roda no GitHub Actions (importar-banco.yml), com a conta de serviço.
 * Sempre imprime a chave pública, que é o que se usa para cifrar um lote.
 */
import { readFileSync, readdirSync } from "node:fs";
import { createSign, createPublicKey, privateDecrypt, createDecipheriv, constants } from "node:crypto";
import { classificacaoValida, resumoDaProva, idValido } from "../worker/api/banco.js";

const PROJETO = process.env.PROJETO || "cadencia-7c1f1";
const NOME_BASE = `projects/${PROJETO}/databases/(default)/documents`;
const BASE = `https://firestore.googleapis.com/v1/${NOME_BASE}`;
const CODIGO = "autoral";
const INSTITUICAO = "Cadência Med (autoral)";
const PASTA = new URL("./banco-autoral/", import.meta.url);

const conta = JSON.parse(readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, "utf8"));
const b64 = (x) => Buffer.from(typeof x === "string" ? x : JSON.stringify(x)).toString("base64url");

async function token(escopos) {
  const agora = Math.floor(Date.now() / 1000);
  const corpo = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({
    iss: conta.client_email, scope: escopos.join(" "), aud: "https://oauth2.googleapis.com/token", iat: agora, exp: agora + 3000,
  })}`;
  const assinatura = createSign("RSA-SHA256").update(corpo).sign(conta.private_key, "base64url");
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${corpo}.${assinatura}`,
  });
  const j = await r.json();
  if (!j.access_token) throw new Error(`token recusado: ${r.status}`);
  console.log(`::add-mask::${j.access_token}`);
  return j.access_token;
}

console.log("Chave pública para cifrar lotes (não é segredo):");
console.log(createPublicKey(conta.private_key).export({ type: "spki", format: "pem" }).trim().split("\n").map((l) => `CHAVE ${l}`).join("\n"));

function abrir(nome) {
  const c = JSON.parse(readFileSync(new URL(nome, PASTA), "utf8"));
  const chave = privateDecrypt({ key: conta.private_key, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" }, Buffer.from(c.chave, "base64"));
  const d = createDecipheriv("aes-256-gcm", chave, Buffer.from(c.iv, "base64"));
  d.setAuthTag(Buffer.from(c.tag, "base64"));
  return JSON.parse(Buffer.concat([d.update(Buffer.from(c.dados, "base64")), d.final()]).toString("utf8"));
}

let arquivos = [];
try { arquivos = readdirSync(PASTA).filter((n) => n.endsWith(".cifra")).sort(); } catch (e) { /* sem pasta */ }
if (!arquivos.length) { console.log("Nenhum lote cifrado em fonte/banco-autoral/."); process.exit(0); }
const questoes = [];
for (const nome of arquivos) {
  const lote = abrir(nome);
  const qs = Array.isArray(lote.questoes) ? lote.questoes : [];
  console.log(`${nome}: ${qs.length} questões`);
  questoes.push(...qs);
}

/* confere cada questão; a que não passa fica de fora, com o motivo */
const boas = [];
for (const q of questoes) {
  const n = Math.round(Number(q.numero) || 0);
  const c = classificacaoValida(q, q.tema);
  const motivo =
    !(n >= 1 && n <= 9999) || !idValido(`${CODIGO}-${n}`) ? "número" :
    !c.area || !c.esp || !c.tema ? "área, especialidade ou tema" :
    !q.enunciado || String(q.enunciado).length < 40 ? "enunciado" :
    !Array.isArray(q.alternativas) || q.alternativas.length !== 5 || q.alternativas.some((a) => !String(a || "").trim()) ? "alternativas" :
    !Array.isArray(q.comentarios) || q.comentarios.length !== 5 || q.comentarios.some((a) => !String(a || "").trim()) ? "comentários" :
    !(Number.isInteger(q.certa) && q.certa >= 0 && q.certa < 5) ? "resposta" : "";
  if (motivo) { console.log(`questão ${q.numero}: fora (${motivo})`); continue; }
  boas.push({ n, c, q });
}
console.log(`${questoes.length} questões nos lotes, ${boas.length} passaram na conferência.`);

const tBanco = await token(["https://www.googleapis.com/auth/datastore"]);
const cab = { Authorization: `Bearer ${tBanco}`, "Content-Type": "application/json" };

async function gravar(writes) {
  for (let i = 0; i < writes.length; i += 300) {
    const resp = await fetch(`${BASE}:commit`, { method: "POST", headers: cab, body: JSON.stringify({ writes: writes.slice(i, i + 300) }) });
    if (!resp.ok) { console.error(`::error::O Firestore recusou a gravação (HTTP ${resp.status}).`); process.exit(1); }
  }
}

const s = (v) => ({ stringValue: String(v) });
await gravar(boas.map(({ n, c, q }) => ({
  update: {
    name: `${NOME_BASE}/banco/${CODIGO}-${n}`,
    fields: {
      prova: s(CODIGO), instituicao: s(INSTITUICAO), ano: { integerValue: "0" }, numero: { integerValue: String(n) },
      area: s(c.area), esp: s(c.esp), tema: s(c.tema),
      autoral: { booleanValue: true }, figura: { booleanValue: false }, divergente: { booleanValue: false },
      q: s(JSON.stringify({
        enunciado: String(q.enunciado), alternativas: q.alternativas.map(String), comentarios: q.comentarios.map(String),
        certa: q.certa, fonte: String(q.fonte || "").slice(0, 300),
        seguranca: ["alta", "media", "baixa"].includes(q.seguranca) ? q.seguranca : "media",
        avisos: String(q.avisos || "").slice(0, 600),
      })),
    },
  },
})));
console.log(`${boas.length} questões gravadas.`);

/* o resumo das autorais, a partir de tudo o que está no banco com prova = autoral */
const docs = [];
let depois = "";
for (let volta = 0; volta < 40; volta += 1) {
  const consulta = {
    from: [{ collectionId: "banco" }],
    where: { fieldFilter: { field: { fieldPath: "prova" }, op: "EQUAL", value: s(CODIGO) } },
    orderBy: [{ field: { fieldPath: "__name__" }, direction: "ASCENDING" }],
    select: { fields: [{ fieldPath: "area" }, { fieldPath: "esp" }, { fieldPath: "tema" }] },
    limit: 1000,
    ...(depois ? { startAt: { values: [{ referenceValue: depois }], before: false } } : {}),
  };
  const resp = await fetch(`${BASE}:runQuery`, { method: "POST", headers: cab, body: JSON.stringify({ structuredQuery: consulta }) });
  const linhas = (await resp.json()).filter((x) => x.document).map((x) => x.document);
  docs.push(...linhas);
  if (linhas.length < 1000) break;
  depois = linhas[linhas.length - 1].name;
}
const valor = (f, k) => ((f || {})[k] || {}).stringValue || "";
const resumo = resumoDaProva(docs.map((d) => ({ area: valor(d.fields, "area"), esp: valor(d.fields, "esp"), tema: valor(d.fields, "tema") })));
await gravar([{
  update: {
    name: `${NOME_BASE}/banco_provas/${CODIGO}`,
    fields: {
      instituicao: s(INSTITUICAO), ano: { integerValue: "0" }, prova: s("Questões autorais Cadência Med"),
      autoral: { booleanValue: true }, indexadoEm: { doubleValue: Date.now() }, resumo: s(JSON.stringify(resumo)),
    },
  },
}]);
console.log(`No banco agora: ${resumo.total} questões autorais. Por área: ${JSON.stringify(resumo.areas)}`);

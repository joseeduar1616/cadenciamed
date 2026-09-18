/* Peças compartilhadas pelas funções do servidor.
 *
 * Arquivos começados por "_" não viram endereço no Cloudflare Pages, então
 * este aqui é só biblioteca.
 *
 * A assinatura do JWT usa WebCrypto, e não o node:crypto. O Cloudflare roda
 * as funções no runtime de Workers, que não tem createSign nem Buffer. O
 * WebCrypto existe nos dois lugares, então o mesmo código serve para o
 * Cloudflare e para o Node.
 */

export const PROJETO = "cadencia-7c1f1";
export const BASE_FIRESTORE =
  `https://firestore.googleapis.com/v1/projects/${PROJETO}/databases/(default)/documents`;

/* Contas com acesso completo sem pagar. O e-mail vem do token já conferido
   com o Google, então não adianta forjar no navegador. */
export const DONOS = ["joseeduardo1616@gmail.com"];

export const DIAS = { semanal: 7, mensal: 31, anual: 366, vitalicio: 36500 };

/* O plano anual vence numa data fixa — o fim de 2027 —, não um ano a
   partir da compra. mensal e vitalício continuam contados a partir de
   agora, com DIAS acima. */
const FIM_ANUAL = new Date("2028-01-01T00:00:00-03:00").getTime();
export function validadeDoPlano(plano) {
  if (plano === "anual") return FIM_ANUAL;
  return Date.now() + (DIAS[plano] || DIAS.mensal) * 86400000;
}

export const json = (corpo, status = 200) => new Response(JSON.stringify(corpo), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8" },
});

/* base64url a partir de bytes ou de texto, sem depender do Buffer. */
function base64url(dados) {
  const bytes = typeof dados === "string"
    ? new TextEncoder().encode(dados)
    : new Uint8Array(dados);
  let bruto = "";
  for (let i = 0; i < bytes.length; i++) bruto += String.fromCharCode(bytes[i]);
  return btoa(bruto).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/* PEM em texto vira os bytes que o importKey espera. */
function pemParaBytes(pem) {
  const limpo = String(pem)
    .replace(/-----BEGIN [^-]+-----/, "")
    .replace(/-----END [^-]+-----/, "")
    .replace(/\s+/g, "");
  const bruto = atob(limpo);
  const bytes = new Uint8Array(bruto.length);
  for (let i = 0; i < bruto.length; i++) bytes[i] = bruto.charCodeAt(i);
  return bytes;
}

/* Troca a conta de serviço por um token de acesso ao Firestore.
   É esse token que permite escrever em assinaturas/{uid}, coleção que as
   regras do Firestore deixam o navegador apenas ler. */
export async function tokenDeAcesso(conta) {
  const agora = Math.floor(Date.now() / 1000);
  const cabeca = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const corpo = base64url(JSON.stringify({
    iss: conta.client_email,
    scope: "https://www.googleapis.com/auth/datastore",
    aud: "https://oauth2.googleapis.com/token",
    iat: agora, exp: agora + 3600,
  }));
  const base = `${cabeca}.${corpo}`;

  const chave = await crypto.subtle.importKey(
    "pkcs8", pemParaBytes(conta.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const assinatura = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5", chave, new TextEncoder().encode(base));

  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${base}.${base64url(assinatura)}`,
    }),
  });
  if (!r.ok) throw new Error("token recusado");
  return (await r.json()).access_token;
}

/* Lê a conta de serviço da variável de ambiente. */
export function contaDeServico(env) {
  const bruto = env.FIREBASE_SERVICE_ACCOUNT;
  if (!bruto) return null;
  try { return JSON.parse(bruto); } catch (e) { return null; }
}

/* Confere a identidade de quem está pedindo, direto com o Google.
   Devolve { uid, email } ou null. */
export async function quemPede(idToken, apiKey) {
  if (!idToken || !apiKey) return null;
  try {
    const r = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });
    if (!r.ok) return null;
    const j = await r.json();
    const u = (j.users || [])[0];
    if (!u || !u.localId) return null;
    return { uid: u.localId, email: u.email ? String(u.email).toLowerCase() : "" };
  } catch (e) { return null; }
}

export const ehDono = (email) => DONOS.indexOf(String(email || "").toLowerCase()) >= 0;

/* Lê o corpo JSON do pedido sem deixar exceção escapar. */
export async function corpoJson(request) {
  try { return await request.json(); } catch (e) { return null; }
}

/* Grava a assinatura de alguém. Só é chamada com o token da conta de
   serviço, nunca com o token de quem está navegando. */
export async function gravarAssinatura(token, uid, campos) {
  const r = await fetch(`${BASE_FIRESTORE}/assinaturas/${uid}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields: campos }),
  });
  return r.ok;
}

/* Até quando a assinatura de alguém vale. 0 quando não existe. */
export async function validoAte(token, uid) {
  const r = await fetch(`${BASE_FIRESTORE}/assinaturas/${uid}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) return 0;
  const j = await r.json().catch(() => null);
  return Number((((j || {}).fields || {}).validoAte || {}).doubleValue || 0);
}

/* Lê mentores/{uid} sem estourar em quem nunca resgatou. Compartilhada
   entre cupom.js (resgate de "mentor1612") e acessos.js (o dono concede
   direto, no painel). */
export async function lerMentor(token, uid) {
  const r = await fetch(`${BASE_FIRESTORE}/mentores/${uid}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) return null;
  const j = await r.json().catch(() => null);
  const f = (j || {}).fields || {};
  return {
    email: (f.email && f.email.stringValue) || "",
    desde: Number((f.desde && f.desde.doubleValue) || 0),
    alunos: (((f.alunos || {}).arrayValue || {}).values || []),
  };
}

/* Grava mentores/{uid} preservando a lista de alunos já existente: conceder
   de novo não pode apagar quem a pessoa já tinha adicionado. */
export async function concederMentor(token, uid, email) {
  const atual = await lerMentor(token, uid);
  if (atual) return true;         // já é mentor, nada a gravar
  const r = await fetch(`${BASE_FIRESTORE}/mentores/${uid}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      fields: {
        email: { stringValue: email }, desde: { doubleValue: Date.now() },
        alunos: { arrayValue: { values: [] } },
      },
    }),
  });
  return r.ok;
}

/* Descobre o uid de alguém pelo e-mail, usando a coleção emails/{uid} que
   cada pessoa grava de si mesma ao entrar (F.setDoc em "emails", no
   parte3.jsx). Usada pelo aviso de compra e pela aba Mentor, que só sabem
   o e-mail de quem procuram, nunca o uid. */
export async function uidPeloEmail(token, email) {
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

/* ── quem enxerga cada aba ─────────────────────────────────────────────
 *
 * Antes isto era decidido só na tela: a barra escondia a aba e pronto.
 * Esconder não é fechar — quem soubesse o nome da aba chegava nela, e as
 * rotas por trás não perguntavam nada. Agora a regra mora aqui, o
 * servidor responde por ela, e a tela só desenha o que o servidor disser.
 *
 * Três regras possíveis, e só três, porque mais do que isso vira um painel
 * que ninguém entende:
 *   "todos"  — qualquer pessoa com conta
 *   "pro"    — quem tem assinatura em dia
 *   "dono"   — só as contas em DONOS
 *
 * O PADRÃO de cada aba está aqui. O que estiver gravado em
 * config/recursos manda por cima, para dar de mudar sem publicar o site.
 */
export const RECURSOS = [
  { id: "assistente", nome: "Assistente", padrao: "pro" },
  { id: "cartoes", nome: "Cartões", padrao: "pro" },
  { id: "revisoes", nome: "Revisões", padrao: "pro" },
  { id: "provas", nome: "Provas", padrao: "pro" },
  { id: "cronograma", nome: "Cronograma", padrao: "todos" },
  { id: "rotina", nome: "Agenda", padrao: "todos" },
  { id: "amigos", nome: "Amigos", padrao: "todos" },
  { id: "metas", nome: "Metas", padrao: "todos" },
  { id: "desempenho", nome: "Desempenho", padrao: "todos" },
  { id: "simulados", nome: "Simulados", padrao: "todos" },
  { id: "progresso", nome: "Progresso", padrao: "todos" },
  /* A academia não é estudo. Ela nasceu para uma pessoa só e é a única
     aba que não tem nada a ver com prova de residência. */
  { id: "treino", nome: "Treino", padrao: "dono" },
];

export const REGRAS = ["todos", "pro", "dono"];
const regraValida = (v) => (REGRAS.indexOf(String(v)) >= 0 ? String(v) : null);

/* Lê config/recursos e devolve { id: regra } só com o que for válido.
   Campo desconhecido ou regra inventada é descartado: uma linha estranha
   no banco não pode abrir uma aba que deveria estar fechada. */
export function regrasGravadas(doc) {
  const f = (doc || {}).fields || {};
  const saida = {};
  for (const r of RECURSOS) {
    const v = regraValida((f[r.id] || {}).stringValue);
    if (v) saida[r.id] = v;
  }
  return saida;
}

export const camposDasRegras = (regras) => {
  const campos = {};
  for (const r of RECURSOS) {
    const v = regraValida(regras[r.id]);
    if (v) campos[r.id] = { stringValue: v };
  }
  return campos;
};

/* O que ESTA pessoa enxerga: { treino: false, cartoes: true, ... }.
   O dono enxerga tudo, sempre — senão dava para o dono se trancar fora do
   painel que decide quem vê o quê. */
export function recursosDe({ dono, pro, regras, liberados }) {
  const saida = {};
  for (const r of RECURSOS) {
    const regra = (regras || {})[r.id] || r.padrao;
    saida[r.id] = dono
      || (liberados || {})[r.id] === true
      || regra === "todos"
      || (regra === "pro" && !!pro);
  }
  return saida;
}

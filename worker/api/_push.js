/* Notificação que chega com o site fechado · Web Push (RFC 8291 e 8292)
 *
 * O que existia antes não era isto. O lembrete do aplicativo era um
 * setTimeout: só disparava com a aba aberta, e fechar o navegador — que é o
 * que a pessoa faz ao guardar o celular — cancelava o lembrete. Quem
 * precisava do aviso justamente por não ter aberto o site nunca recebia.
 *
 * Web Push é o padrão que resolve: o navegador registra um endereço no
 * servidor dele (Google, Mozilla, Apple), e o nosso servidor entrega ali.
 * Chega com o site fechado, e no iPhone chega com o site instalado.
 *
 * Por que não o SDK de mensagens do Firebase: ele é mais 100 KB no
 * navegador, um segundo service worker e uma dependência a mais para fazer
 * exatamente o que estas duas normas já fazem com WebCrypto puro. E o
 * Firebase Cloud Messaging fala este mesmo protocolo por baixo.
 *
 * O corpo da notificação vai CIFRADO ponta a ponta, e isso não é zelo
 * exagerado: o texto passa pelo servidor do Google ou da Apple no caminho,
 * e ele diz o que a pessoa está devendo estudar. Só o aparelho que assinou
 * consegue abrir — a chave de leitura nunca sai dele.
 *
 * Tudo aqui é função pura ou só-WebCrypto, testada por testar-push.mjs,
 * porque erro de criptografia não dá mensagem de erro: dá silêncio. A
 * notificação simplesmente não chega, e não há tela onde isso apareça.
 */

/* ── base64url, que é como as duas normas escrevem chave e assinatura ── */

export function paraBase64Url(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function deBase64Url(texto) {
  const s = String(texto || "").replace(/-/g, "+").replace(/_/g, "/");
  const cru = atob(s + "=".repeat((4 - (s.length % 4)) % 4));
  const b = new Uint8Array(cru.length);
  for (let i = 0; i < cru.length; i++) b[i] = cru.charCodeAt(i);
  return b;
}

const juntar = (...partes) => {
  const total = partes.reduce((n, p) => n + p.length, 0);
  const fora = new Uint8Array(total);
  let i = 0;
  for (const p of partes) { fora.set(p, i); i += p.length; }
  return fora;
};

const texto = (s) => new TextEncoder().encode(s);

/* ── a chave do servidor (VAPID) ──────────────────────────────────────
 *
 * Um par por site, não por pessoa. A pública viaja na página e é por ela
 * que o navegador reconhece que o push é nosso; a privada assina cada
 * entrega e nunca sai do servidor.
 *
 * Quem gera é o próprio Worker, na primeira vez, e guarda no banco com a
 * conta de serviço. Assim ninguém precisa copiar chave privada de um lado
 * para o outro — que é o caminho pelo qual segredo acaba em conversa, em
 * captura de tela ou no repositório.
 */
export async function gerarChavesVapid() {
  const par = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"],
  );
  const privada = await crypto.subtle.exportKey("jwk", par.privateKey);
  const publica = await crypto.subtle.exportKey("raw", par.publicKey);
  return { privada, publica: paraBase64Url(publica) };
}

/* A assinatura de uma entrega (RFC 8292). Vale para o servidor de push
   inteiro, não para uma notificação — por isso dura horas e é reusada. */
export async function autorizacaoVapid(endpoint, privadaJwk, contato, agora = Date.now()) {
  const destino = new URL(endpoint).origin;
  const cabecalho = { typ: "JWT", alg: "ES256" };
  /* Doze horas. As normas aceitam até 24, e um prazo curto quebraria a
     entrega de quem tivesse relógio alguns minutos adiantado. */
  const corpo = {
    aud: destino,
    exp: Math.floor(agora / 1000) + 12 * 60 * 60,
    sub: contato,
  };
  const base = `${paraBase64Url(texto(JSON.stringify(cabecalho)))}.${paraBase64Url(texto(JSON.stringify(corpo)))}`;

  const chave = await crypto.subtle.importKey(
    "jwk", { ...privadaJwk, key_ops: ["sign"] },
    { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"],
  );
  /* O WebCrypto devolve a assinatura já como r||s de 64 bytes, que é
     exatamente o formato que o ES256 do JWT pede — sem passar por DER. */
  const assinatura = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" }, chave, texto(base),
  );
  return `vapid t=${base}.${paraBase64Url(assinatura)}, k=${await publicaDaPrivada(privadaJwk)}`;
}

/* A pública tirada da própria privada, para as duas nunca discordarem. */
export async function publicaDaPrivada(privadaJwk) {
  const somentePublica = { kty: privadaJwk.kty, crv: privadaJwk.crv, x: privadaJwk.x, y: privadaJwk.y };
  const chave = await crypto.subtle.importKey(
    "jwk", somentePublica, { name: "ECDSA", namedCurve: "P-256" }, true, ["verify"],
  );
  return paraBase64Url(await crypto.subtle.exportKey("raw", chave));
}

/* ── o corpo cifrado (RFC 8291, aes128gcm) ────────────────────────────
 *
 * A conta, na ordem exata da norma:
 *
 *   1. um par efêmero nosso, só para esta notificação;
 *   2. segredo compartilhado por ECDH entre ele e a chave do aparelho;
 *   3. dele sai o IKM, com "WebPush: info" e as duas públicas no meio —
 *      é o que amarra o segredo A ESTE par de pontas;
 *   4. do IKM e de um sal aleatório saem a chave (16 bytes) e o nonce (12);
 *   5. o texto vai com o delimitador 0x02 no fim, marcando último registro;
 *   6. o corpo é sal ‖ tamanho ‖ nossa pública ‖ cifrado.
 *
 * As três cadeias de "info" são literais da norma. Trocar uma letra de
 * qualquer uma delas ainda cifra, ainda envia, o servidor de push ainda
 * responde 201 — e o aparelho descarta calado. É o motivo de estarem
 * conferidas no teste, letra por letra.
 */
const INFO_CHAVE = "WebPush: info\0";
const INFO_CEK = "Content-Encoding: aes128gcm\0";
const INFO_NONCE = "Content-Encoding: nonce\0";

/* Tamanho de registro anunciado. 4096 é o que todo servidor de push
   aceita; o nosso texto é uma frase, então nunca chega perto. */
const TAMANHO_REGISTRO = 4096;

async function derivar(salt, ikm, info, bytes) {
  const base = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info }, base, bytes * 8,
  ));
}

export async function cifrarParaAparelho(mensagem, p256dhB64, authB64, efemero, salt) {
  const doAparelho = deBase64Url(p256dhB64);
  const segredoDoAparelho = deBase64Url(authB64);

  const par = efemero || await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"],
  );
  const nossaPublica = new Uint8Array(await crypto.subtle.exportKey("raw", par.publicKey));
  const sal = salt || crypto.getRandomValues(new Uint8Array(16));

  const publicaDoAparelho = await crypto.subtle.importKey(
    "raw", doAparelho, { name: "ECDH", namedCurve: "P-256" }, false, [],
  );
  const compartilhado = new Uint8Array(await crypto.subtle.deriveBits(
    { name: "ECDH", public: publicaDoAparelho }, par.privateKey, 256,
  ));

  /* A ordem é a do aparelho primeiro, a nossa depois. Invertida, o
     aparelho deriva outra chave e descarta a notificação sem dizer nada. */
  const infoChave = juntar(texto(INFO_CHAVE), doAparelho, nossaPublica);
  const ikm = await derivar(segredoDoAparelho, compartilhado, infoChave, 32);

  const cek = await derivar(sal, ikm, texto(INFO_CEK), 16);
  const nonce = await derivar(sal, ikm, texto(INFO_NONCE), 12);

  const claro = juntar(texto(mensagem), new Uint8Array([2]));
  const chaveAes = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const cifrado = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce }, chaveAes, claro,
  ));

  const tamanho = new Uint8Array(4);
  new DataView(tamanho.buffer).setUint32(0, TAMANHO_REGISTRO);
  return juntar(sal, tamanho, new Uint8Array([nossaPublica.length]), nossaPublica, cifrado);
}

/* ── a quem entregar, e quando ────────────────────────────────────────
 *
 * O Worker acorda de hora em hora, e não uma vez por dia, porque as
 * pessoas escolhem horários diferentes e ninguém mora no mesmo fuso do
 * servidor. Cada aparelho guarda o fuso dele, em minutos, do jeito que o
 * navegador informa.
 */
export function horaLocal(agora, fusoMin) {
  const f = Number(fusoMin);
  const deslocada = new Date(Number(agora) - (Number.isFinite(f) ? f : 0) * 60000);
  return { hora: deslocada.getUTCHours(), dia: deslocada.toISOString().slice(0, 10) };
}

/* A hora local escolhida, convertida para a hora UTC em que ela cai.
 *
 * É ela que fica gravada junto do registro, e é por ela que a batida
 * procura. Sem isso a batida teria de ler TODOS os aparelhos de hora em
 * hora e descartar 23 de cada 24 — o que custa caro, e pior: obriga a um
 * teto de quantos aparelhos cabem numa leitura, e quem ficasse além do
 * teto simplesmente nunca receberia, sem nada indicando isso.
 *
 * O fuso vem como getTimezoneOffset: minutos que o local está ATRÁS do
 * UTC, com o sinal invertido. Brasília devolve 180, e 8h em Brasília é
 * 11h UTC — por isso soma, e não subtrai. */
export function horaUtcDe(hora, fusoMin) {
  const h = Math.round(Number(hora));
  const f = Math.round(Number(fusoMin));
  if (!Number.isFinite(h) || h < 0 || h > 23) return -1;
  const fuso = Number.isFinite(f) ? f : 0;
  return (((h + Math.round(fuso / 60)) % 24) + 24) % 24;
}

/* A decisão de enviar, separada do envio para poder ser testada sem rede.
 *
 * Três condições, e as três são sobre não incomodar:
 *   · a hora local do aparelho bateu com a escolhida;
 *   · não saiu nada para ele hoje;
 *   · há algo para dizer.
 *
 * A janela é de uma hora para frente, nunca para trás: reenviar o de ontem
 * quando o Worker perde uma batida é pior que não enviar — a pessoa recebe
 * "você tem 3 revisões atrasadas" sobre um dia que já passou. */
export function deveEnviar(aparelho, agora) {
  const a = aparelho || {};
  if (!a.endpoint || !a.p256dh || !a.auth) return false;
  if (!String(a.resumo || "").trim()) return false;

  const escolhida = Math.round(Number(a.hora));
  if (!Number.isFinite(escolhida) || escolhida < 0 || escolhida > 23) return false;

  const { hora, dia } = horaLocal(agora, a.fuso);
  if (hora !== escolhida) return false;
  if (String(a.enviadoEm || "") === dia) return false;
  return true;
}

/* O endereço do aparelho vira o nome do documento: assinar de novo no
   mesmo aparelho substitui o registro em vez de criar um segundo, que
   mandaria a notificação duas vezes. */
export async function idDoAparelho(endpoint) {
  const h = await crypto.subtle.digest("SHA-256", texto(String(endpoint || "")));
  return [...new Uint8Array(h)].slice(0, 16).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* Endereço de push confiável.
 *
 * O endpoint chega do navegador e é para lá que o servidor vai fazer um
 * POST autenticado. Sem esta conferência, quem mandasse um endpoint
 * apontando para dentro da rede do Cloudflare teria o Worker batendo em
 * endereço interno com a nossa assinatura — e uma lista de serviços de
 * verdade é o que impede isso. */
const SERVIDORES = [
  "android.googleapis.com",
  "fcm.googleapis.com",
  "updates.push.services.mozilla.com",
  "updates-autopush.stage.mozilla.com",
  "web.push.apple.com",
  "wns2-.*\\.notify\\.windows\\.com",
];

export function endpointValido(endpoint) {
  let u;
  try { u = new URL(String(endpoint || "")); } catch (e) { return false; }
  if (u.protocol !== "https:") return false;
  return SERVIDORES.some((s) => new RegExp(`^${s}$`).test(u.hostname));
}

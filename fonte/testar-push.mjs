/* Testa a criptografia e a decisão de envio das notificações por push.
 *
 * Erro aqui não dá mensagem de erro: dá SILÊNCIO. O servidor de push
 * responde 201, tudo parece ter dado certo, e o aparelho descarta a
 * notificação sem avisar ninguém porque não conseguiu abrir o pacote. Não
 * existe tela onde isso apareça — só a pessoa que não recebeu o lembrete e
 * não sabe que devia ter recebido.
 *
 * Por isso este teste faz o caminho de volta INTEIRO: monta um aparelho de
 * mentira com par de chaves próprio, cifra com o código que vai para o ar, e
 * decifra do outro lado com uma implementação escrita a partir da RFC 8291,
 * lendo o corpo campo por campo. Se as duas pontas discordarem em qualquer
 * detalhe — ordem das chaves no "info", tamanho do nonce, delimitador do
 * último registro — o texto não volta.
 *
 *   node testar-push.mjs
 */
const passos = [];
const erros = [];
const ok = (m) => passos.push('ok   ' + m);
const falha = (m) => { passos.push('FALHA ' + m); erros.push(m); };

const P = await import('../worker/api/_push.js');

const cod = (s) => new TextEncoder().encode(s);
const dec = (b) => new TextDecoder().decode(b);

/* ── um aparelho de mentira, igual ao que o navegador registra ────────── */
const aparelho = await crypto.subtle.generateKey(
  { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'],
);
const p256dh = P.paraBase64Url(await crypto.subtle.exportKey('raw', aparelho.publicKey));
const authSecret = crypto.getRandomValues(new Uint8Array(16));
const auth = P.paraBase64Url(authSecret);

/* ── o decifrador independente ────────────────────────────────────────
 * Escrito lendo a RFC 8291 na direção contrária, e não copiando o código
 * que cifra: se os dois tivessem o mesmo mal-entendido, o teste passaria
 * com o aparelho de verdade descartando tudo. */
async function decifrar(corpo, privadaDoAparelho, publicaDoAparelhoB64, segredoAuth) {
  /* Corpo: sal(16) ‖ tamanho(4) ‖ idlen(1) ‖ pública do remetente ‖ cifrado */
  const sal = corpo.slice(0, 16);
  const tamanho = new DataView(corpo.buffer, corpo.byteOffset + 16, 4).getUint32(0);
  const idlen = corpo[20];
  const doRemetente = corpo.slice(21, 21 + idlen);
  const cifrado = corpo.slice(21 + idlen);

  const publicaRemetente = await crypto.subtle.importKey(
    'raw', doRemetente, { name: 'ECDH', namedCurve: 'P-256' }, false, [],
  );
  const compartilhado = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'ECDH', public: publicaRemetente }, privadaDoAparelho, 256,
  ));

  const hkdf = async (salt, ikm, info, bytes) => {
    const base = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
    return new Uint8Array(await crypto.subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt, info }, base, bytes * 8,
    ));
  };

  const daPessoa = P.deBase64Url(publicaDoAparelhoB64);
  const infoChave = new Uint8Array([
    ...cod('WebPush: info\0'), ...daPessoa, ...doRemetente,
  ]);
  const ikm = await hkdf(segredoAuth, compartilhado, infoChave, 32);
  const cek = await hkdf(sal, ikm, cod('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(sal, ikm, cod('Content-Encoding: nonce\0'), 12);

  const chave = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const claro = new Uint8Array(await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: nonce }, chave, cifrado,
  ));
  /* O último byte é o delimitador: 0x02 marca o último registro. */
  return { texto: dec(claro.slice(0, -1)), delimitador: claro[claro.length - 1], tamanho, idlen };
}

/* Uma casca que nunca estoura. Chave derivada errada faz o AES-GCM lançar,
   e uma exceção solta mataria o teste na primeira linha — escondendo tudo o
   que vem depois atrás de um rastro de pilha. Aqui ela vira uma falha
   legível, que é o que diz onde olhar. */
const tentarDecifrar = async (corpo, privada, pub, segredo) => {
  try { return await decifrar(corpo, privada, pub, segredo); }
  catch (e) { return { erro: (e && e.message) || String(e) }; }
};

/* ── o caminho de volta ───────────────────────────────────────────────── */
const FRASE = 'Você tem 3 revisões atrasadas hoje.';
let corpo = await P.cifrarParaAparelho(FRASE, p256dh, auth);
let volta = await tentarDecifrar(corpo, aparelho.privateKey, p256dh, authSecret);
if (volta.erro) falha('não consegui decifrar o que o servidor cifrou: ' + volta.erro);
if (volta && volta.texto === FRASE) ok('o texto cifrado pelo servidor volta inteiro no aparelho que assinou');
else falha('voltou: ' + JSON.stringify(volta && volta.texto));
if (volta && volta.delimitador === 2) ok('e marcado como último registro, que é o que a norma pede');
else falha('delimitador: ' + (volta && volta.delimitador));
if (volta && volta.idlen === 65) ok('a pública do remetente vai inteira, nos 65 bytes do ponto não comprimido');
else falha('tamanho da pública: ' + (volta && volta.idlen));
if (volta && volta.tamanho === 4096) ok('e o tamanho de registro anunciado é o que todo servidor de push aceita');
else falha('tamanho de registro: ' + (volta && volta.tamanho));

/* Acento e emoji no texto: o lembrete é em português, e um corpo contado em
   caracteres em vez de bytes cortaria a frase no meio de uma letra. */
const ACENTUADA = 'Revisão de cardiologia atrasada — não deixe para amanhã 🫀';
corpo = await P.cifrarParaAparelho(ACENTUADA, p256dh, auth);
volta = await tentarDecifrar(corpo, aparelho.privateKey, p256dh, authSecret);
if (volta.texto === ACENTUADA) ok('acento e emoji atravessam sem estragar');
else falha('acentuada voltou: ' + JSON.stringify(volta));

/* Duas notificações seguidas não podem sair iguais: cada uma tem par
   efêmero e sal próprios. Corpo idêntico significaria chave reusada, que é
   o defeito clássico desta norma. */
const a = await P.cifrarParaAparelho(FRASE, p256dh, auth);
const b = await P.cifrarParaAparelho(FRASE, p256dh, auth);
if (P.paraBase64Url(a) !== P.paraBase64Url(b)) ok('duas entregas do mesmo texto saem diferentes: sal e par efêmero são novos');
else falha('duas entregas idênticas: a chave está sendo reusada');

/* Outro aparelho não abre. É o ponto todo de cifrar: o texto passa pelo
   servidor do Google ou da Apple no caminho. */
const outro = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
const tentativa = await tentarDecifrar(corpo, outro.privateKey, p256dh, authSecret);
if (tentativa.erro) ok('aparelho que não assinou não consegue abrir a notificação');
else falha('outro aparelho abriu a notificação: ' + tentativa.texto);

/* ── a assinatura da entrega (RFC 8292) ──────────────────────────────── */
const chaves = await P.gerarChavesVapid();
const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/abc123';
const cabecalho = await P.autorizacaoVapid(ENDPOINT, chaves.privada, 'mailto:suporte@cadenciamed.com.br');
const m = /^vapid t=([\w-]+\.[\w-]+\.[\w-]+), k=([\w-]+)$/.exec(cabecalho);
if (m) ok('a autorização sai no formato que os servidores de push exigem');
else falha('cabeçalho fora de formato: ' + cabecalho);

if (m && m[2] === chaves.publica) ok('e a chave anunciada é a mesma que o navegador recebeu');
else falha('a chave do cabeçalho não é a pública do par');

if (m) {
  const corpoJwt = JSON.parse(dec(P.deBase64Url(m[1].split('.')[1])));
  if (corpoJwt.aud === 'https://fcm.googleapis.com') ok('o destino da assinatura é o servidor de push, e não o nosso site');
  else falha('aud: ' + corpoJwt.aud);
  if (corpoJwt.exp > Math.floor(Date.now() / 1000) && corpoJwt.exp < Math.floor(Date.now() / 1000) + 25 * 3600) {
    ok('e ela vence dentro do prazo que a norma permite');
  } else falha('exp fora do prazo: ' + corpoJwt.exp);

  /* A assinatura tem de FECHAR com a chave pública: um t= que não confere é
     rejeitado pelo servidor de push com 401, e a notificação some. */
  const pub = await crypto.subtle.importKey(
    'jwk', { kty: chaves.privada.kty, crv: chaves.privada.crv, x: chaves.privada.x, y: chaves.privada.y },
    { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'],
  );
  const [h, c, s] = m[1].split('.');
  const boa = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' }, pub, P.deBase64Url(s), cod(`${h}.${c}`),
  );
  if (boa) ok('a assinatura fecha com a chave pública anunciada');
  else falha('a assinatura não confere com a própria chave');

  const alg = JSON.parse(dec(P.deBase64Url(h)));
  if (alg.alg === 'ES256') ok('assinada em ES256, que é o único algoritmo que a norma aceita');
  else falha('alg: ' + alg.alg);
}

/* A privada guardada tem de dar a mesma pública sempre, senão o navegador
   passa a receber uma chave e o servidor a assinar com outra — e aí nada
   chega, sem erro em lugar nenhum. */
if (await P.publicaDaPrivada(chaves.privada) === chaves.publica) ok('a pública tirada da privada é sempre a mesma');
else falha('a pública derivada não bate com a guardada');

/* ── quando enviar ───────────────────────────────────────────────────── */
const BASE = { endpoint: ENDPOINT, p256dh, auth, resumo: '3 revisões', hora: 8, fuso: 180 };
/* 11:00 UTC é 08:00 em Brasília (fuso +180 min de atraso). */
const ONZE_UTC = Date.parse('2026-09-25T11:30:00Z');
if (P.deveEnviar(BASE, ONZE_UTC)) ok('às 8 da manhã de quem escolheu 8 da manhã, envia');
else falha('não enviou na hora certa');
if (!P.deveEnviar(BASE, Date.parse('2026-09-25T14:30:00Z'))) ok('três horas depois, não envia');
else falha('enviou fora da hora');

if (!P.deveEnviar({ ...BASE, enviadoEm: '2026-09-25' }, ONZE_UTC)) ok('quem já recebeu hoje não recebe de novo');
else falha('mandou duas vezes no mesmo dia');
if (P.deveEnviar({ ...BASE, enviadoEm: '2026-09-24' }, ONZE_UTC)) ok('e o de ontem não bloqueia o de hoje');
else falha('o envio de ontem bloqueou o de hoje');

if (!P.deveEnviar({ ...BASE, resumo: '' }, ONZE_UTC)) ok('sem nada para dizer, não incomoda');
else falha('enviou notificação vazia');
if (!P.deveEnviar({ ...BASE, resumo: '   ' }, ONZE_UTC)) ok('e resumo só com espaço conta como vazio');
else falha('espaço em branco virou notificação');

/* Fuso do outro lado do mundo: quem está em Tóquio (-540) às 8 da manhã
   está às 23 UTC do dia ANTERIOR, e é aí que o aviso tem de sair. */
const TOQUIO = { ...BASE, fuso: -540 };
if (P.deveEnviar(TOQUIO, Date.parse('2026-09-24T23:10:00Z'))) ok('fuso do outro lado do mundo cai na hora local certa');
else falha('errou a hora de quem está em Tóquio');
if (!P.deveEnviar(TOQUIO, ONZE_UTC)) ok('e não manda na hora de Brasília para quem está em Tóquio');
else falha('mandou no fuso errado');

/* Registro estragado no banco não pode virar entrega quebrada nem estouro. */
for (const [nome, ap] of [
  ['sem endereço', { ...BASE, endpoint: '' }],
  ['sem chave do aparelho', { ...BASE, p256dh: '' }],
  ['sem segredo', { ...BASE, auth: '' }],
  ['hora inventada', { ...BASE, hora: 99 }],
  ['hora em texto', { ...BASE, hora: 'manhã' }],
  ['registro nulo', null],
]) {
  if (!P.deveEnviar(ap, ONZE_UTC)) ok(`registro com ${nome} é ignorado, em vez de quebrar a rodada`);
  else falha(`aceitou registro com ${nome}`);
}

/* ── a hora de busca ──────────────────────────────────────────────────
 * É por ela que a batida de hora em hora acha quem avisar. Sem ela a
 * batida teria de ler TODOS os aparelhos e descartar 23 de cada 24 — e
 * aí precisaria de um teto de quantos cabem numa leitura, com quem
 * ficasse além do teto nunca recebendo, sem nada indicando isso.
 *
 * Errar a conversão é o mesmo tipo de erro silencioso da criptografia: o
 * aviso sai, só que na hora errada — ou não sai nunca. */
if (P.horaUtcDe(8, 180) === 11) ok('8h em Brasília é 11h UTC');
else falha('Brasília: ' + P.horaUtcDe(8, 180));
if (P.horaUtcDe(8, -540) === 23) ok('8h em Tóquio é 23h UTC do dia anterior');
else falha('Tóquio: ' + P.horaUtcDe(8, -540));
if (P.horaUtcDe(22, 180) === 1) ok('22h em Brasília dá a volta e cai em 1h UTC');
else falha('virada: ' + P.horaUtcDe(22, 180));
if (P.horaUtcDe(0, 0) === 0) ok('meia-noite em UTC é meia-noite');
else falha('UTC: ' + P.horaUtcDe(0, 0));
if (P.horaUtcDe(1, -120) === 23) ok('e a volta para trás também fecha');
else falha('volta para trás: ' + P.horaUtcDe(1, -120));

/* A hora de busca tem de CONCORDAR com a decisão de enviar. As duas
   discordando é o defeito que ninguém encontra: a batida acha a pessoa e
   depois decide não mandar, ou nunca a acha. */
for (const fuso of [180, 0, -540, -120, 300, 720, -840]) {
  for (const hora of [0, 6, 8, 13, 22, 23]) {
    const alvo = P.horaUtcDe(hora, fuso);
    /* Um instante qualquer dentro dessa hora UTC. */
    const quando = Date.UTC(2026, 8, 25, alvo, 30, 0);
    if (!P.deveEnviar({ endpoint: ENDPOINT, p256dh, auth, resumo: 'x', hora, fuso }, quando)) {
      falha(`a busca acha hora=${hora} fuso=${fuso} às ${alvo}h UTC, mas o envio recusa`);
    }
  }
}
if (!erros.some((e) => /a busca acha/.test(e))) {
  ok('a hora de busca e a decisão de enviar concordam em todos os fusos testados');
}

/* ── o endereço de entrega ────────────────────────────────────────────
 * O endpoint vem do navegador, e é para lá que o servidor faz um POST
 * assinado. Sem conferir, quem mandasse um endereço interno teria o Worker
 * batendo na rede do Cloudflare com a nossa assinatura no cabeçalho. */
for (const bom of [
  'https://fcm.googleapis.com/fcm/send/xyz',
  'https://android.googleapis.com/gcm/send/xyz',
  'https://updates.push.services.mozilla.com/wpush/v2/abc',
  'https://web.push.apple.com/Abc123',
]) {
  if (P.endpointValido(bom)) ok('aceita ' + new URL(bom).hostname);
  else falha('recusou servidor de verdade: ' + bom);
}
for (const ruim of [
  'https://127.0.0.1/interno',
  'http://fcm.googleapis.com/fcm/send/xyz',
  'https://fcm.googleapis.com.exemplo.com/fcm/send/xyz',
  'https://meu-site.com/push',
  'https://localhost:8080/',
  'não é endereço',
  '',
]) {
  if (!P.endpointValido(ruim)) ok('recusa ' + (ruim || '(vazio)'));
  else falha('aceitou endereço que não é servidor de push: ' + ruim);
}

/* O nome do documento vem do endereço: assinar de novo no mesmo aparelho
   substitui o registro em vez de criar um segundo — senão a notificação
   sairia duas vezes para a mesma pessoa. */
const id1 = await P.idDoAparelho(ENDPOINT);
const id2 = await P.idDoAparelho(ENDPOINT);
const id3 = await P.idDoAparelho(ENDPOINT + 'x');
if (id1 === id2 && id1 !== id3) ok('o mesmo aparelho dá sempre o mesmo id, e outro aparelho dá outro');
else falha(`ids: ${id1} ${id2} ${id3}`);
if (/^[0-9a-f]{32}$/.test(id1)) ok('e o id é só hexadecimal, seguro como nome de documento');
else falha('id fora de formato: ' + id1);

console.log(passos.join('\n'));
console.log('\n' + (erros.length ? `${erros.length} PROBLEMA(S):\n` + erros.join('\n') : 'nenhum erro'));
if (erros.length) process.exitCode = 1;

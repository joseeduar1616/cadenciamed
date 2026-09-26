/* Service worker do Cadência Med.
 *
 * Resolve duas coisas que faltavam:
 *
 * 1. O site não abria sem internet. Tinha manifest e se dizia instalável,
 *    mas sem service worker o Android nem oferece instalar direito, e
 *    aberto no avião ficava a tela de erro do navegador. Os DADOS já eram
 *    do aparelho; o que faltava era o aplicativo em si.
 * 2. Toda visita rebaixava o site inteiro. O HTML é publicado com
 *    "no-store" de propósito, para uma publicação nova aparecer na hora —
 *    e o preço disso era ~300 KB por abertura, dez vezes por dia.
 *
 * A estratégia é "rede primeiro, cache como reserva" para o HTML: quem
 * tem internet sempre vê a versão mais nova (a razão do no-store continua
 * valendo), e quem não tem vê a última que funcionou. Para os arquivos que
 * mudam pouco (ícones, o leitor de banco do Anki) é o contrário: responde
 * do cache na hora e atualiza por baixo.
 *
 * O que NUNCA entra em cache: /api/. São respostas por pessoa, com token,
 * e guardá-las seria mostrar dado de uma conta em outra.
 */
const VERSAO = "cadencia-997391a49e";
const CASCA = "/";

/* Instala já guardando a casca do app, para a primeira visita offline
   depois desta já funcionar. */
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(VERSAO).then((c) => c.addAll([CASCA, "/manifest.webmanifest"]))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

/* Ao assumir, apaga as versões antigas: sem isso o cache só cresce. */
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((nomes) => Promise.all(nomes.filter((n) => n !== VERSAO).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

const ehNavegacao = (req) => req.mode === "navigate"
  || (req.method === "GET" && String(req.headers.get("accept") || "").includes("text/html"));

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // CDN e Google: passa direto
  if (url.pathname.startsWith("/api/")) return;      // resposta de conta, nunca guardar

  if (ehNavegacao(req)) {
    /* Rede primeiro: publicar tem de aparecer na hora para quem está
       online. Sem rede, devolve a última página que funcionou. */
    e.respondWith(
      fetch(req)
        .then((r) => {
          const copia = r.clone();
          caches.open(VERSAO).then((c) => c.put(CASCA, copia)).catch(() => undefined);
          return r;
        })
        .catch(() => caches.match(CASCA).then((r) => r || Response.error())),
    );
    return;
  }

  /* Ícone, manifest, leitor de banco: do cache na hora, e atualiza por
     baixo para a próxima vez já vir novo. */
  e.respondWith(
    caches.match(req).then((guardado) => {
      const daRede = fetch(req).then((r) => {
        if (r && r.ok) {
          const copia = r.clone();
          caches.open(VERSAO).then((c) => c.put(req, copia)).catch(() => undefined);
        }
        return r;
      }).catch(() => guardado);
      return guardado || daRede;
    }),
  );
});

/* ── notificação que chega com o site fechado ─────────────────────────
 *
 * É aqui que o push vira aviso na tela. O navegador acorda este arquivo
 * mesmo sem nenhuma aba aberta — que é exatamente o caso em que o lembrete
 * serve para alguma coisa.
 *
 * O corpo chega cifrado e o navegador já o abre antes de entregar aqui: a
 * chave de leitura é do aparelho e nunca saiu dele. O que se lê abaixo é o
 * texto claro, do lado de dentro.
 *
 * O aviso tem de aparecer SEMPRE. Um push recebido e não mostrado faz o
 * navegador desconfiar do site e, depois de algumas vezes, revogar a
 * permissão — então mesmo um corpo ilegível vira uma frase genérica, em vez
 * de silêncio.
 */
self.addEventListener("push", (e) => {
  let aviso = {};
  try { aviso = (e.data && e.data.json()) || {}; } catch (err) { /* frase padrão abaixo */ }

  const titulo = String(aviso.titulo || "Cadência Med").slice(0, 80);
  const corpo = String(aviso.corpo || "Você tem estudo marcado para hoje.").slice(0, 240);

  e.waitUntil(self.registration.showNotification(titulo, {
    body: corpo,
    icon: "/icone-192.png",
    badge: "/icone-192.png",
    lang: "pt-BR",
    /* Uma etiqueta só: o lembrete de hoje substitui o de ontem que ficou
       na bandeja, em vez de empilhar sete avisos numa semana ocupada. */
    tag: String(aviso.etiqueta || "cadencia-lembrete"),
    renotify: true,
    data: { url: String(aviso.url || "/") },
  }));
});

/* Tocar no aviso abre o site. Se já houver uma aba, é ela que vem para a
   frente — abrir uma segunda aba do mesmo aplicativo perderia o que a
   pessoa estava fazendo na primeira. */
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const destino = new URL((e.notification.data && e.notification.data.url) || "/", self.location.origin);
  e.waitUntil((async () => {
    const abas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const aba of abas) {
      if (new URL(aba.url).origin === self.location.origin) {
        await aba.focus();
        if ("navigate" in aba && aba.url !== destino.href) await aba.navigate(destino.href).catch(() => {});
        return;
      }
    }
    await self.clients.openWindow(destino.href);
  })());
});

/* O navegador troca o endereço de entrega de vez em quando, por conta dele.
 * Sem tratar isto, o lembrete simplesmente para de chegar um dia — e não há
 * nada na tela dizendo por quê. Aqui o novo endereço é reassinado na hora,
 * usando a mesma chave do site que o antigo usava. */
self.addEventListener("pushsubscriptionchange", (e) => {
  e.waitUntil((async () => {
    try {
      const antiga = e.oldSubscription || await self.registration.pushManager.getSubscription();
      const chave = (antiga && antiga.options && antiga.options.applicationServerKey) || null;
      if (!chave) return;
      const nova = e.newSubscription || await self.registration.pushManager.subscribe({
        userVisibleOnly: true, applicationServerKey: chave,
      });
      /* O service worker não tem token de conta nenhum: quem sabe falar com
         /api/push é a página. Então o aparelho guarda o pedido e a próxima
         abertura do site o cumpre. */
      const c = await caches.open(VERSAO);
      await c.put("/__reassinar", new Response(JSON.stringify(nova.toJSON()), {
        headers: { "Content-Type": "application/json" },
      }));
    } catch (err) { /* na próxima abertura o site reassina de qualquer jeito */ }
  })());
});

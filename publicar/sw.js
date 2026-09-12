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
const VERSAO = "cadencia-v1";
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

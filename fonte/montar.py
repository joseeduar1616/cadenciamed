import json
import os
import re
os.chdir(os.path.dirname(os.path.abspath(__file__)))

css = open('utils.css', encoding='utf-8').read()

# O favicon e o ícone do iPhone entram como data URI, para funcionarem mesmo
# se os PNG soltos não forem publicados. Quem os gera é o gerar_icones.py.
ICONES = dict(
    linha.split('=', 1)
    for linha in open('icones-embutidos.txt', encoding='utf-8').read().splitlines()
    if '=' in linha
)

# O id do cliente do Google vem do wrangler.jsonc, que é o mesmo arquivo que
# entrega esse valor ao Worker. A página só o usa de reserva, para quando a
# rota /api/google não responder — mas uma reserva diferente da credencial
# de verdade é pior que reserva nenhuma: a janela pediria o código para um
# cliente e o servidor tentaria trocar com outro, que é o erro
# invalid_client. Lendo daqui, os dois lados não têm como divergir.
def _id_do_google():
    bruto = open('../wrangler.jsonc', encoding='utf-8').read()
    # jsonc: o json do Python não aceita os comentários //
    limpo = re.sub(r'^\s*//.*$', '', bruto, flags=re.M)
    valor = json.loads(limpo).get('vars', {}).get('GOOGLE_CLIENT_ID', '')
    if not valor:
        raise SystemExit('falta GOOGLE_CLIENT_ID em vars, no wrangler.jsonc')
    return valor


GOOGLE_CLIENT_ID = _id_do_google()

TPL = """<!DOCTYPE html>
<html lang="pt-BR" data-theme="dark" data-layout="auto">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#04030A">
<meta name="description" content="__DESC__">
<!-- O carimbo do build, para a tela conferir se o que está no ar é mais
     novo do que o que ela está rodando. Uma meta própria, e não um texto
     qualquer da página: qualquer outra coisa muda de redação um dia e a
     conferência passa a mentir em silêncio. -->
<meta name="cadencia-versao" content="__VERSAO__">
<link rel="canonical" href="__SITE__/">

<!-- Compartilhamento. Sem isto, colar o link no WhatsApp, no Instagram ou
     no Twitter mostra só o endereço cru: nada de imagem, título ou
     descrição. Numa campanha de lançamento isso custa clique em toda
     postagem. A imagem é gerada pelo gerar_cartao.py, 1200x630, que é a
     medida que as três redes recortam sem cortar nada. -->
<meta property="og:type" content="website">
<meta property="og:site_name" content="Cadência Med">
<meta property="og:locale" content="pt_BR">
<meta property="og:url" content="__SITE__/">
<meta property="og:title" content="__TITLE__">
<meta property="og:description" content="__DESC__">
<meta property="og:image" content="__SITE__/cartao.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Cadência Med: cronograma, revisão espaçada e flashcards para a residência médica.">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="__TITLE__">
<meta name="twitter:description" content="__DESC__">
<meta name="twitter:image" content="__SITE__/cartao.png">

<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Cadência Med">
<meta name="mobile-web-app-capable" content="yes">
<link rel="manifest" href="/manifest.webmanifest">
<title>__TITLE__</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="icon" type="image/png" sizes="32x32" href="data:image/png;base64,__FAVICON32__">
<link rel="apple-touch-icon" sizes="180x180" href="data:image/png;base64,__APPLE180__">
<link rel="icon" type="image/png" sizes="192x192" href="/icone-192.png">

<script>
/* ══════════════════════════════════════════════════════════════════════
   CONTAS E SINCRONIZACAO (Firebase)
   Ja preenchido com o projeto cadencia-7c1f1.
   Enderecos publicados: cadenciamed.com.br e cadenciamed.joseeduardo1616.workers.dev
   TODO dominio novo precisa entrar em Authentication > Settings > Dominios
   autorizados, no console do Firebase. Sem isso o login para com o erro
   "auth/unauthorized-domain", e so nesse dominio: no antigo continua
   funcionando, o que faz parecer que o site quebrou sozinho.
   ══════════════════════════════════════════════════════════════════════ */
window.CADENCIA_FIREBASE = {
  apiKey: "AIzaSyB0IlxoiJYpMr9S3uGpD1lnUwXvEVk8cVA",
  authDomain: "cadencia-7c1f1.firebaseapp.com",
  projectId: "cadencia-7c1f1",
  storageBucket: "cadencia-7c1f1.appspot.com",
  messagingSenderId: "499777815393",
  appId: "1:499777815393:web:a434c2c862dda8e696bb20"
};

/* ══════════════════════════════════════════════════════════════════════
   GOOGLE AGENDA
   Cada origem precisa estar em Origens JavaScript autorizadas, no console
   do Google Cloud, dentro da credencial ID do cliente OAuth:
     https://cadenciamed.com.br
     https://www.cadenciamed.com.br
     https://cadenciamed.joseeduardo1616.workers.dev
   Sem isso da erro 400 origin_mismatch ao conectar o Google Agenda.
   ══════════════════════════════════════════════════════════════════════ */
/* Este id é só a RESERVA. Quem manda é o GOOGLE_CLIENT_ID do Worker: a
   rota /api/google devolve o dela em "estado", e a página abre a janela com
   aquele. O motivo é que o código de autorização é emitido PARA um cliente
   e só pode ser trocado por aquele mesmo — com o id fixado aqui, trocar a
   credencial do Worker fazia as duas pontas apontarem para clientes
   diferentes, e o Google recusava a troca com invalid_client.

   Ele é o que vale se a rota não responder, então não pode divergir. Para
   isso não depender de ninguém lembrar, o valor abaixo é copiado do
   wrangler.jsonc na hora de montar a página: existe um literal só no
   repositório, e é o mesmo que o Worker recebe. */
window.CADENCIA_GOOGLE = {
  clientId: "__GOOGLE_CLIENT_ID__"
};

/* ══════════════════════════════════════════════════════════════════════
   LINKS DE PAGAMENTO — e o que falta para vender

   1. Crie dois produtos na Kiwify ou na Hotmart: um mensal (R$ 39) e um
      anual (R$ 300). O nome do produto precisa ter a palavra "anual" no
      anual: e por ela que o servidor sabe qual plano liberar.
   2. Cole os dois links de checkout aqui embaixo.
   3. Na plataforma, cadastre o aviso de compra (webhook):
        https://cadenciamed.joseeduardo1616.workers.dev/api/compra?segredo=SEU_SEGREDO
      Eventos: compra aprovada, reembolso e chargeback.
   4. Cadastre WEBHOOK_SEGREDO nas variaveis do Worker, com esse mesmo
      SEU_SEGREDO. Sem ele o aviso de compra e recusado de proposito:
      qualquer pessoa poderia forjar uma compra e liberar assinatura.

   Enquanto os links estiverem vazios, a tela de planos mostra os precos e
   diz "em breve" a quem visita.
   ══════════════════════════════════════════════════════════════════════ */
window.CADENCIA_CHECKOUT = {
  mensal: "https://pay.kiwify.com.br/BaolhdL",
  anual: "https://pay.kiwify.com.br/1kOIQ8c"
};

/* ══════════════════════════════════════════════════════════════════════
   ONDE FICAM AS ROTAS /api
   Deixe comentado e o app resolve sozinho: tenta o proprio site e, se a
   resposta vier a pagina em vez de dados, repete no Worker do Cloudflare.
   E isso que faz o painel de acessos e o cupom funcionarem enquanto as
   paginas ainda sao servidas pelo Firebase Hosting.

   Preencha so para apontar para outro servidor. String vazia significa
   "o proprio site", que e o certo depois que o dominio apontar para o
   Worker.
   ══════════════════════════════════════════════════════════════════════ */
// window.CADENCIA_API = "https://cadenciamed.joseeduardo1616.workers.dev";
</script>

<style>
html,body{margin:0;padding:0;background:#04030A;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;overflow-x:hidden}
html[data-theme="light"],html[data-theme="light"] body{background:#F1EFF8}
#root{min-height:100vh}
*,*::before,*::after{box-sizing:border-box}

/* A tarja de "tem versão nova". Mora aqui, no estilo do documento, e não
   no do app: ela é desenhada pelo script de registro do service worker,
   que roda fora do React e precisa funcionar mesmo se o app não tiver
   montado. Usa as variáveis do tema quando elas existem, e tem valor de
   reserva para quando ainda não existirem. */
#tarja-versao{position:fixed;left:12px;right:12px;z-index:9999;
  bottom:calc(12px + env(safe-area-inset-bottom,0px));
  display:flex;align-items:center;gap:10px;flex-wrap:wrap;
  padding:12px 14px;border-radius:18px;
  background:var(--card3,#2A2342);color:var(--ink,#F5F2FF);
  border:1px solid var(--line2,rgba(185,160,255,.30));
  box-shadow:0 18px 44px rgba(0,0,0,.45);
  font-family:var(--f-ui,system-ui,sans-serif);font-size:14.5px;line-height:1.45}
#tarja-versao span{flex:1;min-width:150px}
#tarja-versao button{border-radius:999px;padding:8px 15px;cursor:pointer;
  font-family:inherit;font-size:14px;font-weight:600;border:1px solid transparent;
  min-height:40px}
#tarja-recarregar{background:var(--neon,#35E4FF);color:#08050F}
#tarja-depois{background:transparent;color:var(--dim,#B5ACD4);
  border-color:var(--line2,rgba(185,160,255,.30))}
@media(min-width:560px){#tarja-versao{left:auto;right:16px;max-width:430px}}

__CSS__
</style>
</head>
<body>
<div id="root"></div>
<script>
__JS__
</script>
<script>
/* O convite de instalação do navegador chega UMA vez, e cedo — em geral
   antes de o aplicativo terminar de carregar. Guardado aqui, ele espera
   pela tela que oferece o botão; sem isto o evento passava e o botão
   "Instalar agora" nunca aparecia para quem abrisse Configurações alguns
   segundos depois. */
window.addEventListener("beforeinstallprompt", function (e) {
  e.preventDefault();
  window.__cadenciaInstalar = e;
});
</script>

<script>
/* Service worker: é o que faz o site abrir sem internet e carregar na
   hora na segunda visita. Registrado depois do load para não disputar
   banda com a primeira pintura.

   Em https, e também em localhost: o navegador trata localhost como
   origem segura de propósito, justamente para dar de exercitar isto sem
   publicar. A condição só olhava o https, embora este comentário já
   dissesse "ou localhost" — e o resultado era que o caminho da
   atualização não tinha como ser testado em lugar nenhum a não ser em
   produção. Aberto como ARQUIVO o navegador recusa mesmo, e aí não
   adianta tentar.

   E, mais importante, é aqui que a ATUALIZAÇÃO é percebida.

   O service worker chama skipWaiting e clients.claim, então ele troca
   sozinho assim que a versão nova chega. Só que a PÁGINA já aberta
   continua rodando o código velho até alguém recarregar — e o site é um
   arquivo só, com tudo dentro do HTML, então "o código" é a página
   inteira. Num aplicativo instalado na tela de início, que a pessoa nunca
   fecha de verdade, isso dura indefinidamente: o servidor publica, o
   service worker atualiza, e a tela continua a mesma de semanas atrás.
   Foi exatamente o que aconteceu.

   Então: assim que o novo assume, aparece uma tarja perguntando se pode
   recarregar. Perguntando, e não recarregando sozinho — recarregar por
   conta própria no meio de um flashcard ou de um duelo faz a pessoa
   perder o que estava fazendo. */
var origemSegura = location.protocol === "https:"
  || location.hostname === "localhost" || location.hostname === "127.0.0.1";
if ("serviceWorker" in navigator && origemSegura) {
  window.addEventListener("load", function () {
    navigator.serviceWorker.register("/sw.js").then(function (reg) {
      /* Já havia um controlando? Então esta troca é uma ATUALIZAÇÃO, e
         não a primeira instalação. Na primeira não há o que avisar: a
         página já é a mais nova. */
      var primeiraVez = !navigator.serviceWorker.controller;

      var avisar = function () {
        if (primeiraVez) return;
        if (document.getElementById("tarja-versao")) return;
        var d = document.createElement("div");
        d.id = "tarja-versao";
        d.setAttribute("role", "status");
        d.innerHTML = '<span>Tem uma versão nova do Cadência.</span>'
          + '<button type="button" id="tarja-recarregar">atualizar agora</button>'
          + '<button type="button" id="tarja-depois" aria-label="Depois">depois</button>';
        document.body.appendChild(d);
        document.getElementById("tarja-recarregar").onclick = function () {
          location.reload();
        };
        document.getElementById("tarja-depois").onclick = function () {
          d.remove();
        };
      };

      /* O novo assumiu o controle: é o sinal mais confiável, porque o
         service worker daqui chama skipWaiting. */
      navigator.serviceWorker.addEventListener("controllerchange", avisar);

      /* E o caminho normal, para quando a troca demorar: um novo foi
         instalado e está esperando. */
      reg.addEventListener("updatefound", function () {
        var novo = reg.installing;
        if (!novo) return;
        novo.addEventListener("statechange", function () {
          if (novo.state === "installed" && navigator.serviceWorker.controller) avisar();
        });
      });

      /* Voltar para o aplicativo é quando mais adianta conferir: no
         celular ele fica horas em segundo plano, e sem isto a procura por
         versão nova só aconteceria na próxima abertura de verdade. */
      document.addEventListener("visibilitychange", function () {
        if (!document.hidden) reg.update().catch(function () { /* segue */ });
      });
    }).catch(function () { /* segue sem */ });
  });
}
</script>
</body>
</html>
"""


SITE = 'https://cadenciamed.com.br'

# O mesmo carimbo que vai para o JS (ver montar.sh). Fora do montar.sh
# ele não existe, e aí vale "dev" — igual ao que o base.jsx faz.
VERSAO = os.environ.get('VERSAO', 'dev')


def build(js, out, title, desc):
    html = (TPL.replace('__CSS__', css).replace('__TITLE__', title)
            .replace('__VERSAO__', VERSAO)
            .replace('__DESC__', desc).replace('__SITE__', SITE)
            .replace('__FAVICON32__', ICONES['FAVICON32'])
            .replace('__APPLE180__', ICONES['APPLE180'])
            .replace('__GOOGLE_CLIENT_ID__', GOOGLE_CLIENT_ID)
            .replace('__JS__', open(js, encoding='utf-8').read()))
    for sobrou in ('__CSS__', '__TITLE__', '__DESC__', '__SITE__', '__JS__', '__FAVICON32__', '__APPLE180__',
                   '__GOOGLE_CLIENT_ID__'):
        if sobrou in html:
            raise SystemExit('marcador não substituído: ' + sobrou)
    open(out, 'w', encoding='utf-8').write(html)
    print(out, round(len(html.encode()) / 1024), 'KB')


if __name__ == '__main__':
    build('b-limpa.js', 'index.html', 'Cadência Med · Estudos para residência',
          'O cronograma inteiro, a revisão que volta na hora certa e os seus flashcards, no mesmo lugar. '
          '90 aulas e 213 tópicos prontos para marcar.')

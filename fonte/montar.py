import os
os.chdir(os.path.dirname(os.path.abspath(__file__)))

css = open('utils.css', encoding='utf-8').read()

# O favicon e o ícone do iPhone entram como data URI, para funcionarem mesmo
# se os PNG soltos não forem publicados. Quem os gera é o gerar_icones.py.
ICONES = dict(
    linha.split('=', 1)
    for linha in open('icones-embutidos.txt', encoding='utf-8').read().splitlines()
    if '=' in linha
)

TPL = """<!DOCTYPE html>
<html lang="pt-BR" data-theme="dark" data-layout="auto">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#04030A">
<meta name="description" content="__DESC__">
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
window.CADENCIA_GOOGLE = {
  clientId: "499777815393-3br9aadldo4vdqfpqfhmai2qrud2t89u.apps.googleusercontent.com"
};

/* ══════════════════════════════════════════════════════════════════════
   LINKS DE PAGAMENTO — e o que falta para vender

   1. Crie dois produtos na Kiwify ou na Hotmart: um mensal (R$ 30) e um
      anual (R$ 250). O nome do produto precisa ter a palavra "anual" no
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
  mensal: "https://pay.kiwify.com.br/tnUuamR",
  anual: "https://pay.kiwify.com.br/MHVKdUS"
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
__CSS__
</style>
</head>
<body>
<div id="root"></div>
<script>
__JS__
</script>
</body>
</html>
"""


def build(js, out, title, desc):
    html = (TPL.replace('__CSS__', css).replace('__TITLE__', title)
            .replace('__DESC__', desc)
            .replace('__FAVICON32__', ICONES['FAVICON32'])
            .replace('__APPLE180__', ICONES['APPLE180'])
            .replace('__JS__', open(js, encoding='utf-8').read()))
    for sobrou in ('__CSS__', '__TITLE__', '__DESC__', '__JS__', '__FAVICON32__', '__APPLE180__'):
        if sobrou in html:
            raise SystemExit('marcador não substituído: ' + sobrou)
    open(out, 'w', encoding='utf-8').write(html)
    print(out, round(len(html.encode()) / 1024), 'KB')


if __name__ == '__main__':
    build('b-limpa.js', 'index.html', 'Cadência Med · Estudos para residência',
          'Painel de estudos para residencia medica: cronograma, cronometro, revisao espacada, flashcards e rotina.')

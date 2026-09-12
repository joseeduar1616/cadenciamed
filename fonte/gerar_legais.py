"""Gera privacidade.html e termos.html.

Duas páginas soltas, fora do app. São exigência prática: a LGPD pede que
esteja escrito o que se coleta e por quê, e as plataformas de pagamento
pedem o endereço dos termos na hora de aprovar o produto.

Ficam aqui, e não dentro do React, por três motivos: abrem sem carregar
1 MB de aplicativo, funcionam com o endereço direto (que é o que se cola
no checkout) e continuam no ar mesmo se o app quebrar.

O texto sai dos fatos do próprio sistema — o que de fato é guardado, onde,
e por quanto tempo. Um texto genérico copiado da internet descreveria um
produto que não é este.
"""
import os
import re

os.chdir(os.path.dirname(os.path.abspath(__file__)))

ATUALIZADO = '12 de setembro de 2026'
SITE = 'cadenciamed.com.br'
EMAIL = 'suporte@cadenciamed.com.br'

ESTILO = """
:root{color-scheme:dark}
*,*::before,*::after{box-sizing:border-box}
body{margin:0;background:#04030A;color:#F5F2FF;
  font-family:"Inter",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  font-size:16px;line-height:1.7;-webkit-font-smoothing:antialiased}
.folha{max-width:760px;margin:0 auto;padding:56px 22px 96px}
a{color:#35E4FF}
h1{font-size:34px;line-height:1.2;margin:0 0 6px;letter-spacing:-0.02em}
h2{font-size:20px;margin:44px 0 12px;color:#35E4FF;letter-spacing:-0.01em}
p,li{color:#CFC8E4}
ul{padding-left:22px}
li{margin:7px 0}
.quando{color:#877F9E;font-size:14px;margin:0 0 8px}
.volta{display:inline-block;margin-bottom:34px;color:#877F9E;text-decoration:none;font-size:14.5px}
.volta:hover{color:#35E4FF}
.aviso{border:1px solid rgba(170,145,255,.16);background:rgba(170,145,255,.05);
  border-radius:14px;padding:16px 18px;margin:30px 0}
.pe{margin-top:56px;padding-top:22px;border-top:1px solid rgba(170,145,255,.14);
  color:#877F9E;font-size:14px}
@media (max-width:520px){.folha{padding:38px 18px 70px}h1{font-size:27px}}
"""

MOLDE = """<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#04030A">
<meta name="description" content="__DESC__">
<title>__TITULO__ · Cadência Med</title>
<link rel="icon" href="/icone-32.png" type="image/png">
<style>__ESTILO__</style>
</head>
<body>
<div class="folha">
<a class="volta" href="/">voltar para o Cadência Med</a>
<h1>__TITULO__</h1>
<p class="quando">Atualizado em __QUANDO__</p>
__CORPO__
<div class="pe">
Cadência Med · <a href="https://__SITE__">__SITE__</a> · <a href="mailto:__EMAIL__">__EMAIL__</a>
</div>
</div>
</body>
</html>
"""

PRIVACIDADE = """
<p>Esta página explica quais dados o Cadência Med guarda, por que guarda e
o que você pode fazer com eles. Está escrita a partir do que o sistema de
fato faz, e não de um modelo genérico.</p>

<h2>Quem é o responsável</h2>
<p>O Cadência Med é operado por José Eduardo. Para qualquer assunto sobre
os seus dados, inclusive os pedidos descritos mais abaixo, escreva para
<a href="mailto:__EMAIL__">__EMAIL__</a>.</p>

<h2>O que é guardado</h2>
<ul>
  <li><strong>Sua conta:</strong> nome, e-mail e uma senha, que nunca é
    guardada em texto legível. A autenticação usa o Firebase
    Authentication, do Google.</li>
  <li><strong>O seu estudo:</strong> as aulas marcadas, as sessões com
    minutos, questões e acertos, as revisões cumpridas, os flashcards, a
    rotina, as metas e as anotações que você escreve.</li>
  <li><strong>Sua assinatura:</strong> qual plano está ativo e até quando.
    <strong>O pagamento não passa por aqui</strong>: ele acontece na
    plataforma de checkout, que nos avisa apenas que a compra foi
    aprovada. Dados de cartão nunca chegam a este site.</li>
  <li><strong>Imagens das anotações:</strong> ficam no seu próprio
    aparelho, no armazenamento do navegador, e não são enviadas para os
    nossos servidores.</li>
</ul>

<h2>Onde os dados ficam</h2>
<p>Enquanto você não cria conta, tudo fica <strong>só no seu
aparelho</strong>. Ao criar conta, o seu painel passa a ser sincronizado
no Firebase (Google Cloud), para você abrir no computador e no celular.</p>

<h2>Por que guardamos</h2>
<ul>
  <li>Para o serviço funcionar: sem guardar o que você marcou, não há
    cronograma, revisão nem estatística.</li>
  <li>Para cumprir o contrato da assinatura, quando existe uma.</li>
  <li>Para responder você quando pede suporte.</li>
</ul>
<p>Não vendemos, alugamos nem trocamos os seus dados com ninguém, e não
usamos o seu conteúdo de estudo para nenhuma finalidade de publicidade.</p>

<h2>Serviços de terceiros, e só quando você pede</h2>
<ul>
  <li><strong>Google Agenda e Google Drive:</strong> só depois de você
    autorizar. A autorização fica guardada no servidor e pode ser
    desfeita a qualquer momento, aqui no site ou em
    <a href="https://myaccount.google.com/permissions">myaccount.google.com/permissions</a>.</li>
  <li><strong>Notion:</strong> igual, só depois de você conectar, e
    apenas nas páginas que você liberar para a integração.</li>
  <li><strong>Inteligência artificial:</strong> ao usar o assistente, ao
    montar flashcards a partir de um documento ou ao ler a foto de um
    cronograma, o texto enviado é processado por um provedor de IA
    (Google Gemini). Esse texto não é usado para treinar modelo, e nada
    é enviado sem você pedir a ação.</li>
</ul>

<h2>Por quanto tempo</h2>
<p>Enquanto a sua conta existir. Pedindo a exclusão, apagamos os dados da
conta; registros necessários para obrigação fiscal ou legal de uma compra
podem ser mantidos pelo prazo exigido em lei.</p>

<h2>Os seus direitos</h2>
<p>Pela LGPD (Lei 13.709/2018) você pode pedir, a qualquer momento:
confirmação de que tratamos os seus dados, acesso a eles, correção,
portabilidade, informação sobre compartilhamento e a exclusão da conta.
Escreva para <a href="mailto:__EMAIL__">__EMAIL__</a>; respondemos em até
15 dias.</p>
<p>Duas coisas você já pode fazer sozinho, sem pedir nada a ninguém:
<strong>baixar tudo</strong> num arquivo (Configurações, "Baixar backup")
e <strong>apagar tudo</strong> do aparelho (Configurações, "Apagar
tudo").</p>

<h2>Cookies e medição</h2>
<p>O site <strong>não usa cookies de publicidade nem rastreadores de
terceiros</strong>. O que existe é o armazenamento local do navegador,
que guarda o seu painel e a sua sessão — é o que faz o site abrir com os
seus dados e continuar logado.</p>

<h2>Segurança</h2>
<p>O acesso é por HTTPS. As chaves dos serviços ficam no servidor e nunca
chegam ao navegador. As regras do banco não deixam uma conta ler os dados
de outra. Nenhum sistema é infalível: havendo incidente com risco
relevante, avisaremos os afetados e a ANPD, como manda a lei.</p>

<h2>Menores de idade</h2>
<p>O serviço é destinado a estudantes de medicina e médicos, maiores de 18
anos.</p>

<h2>Mudanças</h2>
<p>Se esta política mudar, a data no topo muda junto. Mudança relevante é
avisada dentro do próprio site.</p>
"""

TERMOS = """
<p>Estes termos valem para quem usa o Cadência Med, em
<a href="https://__SITE__">__SITE__</a>. Usando o site, você concorda com
eles.</p>

<h2>O que o Cadência Med é</h2>
<p>É uma <strong>ferramenta de organização pessoal de estudos</strong>:
cronograma, cronômetro, revisão espaçada, flashcards, rotina e
estatísticas. Ele organiza o SEU estudo.</p>
<div class="aviso">
<strong>O que ele não é.</strong> Não é curso, não é material didático e
não vende conteúdo de aula. O conteúdo que você estuda é de quem você
estuda; aqui ficam as suas marcações e as suas anotações. Também não
promete aprovação, nota nem resultado em prova nenhuma, e não presta
orientação médica.
</div>

<h2>Conta</h2>
<p>Você é responsável pelos dados que informa e por manter a sua senha em
segredo. A conta é pessoal: não a compartilhe. Havendo indício de
compartilhamento de assinatura ou de uso automatizado, a conta pode ser
suspensa.</p>

<h2>Planos, preço e cobrança</h2>
<ul>
  <li>Parte do site é livre. Alguns recursos exigem o plano completo, e
    quais são está indicado dentro do próprio site.</li>
  <li>Os preços vigentes aparecem na página de planos. Preço promocional
    de lançamento vale enquanto estiver anunciado.</li>
  <li>A cobrança é feita pela plataforma de pagamento, que emite o
    comprovante. O plano é liberado assim que a compra é aprovada.</li>
  <li>Podemos mudar preços. A mudança não afeta período já pago.</li>
</ul>

<h2>Cancelamento e reembolso</h2>
<ul>
  <li><strong>Garantia de 7 dias:</strong> dentro de 7 dias da compra,
    basta pedir para receber o valor de volta, sem precisar justificar.
    É o prazo de arrependimento do Código de Defesa do Consumidor
    (art. 49) para compra pela internet.</li>
  <li>Depois disso, o cancelamento interrompe as cobranças seguintes e o
    acesso continua até o fim do período já pago.</li>
  <li>Para cancelar ou pedir reembolso, escreva para
    <a href="mailto:__EMAIL__">__EMAIL__</a>.</li>
</ul>

<h2>O que você não pode fazer</h2>
<ul>
  <li>Revender, sublicenciar ou distribuir o acesso.</li>
  <li>Tentar burlar o controle de assinatura, ou acessar dados de outra
    pessoa.</li>
  <li>Subir conteúdo ilegal, ou material de terceiros sem direito de
    usar.</li>
  <li>Sobrecarregar o serviço de propósito, com robô ou raspagem.</li>
</ul>

<h2>Os seus dados e o seu conteúdo</h2>
<p>As suas anotações e marcações são suas. Você pode baixar tudo em
Configurações, a qualquer momento, e apagar tudo quando quiser. O
tratamento dos dados está descrito na
<a href="/privacidade.html">Política de Privacidade</a>.</p>

<h2>Disponibilidade</h2>
<p>Trabalhamos para manter o serviço no ar, mas ele pode ficar
indisponível por manutenção, falha de terceiros ou motivo fora do nosso
controle. Recursos podem ser alterados ou descontinuados; havendo mudança
relevante em recurso pago, avisaremos dentro do site.</p>
<p><strong>Guarde backups.</strong> A função de baixar backup existe por
isso e leva um clique.</p>

<h2>Limite de responsabilidade</h2>
<p>O serviço é oferecido como está. Na medida permitida pela lei, não
respondemos por perdas indiretas, lucros cessantes ou resultado em prova.
Nada aqui afasta direitos que o Código de Defesa do Consumidor garante a
você.</p>

<h2>Mudanças nestes termos</h2>
<p>Podemos atualizar estes termos; a data no topo muda junto, e mudança
relevante é avisada dentro do site. Continuar usando depois do aviso
significa concordar com a versão nova.</p>

<h2>Lei e foro</h2>
<p>Aplica-se a lei brasileira. Fica eleito o foro do domicílio do
consumidor para resolver questões deste contrato.</p>

<h2>Contato</h2>
<p><a href="mailto:__EMAIL__">__EMAIL__</a></p>
"""


def montar(arquivo, titulo, desc, corpo):
    html = (MOLDE.replace('__ESTILO__', ESTILO.strip())
            .replace('__TITULO__', titulo)
            .replace('__DESC__', desc)
            .replace('__QUANDO__', ATUALIZADO)
            .replace('__CORPO__', corpo.strip())
            .replace('__SITE__', SITE)
            .replace('__EMAIL__', EMAIL))
    if re.search(r'__[A-Z]+__', html):
        raise SystemExit('marcador não substituído em ' + arquivo)
    open(arquivo, 'w', encoding='utf-8').write(html)
    print(arquivo, round(len(html.encode()) / 1024, 1), 'KB')


montar('privacidade.html', 'Política de Privacidade',
       'Quais dados o Cadência Med guarda, por que guarda, e como pedir acesso ou exclusão.',
       PRIVACIDADE)
montar('termos.html', 'Termos de Uso',
       'As regras de uso do Cadência Med: planos, garantia de 7 dias, cancelamento e responsabilidades.',
       TERMOS)

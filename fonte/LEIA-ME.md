# Cadência Med · código-fonte

Site estático em React, compilado para um único `index.html`. As páginas são
servidas pelo Firebase Hosting em `cadenciamed.com.br`; as rotas `/api` vêm de
um Worker do Cloudflare. A seção **Publicar** explica os dois.

## Montar

```bash
npm install react@18.3.1 react-dom@18.3.1 recharts@2.12.7 lucide-react@0.383.0 fflate
npm install playwright          # só para o teste
pip install pillow              # só para os ícones

./montar.sh
```

O `montar.sh` faz tudo na ordem certa: gera os ícones, junta os pedaços,
compila, monta o CSS e o HTML, roda o teste num navegador de verdade e
prepara a pasta `publicar/`. Para pular o teste: `./montar.sh --sem-teste`.

Passo a passo, se preferir na mão:

```bash
python3 gerar_icones.py         # ícones, favicon e a marca embutida no base.jsx

cat base.jsx parte2.jsx parte3.jsx parte10.jsx parte11.jsx parte13.jsx \
    parte12.jsx parte4.jsx parte5.jsx parte6.jsx parte7.jsx parte9.jsx \
    parte14.jsx parte8.jsx > app.jsx

npx esbuild main.jsx --bundle --minify --format=iife --loader:.jsx=jsx \
  --define:process.env.NODE_ENV='"production"' \
  --define:__PRESET__=false --define:__VERSAO__='"07/09 12:00"' \
  --outfile=b-limpa.js

python3 gerar_css.py            # varre o app.jsx e escreve utils.css
python3 montar.py               # junta CSS + JS num index.html autônomo
python3 publicar.py             # copia o que vai ao ar para ../publicar
```

A ordem da concatenação importa: `parte8.jsx` tem o componente raiz e vai por
último; `parte13.jsx` precisa vir antes de `parte12.jsx`.

## Testar

```bash
python3 montar_teste.py         # gera teste.html, igual ao site mas com o plano liberado
node testar.mjs                 # abre no Chromium e confere tudo
node testar.mjs index.html      # confere o arquivo de produção
node testar-assistente.mjs      # confere a função da IA, sem gastar cota
node testar-compra.mjs          # confere o aviso de compra: segredo, plano e estorno
node testar-salas.mjs           # confere as salas de amigos, com banco de mentira
node testar-baralhos.mjs        # confere os baralhos publicados: quem publica e quem baixa
node testar-api.mjs             # confere como o app acha o servidor das rotas /api
node testar-worker.mjs          # confere o roteamento e os cabeçalhos de CORS
```

O `teste.html` existe só para o teste conseguir abrir as abas pagas. Ele é
gerado a partir de uma cópia do `app.jsx` e **não** entra na pasta de
publicação. O teste falha se qualquer aba não montar, se sobrar erro no
console, se as pastas ou os cartões sumirem ao recarregar a página, ou se a
troca de esquema de revisão e de aparência não pegar. O bloco da agenda
marcado como cumprido entra nessa mesma conferência: é o tipo de coisa que
some calada quando falta uma linha no `normalize()`.

## O que é cada arquivo

| Arquivo | Conteúdo |
|---|---|
| `base.jsx` | tema em variáveis CSS, constantes, datas, esquemas de revisão, marca embutida |
| `parte2.jsx` | estado, armazenamento local, peças de interface |
| `parte3.jsx` | conta e sincronização no Firebase, Google Agenda, cronômetro |
| `parte10.jsx` | cena de fundo em canvas, medidores, radar |
| `parte11.jsx` | assinatura, tela de planos, painel do dono |
| `parte13.jsx` | leitor de `.apkg` do Anki e imagens no IndexedDB |
| `parte12.jsx` | flashcards, pastas, repetição espaçada |
| `parte4.jsx` | agenda da Rotina (semana e dia) e aba Temas |
| `parte5.jsx` | aba Foco e aba Hoje |
| `parte6.jsx` | Matérias, Revisões, escolha do esquema, exportação `.ics` |
| `parte7.jsx` | Metas, Progresso, aparência, painel de conta |
| `parte9.jsx` | assistente que conversa com a API |
| `parte14.jsx` | salas de amigos, ranking e envio do perfil público |
| `parte8.jsx` | componente raiz, cabeçalho, barra lateral, rodapé |
| `curriculo.js` | cronograma próprio: 90 aulas em 34 blocos de especialidade |
| `gerar_css.py` | varre o `app.jsx` e gera só as regras das classes usadas |
| `gerar_icones.py` | ícones, favicon e marca, a partir de `logo-original.png` |
| `montar.py` | junta CSS e JS num `index.html` autônomo |
| `montar_teste.py` | mesma coisa, com o plano liberado, para o teste |
| `publicar.py` | monta a pasta `publicar/`, que é o que vai ao ar |
| `testar.mjs` | teste de fumaça no Chromium |
| `testar-assistente.mjs` | teste da função da IA, com servidor falso no lugar da API |
| `testar-compra.mjs` | teste do aviso de compra: segredo, planos e estorno |
| `testar-cupom.mjs` | teste do resgate de cupom, com Firebase falso |
| `testar-acessos.mjs` | teste do painel de acessos do dono |
| `testar-salas.mjs` | teste das salas de amigos e dos recortes do ranking |
| `testar-baralhos.mjs` | teste dos baralhos publicados: quem publica e quem baixa |
| `testar-api.mjs` | teste de como o app acha o servidor das rotas `/api` |
| `testar-worker.mjs` | teste do roteamento: o que é API e o que é arquivo |
| `montar.sh` | roda tudo na ordem |

## Trocar a logo

Substitua `logo-original.png` por um PNG quadrado com fundo transparente e
rode `./montar.sh`. O `gerar_icones.py` gera os tamanhos, o favicon, a versão
maskable e reescreve sozinho a linha `const MARCA = ...` no `base.jsx`.

## CSS

Não é Tailwind. O `gerar_css.py` varre as classes usadas no `app.jsx` e
escreve o `classes.txt` e o `utils.css` com só o que é preciso. Uma classe
utilitária que o tradutor não conheça para a compilação com `SEM REGRA:`, de
propósito. Classes de comportamento (`vidro`, `brilhar`, `aba`, `nota`,
`aura`, `rise`, `marca`, `breathe`, `pulso`) são escritas no `<style>` do
próprio app e ficam na lista `DO_APP`, no topo do script.

O modo celular funciona escopando as regras `sm:` e `lg:` sob
`html:not([data-layout="movel"])`, então forçar o celular desliga as regras de
tela larga.

## Aparência e revisão, escolhidas por quem usa

- As cores de acento são `--neon` e `--neon2`. As cinco cores de área
  (`--a-CL`, `--a-CI`, `--a-GO`, `--a-PE`, `--a-PR`) não mudam nunca.
- As fontes são `--f-ui`, `--f-serif` e `--f-mono`. Por isso `F_UI`, `F_SERIF`
  e `F_MONO`, no `base.jsx`, são `var(...)` e não o nome da fonte.
- Quem escreve essas variáveis no `<html>` é o componente raiz, no
  `parte8.jsx`.
- Os esquemas de intervalo de revisão estão em `ESQUEMAS`, no `base.jsx`. A
  escada em uso sai da função `escada(data.revisao)`.

## Código do servidor

Fica em **`worker/`, na raiz do repositório** — fora de `publicar/`, que é a
pasta servida como arquivo. Assim o código não fica acessível como texto,
problema que existia quando as funções moravam dentro do que ia ao ar.

| Arquivo | Conteúdo |
|---|---|
| `worker/index.js` | entrada: decide o que é `/api/...` e o que é arquivo |
| `worker/api/assistente.js` | conversa com a IA; só o administrador pode usar |
| `worker/api/cupom.js` | confere o cupom e libera o plano |
| `worker/api/compra.js` | recebe o aviso de compra da Kiwify ou Hotmart |
| `worker/api/acessos.js` | painel do dono, libera e revoga acessos |
| `worker/api/salas.js` | salas de amigos: cria, entra, sai e monta o ranking |
| `worker/api/baralhos.js` | baralhos que o dono publica, e a cópia para quem assina |
| `worker/api/_comum.js` | JWT, Firestore e identidade |

Acrescentar um endereço é escrever o arquivo em `worker/api/` e citá-lo na
tabela `ROTAS`, no `worker/index.js`.

O `wrangler.jsonc`, na raiz, amarra tudo: `assets.directory` aponta para
`publicar/`, e `run_worker_first: ["/api/*"]` garante que só as rotas de API
passem pelo Worker. Todo o resto é servido direto do arquivo, sem custo de
invocação. O `not_found_handling: "single-page-application"` faz um endereço
desconhecido devolver o `index.html`, então atualizar a página numa rota
inventada não dá erro.

### Onde o app procura as rotas /api

O site e o servidor podem estar em endereços diferentes: enquanto as páginas
vêm do Firebase Hosting, quem responde `/api` é o Worker, noutro domínio.

O `chamarApi`, no `parte2.jsx`, resolve isso sozinho: tenta o próprio site e,
se a resposta for a página em vez de dados, repete no Worker e guarda qual
dos dois funcionou. Era esta a causa do "Não deu certo." no painel de acessos
e no cupom. Para fixar um endereço, preencha `window.CADENCIA_API` no topo do
`index.html` — string vazia significa "o próprio site", que é o certo depois
que o domínio apontar para o Worker.

Do lado do Worker, o `index.js` responde os cabeçalhos de CORS. A lista de
sites liberados é fechada de propósito: com `*` qualquer página conseguiria
chamar estas rotas com o token de quem estivesse logado. Para acrescentar
endereço sem mexer no código, cadastre `ORIGENS`, separando por vírgula.

**A assinatura do JWT usa WebCrypto, não `node:crypto`.** O runtime de
Workers não tem `createSign` nem `Buffer`. O WebCrypto existe nos dois
lugares, e a assinatura sai byte a byte igual à do `node:crypto` — conferido
em teste.

Variáveis de ambiente: `FIREBASE_API_KEY`, `FIREBASE_SERVICE_ACCOUNT`,
`WEBHOOK_SEGREDO`, `CUPONS`, a chave da IA e, para o Notion,
`NOTION_CLIENT_ID`, `NOTION_CLIENT_SECRET` e `NOTION_REDIRECT`.

### Ligar o Notion (MEDPlanner)

A rota `/api/notion` liga a conta de quem usa o site à conta do Notion dela e
lê de lá o MEDPlanner. Enquanto as variáveis não existirem, o painel na aba
Assistente diz isso na tela em vez de mandar a pessoa para uma página de erro
do Notion — e nada mais acontece.

Uma vez só, no [notion.so/my-integrations](https://www.notion.so/my-integrations):

1. **New integration** → tipo **Public**, para outras pessoas poderem conectar
   o Notion delas (uma integração *Internal* só enxerga o seu próprio espaço)
2. em **Redirect URIs**, cadastrar exatamente `https://cadenciamed.com.br/notion`
3. copiar o **OAuth client ID** e o **OAuth client secret**
4. no Worker, em **Settings → Variables and Secrets**, cadastrar como *Secret*
   `NOTION_CLIENT_ID` e `NOTION_CLIENT_SECRET`; `NOTION_REDIRECT` só é preciso
   se o endereço de volta for outro

O endereço de volta é escolhido pelo servidor e conferido pelo Notion contra
o que está cadastrado. Aceitar o que a página mandasse deixaria alguém receber
o código de autorização em outro site.

**O token de leitura de cada pessoa fica em `notion/{uid}`**, coleção fechada
para o navegador nas duas pontas, e nenhuma resposta da rota o devolve — há
teste para isso. Quem conectou desliga pelo painel ou pelo próprio Notion, em
Configurações → Conexões.

O encaixe entre as linhas do planner e as aulas do site é por comparação de
texto: o que casa com folga entra sozinho, o que ficou parecido vai para uma
lista de conferência antes de escrever qualquer coisa. A importação só
acrescenta — o que já está marcado no app continua como está.

A pasta `fonte/netlify/` é a versão antiga, do Netlify, guardada só como
reserva. Quando o Cloudflare estiver firme, dá para apagar.

## Publicar

Como está no ar hoje, em dois lugares:

| Quem serve | O quê | Como sobe |
|---|---|---|
| **Firebase Hosting** | `cadenciamed.com.br`, as páginas | `.github/workflows/deploy-firebase.yml` |
| **Cloudflare Worker** | as rotas `/api/...` | `.github/workflows/publicar.yml` |

Os dois disparam no mesmo push e nenhum dos dois compila nada: mandam a pasta
`publicar/` como ela está no repositório.

**Cabeçalhos de cache ficam no `firebase.json`, não no `publicar/_headers`.**
Aquele arquivo é formato do Netlify e do Cloudflare; o Firebase o ignora em
silêncio e aplica o padrão dele, que guarda HTML por uma hora. O app inteiro
é o `index.html`, então nessa hora quem já visitou continua vendo a versão
anterior depois de publicar — e não há erro nenhum para denunciar isso. O
`firebase.json` marca o `index.html` como `no-cache` justamente por isso. Quem refaz essa pasta é o
`fonte/montar.sh`, que abre um navegador para os testes e por isso não cabe
num passo de deploy — **rode-o e faça commit de `publicar/` antes de enviar**,
senão o push publica a versão anterior sem avisar.

As chamadas do site ao Worker atravessam domínios, e é o `chamarApi` mais os
cabeçalhos de CORS que fazem isso funcionar. Se um dia o domínio apontar para
o Worker, os dois viram o mesmo lugar e o Firebase Hosting sai de cena.

### Publicar tudo no Cloudflare, se quiser juntar os dois

Uma vez só, na criação do projeto:

1. dash.cloudflare.com → **Workers & Pages** → **Create** → **Import a
   repository** → escolher este repositório
2. **Build command**: deixar vazio (o repositório já tem tudo compilado)
3. **Deploy command**: `npx wrangler deploy`
4. Em **Settings → Variables and Secrets**, cadastrar como *Secret*:
   `FIREBASE_API_KEY`, `FIREBASE_SERVICE_ACCOUNT`, `GEMINI_API_KEY` e,
   quando houver checkout, `WEBHOOK_SEGREDO`

Depois disso, cada `git push` publica sozinho. Conferir abrindo
`/api/assistente` no navegador: responde qual IA está ligada.

Pela linha de comando, com a conta já autenticada: `npm run publicar`. Para
ver o que seria enviado sem enviar nada: `npm run publicar:conferir`.

Quem preferir publicar pelo GitHub em vez do painel do Cloudflare já tem o
caminho pronto em `.github/workflows/publicar.yml`. Falta só guardar o token
em **Settings → Secrets and variables → Actions**, com o nome
`CLOUDFLARE_API_TOKEN` (o token sai de dash.cloudflare.com → My Profile → API
Tokens → *Edit Cloudflare Workers*). Enquanto o segredo não existir, o fluxo
avisa e para sem erro. Os dois caminhos fazem a mesma coisa; usar um só evita
publicar duas vezes a cada push.

### Mudar o endereço de hospedagem

Enquanto o site estiver no Firebase Hosting, `/api/...` devolve o
`index.html` com status 200, porque hospedagem de arquivo não roda código. O
app diz isso na tela em vez de um "não deu certo" vago, mas os painéis de
acesso e de cupom só funcionam de verdade depois de o Worker estar no ar.

Para apontar `cadenciamed.com.br` do Firebase para o Cloudflare:

1. No registro.br, trocar os servidores DNS pelos dois que o Cloudflare
   informa ao adicionar o domínio (**Add a domain**). A propagação leva de
   minutos a algumas horas.
2. No Worker, **Settings → Domains & Routes → Add → Custom domain**, com
   `cadenciamed.com.br` e `www.cadenciamed.com.br`.
3. Só então tirar o domínio do Firebase Hosting, para não ficar sem site no
   meio do caminho.

### Qual IA o assistente usa

O `worker/api/assistente.js` fala com os dois provedores. Quem decide é a
variável de ambiente cadastrada no Cloudflare:

| Variável | Provedor | Custo |
|---|---|---|
| `GEMINI_API_KEY` | Gemini, do Google | tem camada gratuita (aistudio.google.com/apikey) |
| `ANTHROPIC_API_KEY` | Claude, da Anthropic | pré-pago (console.anthropic.com) |

Com as duas cadastradas o Gemini é o escolhido. Para forçar um deles,
cadastre `IA_PROVEDOR` com `gemini` ou `anthropic`. O modelo também dá para
trocar sem mexer no código, por `GEMINI_MODELO` e `ANTHROPIC_MODELO`.

**O Google aposenta modelo sem aviso.** O `gemini-2.5-flash` parou de aceitar
conta nova e o assistente passou a devolver a recusa da própria API. Quando
acontecer de novo, não é preciso recompilar nem publicar: cadastre
`GEMINI_MODELO` no Worker com o nome que a mensagem de erro indicar. A
mensagem na tela já diz isso, e repete o substituto que o provedor sugeriu.

A assinatura do Gemini Advanced e a do Claude **não** dão acesso às APIs: são
cobranças separadas. A camada gratuita do Gemini vem da chave do AI Studio,
não do plano Pro.

## Cronograma

O `curriculo.js` tem a ordem de estudo da casa, em blocos de especialidade,
sem vínculo com o calendário de nenhum curso preparatório.

**O `id` de cada aula é fixo e nunca pode ser reaproveitado.** É ele que fica
gravado no progresso de quem usa: mudar o id de uma aula equivale a apagar o
que já foi marcado nela. Reordenar a lista, renomear o título ou acrescentar
aula é seguro, desde que os ids fiquem como estão. A tabela `ID_ANTIGO`, no
fim do arquivo, traduz o formato antigo (a posição na lista) e não deve ser
mexida nem encurtada.

## Cupons

Os códigos ficam no `worker/api/cupom.js`, no servidor, e nunca no navegador.
Para trocá-los sem mexer no código, cadastre `CUPONS` no Cloudflare, no formato
`codigo:plano,codigo:plano` (planos: mensal, anual, vitalicio). Enquanto essa
variável não existir, valem os dois cupons escritos no arquivo.

## Cartões

O estudo abre em tela cheia, por cima de tudo. Não é capricho: desenhado
dentro da página, o cartão dividia espaço com o cabeçalho, o menu e o rodapé,
e no celular sobrava uma faixa. A altura usa `dvh`, e não `vh`, senão a barra
do navegador do celular cobre os botões justamente na hora de responder.

A resposta aparece **abaixo** da pergunta, não no lugar dela: some a pergunta
e a pessoa responde sem lembrar o que foi perguntado.

Cada baralho tem ajustes próprios em `data.baralhoCfg`, com a pasta na chave —
dois baralhos de mesmo nome em pastas diferentes são baralhos diferentes.
Renomear, mover ou apagar um baralho muda essa chave, então o ajuste vai junto
(`moverCfg`). Sem isso o embaralhar e os limites voltariam ao padrão calados.

O mínimo por dia adianta os cartões que vencem mais cedo; o máximo corta o
excesso. Estudando vários baralhos de uma vez, cada um entra com os próprios
ajustes, um depois do outro: misturar tudo num embaralhamento só desrespeitaria
quem desligou o embaralhar no baralho dele.

### Baralhos publicados

O dono publica um baralho pela engrenagem da linha dele, ou a **pasta
inteira** pelo botão na linha da pasta. Publicando a pasta, cada cartão leva
o baralho dele junto, e quem copia recebe a pasta já dividida do mesmo jeito.
A pasta e um baralho de mesmo nome dentro dela não caem no mesmo endereço,
senão um sobrescreveria o outro.

Quem assina copia para a própria conta. É **cópia**, não pasta compartilhada, e de propósito:
duas pessoas estudando o mesmo cartão têm intervalos de revisão diferentes.

As imagens não viajam — elas moram no IndexedDB de cada aparelho, então o que
iria junto seria um nome de arquivo que não existe do outro lado. O
agendamento de quem publicou também fica de fora: quem copia começa do zero.

## Primeira tela

Abre pedindo conta, não o nome. Pedir só o nome deixava a pessoa estudar e
descobrir depois que nada estava sincronizado.

A saída "usar sem conta por enquanto" existe, e a tela cai nela sozinha
quando a sincronização está desligada ou fora do ar — sem essa reserva, quem
abrisse o site com o Firebase indisponível veria um login que não funciona e
não teria como passar. É o caminho que o teste do navegador exercita, já que
lá não há rede.

"Manter conectado" escolhe onde a sessão fica guardada: no disco, sobrevivendo
a fechar o navegador, ou só na aba. Precisa ser decidido **antes** de entrar,
porque depois já está gravado.

## Alvos de toque

Botões abaixo de 32px são chute num aparelho de dedo. As classes `.toque` e
`.toque-larg`, no `<style>` do `parte8.jsx`, crescem a área só sob
`(pointer: coarse)` — no computador o cursor acerta qualquer coisa, e engordar
tudo lá só ocuparia espaço à toa. Elas estão na lista `DO_APP` do
`gerar_css.py`, porque não são utilitárias.

## Assistente

A resposta chega em markdown e é desenhada pelo `Markdown`, no `parte9.jsx` —
um pedaço pequeno da linguagem, o que a resposta realmente usa. Cada trecho
vira elemento React, nunca HTML montado à mão: o texto vem de fora, e montar
HTML com ele abriria a porta para injeção.

O teto de saída é 4000 tokens. Estava em 1400, e um plano de semana passava
disso: a resposta chegava cortada no meio da frase sem nada dizendo por quê.
Quando ainda assim bater no teto, o servidor devolve `cortado: true` e a
bolha avisa, em vez de parecer travamento.

## Salas de amigos

Uma sala é um nome mais uma senha. O nome vira apelido (`Plantão da
Madrugada!` → `plantao-da-madrugada`), então maiúscula, acento e espaço levam
todo mundo à mesma sala em vez de criarem quase-duplicatas.

A senha nunca é guardada: fica gravado o PBKDF2 dela, com um sal sorteado por
sala. A conferência é no servidor — no navegador bastaria abrir o código da
página para entrar em qualquer sala.

O ranking tem três recortes: **semana** (o padrão, porque é a corrida em que
dá para virar o jogo), **mês** e **desde sempre**. Quem decide de que semana e
de que mês se trata é o servidor, no fuso de São Paulo — deixar cada navegador
decidir faria duas pessoas da mesma sala compararem semanas diferentes sem
perceber.

Cada recorte é gravado com a chave do período junto. Quem estudou muito na
semana passada e não abriu o app desde então aparece zerado nesta semana, com
a observação "não abriu o app neste período", em vez de liderar com número
velho.

Os números do ranking ficam em `perfis/{uid}`, escrito pelo próprio dono e
lido só por ele. Quem monta o ranking é o servidor, com a conta de serviço:
sem isso bastaria saber o uid de alguém para ler os números dessa pessoa sem
estar em sala nenhuma. Aparecem o nome do perfil, os minutos lançados em
sessão, as questões e o acerto — nada do que foi estudado.

Cada pessoa decide se aparece, pela caixa na própria aba. Desligado, o app
grava o perfil **zerado**, com a marca de oculto: os números nem chegam a
sair do aparelho. No ranking essa pessoa fica no fim e sem posição — aparecer
em último com zero horas exporia uma escolha de privacidade como se fosse
desempenho ruim.

Quem publica o perfil é o `usePerfilPublico`, chamado no componente raiz e
não dentro da aba. Fosse dentro da aba, o ranking mostraria zero para quem
estudou e simplesmente não a tinha aberto.

## Domínio

Ao acrescentar ou trocar de domínio, três lugares precisam saber, não só a
hospedagem. Os dois primeiros quebram calados, e só no domínio novo:

1. **Firebase** → Authentication → Settings → Domínios autorizados. Sem isso o
   login falha com `auth/unauthorized-domain`. O app mostra essa mensagem em
   português, então o erro na tela já diz o que fazer.
2. **Google Cloud** → credencial ID do cliente OAuth → Origens JavaScript
   autorizadas. Sem isso o Google Agenda dá erro 400 `origin_mismatch`.
3. **Kiwify ou Hotmart** → o endereço do aviso de compra (webhook), que agora
   é `https://cadenciamed.com.br/api/compra`.

O domínio antigo continua funcionando enquanto estiver na lista, o que ajuda a
migrar sem apagão.

## Cuidados

- Nunca editar o `index.html` gerado, que é minificado.
- Chave de API só no servidor, nunca no front-end.
- `assinaturas/{uid}` é somente leitura no cliente; quem grava é o servidor.
- Testar num navegador de verdade antes de publicar.
- Tudo que for guardado precisa passar pelo `normalize()`, no `parte2.jsx`.
  O que não for copiado ali se perde ao recarregar a página.
- Não citar cursos preparatórios em lugar nenhum do site.

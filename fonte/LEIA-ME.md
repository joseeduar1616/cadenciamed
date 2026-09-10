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
    parte12.jsx parte17.jsx parte4.jsx parte5.jsx parte6.jsx parte7.jsx parte9.jsx \
    parte14.jsx parte15.jsx parte16.jsx parte8.jsx > app.jsx

npx esbuild main.jsx --bundle --minify --format=iife --loader:.jsx=jsx \
  --define:process.env.NODE_ENV='"production"' \
  --define:__PRESET__=false --define:__VERSAO__='"07/09 12:00"' \
  --outfile=b-limpa.js

python3 gerar_css.py            # varre o app.jsx e escreve utils.css
python3 montar.py               # junta CSS + JS num index.html autônomo
python3 publicar.py             # copia o que vai ao ar para ../publicar
```

A ordem da concatenação importa: `parte8.jsx` tem o componente raiz e vai por
último; `parte13.jsx` precisa vir antes de `parte12.jsx` e de `parte17.jsx`,
que guardam imagem no mesmo IndexedDB.

## Testar

```bash
python3 montar_teste.py         # gera teste.html, igual ao site mas com o plano liberado
node testar.mjs                 # abre no Chromium e confere tudo
node testar.mjs index.html      # confere o arquivo de produção
node testar-assistente.mjs      # confere a função da IA, sem gastar cota
node testar-flashcards-ia.mjs   # confere o montador de flashcards a partir de PDF/Word
node testar-pastas.mjs          # confere em qual pasta grande cai o baralho de cada área
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
| `parte17.jsx` | anotação rica por matéria, com imagem no IndexedDB |
| `parte4.jsx` | agenda da Rotina (semana e dia) e aba Temas |
| `parte5.jsx` | aba Foco e aba Hoje |
| `parte6.jsx` | Matérias, Revisões, escolha do esquema, exportação `.ics` |
| `parte7.jsx` | Metas, Progresso, aparência, painel de conta |
| `parte9.jsx` | assistente que conversa com a API |
| `parte14.jsx` | salas de amigos, ranking e envio do perfil público |
| `parte16.jsx` | aba Mentor: lista de alunos e o painel de cada um |
| `parte8.jsx` | componente raiz, cabeçalho, barra lateral, rodapé |
| `curriculo.js` | cronograma próprio: 90 aulas em 34 blocos de especialidade |
| `gerar_css.py` | varre o `app.jsx` e gera só as regras das classes usadas |
| `gerar_icones.py` | ícones, favicon e marca, a partir de `logo-original.png` |
| `montar.py` | junta CSS e JS num `index.html` autônomo |
| `montar_teste.py` | mesma coisa, com o plano liberado, para o teste |
| `publicar.py` | monta a pasta `publicar/`, que é o que vai ao ar |
| `testar.mjs` | teste de fumaça no Chromium |
| `testar-assistente.mjs` | teste da função da IA, com servidor falso no lugar da API |
| `testar-flashcards-ia.mjs` | teste do montador de flashcards a partir de PDF/Word, mesma técnica de servidor falso |
| `testar-cronograma-ia.mjs` | teste de organizar o cronograma de outro curso (ou ciclo clínico) em matérias, mesma técnica |
| `testar-ler-foto.mjs` | teste da transcrição de foto de cronograma, com a IA de mentira |
| `testar-buscar-imagem.mjs` | teste da ponte que traz figura de fora, incluindo o que ela precisa recusar |
| `testar-google.mjs` | teste da ligação permanente com o Google, com o OAuth de mentira |
| `testar-curriculo.mjs` | teste de substituir o currículo padrão, no todo ou só numa área |
| `testar-cores.mjs` | teste da cor própria: ajuste de legibilidade e sugestão de combinação |
| `testar-pastas.mjs` | teste de em qual pasta grande cai o baralho de cada área, incluindo o reaproveitamento de pasta já existente |
| `testar-recorte-pdf.mjs` | teste da matemática que acha o retângulo de cada figura num PDF, com objetos falsos, sem abrir PDF nenhum |
| `testar-compra.mjs` | teste do aviso de compra: segredo, planos e estorno |
| `testar-cupom.mjs` | teste do resgate de cupom, com Firebase falso |
| `testar-acessos.mjs` | teste do painel de acessos do dono |
| `testar-salas.mjs` | teste das salas de amigos e dos recortes do ranking |
| `testar-mentor.mjs` | teste da aba Mentor: papel, alunos, rotina, metas e currículo |
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

- As cores de acento são `--neon` e `--neon2`.
- **A cor escolhida pinta o site inteiro, não só os acentos.** Antes, escolher
  rosa deixava rosa o botão e o número em destaque, e o resto continuava roxo,
  porque fundo, painéis, linhas e texto nasciam roxos no `THEME_CSS`. Agora
  `ambienteDoTema` (`base.jsx`) recalcula tudo isso: cada valor é a cor
  original convertida para HSL, com a **saturação e a claridade preservadas**
  e só o matiz trocado pelo da cor escolhida. É o que faz o rosa ficar rosa em
  tudo sem clarear o fundo nem apagar o texto. As cinco cores de área também
  entram na família (`AREAS_DO_TEMA`), espalhadas em matiz, saturação e
  claridade para continuarem distinguíveis no radar e nos gráficos.
- **Onde essas variáveis são escritas importa.** Elas vão no `style` do
  elemento raiz do app, e não só no `<html>`: o `THEME_CSS` redeclara as
  mesmas variáveis num `[data-theme]` que casa com esse elemento, e regra de
  folha de estilo ganha de variável herdada do `<html>`. Escritas só no
  `<html>`, o fundo da página mudava e os painéis continuavam roxos — o
  defeito parecia "a cor não pega" e era ordem de cascata. O `<html>`
  continua recebendo uma cópia, para o fundo do body e a cor da barra do
  navegador no celular.
- A cor de origem (`cadencia`) é a única que **não** passa por isso: ela é o
  desenho original, e recalcular o roxo a partir dele mudaria o tom por
  arredondamento.
- `--neon`/`--neon2` valem para os dois temas (claro e escuro) — a troca de
  tema não as toca, só as outras variáveis. Escolhendo uma cor própria (em
  vez de uma das prontas, `CORES_TEMA`), `corLegivel` (`base.jsx`) ajusta a
  saturação e a claridade para a cor continuar legível nos dois fundos —
  sem isso uma cor clara demais sumiria no fundo claro, e o oposto no
  escuro. A segunda cor nasce sugerida a partir da primeira, girando o
  matiz (`corCombinando`), para nunca ser um palpite solto sem relação com
  a primeira — a pessoa continua livre para trocar as duas depois.
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
| `worker/api/assistente.js` | conversa com a IA; o dono e quem assina podem usar |
| `worker/api/flashcards-ia.js` | monta flashcards a partir do texto extraído de um PDF/Word |
| `worker/api/cronograma-ia.js` | organiza o cronograma de outro curso (ou ciclo clínico) em matérias |
| `worker/api/ler-foto.js` | transcreve o texto da foto de um cronograma, para entrar como se tivesse sido colado |
| `worker/api/buscar-imagem.js` | busca a figura que o navegador não consegue ler por CORS, para ela ficar dentro da anotação |
| `worker/api/google.js` | liga a conta do Google de vez: guarda o token de atualização e entrega acesso sem janela |
| `worker/api/mentor.js` | papel de mentor, alunos, e a rotina/metas/currículo de cada um |
| `worker/api/cupom.js` | confere o cupom e libera o plano |
| `worker/api/compra.js` | recebe o aviso de compra da Kiwify ou Hotmart |
| `worker/api/acessos.js` | painel do dono, libera e revoga acessos |
| `worker/api/salas.js` | salas de amigos: cria, entra, sai e monta o ranking |
| `worker/api/baralhos.js` | baralhos que o dono publica, e a cópia para quem assina |
| `worker/api/_ia.js` | fala com o Gemini e a Anthropic; compartilhado entre o assistente e o montador de flashcards |
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

### Ligar o Notion

A rota `/api/notion` liga a conta de quem usa o site à conta do Notion dela e
lê de lá o cronograma. Enquanto as variáveis não existirem, o painel na aba
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

Os dois disparam no mesmo push para a `main` e nenhum dos dois compila nada:
mandam a pasta `publicar/` como ela está no repositório.

> Até setembro de 2026 a `main` era outra coisa: um histórico separado, sem
> ancestral comum com este, guardando um `cadenciamed-publicar.zip` e um
> workflow `firebase-hosting.yml` que publicava no mesmo projeto do Firebase.
> O código de verdade morava numa branch de trabalho. Eram duas publicações
> disputando o mesmo site, e um push na `main` derrubava a versão nova. Agora
> a `main` é o tronco. Aquele estado antigo ficou guardado na branch
> `arquivo-main-zip-2026-09`, caso um dia falte alguma coisa de lá.

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

`worker/api/assistente.js` e `worker/api/flashcards-ia.js` falam com os dois
provedores através do mesmo `worker/api/_ia.js`, e valem as mesmas variáveis
para os dois — não tem uma chave para o assistente e outra para os
flashcards. Quem decide é a variável de ambiente cadastrada no Cloudflare:

| Variável | Provedor | Custo |
|---|---|---|
| `GEMINI_API_KEY` | Gemini, do Google | tem camada gratuita (aistudio.google.com/apikey) |
| `ANTHROPIC_API_KEY` | Claude, da Anthropic | pré-pago (console.anthropic.com) |

Com as duas cadastradas o Gemini é o escolhido. Para forçar um deles,
cadastre `IA_PROVEDOR` com `gemini` ou `anthropic`. O modelo também dá para
trocar sem mexer no código, por `GEMINI_MODELO` e `ANTHROPIC_MODELO`.

O padrão é o **`gemini-3.6-flash`** (`GEMINI_PADRAO`, em
`worker/api/_ia.js`): o Flash é o corte rápido e barato, que é o que estas
rotas pedem. Responder uma dúvida de estudo, separar um cronograma em aulas e
transcrever a foto de um calendário não precisam do modelo grande, e o grande
custa algumas vezes mais por pedido.

**O Google aposenta modelo sem aviso**, e já aconteceu duas vezes aqui: o
`gemini-2.5-flash` parou de aceitar conta nova, e depois o `gemini-1.5-flash`
deixou de ser reconhecido para chave de projeto novo. Quando acontecer de
novo, não é preciso recompilar nem publicar na hora: cadastre `GEMINI_MODELO`
no Worker com o nome que a mensagem de erro indicar, e ela ganha do padrão. A
mensagem na tela já diz isso, e repete o substituto que o provedor sugeriu.

Só que a variável **ganha em silêncio**: com um `GEMINI_MODELO` cadastrado, o
site roda aquele modelo, não o do código, e os dois podem discordar por meses
sem ninguém notar. `GET /api/assistente` responde qual está no ar de verdade
(`{"provedor":"gemini","modelo":"..."}`) — vale conferir depois de mexer. E,
passado o aperto, traga o nome novo para o `GEMINI_PADRAO` e apague a
variável, para o padrão voltar a ser verdade. O teste do assistente importa
`GEMINI_PADRAO` em vez de repetir o nome, então ele acompanha sozinho.

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

### Currículo próprio

Na aba Cronograma, a pessoa pode anexar (colar, enviar PDF/Word/texto, ou
mandar uma foto) o cronograma de outro cursinho, ou o conteúdo do ciclo
clínico (estágio) que está cursando agora. A rota `/api/cronograma-ia` (mesmo padrão
de `_ia.js` do montador de flashcards) organiza o material em matérias,
classificadas nas mesmas 5 áreas do currículo padrão (`CL`/`CI`/`GO`/`PE`/
`PR` — `AREAS`, no `base.jsx`). A pessoa revê o que a IA separou, desmarca
áreas que não quer trocar, e confirma.

### A foto do cronograma

Muita gente recebe o cronograma no papel ou vê no mural, e o que tem no
telefone é a foto. A `/api/ler-foto` manda a imagem para a mesma IA das
outras rotas e devolve **só o texto transcrito** — daí em diante o caminho é
o mesmo do PDF, e nenhum campo da aba precisa saber que existe IA no meio.

O navegador reduz a foto antes de mandar: 1600px no lado maior e JPEG de
qualidade 0,72 (`reduzirFoto`, em `parte9.jsx`). Uma foto de telefone tem
4000px e vários megabytes, e nesse tamanho demoraria para subir sem ler nada
melhor: texto de cartaz e de folha impressa fica legível bem antes disso.
HEIC do iPhone não é desenhado pelo navegador, então nem chega a ser
reduzido — a mensagem pede JPEG.

Como custa cota da IA, ler foto exige plano, igual ao "organizar com a IA".
Arquivo e texto colado continuam abertos para todo mundo, porque são lidos
no próprio navegador.

### As datas do período

`data.cronograma` guarda, além do texto, o `inicio` e o `fim` do período. A
**data da prova não está aí de propósito**: é a de sempre, em
`data.profile.examDate`, que é quem manda na projeção de ritmo do painel
inteiro. Ter duas seria ter duas contagens regressivas discordando uma da
outra; a aba Cronograma só oferece um segundo lugar para editar a mesma.

As três aparecem no `resumoParaIA` em linha separada do texto do curso: elas
são dado do painel, conferido pela pessoa, e o calendário é material de fora.
É o que deixa o assistente dizer "faltam três semanas" sem depender de achar
isso escrito no meio do calendário.

O resultado fica em `data.cronogramaProprio`: uma lista no mesmo formato do
currículo padrão (`{id, week, area, title, esp, bonus}`), com o `id`
prefixado por `"pp-"` (`materiaParaAula`, em `parte9.jsx`) para nunca bater
com o id de uma aula padrão. Cada leva (`aplicarNoCronogramaProprio`) mexe
só nas áreas que vieram nela, preservando o que já tinha sido trocado antes
noutra área — é o que faz um envio "só uma área" (ciclo clínico) trocar só
aquele pedaço, e um envio com as 5 áreas trocar o currículo inteiro, sem
duplicar entre uma leva e outra.

**Somar ou substituir, escolhido na hora de revisar.** Duas pessoas usam
essa tela por motivos bem diferentes: quem segue outro curso inteiro no
lugar da residência quer **substituir** (era o único comportamento antes
disso); quem está no ciclo clínico e quer estudar as duas coisas ao mesmo
tempo quer **somar** — nenhuma aula da residência pode sumir por causa
disso. No modo "somar", `aplicarNoCronogramaProprio` copia as aulas padrão
daquela área (do `CURRICULUM`, mantendo o `id` de cada uma — é o que faz o
progresso já marcado continuar valendo) e põe as aulas novas depois delas,
as duas dentro da mesma leva de `cronogramaProprio`. Funciona porque
`montarCurriculo` só sabe fazer uma coisa com uma área presente em
`cronogramaProprio`: **excluir** o padrão dela — "somar" só engana essa
regra pré-colocando uma cópia do padrão ali dentro, então nenhuma outra
parte do app precisou mudar. Somar de novo na mesma área substitui a leva
de "somar" anterior (não empilha duas cópias do padrão uma em cima da
outra).

**Qual currículo está ativo, na prática**, é sempre `montarCurriculo(data.
cronogramaProprio)` (`base.jsx`): sem currículo próprio, é o padrão inteiro;
com ele, é o currículo próprio mais o que sobrou do padrão nas áreas que ele
não cobre. Como o `id` de cada aula é fixo e o progresso fica preso a ele, as
aulas do padrão que saem da lista ativa não são apagadas — `data.marks`
continua com o que foi marcado nelas, só sem uso, e reaparece se a pessoa
apagar o currículo próprio (botão "voltar ao currículo padrão") e voltar ao
padrão.

Como o restante do app (Matérias, Foco, Progresso, Cartões, o resumo que o
Assistente lê, o seletor de matéria...) até então lia sempre as constantes
fixas `CURRICULUM`/`BY_ID`/`TOTAL_BONUS`, essas telas passaram a ler o
currículo ativo pelo hook `useAtivo()`, que lê o `AtivoContext` — fornecido
uma vez, no componente raiz (`Cadencia`, em `parte8.jsx`), a partir de
`montarCurriculo`. `CURRICULUM`/`BY_ID`/`TOTAL_BONUS` continuam existindo
como estavam, e ainda são o que aparece nas telas de antes de entrar na
conta (cadastro, plano) — ali não haveria de quem ser o currículo próprio.

**Duas coisas ficam de fora, de propósito:**
- `ORDEM_ESP` (a ordem das especialidades dentro de uma área, usada só para
  ordenar a lista em Temas) continua vindo do currículo padrão. Uma
  especialidade nova, de um currículo próprio, cai no fim da ordenação em
  vez de quebrar — rugosidade pequena, não vale a complicação de recalcular.
- Na aba Mentor, o currículo que aparece é sempre o **do aluno** (a rota
  `/api/mentor` devolve o `cronogramaProprio` dele), nunca o do mentor —
  `CurriculoDoAluno`, em `parte16.jsx`, chama `montarCurriculo` direto com os
  dados do aluno, sem usar o `useAtivo()` do mentor.

## Cupons

Os códigos ficam no `worker/api/cupom.js`, no servidor, e nunca no navegador.
Para trocá-los sem mexer no código, cadastre `CUPONS` no Cloudflare, no formato
`codigo:plano,codigo:plano` (planos: semanal, mensal, anual, vitalicio). Enquanto
essa variável não existir, valem os dois cupons escritos no arquivo — hoje,
`secdamocada` libera 7 dias (`semanal`) e `medeasysoft` libera o plano anual.
Cada plano fora do `anual` conta os dias a partir do resgate (`DIAS`, em
`_comum.js`); só o `anual` vence numa data fixa, veja "Plano anual", abaixo.

O cupom `mentor1612` é especial: fica fora dessa lista (não dá para trocar
pela variável `CUPONS`) e não libera plano nenhum — concede o papel de
mentor, gravando `mentores/{uid}` em vez de `assinaturas/{uid}`. Resgatar de
novo não faz nada de errado, e não apaga a lista de alunos que a pessoa já
tinha. O dono (`joseeduardo1616@gmail.com`, em `DONOS`, no `_comum.js`) já é
mentor sem precisar resgatar nada — é a mesma lista que já dá acesso completo
sem pagar.

## Plano anual e painel de acessos

O plano anual vale até **31/12/2027**, uma data fixa, não um ano contado a
partir da compra ou do cupom — `validadeDoPlano`, em `_comum.js`, é o único
lugar que decide isso, usado por `cupom.js`, `compra.js` e `acessos.js`, para
não correr o risco de uma dessas rotas ficar com a conta antiga (`+365
dias`) enquanto as outras mudam. A tela de Planos e o painel do dono
(`PainelDono`, em `parte11.jsx`) escrevem "até o fim de 2027" perto do preço,
para não vender por engano um ano a partir da data de hoje.

No painel de acessos (`worker/api/acessos.js`), o dono também pode tornar
alguém mentor pelo e-mail, sem mexer no plano da pessoa — mesmo caminho do
cupom `mentor1612` (`concederMentor`, em `_comum.js`), só que iniciado pelo
dono em vez de digitado pelo aluno. Botão "Tornar mentor(a)", ao lado de
"Liberar acesso".

## Foco

O cronômetro (anel com os dígitos dentro, por padrão) tem três estilos
alternativos, escolhidos em Ajustes, dentro da própria aba Foco, e guardados
em `data.pomo.estilo`: dígitos sozinhos, dígitos com uma barra de progresso
embaixo, e minimalista (só o número, sem rótulo de fase nem bolinhas de
ciclo). `Cronometro`, em `parte5.jsx`, é a única coisa que decide qual
desenhar — o resto do componente `Foco` (contagem, fases, atalhos de
teclado) não muda com o estilo.

**Só vale na tela normal, não na tela cheia** (o `full` que abre com o
botão "Tela cheia" ou a tecla F): lá o espaço sobra e a pessoa já está
comprometida com o bloco, então o layout fixo de sempre (dígitos enormes
com a barra de progresso embaixo) continua — trocar de estilo ali não
ganhava nada e só somava mais uma decisão a cada vez que a pessoa entra em
foco.

## Cartões

O estudo abre em tela cheia, por cima de tudo. Não é capricho: desenhado
dentro da página, o cartão dividia espaço com o cabeçalho, o menu e o rodapé,
e no celular sobrava uma faixa. A altura usa `dvh`, e não `vh`, senão a barra
do navegador do celular cobre os botões justamente na hora de responder.

A resposta aparece **abaixo** da pergunta, não no lugar dela: some a pergunta
e a pessoa responde sem lembrar o que foi perguntado.

A pergunta começa **no topo** do espaço disponível, não centralizada nele:
centralizada, uma pergunta curta numa tela alta de celular sobrava um vazio
grande acima dela.

**A tela de estudo é um portal, direto para `document.body`, e não pode
deixar de ser.** O conteúdo de cada aba mora dentro de uma `.rise`, a div que
anima a entrada em cascata (`animation: rise .38s ... both`, em `parte8.jsx`).
Terminada a animação, o navegador continua enxergando um `transform` de
verdade ali — o `fill-mode: both` segura o valor final da animação (que é
`transform: none`, mas o computed style aparece como a matriz identidade, não
como a palavra "none") —, e qualquer `transform` que não seja `none`, mesmo
sem efeito visual nenhum, vira um novo referencial para os descendentes com
`position: fixed`. Sem o portal, "tela cheia" parava de significar a tela
inteira e passava a significar "do tamanho da `.rise`, a partir de onde ela
começa" — o cartão nascia empurrado para baixo da altura do cabeçalho, e o
botão "ver a resposta" saía da parte visível sem nada para rolar até lá. Foi
esse o motivo real por trás do "tá cortando" no celular, não só o
`justify-content`. Qualquer outra tela cheia que nasça dentro de uma aba
precisa do mesmo tratamento — a `.rise` pega qualquer descendente, não só
este.

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

### Montar com IA, a partir de PDF ou Word

Fica na própria aba Cartões, em `MontarFlashcardsIA` (`parte12.jsx`), logo no
topo — não escondida atrás do botão "Trazer baralho". Chegou a morar na aba
Assistente, mas o resultado é cartão: faz mais sentido ficar onde os cartões
já vivem, junto do resto da importação.

Por padrão a IA escolhe os pontos que valem a pena virar cartão. Marcando
"quero todos os cartões possíveis", o pedido muda: `cobrirTudo` vai junto
para `worker/api/flashcards-ia.js`, que troca a instrução (cobrir cada fato,
não só os principais) e sobe o teto de saída e o limite de cartões. Pedir
tudo aumenta a chance da resposta da IA bater no teto no meio do array de
cartões — por isso o servidor tenta ler o JSON inteiro primeiro e, se não
fechar direito, cai para `recuperarCartoesParciais`: salva por regex cada
cartão que já veio completo antes do corte, em vez de jogar tudo fora porque
o JSON como um todo não fechou. A pessoa recebe os cartões que deram certo,
marcados como cortado, do jeito que já acontecia quando o texto de entrada é
maior que o limite.

O PDF e o Word são lidos **no navegador**, com bibliotecas buscadas de um CDN
só quando alguém usa a função — o mesmo esquema do leitor de `.apkg` do Anki,
em `parte13.jsx`, que também baixa o `sql.js` sob demanda. Só o texto
extraído vai para o servidor; o arquivo original nunca sai do aparelho.

- **PDF** (`lerPdfParaTexto`, com `pdf.js`): o texto sai por `getTextContent`,
  página por página. As figuras vêm **recortadas**, não a página inteira:
  `retangulosDeImagem` percorre a lista de operadores da página do mesmo
  jeito que `page.render` percorre por dentro — acompanhando os
  `save`/`restore`/`transform` (o operador `cm` do PDF) — e, ao chegar num
  `paintImageXObject`/`paintJpegXObject`/`paintInlineImageXObject`, aplica a
  matriz acumulada nos quatro cantos do quadrado unitário para achar
  exatamente o retângulo daquela figura em pixels do canvas. A página é
  desenhada **uma vez**, numa resolução alta o bastante para o recorte não
  sair borrado, e `figurasDaPagina` recorta cada retângulo dali —
  `drawImage` com os oito argumentos, retângulo de origem e de destino. Essa
  volta é o que permite recortar sem decodificar o formato de cada imagem
  por dentro (JPEG, cor indexada, CMYK...), que muda de gerador para gerador
  e é exatamente onde uma extração "direto dos bytes" costuma quebrar.
  Retângulo menor que `FIGURA_MIN_PX` é descartado — é decoração, não
  figura.
- **Word** (`lerDocxParaTexto`, com `mammoth`): o `.docx` já entrega as
  imagens embutidas como `data:` no HTML da conversão; cada uma vira uma
  entrada no depósito, sem precisar recortar nada.

Nos dois casos, cada imagem some no texto como um marcador `[[img:nome]]` —
o mesmo formato que o leitor do Anki já usa e que `LadoDoCartao`, em
`parte13.jsx`, já sabe desenhar. A IA (`worker/api/flashcards-ia.js`) só
enxerga esse texto com marcadores, nunca a imagem em si; a instrução pede pra
ela copiar um marcador existente para dentro do cartão quando a figura for
necessária ali, e não inventar marcador que não estava no texto. O JSON que a
IA devolve é conferido e limpo no servidor — tamanho de cada campo, quantos
cartões no máximo — antes de chegar ao navegador.

### A pasta grande de cada área

Antes, cada documento virava uma pasta com o nome do próprio assunto, e a
aba Cartões enchia de pasta com um baralho só. Agora a IA também diz **de
que área é o material**: junto do nome do baralho, ela devolve `area`, uma
das cinco siglas do currículo (`CL`, `CI`, `GO`, `PE`, `PR`). O servidor
confere a sigla contra a lista — sigla inventada vira `""`, nunca uma pasta
que o app não sabe desenhar — e pede o campo **antes** dos cartões no JSON
de propósito: quando a resposta é cortada no meio do array, a área ainda
está escrita no texto cru e `lerArea` a pesca de lá com regex, do mesmo
jeito que `recuperarCartoesParciais` salva os cartões inteiros.

No navegador, `pastaDaArea` (`parte12.jsx`) traduz a sigla no nome da pasta.
Ela não escreve o nome oficial de cara: primeiro procura, entre as pastas
que a pessoa já tem, uma que **seja** aquela área escrita de outro jeito —
`PASTAS_DE_AREA` guarda os apelidos ("MEDICINA PREVENTIVA", "SAÚDE
PÚBLICA", "GO E PREVENTIVA", a pasta antiga que juntava as duas) e
`chavePasta` compara ignorando acento, caixa e pontuação. Só quando não
acha nenhuma é que cria a pasta com o nome oficial. É o que impede
"PREVENTIVA" de nascer ao lado de "Medicina Preventiva" na conta de quem já
organizou tudo à mão.

Sem área reconhecida, vale o comportamento antigo: uma pasta com o nome do
assunto. `testar-pastas.mjs` roda contra `_pastas.mjs`, a cópia automática
dessas três coisas, refeita pelo `extrair_pastas.py` a cada build.

### O estilo dos cartões

A instrução da IA (`INSTRUCOES`, em `worker/api/flashcards-ia.js`) pede um
estilo específico, o de um baralho de Anki bem feito e comum entre
estudantes de residência: pergunta direta, resposta sem enrolação, e o termo
que decide a resposta em **negrito**. Três formatos, o que fizer sentido
para cada trecho — fato direto; reconhecimento de imagem, ligando achado a
diagnóstico com uma seta; e "Se a prova disser: [vinheta] → Pense em...",
para quando o material tiver a cara de uma associação clássica de prova.

O `**negrito**` só funciona porque `LadoDoCartao`, em `parte13.jsx`, passa
cada trecho de texto por `comNegrito` antes de desenhar — o mesmo truque
pequeno de markdown que a resposta do assistente já usa em `parte9.jsx`,
adaptado para não brigar com o marcador `[[img:nome]]`, que continua sendo
resolvido primeiro. Cartão criado à mão também pode usar `**assim**`, já que
o desenho é o mesmo para qualquer cartão, não só os que vêm da IA.

Um PDF sem `.docx` antigo (`.doc`) não abre: é formato fechado, sem leitor
que caiba no navegador. Um PDF só de imagem escaneada, sem texto por trás,
também não funciona — não há OCR aqui.

## Anotações

Em Matérias (não em Temas — as duas abas parecem a mesma coisa pelo nome,
mas Temas só agrupa o progresso por especialidade, sem abrir aula por
aula), tocar numa aula mostra o botão de anotação — clicar escreve, ou cola
o que a pessoa já tinha escrito noutro lugar. `parte17.jsx` monta o editor,
com `document.execCommand` (negrito, itálico, sublinhado, alinhar —
inclusive justificado —, cor da letra, grifo, imagem): obsoleto na
especificação, mas ainda funciona em todo navegador atual, e evita trazer
uma biblioteca de editor inteira para o que foi pedido, bem mais simples que
um Word completo. O HTML fica em `data.anotacoes[id]`, pelo id da aula — o
mesmo id fixo do currículo (ou do currículo próprio, parte9.jsx), então a
anotação segue a aula mesmo se o currículo próprio substituir o padrão.

**Achado difícil de achar**: a anotação era o último bloco dentro da aula
aberta, depois de Etapas, Desempenho e Tópicos relacionados — quem abria uma
aula e não rolava até o fim nunca via o botão. `SubjectRow`, em `parte6.jsx`,
agora mostra a anotação primeiro, antes de tudo, e a linha fechada da aula
ganhou um ícone de caderno (`NotebookPen`, aceso em `var(--neon)`) sempre
que já existe alguma anotação escrita — `temAnotacao()`, extraída para o
topo de `parte17.jsx` porque tanto o botão de abrir quanto esse indicador
precisam da mesma regra (uma anotação só com imagem, sem texto, ainda conta
como anotação).

**As imagens não moram no HTML guardado.** Ficam no mesmo IndexedDB dos
cartões e do Anki (`guardarMidia`/`lerMidia`, `parte13.jsx`): ao salvar, cada
`<img>` recém-colada vira um nome ali dentro, e o HTML guardado fica só com
`data-nome="..."`, sem o `src`. Ao abrir a anotação de novo, cada `data-nome`
é resolvido de volta para uma imagem de verdade. Sem essa separação, cada
foto colada iria inteira, em base64, para dentro de `data.anotacoes` — e
isso sincroniza com a nuvem e passa pelo `localStorage`; algumas fotos de
caderno já bastariam para estourar os dois.

**Colar um documento que já tinha imagem fazia elas sumirem.** Uma imagem
escolhida por upload sempre chega em base64 (`data:`), mas uma colada de um
documento (Word, Google Docs, uma página) costuma vir com o `src` apontando
para um endereço `http(s):` ou `blob:` de fora. `prepararParaSalvar`
(`parte17.jsx`) só sabia converter `data:` para o IndexedDB — para qualquer
outro tipo de `src`, o código antigo **apagava o `src` de toda imagem na
hora de salvar**, achando que já tinha virado `data-nome` quando não tinha.
Agora ele tenta primeiro trazer a imagem para dentro do IndexedDB também
nesses dois casos (um `fetch` do endereço, convertido para `data:` do mesmo
jeito que uma imagem enviada por upload — necessário até para `blob:`, que
não sobrevive a um recarregar da página) e, se isso falhar, mantém o `src`
original em vez de apagar. Só quem tem `data-nome` (ou seja, quem realmente
foi guardado aqui dentro) tem o `src` removido ao salvar.

**Esse `fetch` direto falha na maioria dos casos que importam**, porque o
site de origem não libera a leitura dos bytes por outro domínio: Notion,
Google Docs e quase todo mundo. No caso do Notion isso era grave, porque o
endereço da figura é assinado e **vence em cerca de uma hora**: pouco depois
de colar, a imagem sumia e sobrava o texto alternativo. Por isso, quando o
`fetch` direto é barrado, a `/api/buscar-imagem` busca no servidor e devolve
em base64 (`trazerImagemDeFora`, em `parte17.jsx`). Só para quem está na
conta, só http(s), só resposta que é imagem, com teto de 8MB e sem nomes que
apontem para dentro da rede — é um caminho para trazer figura, não um proxy
aberto, e o `testar-buscar-imagem.mjs` cobre cada uma dessas recusas.

**O bloco de destaque do Notion** (`<aside>`) chega de dois jeitos: como
elemento, e aí aparecia sem destaque nenhum; ou com a tag escrita como texto,
e aí `</aside>` aparecia escrito na anotação e ia parar no PDF. `virarDestaque`
e `tirarTagsEscritas` resolvem os dois, no colar e também ao abrir uma
anotação que já estava gravada com o defeito (`limparAnotacaoGravada`).

**A figura é trazida no COLAR, não na hora de salvar** (`internalizarImagens`).
Esperar o salvamento já é esperar demais: o endereço do Notion vence em cerca
de uma hora, e quem cola, lê um pouco e só depois volta perdia a figura. Se
não der para trazer de jeito nenhum, o lugar dela vira uma caixa dizendo o que
houve e o que fazer — um ícone de imagem quebrada não ensina nada.

**Colar a imagem em si funciona sempre**, e antes não fazia nada: `aoColar`
olha `clipboardData.files` antes do HTML. Copiar a figura (botão direito,
copiar imagem) ou dar um print traz os bytes junto, sem depender de endereço,
de CORS nem do site de origem. É a saída para figura que não dá para buscar.

**A cor que vem colada** passa por `ajustarCoresColadas`. Texto copiado de
site escuro chega com a cor dele grudada, um branco acinzentado: no editor
escuro ninguém nota, no claro é cinza sobre branco. Cor sem cor (cinza,
branco, preto) é só o "texto normal" do site de origem e sai fora, deixando o
texto seguir o tema; cor com cor (o verde do "NORMAL", o vermelho do
"ANORMAL") quer dizer alguma coisa e fica, só com a claridade puxada para uma
faixa que se lê nos dois fundos.

### Claro e escuro só da anotação

O resto do painel é para consultar e o escuro cai bem; a anotação é para
escrever e reler por muito tempo, e aí a escolha é pessoal. Ela tem o próprio
interruptor (`data.notaTema`: `auto`, `light` ou `dark`), que começa seguindo
o app e passa a mandar sozinho assim que a pessoa escolhe. No claro a letra é
quase preta (`PAPEL_NOTA`, no `base.jsx`), não um cinza: cinza sobre branco
cansa a vista.

Vai por contexto (`TemaNotaContext`) e não por propriedade: o editor está três
componentes abaixo de quem tem os dados.

**Tela cheia e tamanho de fonte.** O botão de tela cheia (`Maximize2`, na
barra da anotação) usa o mesmo `createPortal` do `ModalDrive` para escapar
da `.rise` — o editor cresce para ocupar a tela inteira, útil em anotações
longas ou no celular. O tamanho de fonte é do trecho selecionado, não da
página inteira: `document.execCommand("fontSize")` só aceita os 7 tamanhos
históricos do HTML (1 a 7, sem controle de px), então `aplicarTamanho`
(`parte17.jsx`) pede sempre o maior (7, o único improvável de já estar em
uso no texto) e troca cada `<font size="7">` criado por um `<span>` com o
px exato escolhido.

HTML colado de fora passa por `limparHtmlColado` — tira `<script>`,
`<iframe>` e atributos de evento (`onerror`, `onclick`...) — tanto no colar
quanto de novo dentro do `normalize()`, que é o ponto por onde entra tudo
que vem de fora (outro aparelho, a nuvem, uma cópia de segurança). A
anotação nunca é mostrada para outra pessoa — nem o mentor a alcança (ver
"Mentor", acima) —, mas colar um trecho de uma página maliciosa não pode
virar código rodando na própria conta de quem colou.

### Gerar flashcards a partir da anotação

O botão "Gerar flashcards com IA", dentro do editor, manda o texto puro da
anotação (`editorRef.current.innerText` — sem marcação; as imagens não
ajudam a IA a escrever pergunta e resposta) para a **mesma** rota
`/api/flashcards-ia` que já monta cartão a partir de PDF/Word — mesmas
regras de estilo (negrito no que decide a resposta, achado→diagnóstico, "se
a prova disser"...), então esta função não precisa de instrução própria nem
de rota nova.

Os cartões caem direto na pasta grande da área da aula, sem perguntar:
`pastaDaArea` (`parte12.jsx`) traduz a sigla do currículo (`CL`/`CI`/`GO`/
`PE`/`PR`) na pasta certa. É a mesma função que o montador por documento
usa — ver "A pasta grande de cada área", acima.

### Baixar em Word ou PDF, e enviar para o Google Drive

**Word.** Nenhuma biblioteca: um `.docx` de verdade é um zip de XML, e não
vale a complicação para uma anotação. Em vez disso, `notaParaWordBlob`
(`parte17.jsx`) gera HTML com os namespaces do Word (`xmlns:w`) e extensão
`.doc` — o Word abre pelo **conteúdo**, não pela extensão, e preserva
negrito, cor, alinhamento e imagem porque é HTML de verdade com estilo
inline. Truque antigo, ainda válido.

**PDF.** Aqui sim entra biblioteca: [jsPDF](https://github.com/parallax/jsPDF)
e [html2canvas](https://html2canvas.hertzen.com), carregadas de um CDN só
quando a pessoa pede (mesmo padrão do `carregarPdfJs`/`carregarMammoth`, em
`parte12.jsx`). `doc.html()` percorre o HTML formatado da anotação e escreve
no PDF — sem isso, um PDF de verdade exigiria escrever o layout de texto rico
(negrito, cor, grifo, alinhamento, imagem) à mão, com a API de desenho do
jsPDF. O texto sai como texto, dá para selecionar e buscar, e as imagens vão
junto.

### A fonte do PDF da anotação

O jsPDF escreve com as 14 fontes padrão do PDF, e **todas são de 8 bits**
(WinAnsi). Acento passa, porque está na tabela. Seta, `≥`, `≤` e emoji não:
saíam trocados por lixo, e não por um quadradinho — `→` virava `!’`, `≥`
virava `”e`, `💡` virava `Ø=ÜI`. Numa anotação de medicina, cheia de seta de
fisiopatologia, isso estragava o arquivo inteiro, e o defeito não aparecia
em lugar nenhum antes de abrir o PDF.

A saída é embutir uma fonte de verdade: a DejaVu, do jsDelivr, baixada só na
primeira exportação e guardada pelo navegador depois. **Duas coisas precisam
acontecer juntas**, e é o pulo do gato aqui:

1. registrar a fonte no jsPDF (`addFileToVFS` + `addFont`), que é quem
   desenha;
2. colocar a **mesma** fonte na página, num `@font-face`, porque quem mede a
   largura de cada palavra para quebrar a linha é o navegador. Medindo com
   uma fonte e desenhando com outra, as palavras saem grudadas
   ("DistúrbiosHipertensivosda").

Emoji não existe em fonte de texto nenhuma, então ele é tirado do texto antes
de exportar — na anotação continua. E se a fonte não baixar (sem rede), o PDF
sai nas fontes padrão com os símbolos trocados por versões de 8 bits
(`TROCAS_SEM_FONTE`): um `->` é pior que um `→`, mas é muito melhor que `!’`.

O PDF sempre saía em branco: o elemento temporário usado para "fotografar"
a anotação (`notaParaPdfBlob`) ficava em `left:-9999px`, fora da área da
página — e uma coordenada negativa nunca chega a ser *pintada* em lugar
nenhum (a página começa em 0,0; não existe "rolar para antes disso"). O
html2canvas só consegue capturar o que o navegador de fato pintou, então o
resultado era sempre uma imagem vazia. Agora o elemento fica dentro da área
visível (0,0), na frente de tudo por um instante — daí o `pointer-events:
none` e o z-index gigante, para não atrapalhar quem está usando a página
durante esse instante.

**Google Drive.** `useGoogleDrive` (`parte3.jsx`) pede um token separado do
da Agenda, com um escopo diferente: `drive.file`, o mínimo que existe — só
alcança arquivos que este app criou ou que a pessoa abriu através dele,
nunca o Drive inteiro. E só pede essa autorização na hora em que a pessoa
clica em "Enviar para o Drive", nunca de saída: quem nunca usa a função
nunca vê essa tela de permissão. `ModalDrive` deixa navegar pelas pastas
(a partir de "Meu Drive"), criar uma pasta nova, e manda o arquivo (Word ou
PDF, a pessoa escolhe) com `multipart/related`, o formato que a API do
Drive espera para metadado + conteúdo numa chamada só. Como o resto de
`parte17.jsx`, o modal usa `createPortal` — sem isso ficaria preso dentro
da `.rise` que anima a troca de aba, que vira um "containing block" para
`position:fixed` (o mesmo motivo documentado para o estudo de cartões em
tela cheia, em `parte12.jsx`).

**"Enviar" ficava mudo quando dava errado.** Duas falhas silenciosas em
`useGoogleDrive`, ambas de fechamento (*closure*) velho do React:

1. `enviarArquivo` não tinha `try/catch` ao redor do `fetch` de upload. Uma
   falha de rede lançava uma exceção não tratada, que subia direto pelo
   `await` em `ModalDrive.enviar` — o `setEnviando(false)` logo depois
   nunca rodava, e o botão ficava preso em "Enviando…" para sempre, sem
   nenhum aviso. Agora `enviarArquivo` nunca lança: sempre devolve
   `{ ok, erro }`.
2. Ao terminar, `ModalDrive.enviar` conferia `drive.erro` para decidir o
   que avisar — mas `drive` ali é o valor de um *render* anterior; o
   `setErro(...)` chamado dentro de `enviarArquivo` só valeria a partir do
   próximo render, não durante a própria chamada em andamento. Numa falha
   sem exceção (ex.: o Drive recusou com HTTP 403), o aviso de erro nunca
   disparava. Agora `enviarArquivo` (e `pedirToken`, pela mesma razão)
   devolve a mensagem de erro exata como parte do próprio retorno, e quem
   chama usa esse valor direto, nunca o estado lido depois.

De quebra, o erro do próprio Google (`detalhe.error.message`, quando o
Drive responde com um motivo, como "API não ativada" ou permissão negada)
passa a aparecer na mensagem, em vez de um genérico "não consegui enviar" —
ajuda a saber se o problema é a conta da pessoa ou a configuração do site
(ex.: a API do Drive não habilitada no projeto do Google Cloud).

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

## Cabeçalho, no celular

Com a barra lateral fixa, o cabeçalho põe a marca ao centro e os controles
(menu, cronômetro, tema) flutuando nos cantos, em `position: absolute`. Isso
só cabe porque sobra largura dos dois lados da marca — que nunca encolhe
abaixo de 150px. Com a barra em gaveta (tela estreita, o `estreita` de
`parte8.jsx`, o mesmo limiar de 1024px que já decide gaveta ou barra fixa),
os controles vão para uma fileira própria, no fluxo normal, **acima** da
marca, em vez de flutuar por cima dela. Sem essa troca, o cronômetro rodando
— que é quando o grupo de controles fica mais largo — ficava por cima do
desenho da marca.

A escolha entre as duas fileiras é feita **uma vez, em React** (`estreita ?
... : ...`), e não escondendo uma com CSS: renderizar as duas e esconder uma
por `display:none` deixava a escondida no HTML assim mesmo, e qualquer coisa
que busque "o botão de tema" pela ordem do documento — inclusive o teste do
navegador (`testar.mjs`) — podia pegar a cópia escondida e nunca conseguir
clicar nela.

Na aba Rotina, a fita dos sete dias da semana (`parte4.jsx`) tinha uma
largura mínima de 76px por dia; numa tela estreita os sete não cabiam, e o
card do fim da semana ficava cortado ao meio, sem nada dizendo que dava para
arrastar. Sem largura mínima (`flex: "1 1 0%", minWidth: 0`), os sete sempre
dividem o espaço que existe.

### O `grid` sem `grid-cols-N` na base é uma armadilha

Várias telas usam `grid sm:grid-cols-2` ou `grid lg:grid-cols-5` — colunas só
a partir de um certo tamanho de tela, empilhado antes disso. Sem uma classe
`grid-cols-N` **sem prefixo**, por baixo do limiar o `<div>` continua sendo
`display:grid`, só que sem nenhuma coluna explícita — e um grid sem colunas
explícitas cria uma coluna implícita do tamanho `auto`, que **não** encolhe
para caber no que tem dentro, ao contrário de `minmax(0,1fr)` (a régua que
`grid-cols-N` usa, em `gerar_css.py`). Do lado de fora os dois casos parecem
idênticos — uma coluna só, empilhada —, mas só o primeiro estoura a largura
da tela quando algum filho tem texto livre comprido: a pendência anotada à
mão, o nome de uma matéria atrasada. O texto não quebra, e a tela — não só
aquele cartão — passa da borda do celular. A régua é sempre pôr um
`grid-cols-N` sem prefixo antes do `sm:`/`lg:`, mesmo que o número pareça
óbvio (quase sempre `grid-cols-1`).

Duas peças achadas pelo mesmo motivo, num `<span className="flex-1">` sem o
`min-w-0` de sempre: a pendência anotada à mão (`parte5.jsx`) e os hábitos e
itens de "preciso rever" (`parte7.jsx`). Sem `min-w-0`, um item de `flex` não
aceita ficar menor que o próprio conteúdo — a regra é sempre grudar
`min-w-0` (ou `min-width:0`) em quem carrega texto livre dentro de um `flex`
ou `grid`, e não só nos que já tinham.

O botão de "Montar flashcards com IA" (`parte12.jsx`) tinha o mesmo problema
por um motivo diferente: `Btn` nunca quebra linha por dentro (é assim que um
rótulo de botão deve se comportar), mas o texto de status ("a IA está
montando todos os cartões...") ia dentro do próprio botão, e ficava comprido
demais. Rótulo de botão fica sempre curto; o status detalhado vai numa linha
à parte, fora do `Btn`, que aí quebra normal.

Na aba Cartões, o nome da pasta e o nome do baralho (`parte12.jsx`) tinham
`overflow:hidden; textOverflow:ellipsis; whiteSpace:nowrap` mas sem
`minWidth:0` — nesses dois, o `<span>` do nome é filho direto de uma linha
`flex` ao lado de ícones/contadores de largura fixa, então a pegadinha do
`min-width:auto` valia de novo, e o nome comprido não encolhia: ficava por
cima do texto vizinho ("publicar", a contagem de baralhos/cartões) em vez de
truncar com reticências. Diferente do caso do `<span className="flex-1
min-w-0">` (o padrão já seguro, usado como wrapper em várias telas), aqui o
próprio `<span>` do nome participa da linha `flex`, então precisa do
`minWidth:0` nele mesmo.

O cabeçalho e o menu do celular também sobrepunham a barra de status do
aparelho quando o site está instalado como app: o `viewport-fit=cover` do
`<meta name="viewport">` (`montar.py`) junto com `"display":"standalone"` do
manifesto faz a página desenhar por baixo dessa barra, e sem
`env(safe-area-inset-top)` o primeiro conteúdo — os botões do topo — nascia
exatamente atrás dela. `env()` vale `0` fora desse modo (navegador comum),
então a correção não muda nada para quem não instalou o app.

## Assistente

A resposta chega em markdown e é desenhada pelo `Markdown`, no `parte9.jsx` —
um pedaço pequeno da linguagem, o que a resposta realmente usa. Cada trecho
vira elemento React, nunca HTML montado à mão: o texto vem de fora, e montar
HTML com ele abriria a porta para injeção.

O teto de saída é 4000 tokens. Estava em 1400, e um plano de semana passava
disso: a resposta chegava cortada no meio da frase sem nada dizendo por quê.
Quando ainda assim bater no teto, o servidor devolve `cortado: true` e a
bolha avisa, em vez de parecer travamento.

### Contar o que acabou de estudar

Além de tarefa, "preciso rever" e bloco de rotina, o bloco `<acoes>` aceita
`{"tipo":"sessao",...}`: a pessoa conta o que acabou de fazer ("30 questões
de febre reumática, acertei 27, em 45 min") e o assistente registra a sessão
sozinho, sem passar pelo formulário de lançar à mão.

`acharMateriaPorNome` (`parte9.jsx`) acha a aula do currículo mais parecida
com o nome que a pessoa escreveu, reaproveitando o mesmo casamento por
palavras que o cronograma do Notion já usa (`palavras`/`parecenca`, em
`parte15.jsx`) — só que com um limiar mais solto (`LIMIAR_SESSAO_CHAT`),
porque texto de chat digitado rápido tem menos sobreposição de palavras que
um planner escrito com calma. Achando a aula, ela é marcada como estudada do
mesmo jeito que o checkbox de Matérias marca — só grava a data na primeira
vez, para não apagar uma data antiga se a pessoa mencionar de novo depois.
Minutos são opcionais de propósito: a instrução da IA pede para não inventar
número que a pessoa não disse.

### Escolher o tipo da sessão, ao terminar o cronômetro

O cronômetro do Foco sempre gravava a sessão como "Aula". Agora, ao terminar
(ou parar o tempo corrido), um modal pergunta o tipo de verdade — Aula,
Apostila, Questões, Revisão, Flashcards, Prática clínica — e, se for
Questões, quantas e quantos acertos. A sessão já entra gravada como Aula
antes do modal aparecer, para não perder o tempo registrado se a pessoa
ignorar a pergunta; o modal só corrige o que já foi salvo.

## Salas de amigos

Uma sala é um nome mais uma senha. O nome vira apelido (`Plantão da
Madrugada!` → `plantao-da-madrugada`), então maiúscula, acento e espaço levam
todo mundo à mesma sala em vez de criarem quase-duplicatas.

A senha nunca é guardada: fica gravado o PBKDF2 dela, com um sal sorteado por
sala. A conferência é no servidor — no navegador bastaria abrir o código da
página para entrar em qualquer sala.

O ranking tem quatro recortes: **hoje**, **semana** (o padrão, porque é a
corrida em que dá para virar o jogo), **mês** e **desde sempre**. Quem decide
de que dia, de que semana e de que mês se trata é o servidor, no fuso de São
Paulo — deixar cada navegador decidir faria duas pessoas da mesma sala
compararem semanas diferentes sem perceber.

O número do dia acompanha **qualquer** recorte, não só o dele: cada linha do
ranking mostra quanto a pessoa fez hoje ao lado do total da semana. Quem
lidera o mês pode não ter aberto o livro hoje, e é essa a informação que muda
o que alguém faz agora.

O próprio dia, no alto da aba (`MeuDia`), sai das sessões gravadas no
aparelho e não do servidor: é o mesmo número que a aba Hoje mostra, aparece
na hora e continua certo sem rede.

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

### Google Agenda: sincronizar sozinho

O login do Google (`google.accounts.oauth2`) entrega um token de acesso que
expira em cerca de uma hora e não vem com token de atualização — não dá para
guardar isso em disco e continuar puxando a agenda com o site fechado sem um
servidor por trás, fora do alcance de um site estático. O que o `useGoogleAgenda`
(`parte3.jsx`) faz em vez disso: assim que a pessoa clica em "Puxar do Google"
pela primeira vez e a leitura dá certo, `data.googleCal.autoSync` vira `true`
(persistido, então sobrevive a recarregar a página). Dali em diante, enquanto
a aba estiver aberta:

- tenta pegar um novo token **sem abrir janela nenhuma** (`requestAccessToken({prompt: ""})`
  — só funciona se o navegador já tiver concedido acesso antes; se falhar,
  não mostra erro, só não sincroniza dessa vez);
- conseguindo o token, relê a semana atual a cada 30 minutos;
- e de novo sempre que a aba volta a ficar visível depois de passar 15 minutos
  ou mais em segundo plano (`visibilitychange`).

Essas leituras automáticas são silenciosas (sem toast de "compromissos
sincronizados" a cada 30 minutos) para não incomodar; erros também não
aparecem, já que a pessoa não pediu essa tentativa. O botão "Puxar do Google"
continua funcionando a qualquer momento para puxar na hora. Desconectar
(`gcal.desconectar`) desliga o `autoSync` — só liga de novo puxando manualmente
uma vez.

### Ligar a conta de vez

A tentativa silenciosa acima depende de o navegador ainda ter a sessão do
Google e de não estar barrando cookie de terceiros. **No celular e no modo
aplicativo ela falha quase sempre**, e o resultado é a tela de autorizar
aparecendo toda vez que a pessoa abre o site. Foi a reclamação que originou
esta parte.

A rota `/api/google` resolve pelo mesmo caminho do Notion: o navegador faz o
fluxo de **código** (`initCodeClient`, uma janela, uma vez), manda o código
para o servidor, e o servidor troca por um **token de atualização** usando o
segredo da credencial. O token fica em `google/{uid}`, escrito e lido só pela
conta de serviço, e **nunca volta para a página** — o teste
`testar-google.mjs` cobre exatamente isso. Dali em diante o navegador pede
`acao: "token"` e recebe um acesso novo, sem janela e sem depender de cookie
de terceiros.

Para funcionar, o Worker precisa de duas variáveis:

| Variável | O que é |
|---|---|
| `GOOGLE_CLIENT_ID` | o mesmo ID que a página já usa em `CADENCIA_GOOGLE` |
| `GOOGLE_CLIENT_SECRET` | o segredo da **mesma** credencial, no Google Cloud |

A credencial precisa ser do tipo **Aplicativo da Web**, com o endereço do
site em Origens JavaScript autorizadas (o que já era necessário antes).

**Sem as duas variáveis nada quebra**: a rota responde `disponivel: false`, a
página não oferece o botão e tudo continua como era, autorizando por sessão.

Duas armadilhas que o código já trata:

1. O Google só manda o token de atualização na **primeira** autorização de
   cada conta. Por isso o pedido vai com `prompt: "consent"`: sem ele, quem
   já tinha autorizado antes recebia um código que virava só token de acesso,
   e a ligação permanente não saía do lugar sem ninguém entender por quê.
2. Quando a pessoa revoga o acesso pela conta Google, a renovação passa a
   responder `invalid_grant`. O token guardado é apagado na hora, senão o app
   ficaria tentando com ele a cada abertura, para sempre.

## Mentor

Quem resgata o cupom `mentor1612` (veja "Cupons", acima) ganha a aba Mentor
e adiciona alunos pelo e-mail com que eles se cadastraram — nunca pelo uid,
que o mentor não tem como saber. A ligação usa a coleção `emails/{uid}` que
cada pessoa já grava de si mesma ao entrar (é a mesma que o aviso de compra
usa para achar quem pagou); `uidPeloEmail`, em `_comum.js`, faz essa busca.

Tudo mora em `worker/api/mentor.js`, com a conta de serviço, pelo mesmo
motivo de sempre: as regras do Firestore não deixam ninguém ler o documento
de outra pessoa, então só o servidor alcança os dados de um aluno. Cada ação
confere primeiro que o aluno pedido está na lista `mentores/{uid}.alunos`
deste mentor — sem essa conferência, bastaria saber o uid de alguém para
mexer nos dados dela.

**Só funciona com aluno que tem o plano pago e a nuvem ligada.** Os dados de
estudo de cada pessoa só chegam ao Firestore (`usuarios/{uid}`) quando ela é
`pro` — é como o `useNuvem` já funciona, e o mentor não muda isso. Um aluno
sem plano aparece na lista, mas a rota devolve "ainda não tem dados na
nuvem" em vez de erro.

O mentor grava rotina, metas (`tasks`) e currículo (`marks`, a mesma marca
`aula` que o checkbox de Matérias usa) direto no documento inteiro do aluno
— lê `usuarios/{uid}.dados` (um texto JSON, o mesmo formato do
`localStorage`), troca só os campos da ação, e grava de volta o documento
inteiro com `dispositivo: "mentor"`. Esse `dispositivo` nunca bate com o de
aparelho nenhum (`idDispositivo`, em `parte3.jsx`), então se o aluno estiver
com a aba aberta, o `onSnapshot` dele aceita a mudança na hora, pelo mesmo
caminho que já sincroniza entre os aparelhos da própria pessoa — não foi
preciso mudar nada do lado do aluno.

O que a aba **não** faz, de propósito, para não expor mais do que o
combinado: não manda anotações, flashcards nem o histórico do Assistente do
aluno para o mentor — só nome, prova marcada, currículo, rotina, metas e as
sessões (para o resumo de minutos/questões/acerto). Também não existe
consentimento do aluno para ser adicionado: quem resgata o cupom e sabe o
e-mail de alguém já consegue montar a rotina e o currículo dessa pessoa. Se
isso for um problema no seu uso, vale avisar quem for adicionado antes.

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

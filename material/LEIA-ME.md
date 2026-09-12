# Material · os dois documentos

Dois documentos A4 deitados, montados em HTML e impressos pelo Chromium:

- **Cadencia-Med-Guia-de-Uso** — uma página por função do painel, com a
  captura da tela de verdade ao lado dos passos. 17 páginas.
- **Cadencia-Med-Plano-de-Parceria** — o que é a ferramenta, para quem
  serve, o preço e as condições de parceria com criadores. 8 páginas.

Cada um sai em dois formatos: **PDF**, para mandar e imprimir, e **PPTX**,
para editar no PowerPoint. O texto dos dois é texto de verdade.

## Refazer

```bash
cd fonte && ./montar.sh --sem-teste && python3 montar_teste.py   # gera o teste.html
cd ../material
node capturar.mjs    # fotografa o app, 4200px de largura
node gerar.mjs       # escreve os HTML e imprime os PDF
node gerar-pptx.mjs  # os mesmos materiais em .pptx (precisa dos HTML acima)
```

O `capturar.mjs` escreve uma conta de mentira no localStorage antes de abrir
a página (`dados-demo.mjs`): seis semanas de sessões, 46 das 90 aulas
marcadas, revisões vencendo e uma fila de cartões. Sem isso as capturas
sairiam de um painel vazio, que não ensina nada. Nada disso vai para o site
publicado.

O `gerar.mjs` baixa as três fontes da marca uma vez, guarda em `.fontes/` e
embute em base64 no HTML: assim o PDF sai igual em qualquer máquina, sem
depender da rede na hora de imprimir.

## As fontes, e por que o pedido é feito como um Chrome de 2016

Duas armadilhas seguidas, as duas silenciosas:

1. O CSS que vem do Google já termina em `format('woff2')`. Acrescentar
   outro descritor ao trocar o endereço pelo base64 deixa a linha inválida,
   e o navegador **descarta a regra inteira sem avisar**. As onze regras
   caíram assim, e os dois PDF saíram inteiros em fonte de reserva. Na tela
   quase não se nota; `document.fonts.size === 0` denuncia na hora.
2. Para navegador moderno o Google devolve **fonte variável**. O Chromium
   desenha certo, mas na hora de imprimir instancia o peso pedido e grava
   as letras como **Type3**, que é glifo desenhado. O texto continua
   selecionável e o desenho fica igual, mas ninguém consegue editar aquilo
   num editor de PDF.

Por isso o `fontes.mjs` pede o CSS com um User-Agent de Chrome 50: sem
suporte anunciado a fonte variável, vem um arquivo estático por peso e o
PDF sai com fonte embutida de verdade. Para conferir depois de gerar:

```bash
python3 -c "import pymupdf,sys; d=pymupdf.open(sys.argv[1]); \
print(sorted({(f[3],f[2]) for p in d for f in p.get_fonts(full=True)}))" \
  Cadencia-Med-Guia-de-Uso.pdf
```

Tem que sair só `Type0` e só os cinco cortes da marca. Qualquer `DejaVu` ou
`Liberation` na lista é caractere que nenhuma das três fontes tem e que o
Chromium foi buscar no sistema: o `✓` da garantia era um, e virou um traço
em SVG. Um `Type3` na lista significa que a fonte variável voltou.

Antes de montar as páginas ele chama o `molduras.mjs`, e essa parte é o
coração do material. **Transform 3D na folha de impressão estraga a
imagem**: o Chromium desiste de compor aquela camada e rasteriza tudo na
resolução da tela. Na primeira versão a moldura do computador era desenhada
em CSS na própria página, e a captura de 4200px entrava no PDF com 408px de
largura, ilegível. Agora cada moldura é montada num navegador à parte, no
tamanho que vai ter no papel, e sai como PNG plano de fundo transparente. O
relevo é o mesmo; o que mudou foi quem desenha. **Se um dia alguém voltar a
pôr `transform: rotate...` no HTML de impressão, o defeito volta junto.**

Pelo mesmo motivo o gradiente dos títulos é feito letra a letra, no
`tituloGradiente()`, e não com `background-clip: text`: recortado no texto,
o fundo deixa um retângulo de sobra em volta da palavra ao imprimir. Aparece
no PDF e não na tela, que foi como passou despercebido.

E pelo mesmo motivo **não há `filter:` nenhum nas páginas de impressão**. O
`drop-shadow` da marca e o `blur` das auras achatavam camada inteira em
bitmap. Sem eles o fundo voltou a ser vetorial: uma página de conteúdo agora
tem duas imagens, a marca e a captura, contra as seis de antes.

## A marca de impressão

**A `fonte/marca.png` não serve para papel.** Ela é feita para a web: 440px
de largura, reduzida a 128 cores, e aparada em alfa 40 — o que corta o
brilho no meio e deixa a imagem terminando com alfa 244 na borda. No fundo
do site aquilo some; no PDF vira uma caixa clara de borda reta em volta da
onda.

O `marcaImpressao()`, no `molduras.mjs`, recorta a onda de novo do
`fonte/logo-original.png`, que tem 1024px e todas as cores. Duas coisas
acontecem ali:

1. **Apara em alfa 2**, não 40, então o brilho inteiro fica dentro da imagem
   e não sobra borda reta.
2. **Tira a sombra clara da arte original**, que foi desenhada para fundo
   branco. O que separa a sombra do brilho de verdade é a saturação: a
   sombra fica entre 0 e 0,25, o brilho roxo entre 0,54 e 0,75. A regra só
   toca pixel de alfa baixo, então o corpo da onda nunca é alterado.

A onda ocupa 100% da largura do arquivo mas só **63% da altura** (o resto é
o brilho). Quem posiciona a marca por altura passa pelo `marcaAltura()`,
senão o traço sai 37% menor do que o pedido.

## O PowerPoint

O `gerar-pptx.mjs` monta cada página em duas camadas: o **desenho** entra
como imagem e o **texto** volta por cima em caixa de texto de verdade. O
`slides.mjs` fotografa a página com `body.sem-texto`, que deixa as letras
transparentes e mantém painel, brilho, molduras e capturas, e depois mede
cada parágrafo no navegador para reconstruir a caixa.

Separar assim é o que permite editar o texto sem perder o visual: o
PowerPoint não sabe desenhar vidro, brilho de borda nem degradê fino, e
refazer aquilo em formas nativas sairia pior.

Medir a caixa no navegador tem quatro pegadinhas, todas já resolvidas no
`slides.mjs`, e todas com a mesma cara: o texto sai deslocado alguns
milímetros e encosta em algo.

- O `rect` é a caixa de **borda**. O respiro interno não é lugar de texto,
  senão a última letra do selo passa por cima da borda arredondada.
- Um `::before` que ocupa lugar entra na medida sem ser texto. É o risco do
  rótulo, 8mm mais 3mm: sem descontar, a primeira palavra cai em cima dele.
- Num flex quem centraliza é o `justify-content`, não o `text-align`. Lendo
  só o `text-align`, o número do passo saía encostado no canto do selo.
- Caixa alta é por trecho, não por bloco: o selo "novo" é um `<span>` com
  `text-transform` dentro de um parágrafo que não tem nenhum.

E a folga da caixa (o `FOLGA`, no `gerar-pptx.mjs`) entra **só do lado para
onde o texto não está encostado**. Somada dos dois lados, ela crescia para
a esquerda junto e arrastava o texto: numa faixa larga davam quase 7mm.

Para conferir o resultado sem PowerPoint, dá para ler o `.pptx` de volta
com `python-pptx` e redesenhar cada slide em HTML com a geometria e as
fontes que ficaram gravadas. Foi assim que estes quatro defeitos
apareceram. O LibreOffice deste ambiente não converte nem um `.txt`.

## Onde mexer

| O quê | Arquivo |
| --- | --- |
| Cores, fundo, vidro, esfera | `comum.mjs` |
| As molduras com relevo e o giro de cada uma | `molduras.mjs` |
| Texto e ordem das páginas do guia | `tutorial.mjs` |
| Texto das páginas de parceria | `patrocinio.mjs` |
| Comissão, dias de teste, acesso do criador | `patrocinio.mjs`, no `CONDICOES` |
| Quais telas são fotografadas | `capturar.mjs`, no `ABAS` |
| Os dados da conta de mentira | `dados-demo.mjs` |
| Como o texto vira caixa editável no `.pptx` | `slides.mjs`, `gerar-pptx.mjs` |

As condições da parceria são uma proposta de partida, não um combinado
fechado: estão todas no `CONDICOES` para trocar num lugar só e gerar de novo.

`capturas/`, `molduras/`, `slides/`, `.fontes/` e os `.html` são refeitos pelos comandos
acima e por isso ficam fora do repositório.

# Material · os dois PDFs

Dois documentos A4 deitados, montados em HTML e impressos pelo Chromium:

- **Cadencia-Med-Guia-de-Uso.pdf** — uma página por função do painel, com a
  captura da tela de verdade ao lado dos passos. 17 páginas.
- **Cadencia-Med-Plano-de-Parceria.pdf** — o que é a ferramenta, para quem
  serve, o preço e as condições de parceria com criadores. 8 páginas.

## Refazer

```bash
cd fonte && ./montar.sh --sem-teste && python3 montar_teste.py   # gera o teste.html
cd ../material
node capturar.mjs   # fotografa o app, 4200px de largura
node gerar.mjs      # escreve os HTML e imprime os PDF
```

O `capturar.mjs` escreve uma conta de mentira no localStorage antes de abrir
a página (`dados-demo.mjs`): seis semanas de sessões, 46 das 90 aulas
marcadas, revisões vencendo e uma fila de cartões. Sem isso as capturas
sairiam de um painel vazio, que não ensina nada. Nada disso vai para o site
publicado.

O `gerar.mjs` baixa as três fontes da marca uma vez, guarda em `.fontes/` e
embute em base64 no HTML: assim o PDF sai igual em qualquer máquina, sem
depender da rede na hora de imprimir.

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

As condições da parceria são uma proposta de partida, não um combinado
fechado: estão todas no `CONDICOES` para trocar num lugar só e gerar de novo.

`capturas/`, `molduras/`, `.fontes/` e os `.html` são refeitos pelos comandos acima e por
isso ficam fora do repositório.

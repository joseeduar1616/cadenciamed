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

## Onde mexer

| O quê | Arquivo |
| --- | --- |
| Cores, fundo, vidro, relevo, esfera | `comum.mjs` |
| Texto e ordem das páginas do guia | `tutorial.mjs` |
| Texto das páginas de parceria | `patrocinio.mjs` |
| Comissão, dias de teste, acesso do criador | `patrocinio.mjs`, no `CONDICOES` |
| Quais telas são fotografadas | `capturar.mjs`, no `ABAS` |
| Os dados da conta de mentira | `dados-demo.mjs` |

As condições da parceria são uma proposta de partida, não um combinado
fechado: estão todas no `CONDICOES` para trocar num lugar só e gerar de novo.

`capturas/`, `.fontes/` e os `.html` são refeitos pelos comandos acima e por
isso ficam fora do repositório.

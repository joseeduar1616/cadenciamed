# Cadência Med · código-fonte

Site estático em React, compilado para um único `index.html`, publicado no
Netlify em `cadenciamed.com.br`.

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
    parte8.jsx > app.jsx

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
```

O `teste.html` existe só para o teste conseguir abrir as abas pagas. Ele é
gerado a partir de uma cópia do `app.jsx` e **não** entra na pasta de
publicação. O teste falha se qualquer aba não montar, se sobrar erro no
console, se as pastas ou os cartões sumirem ao recarregar a página, ou se a
troca de esquema de revisão e de aparência não pegar.

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
| `parte4.jsx` | rotina em calendário e aba Temas |
| `parte5.jsx` | aba Foco e aba Hoje |
| `parte6.jsx` | Matérias, Revisões, escolha do esquema, exportação `.ics` |
| `parte7.jsx` | Metas, Progresso, aparência, painel de conta |
| `parte9.jsx` | assistente que conversa com a API |
| `parte8.jsx` | componente raiz, cabeçalho, barra lateral, rodapé |
| `curriculo.js` | cronograma próprio: 90 aulas em 34 blocos de especialidade |
| `gerar_css.py` | varre o `app.jsx` e gera só as regras das classes usadas |
| `gerar_icones.py` | ícones, favicon e marca, a partir de `logo-original.png` |
| `montar.py` | junta CSS e JS num `index.html` autônomo |
| `montar_teste.py` | mesma coisa, com o plano liberado, para o teste |
| `publicar.py` | monta a pasta `publicar/`, que é o que se arrasta no Netlify |
| `testar.mjs` | teste de fumaça no Chromium |
| `testar-assistente.mjs` | teste da função da IA, com servidor falso no lugar da API |
| `testar-cupom.mjs` | teste do resgate de cupom, com Firebase falso |
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

## Funções no servidor

Em `netlify/functions/`:

- `assistente.mjs` — conversa com a IA; só o administrador pode usar
- `cupom.mjs` — confere o cupom e libera o plano
- `compra.mjs` — recebe o aviso de compra da Kiwify ou Hotmart
- `acessos.mjs` — painel do dono, libera e revoga acessos

Variáveis de ambiente: `FIREBASE_API_KEY`, `FIREBASE_SERVICE_ACCOUNT`,
`WEBHOOK_SEGREDO`, e a chave da IA.

### Qual IA o assistente usa

O `assistente.mjs` fala com os dois provedores. Quem decide é a variável de
ambiente que estiver cadastrada no Netlify:

| Variável | Provedor | Custo |
|---|---|---|
| `GEMINI_API_KEY` | Gemini, do Google | tem camada gratuita (aistudio.google.com/apikey) |
| `ANTHROPIC_API_KEY` | Claude, da Anthropic | pré-pago (console.anthropic.com) |

Com as duas cadastradas o Gemini é o escolhido. Para forçar um deles,
cadastre `IA_PROVEDOR` com `gemini` ou `anthropic`. O modelo também dá para
trocar sem mexer no código, por `GEMINI_MODELO` e `ANTHROPIC_MODELO`.

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

Os códigos ficam no `cupom.mjs`, no servidor, e nunca no navegador. Para
trocá-los sem mexer no código, cadastre `CUPONS` no Netlify, no formato
`codigo:plano,codigo:plano` (planos: mensal, anual, vitalicio). Enquanto essa
variável não existir, valem os dois cupons escritos no arquivo.

## Domínio

Ao acrescentar ou trocar de domínio, três lugares precisam saber, não só o
Netlify. Os dois primeiros quebram calados, e só no domínio novo:

1. **Firebase** → Authentication → Settings → Domínios autorizados. Sem isso o
   login falha com `auth/unauthorized-domain`. O app mostra essa mensagem em
   português, então o erro na tela já diz o que fazer.
2. **Google Cloud** → credencial ID do cliente OAuth → Origens JavaScript
   autorizadas. Sem isso o Google Agenda dá erro 400 `origin_mismatch`.
3. **Kiwify ou Hotmart** → o endereço do aviso de compra (webhook) que aponta
   para `/.netlify/functions/compra`.

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

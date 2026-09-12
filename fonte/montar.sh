#!/usr/bin/env bash
# Monta o site do zero e roda o teste no navegador.
#
#   ./montar.sh              → compila, testa e monta a pasta publicar/
#   ./montar.sh --sem-teste  → só compila
#
# A ordem da concatenação importa: parte8.jsx tem o componente raiz e vai
# por último, e parte13.jsx (leitor de Anki) precisa vir antes de parte12.jsx
# (flashcards) e de parte17.jsx (anotações, que também guarda imagem no
# mesmo IndexedDB). parte14.jsx (salas de amigos) vai logo antes do
# parte8.jsx, que é quem monta a aba e chama o usePerfilPublico. parte15.jsx
# (Notion) e parte16.jsx (Mentor) também vêm antes dele, pelo mesmo motivo.
set -euo pipefail
cd "$(dirname "$0")"

VERSAO="${VERSAO:-$(date +'%d/%m %H:%M')}"

echo "── ícones ──────────────────────────────────────────"
python3 gerar_icones.py
python3 gerar_cartao.py
python3 gerar_legais.py

echo "── juntando os pedaços ─────────────────────────────"
cat base.jsx parte2.jsx parte3.jsx parte10.jsx parte11.jsx parte13.jsx \
    parte12.jsx parte17.jsx parte4.jsx parte5.jsx parte6.jsx parte7.jsx parte9.jsx \
    parte14.jsx parte15.jsx parte16.jsx parte18.jsx parte8.jsx > app.jsx

echo "── compilando ──────────────────────────────────────"
npx esbuild main.jsx --bundle --minify --format=iife --loader:.jsx=jsx \
  --define:process.env.NODE_ENV='"production"' \
  --define:__PRESET__=false --define:"__VERSAO__=\"$VERSAO\"" \
  --outfile=b-limpa.js

echo "── css e html ──────────────────────────────────────"
python3 gerar_css.py
python3 montar.py

if [ "${1:-}" != "--sem-teste" ]; then
  python3 extrair_leitor.py
  python3 extrair_recorte.py
  python3 extrair_curriculo.py
  python3 extrair_cores.py
  python3 extrair_pastas.py
  echo "── teste no navegador ──────────────────────────────"
  python3 montar_teste.py > /dev/null
  node testar.mjs
  echo "── conferindo o arquivo de produção ────────────────"
  node testar.mjs index.html
  echo "── funções do servidor ─────────────────────────────"
  node testar-assistente.mjs
  node testar-flashcards-ia.mjs
  node testar-cronograma-ia.mjs
  node testar-ler-foto.mjs
  node testar-buscar-imagem.mjs
  node testar-google.mjs
  node testar-curriculo.mjs
  node testar-cores.mjs
  node testar-pastas.mjs
  node testar-recorte-pdf.mjs
  node testar-cupom.mjs
  node testar-acessos.mjs
  node testar-compra.mjs
  node testar-salas.mjs
  node testar-notion.mjs
  node testar-plano.mjs
  node testar-mentor.mjs
  node testar-baralhos.mjs
  node testar-worker.mjs
  node testar-api.mjs
fi

echo "── pasta para publicar ─────────────────────────────"
python3 publicar.py

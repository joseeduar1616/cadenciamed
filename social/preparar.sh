#!/usr/bin/env bash
# Prepara um post do Instagram a partir do JSON em social/posts/.
#
#   ./social/preparar.sh social/posts/2026-10-17-algo.json           # carrossel
#   ./social/preparar.sh social/posts/2026-10-17-algo.json --reel    # Reel 9:16
#
# Gera as imagens (ou o reel.mp4) em social/publicado/<id>/ e copia para
# publicar/s/<id>/, que vai ao ar em https://cadenciamed.com.br/s/<id>/.
# Depois é commit, push no main, esperar o deploy e publicar pelo Windsor
# (veja social/LEIA-ME.md).
set -euo pipefail
cd "$(dirname "$0")/.."
JSON="$1"; MODO="${2:-}"
ID=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['id'])" "$JSON")

# dependências que não moram no repositório
python3 -c "import PIL" 2>/dev/null || python3 -m pip install -q pillow
python3 -c "import imageio_ffmpeg" 2>/dev/null || python3 -m pip install -q imageio-ffmpeg
if [ ! -d social/node_modules/playwright ]; then
  (cd social && npm init -y >/dev/null 2>&1 || true; npm i -s --no-save playwright@1.56 >/dev/null)
fi
export FFMPEG="${FFMPEG:-$(python3 -c 'import imageio_ffmpeg as f; print(f.get_ffmpeg_exe())')}"
if [ -z "${CHROMIUM:-}" ]; then
  for c in /opt/pw-browsers/chromium-*/chrome-linux/chrome; do [ -x "$c" ] && export CHROMIUM="$c"; done
fi

if [ "$MODO" = "--reel" ]; then
  python3 social/reel.py "$JSON"
  node social/reel.mjs "$ID"
else
  python3 social/carrossel.py "$JSON"
  node social/render.mjs "$ID"
fi
mkdir -p publicar/s
rm -rf "publicar/s/$ID"; cp -r "social/publicado/$ID" "publicar/s/$ID"
ls -la "publicar/s/$ID"
echo "Depois do deploy: https://cadenciamed.com.br/s/$ID/"

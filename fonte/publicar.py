"""Monta a pasta publicar/, que é o que o Cloudflare Pages publica.

Só entra aqui o que o site precisa no ar. Os fontes, o app.jsx montado, o
teste.html e as capturas de tela ficam de fora.

As funções do servidor NÃO entram aqui: no Cloudflare Pages elas moram em
functions/ na raiz do repositório, fora da pasta publicada. Isso também
resolve de graça um problema antigo, que era o código das funções ficar
acessível como arquivo de texto por estar dentro do que ia ao ar.
"""
import os, shutil

os.chdir(os.path.dirname(os.path.abspath(__file__)))
RAIZ = os.path.dirname(os.getcwd())
DESTINO = os.path.join(RAIZ, 'publicar')

ARQUIVOS = [
    'index.html',
    'manifest.webmanifest',
    'regras-firestore.txt',
    'sql-asm.js',
    'favicon.ico',
    'icone-32.png',
    'icone-180.png',
    'icone-192.png',
    'icone-512.png',
    'icone-512-maskable.png',
]
if os.path.isdir(DESTINO):
    shutil.rmtree(DESTINO)
os.makedirs(DESTINO)

faltando = [f for f in ARQUIVOS if not os.path.exists(f)]
if faltando:
    raise SystemExit('faltam arquivos: ' + ', '.join(faltando))

total = 0
for f in ARQUIVOS:
    shutil.copy(f, os.path.join(DESTINO, f))
    total += os.path.getsize(f)
# ── cabeçalhos, no formato que o Cloudflare Pages lê ──────────────────────
# O HTML nunca fica em cache, então publicar já aparece na hora. Ícones e o
# leitor de banco do Anki mudam pouco e podem ficar guardados.
CABECALHOS = """/index.html
  Cache-Control: no-cache, no-store, must-revalidate

/
  Cache-Control: no-cache, no-store, must-revalidate

/manifest.webmanifest
  Content-Type: application/manifest+json
  Cache-Control: public, max-age=3600

/*.png
  Cache-Control: public, max-age=604800

/sql-asm.js
  Cache-Control: public, max-age=2592000
"""
open(os.path.join(DESTINO, '_headers'), 'w', encoding='utf-8').write(CABECALHOS)

# Uma página só: qualquer endereço desconhecido devolve o próprio app, para
# atualizar a página numa rota inventada não dar erro. As chamadas de /api/
# são atendidas pelas funções antes de chegar aqui.
open(os.path.join(DESTINO, '_redirects'), 'w', encoding='utf-8').write(
    '/*  /index.html  200\n')

# as funções ficam fora da pasta publicada, mas precisam existir
RAIZ_FUNCOES = os.path.join(RAIZ, 'functions', 'api')
FUNCOES = ['assistente.js', 'compra.js', 'acessos.js', 'cupom.js', '_comum.js']
faltam = [f for f in FUNCOES if not os.path.exists(os.path.join(RAIZ_FUNCOES, f))]
if faltam:
    raise SystemExit('faltam funções em functions/api: ' + ', '.join(faltam))

print(f'publicar/ pronta: {len(ARQUIVOS) + 2} arquivos, '
      f'{round(total / 1048576, 2)} MB')
print(f'functions/api: {len(FUNCOES)} arquivos (fora da pasta publicada)')

# O mesmo conteúdo zipado, com o index.html na raiz do arquivo, que é como o
# Netlify espera quando se solta um zip na área de deploy.
ZIP = os.path.join(RAIZ, 'cadenciamed-publicar.zip')
if os.path.exists(ZIP):
    os.remove(ZIP)
shutil.make_archive(ZIP[:-4], 'zip', DESTINO)
print(f'cadenciamed-publicar.zip: {round(os.path.getsize(ZIP) / 1048576, 2)} MB')

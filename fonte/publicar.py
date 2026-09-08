"""Monta a pasta publicar/, que é o que se arrasta para o Netlify.

Só entra aqui o que o site precisa no ar. Os fontes, o app.jsx montado, o
teste.html e as capturas de tela ficam de fora.
"""
import os, shutil

os.chdir(os.path.dirname(os.path.abspath(__file__)))
RAIZ = os.path.dirname(os.getcwd())
DESTINO = os.path.join(RAIZ, 'publicar')

ARQUIVOS = [
    'index.html',
    'manifest.webmanifest',
    'netlify.toml',
    'regras-firestore.txt',
    'sql-asm.js',
    'favicon.ico',
    'icone-32.png',
    'icone-180.png',
    'icone-192.png',
    'icone-512.png',
    'icone-512-maskable.png',
]
FUNCOES = ['assistente.mjs', 'compra.mjs', 'acessos.mjs', 'cupom.mjs']

if os.path.isdir(DESTINO):
    shutil.rmtree(DESTINO)
os.makedirs(os.path.join(DESTINO, 'netlify', 'functions'))

faltando = [f for f in ARQUIVOS if not os.path.exists(f)]
if faltando:
    raise SystemExit('faltam arquivos: ' + ', '.join(faltando))

total = 0
for f in ARQUIVOS:
    shutil.copy(f, os.path.join(DESTINO, f))
    total += os.path.getsize(f)
for f in FUNCOES:
    origem = os.path.join('netlify', 'functions', f)
    if not os.path.exists(origem):
        raise SystemExit('falta a função ' + f)
    shutil.copy(origem, os.path.join(DESTINO, 'netlify', 'functions', f))
    total += os.path.getsize(origem)

print(f'publicar/ pronta: {len(ARQUIVOS) + len(FUNCOES)} arquivos, '
      f'{round(total / 1048576, 2)} MB')

# O mesmo conteúdo zipado, com o index.html na raiz do arquivo, que é como o
# Netlify espera quando se solta um zip na área de deploy.
ZIP = os.path.join(RAIZ, 'cadenciamed-publicar.zip')
if os.path.exists(ZIP):
    os.remove(ZIP)
shutil.make_archive(ZIP[:-4], 'zip', DESTINO)
print(f'cadenciamed-publicar.zip: {round(os.path.getsize(ZIP) / 1048576, 2)} MB')

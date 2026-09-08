"""Monta a pasta publicar/, que é o que o Cloudflare serve como arquivo.

Só entra aqui o que o site precisa no ar. Os fontes, o app.jsx montado, o
teste.html e as capturas de tela ficam de fora.

O código do servidor NÃO entra aqui: ele mora em worker/, na raiz do
repositório, fora da pasta publicada. Isso também resolve de graça um
problema antigo, que era o código das funções ficar acessível como arquivo
de texto por estar dentro do que ia ao ar.
"""
import os, re, shutil

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

# Não há _redirects: "atualizar numa rota inventada devolve o index.html" é
# resolvido por not_found_handling no wrangler.jsonc, e o /api/ é resolvido
# por run_worker_first. Um _redirects aqui só criaria uma segunda fonte de
# verdade para a mesma decisão.

# o código do servidor fica fora da pasta publicada, mas precisa existir
#
# A conferência sai do próprio index.js, e não de uma lista escrita aqui:
# uma lista à mão envelhece calada, e foi o que aconteceu — rotas novas
# entraram no ar sem nunca passar por esta conferência.
RAIZ_WORKER = os.path.join(RAIZ, 'worker')
if not os.path.exists(os.path.join(RAIZ_WORKER, 'index.js')):
    raise SystemExit('falta o worker/index.js')

def importados(arquivo):
    """Os caminhos que este arquivo do worker importa, relativos a worker/."""
    texto = open(os.path.join(RAIZ_WORKER, arquivo), encoding='utf-8').read()
    pasta = os.path.dirname(arquivo)
    return [os.path.normpath(os.path.join(pasta, cam))
            for cam in re.findall(r'from\s+"\.\/?([^"]+)"', texto)]


PECAS = []
fila = ['index.js']
while fila:
    peca = fila.pop()
    if peca in PECAS:
        continue
    if not os.path.exists(os.path.join(RAIZ_WORKER, peca)):
        raise SystemExit('o worker importa arquivo que não existe: ' + peca)
    PECAS.append(peca)
    fila.extend(importados(peca))

# E a tabela de rotas precisa existir: sem ela o Worker sobe servindo só
# arquivo, e as chamadas /api caem no site em silêncio.
rotas = re.findall(r'"(/api/[a-z-]+)"\s*:',
                   open(os.path.join(RAIZ_WORKER, 'index.js'), encoding='utf-8').read())
if not rotas:
    raise SystemExit('não achei nenhuma rota na tabela do worker/index.js')
if not os.path.exists(os.path.join(RAIZ, 'wrangler.jsonc')):
    raise SystemExit('falta o wrangler.jsonc na raiz')

print(f'publicar/ pronta: {len(ARQUIVOS) + 1} arquivos, '
      f'{round(total / 1048576, 2)} MB')
print(f'worker/: {len(PECAS)} arquivos (fora da pasta publicada)')

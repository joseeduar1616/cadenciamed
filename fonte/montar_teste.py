"""Monta um teste.html igual ao index.html, só que com o plano liberado.

Serve para o teste automático conseguir abrir as abas pagas. O arquivo de
produção não é tocado: a troca acontece numa cópia do app.jsx, e o teste.html
não faz parte da pasta de publicação.
"""
import os, re, subprocess, shutil

os.chdir(os.path.dirname(os.path.abspath(__file__)))

fonte = open('app.jsx', encoding='utf-8').read()
patch, n = re.subn(r'const pro = assinatura\.pro;',
                   'const pro = true;   /* build de teste */', fonte)
if n != 1:
    raise SystemExit('não achei a linha do paywall em app.jsx')

os.makedirs('_teste', exist_ok=True)
open('_teste/app.jsx', 'w', encoding='utf-8').write(patch)
for f in ('main.jsx', 'curriculo.js'):
    shutil.copy(f, '_teste/' + f)

subprocess.run([
    'npx', 'esbuild', '_teste/main.jsx', '--bundle', '--minify', '--format=iife',
    '--loader:.jsx=jsx', '--define:process.env.NODE_ENV="production"',
    '--define:__PRESET__=false', '--define:__VERSAO__="teste"',
    '--outfile=_teste/b.js',
], check=True)

import montar
montar.build('_teste/b.js', 'teste.html', 'Cadência Med · teste', 'build de teste')

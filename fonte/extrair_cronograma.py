"""Extrai a divisão do cronograma em partes (parte9.jsx) para um módulo
testável.

O cronograma que a pessoa envia vai à IA em partes, e as listas voltam
juntas. Errar aqui não quebra tela: corta o fim do curso calado, ou repete
aula na emenda entre duas partes. A cópia é refeita a cada build.
"""
import os
os.chdir(os.path.dirname(os.path.abspath(__file__)))

s = open('parte9.jsx', encoding='utf-8').read()
inicio = '/* ── a lógica pura do organizar em partes'
fim = '/* ── fim da lógica pura do organizar'
if inicio not in s or fim not in s:
    raise SystemExit('não achei a divisão em partes no parte9.jsx')
corpo = s[s.index(inicio):s.index(fim)].rstrip()
for alvo in ('const PARTE_ORGANIZAR', 'const MAX_PARTES_ORGANIZAR', 'function partesParaOrganizar',
             'function chaveMateria', 'function juntarMaterias'):
    if alvo not in corpo:
        raise SystemExit(f'não achei {alvo} no parte9.jsx')
    corpo = corpo.replace(alvo, 'export ' + alvo, 1)
open('_cronograma.mjs', 'w', encoding='utf-8').write(
    '/* Cópia automática, refeita pelo extrair_cronograma.py a cada build.\n'
    '   Não edite aqui: edite o parte9.jsx. */\n' + corpo + '\n')
print('_cronograma.mjs: cópia da divisão do cronograma refeita')

"""Extrai chamarApi e lerRespostaDoServidor do parte2.jsx para um módulo
importável.

As duas vivem dentro do bundle e não são exportadas, mas o teste precisa
chamá-las. Em vez de manter duas cópias que divergem em silêncio, a cópia é
refeita a cada build a partir do original.
"""
import os
os.chdir(os.path.dirname(os.path.abspath(__file__)))

s = open('parte2.jsx', encoding='utf-8').read()
inicio = '/* ── onde ficam as rotas /api ──'
fim = 'function subjectState(s, marks) {'
if inicio not in s or fim not in s:
    raise SystemExit('não achei chamarApi/lerRespostaDoServidor no parte2.jsx')
corpo = s[s.index(inicio):s.index(fim)].rstrip()

for nome in ('chamarApi', 'lerRespostaDoServidor'):
    alvo = f'async function {nome}'
    if alvo not in corpo:
        raise SystemExit(f'não achei {nome} no trecho extraído')
    corpo = corpo.replace(alvo, f'export async function {nome}')

# basesDeApi decide para onde a chamada vai, então o teste precisa dela para
# conferir a ordem das tentativas.
corpo = corpo.replace('function basesDeApi()', 'export function basesDeApi()')

open('_leitor.mjs', 'w', encoding='utf-8').write(
    '/* Cópia automática, refeita pelo extrair_leitor.py a cada build.\n'
    '   Não edite aqui: edite o parte2.jsx. */\n' + corpo + '\n')
print('_leitor.mjs: cópia de chamarApi e lerRespostaDoServidor refeita')

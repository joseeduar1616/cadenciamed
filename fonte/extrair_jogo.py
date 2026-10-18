"""Extrai a lógica pura do modo jogo (parte38.jsx) para um módulo testável.

É ela que decide se a resposta está certa, quantas vidas sobram, o que volta
no fim da lição, quanto XP entra e quantos dias de ofensiva a pessoa tem: um
erro aqui não quebra a tela, só faz o jogo contar errado com toda a
confiança. A cópia é refeita a cada build a partir do original.
"""
import os
import re
os.chdir(os.path.dirname(os.path.abspath(__file__)))

s = open('parte38.jsx', encoding='utf-8').read()
inicio = '/* ── a lógica pura do jogo'
fim = '/* ── telas do jogo'
if inicio not in s or fim not in s:
    raise SystemExit('não achei o trecho puro no parte38.jsx')
corpo = s[s.index(inicio):s.index(fim)].rstrip()

nomes = re.findall(r'^(?:const|function) ([A-Za-z_][A-Za-z0-9_]*)', corpo, re.M)
for alvo in ('limparJogo', 'ofensivaDoJogo', 'xpDaLicao', 'somarXpDoJogo', 'conferirExercicio',
             'respostaCertaDoJogo', 'fracoDoExercicio', 'novaPartida', 'depoisDaResposta', 'licaoLiberada'):
    if alvo not in nomes:
        raise SystemExit(f'não achei {alvo} no trecho extraído')
corpo = re.sub(r'^(const|function) ', r'export \1 ', corpo, flags=re.M)

open('_jogo.mjs', 'w', encoding='utf-8').write(
    '/* Cópia automática, refeita pelo extrair_jogo.py a cada build.\n'
    '   Não edite aqui: edite o parte38.jsx. */\n' + corpo + '\n')
print('_jogo.mjs: cópia da lógica do modo jogo refeita')

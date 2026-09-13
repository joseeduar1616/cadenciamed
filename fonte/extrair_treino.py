"""Extrai as contas da aba Treino (parte19.jsx) para um módulo importável.

um1RM, melhorSerie, progressaoDoExercicio, exerciciosRegistrados,
volumePorGrupo, gruposEsquecidos, acharPlatos, anilhasPara, aquecimentoPara
e ultimaCarga são puras — nada de navegador nem de React. São elas que
decidem se alguém está evoluindo ou empacado, e quanto peso pôr na barra,
então merecem teste direto. Em vez de manter duas cópias que divergem em
silêncio, a cópia é refeita a cada build a partir do original.

addDays vem do base.jsx e é usada pelo acharPlatos; vai junto, pelo mesmo
motivo de não duplicar.
"""
import os
import re
os.chdir(os.path.dirname(os.path.abspath(__file__)))

s = open('parte19.jsx', encoding='utf-8').read()
inicio = '/* 1RM estimado pela fórmula de Epley.'
fim = '/* ── perfil e montagem do plano'
if inicio not in s or fim not in s:
    raise SystemExit('não achei o trecho das contas no parte19.jsx')
corpo = s[s.index(inicio):s.index(fim)].rstrip()

topo = s[:s.index(inicio)]
for const in ('BARRA_PADRAO', 'ANILHAS_PADRAO', 'GRUPOS_MUSCULO', 'MEDIDAS_CORPO'):
    m = re.search(r'^const %s = .*?;$' % const, topo, re.S | re.M)
    if not m:
        raise SystemExit('não achei o %s no parte19.jsx' % const)
    corpo = 'export ' + m.group(0) + '\n\n' + corpo

def funcao_inteira(fonte, nome):
    """O corpo completo de uma function, contando chaves.

    Uma regex de uma linha só pegaria a primeira linha das que se abrem em
    várias — foi o que aconteceu com o fromISO na primeira versão disto."""
    m = re.search(r'^function %s\(' % nome, fonte, re.M)
    if not m:
        raise SystemExit('não achei o %s no base.jsx' % nome)
    i = fonte.index('{', m.start())
    nivel = 0
    for j in range(i, len(fonte)):
        if fonte[j] == '{':
            nivel += 1
        elif fonte[j] == '}':
            nivel -= 1
            if nivel == 0:
                return fonte[m.start():j + 1]
    raise SystemExit('o %s ficou sem fechar' % nome)


base = open('base.jsx', encoding='utf-8').read()
for nome in ('fromISO', 'addDays'):
    corpo = funcao_inteira(base, nome) + '\n' + corpo
# pad e toISO são arrow de uma linha, então saem por regex mesmo
for nome in ('pad', 'toISO'):
    m = re.search(r'^const %s = .*$' % nome, base, re.M)
    if not m:
        raise SystemExit('não achei o %s no base.jsx' % nome)
    corpo = m.group(0) + '\n' + corpo

for alvo in ('function um1RM', 'function melhorSerie', 'function progressaoDoExercicio',
             'function exerciciosRegistrados', 'function volumePorGrupo',
             'function gruposEsquecidos', 'function acharPlatos', 'function anilhasPara',
             'function aquecimentoPara', 'function ultimaCarga'):
    if alvo not in corpo:
        raise SystemExit('não achei %s no trecho extraído' % alvo)
    corpo = corpo.replace(alvo, 'export ' + alvo, 1)

open('_treino.mjs', 'w', encoding='utf-8').write(
    '/* Cópia automática, refeita pelo extrair_treino.py a cada build.\n'
    '   Não edite aqui: edite o parte19.jsx. */\n' + corpo + '\n')
print('_treino.mjs: cópia das contas do treino refeita')

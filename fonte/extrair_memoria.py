"""Extrai o perfil de memória e as contas dos cartões (base.jsx) para
módulos testáveis.

O perfil decide a escada de revisão de uma pessoa a partir de seis
respostas; as contas dos cartões decidem a "confiança" de cada baralho e as
alternativas da múltipla escolha. Nenhuma dessas contas quebra tela quando
erra: elas entregam uma escada ruim, uma barra que mente, ou uma pergunta
com duas respostas certas. A cópia é refeita a cada build.
"""
import os
os.chdir(os.path.dirname(os.path.abspath(__file__)))

s = open('base.jsx', encoding='utf-8').read()

def fatia(inicio, fim, nomes, saida, rotulo):
    if inicio not in s or fim not in s:
        raise SystemExit(f'não achei {rotulo} no base.jsx')
    corpo = s[s.index(inicio):s.index(fim)].rstrip()
    for alvo in nomes:
        if alvo not in corpo:
            raise SystemExit(f'não achei {alvo} em {rotulo}')
        corpo = corpo.replace(alvo, 'export ' + alvo, 1)
    open(saida, 'w', encoding='utf-8').write(
        '/* Cópia automática, refeita pelo extrair_memoria.py a cada build.\n'
        '   Não edite aqui: edite o base.jsx. */\n' + corpo + '\n')
    print(f'{saida}: cópia de {rotulo} refeita')

PERFIL = '/* ── o perfil de memória: de que escada ESTA pessoa precisa'
CARTOES = '/* ── cartões: o quanto você sabe cada um, e a múltipla escolha'
FICHA = '/* ── a ficha de cada tópico'

fatia(PERFIL, CARTOES,
      ('const PERGUNTAS_MEMORIA', 'function perfilDeMemoria', 'function escadaDoPerfil',
       'function lembrancaNoDia', 'function curvaDeRetencao', 'function alvoDoPrazo',
       'const MAX_DEGRAUS_PERFIL'),
      '_memoria.mjs', 'o perfil de memória')
fatia(CARTOES, FICHA,
      ('function chanceDeLembrar', 'function confiancaDoBaralho', 'function alternativasDoCartao',
       'function notaDaEscolha', 'function pontosDaResposta', 'function diasEntreISO',
       'const SEGUNDOS_RESPOSTA_RAPIDA', 'const CORES_BARALHO', 'const corDoBaralho', 'function textoDaAlternativa'),
      '_cartoes.mjs', 'as contas dos cartões')

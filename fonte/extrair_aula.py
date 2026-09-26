"""Extrai a lógica pura da gravação de aula (parte24.jsx) para um módulo
testável.

É ela que escolhe o formato de gravação, converte o áudio para MP3 ou WAV
quando o serviço recusa o original, e junta as transcrições na ordem. Erro
aqui aparece tarde e caro: uma aula de duas horas que chega à IA com os
trechos fora de ordem, ou um WAV com cabeçalho errado que o serviço recusa
depois de a pessoa esperar a conversão. A cópia é refeita a cada build.
"""
import os
os.chdir(os.path.dirname(os.path.abspath(__file__)))

s = open('parte24.jsx', encoding='utf-8').read()
inicio = '/* ── a lógica pura (copiada e testada pelo extrair_aula.py)'
fim = '/* ── fim da lógica pura'
if inicio not in s or fim not in s:
    raise SystemExit('não achei a lógica pura da gravação no parte24.jsx')
corpo = s[s.index(inicio):s.index(fim)].rstrip()

for alvo in ('function tipoDeGravacao', 'function tipoBaseAudio', 'function extensaoDoAudio',
             'function paraInt16', 'function misturarMono', 'function wavDe', 'function mp3De',
             'function juntarTranscricoes', 'function faltamTranscrever', 'function fmtDuracaoAula',
             'const TIPOS_GRAVACAO', 'const TAXA_TRANSCRICAO', 'const KBPS_MP3',
             'const MINUTOS_POR_TRECHO', 'const SEGUNDOS_ENTRE_SALVAMENTOS'):
    if alvo not in corpo:
        raise SystemExit(f'não achei {alvo} no trecho extraído')
    corpo = corpo.replace(alvo, 'export ' + alvo, 1)

open('_aula.mjs', 'w', encoding='utf-8').write(
    '/* Cópia automática, refeita pelo extrair_aula.py a cada build.\n'
    '   Não edite aqui: edite o parte24.jsx. */\n' + corpo + '\n')
print('_aula.mjs: cópia da lógica da aula gravada refeita')

# Questões autorais do banco

Questões escritas pelo Cadência Med a partir de diretrizes (não são de prova
de banca). Aparecem na tela marcadas como "Autoral Cadência Med".

- `lote-*.cifra`: os lotes, cifrados com `chave-publica.pem` (a chave pública
  da conta de serviço do Firebase). Só o fluxo `importar-banco.yml`, com o
  segredo FIREBASE_SERVICE_ACCOUNT, abre.
- Para um lote novo: monte o JSON `{ "questoes": [...] }` fora do repositório,
  cifre com `node fonte/cifrar-lote.mjs fonte/banco-autoral/chave-publica.pem lote.json fonte/banco-autoral/lote-00N.cifra`
  e faça o push no main. O fluxo grava tudo de novo (sem duplicar).
- Cada questão tem `numero`, que vira o id `banco/autoral-{numero}`. O lote 001
  usa os números 1 a 263; o próximo começa no 264.

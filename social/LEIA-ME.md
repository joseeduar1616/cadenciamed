# Posts do Instagram (@cadenciamed)

Esta pasta faz e publica os posts do perfil. Uma rotina diária roda o passo a
passo abaixo sozinha. O mesmo passo a passo serve pra fazer um post na mão.

## O que os números do perfil mostraram (até 16/10/2026)

Os números vêm do Windsor, conector `instagram`, conta `17841456884640989`.

- **Carrossel com dor ou identificação na capa foi o melhor formato.**
  - "Cronograma na planilha, flashcards no celular..." alcançou 656 contas.
  - "Terminou a aula. E agora?" alcançou 513.
  - Os dois saíram às 09:52 de um sábado e tiveram 57 a 64 interações.
- **Carrossel com estatística do mercado foi o pior.** O post do ENARE, numa quarta às 16:41, alcançou só 54 contas.
- **Nos Reels, o que conta é o começo.**
  - Os memes que abrem direto na frase tiveram uns 66% de pulo nos 3 primeiros segundos.
  - O vídeo que abria com o logo teve 92% de pulo.
  - Por isso a capa do Reel aparece inteira já no quadro 0.
- **Melhor horário até agora:**
  - carrossel às 09:52;
  - Reel às 14:55, o que mais alcançou entre os Reels (300).
  - Horário de Brasília.

Atualize esta seção quando os números mudarem: cada rotina lê o desempenho dos
posts anteriores antes de fazer o próximo.

## Rotina de cada dia

- **09:52 · carrossel:** 5 a 7 slides.
  - Capa com uma dor do estudante.
  - Passos práticos, cada um com um cartão de interface.
  - Último slide claro, com o que o app faz e "Teste 3 dias grátis".
- **14:55 · Reel:** 3 a 5 cenas, 15 a 25 s.
  - Gancho de identificação ("Quem nunca...?", "Plantão de 12h e...").
  - Uma ou duas cenas com a solução.
  - Chamada final.

## Passo a passo

1. **Ler o desempenho.** Pelo Windsor (`get_data`, conector `instagram`, conta
   `17841456884640989`), puxe os últimos 14 dias com estes campos:
   - `timestamp`, `media_id`, `media_type`, `media_caption`;
   - `media_reach`, `media_views`, `media_saved`, `media_shares`, `media_engagement`;
   - `media_reel_skip_rate`, `media_reel_avg_watch_time`.

   Anote no fim do `historico.md` o que funcionou.
2. **Escolher a pauta.** Pegue a próxima do `pautas.md` que ainda não saiu (confira no `historico.md`).
3. **Escrever o JSON.** Crie `social/posts/AAAA-MM-DD-slug.json` seguindo o formato do
   `2026-10-16-cronograma-atrasado.json`:
   - **Tipos de slide:** capa, passo, final.
   - **Temas:** escuro, claro, degrade.
   - **Blocos de `ui`:**
     - `lista` (itens com titulo/sub/selo);
     - `barras` (nome/valor 0 a 1/rotulo);
     - `semana` (dias com blocos);
     - `checklist` (itens com texto/feito);
     - `cartao` (frente/verso);
     - `questao` (enunciado/alternativas/certa/comentario);
     - `recursos` (itens com titulo/texto).
   - **Pro Reel:** use o mesmo formato, com 3 a 5 slides.
4. **Gerar.**
   - Carrossel: `./social/preparar.sh social/posts/<id>.json`
   - Reel: `./social/preparar.sh social/posts/<id>.json --reel`
5. **Conferir.** Abra as imagens ou `social/saida/<id>/previa-*.png` e veja:
   - nada cortado;
   - contraste bom;
   - texto sem erro.
6. **Publicar no site.** `git add social publicar/s`, commit e `git push origin HEAD:main`
   (depois de `git fetch origin main` e `git merge FETCH_HEAD`).
   - Espere os fluxos "Deploy to Firebase Hosting" e "Publicar no Cloudflare" terminarem com sucesso.
   - Confira no GitHub Actions, porque o ambiente da rotina não acessa o cadenciamed.com.br.
7. **Publicar no Instagram.** Pelo Windsor, `execute_action` no conector `instagram`, conta `17841456884640989`:
   - **carrossel:** `create_carousel_post` com `image_urls` = `https://cadenciamed.com.br/s/<id>/1.jpg` ... e `caption` = `legenda`;
   - **Reel:** `create_video_post` com `video_url` = `https://cadenciamed.com.br/s/<id>/reel.mp4`, `caption` e `share_to_feed: true`.

   Se a chamada passar de 60 s, ela pode ter publicado mesmo assim. Confira os
   posts do dia antes de tentar de novo, pra não duplicar.
8. **Registrar.** Anote em `historico.md` a data, o horário, o formato, a pauta e o link do post.

## Regras de texto

- **Tom:** português do Brasil, natural, de estudante pra estudante.
- **Proibido no texto:**
  - travessão (o `carrossel.py` recusa);
  - o molde "não é X, é Y";
  - frase de coach.
- **Não citar:**
  - marca de outro app ou cursinho;
  - número inventado (só número verdadeiro do próprio app ou de fonte citada).
- **Não prometer aprovação.**
- **Só falar de função que existe no app:**
  - cronograma pronto ou o do cursinho (a IA lê), ciclo clínico e os dois juntos;
  - revisão espaçada com o teste de memória;
  - flashcards (a IA monta do PDF);
  - mentor de IA, inclusive por voz;
  - provas comentadas;
  - caderno de erros;
  - desempenho por área;
  - simulados com a turma;
  - salas com amigos e ranking por horas líquidas;
  - Foco com pomodoro;
  - agenda com Google Agenda;
  - 3 dias grátis sem cartão.
- **Preço:** mensal R$ 39, anual R$ 300 (R$ 25 por mês), garantia de 7 dias. Só quando fizer sentido.
- **Legenda:** termine com uma pergunta pros comentários, o convite pra salvar ou mandar
  pra um amigo, e "Teste 3 dias grátis, sem cartão. Link na bio 👉 cadenciamed.com.br".
  Use 5 hashtags: #residenciamedica #medicina #estudantedemedicina #internato e uma do tema.

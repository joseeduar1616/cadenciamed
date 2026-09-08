/* ═══════════════════════════════════════════════════════════════════
   26 · IMPORTAR DO ANKI (.apkg)
   O arquivo é um zip contendo um banco SQLite com as notas e os
   arquivos de mídia numerados. Aqui ele é descompactado, o banco é
   lido e as imagens vão para o IndexedDB, que aguenta bem mais que o
   armazenamento comum do navegador.
   ═══════════════════════════════════════════════════════════════════ */

import { unzipSync, strFromU8 } from "fflate";

/* O leitor de banco viaja junto com o site, num arquivo à parte que só é
   baixado quando alguém importa um .apkg. Se ele faltar, tenta o CDN. */
const SQL_LOCAL = "/sql-asm.js";
const SQL_CDN = "https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/sql-asm.js";

/* ── depósito de imagens ────────────────────────────────────────── */
const BD_NOME = "cadencia-midia";
const BD_LOJA = "arquivos";

function abrirBD() {
  return new Promise((ok, falha) => {
    if (!window.indexedDB) return falha(new Error("sem indexedDB"));
    const req = window.indexedDB.open(BD_NOME, 1);
    req.onupgradeneeded = () => {
      const bd = req.result;
      if (!bd.objectStoreNames.contains(BD_LOJA)) bd.createObjectStore(BD_LOJA);
    };
    req.onsuccess = () => ok(req.result);
    req.onerror = () => falha(req.error);
  });
}

async function guardarMidia(nome, dataUri) {
  const bd = await abrirBD();
  return new Promise((ok, falha) => {
    const tx = bd.transaction(BD_LOJA, "readwrite");
    tx.objectStore(BD_LOJA).put(dataUri, nome);
    tx.oncomplete = () => { bd.close(); ok(true); };
    tx.onerror = () => { bd.close(); falha(tx.error); };
  });
}

const cacheMidia = new Map();

async function lerMidia(nome) {
  if (cacheMidia.has(nome)) return cacheMidia.get(nome);
  try {
    const bd = await abrirBD();
    const v = await new Promise((ok, falha) => {
      const tx = bd.transaction(BD_LOJA, "readonly");
      const r = tx.objectStore(BD_LOJA).get(nome);
      r.onsuccess = () => ok(r.result || null);
      r.onerror = () => falha(r.error);
    });
    bd.close();
    /* Só o que foi achado entra no cache. Guardar o "não achei" fazia uma
       falha de um instante virar permanente: bastava a leitura acontecer
       antes de a importação terminar de gravar, e aquela imagem ficava
       "indisponível" para sempre, mesmo já estando no banco. */
    if (v) cacheMidia.set(nome, v);
    return v;
  } catch (e) { return null; }
}

async function limparMidia() {
  try {
    const bd = await abrirBD();
    await new Promise((ok) => {
      const tx = bd.transaction(BD_LOJA, "readwrite");
      tx.objectStore(BD_LOJA).clear();
      tx.oncomplete = ok; tx.onerror = ok;
    });
    bd.close();
    cacheMidia.clear();
    return true;
  } catch (e) { return false; }
}

const TIPOS = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
  webp: "image/webp", svg: "image/svg+xml", bmp: "image/bmp", avif: "image/avif",
};
const ehImagem = (nome) => !!TIPOS[String(nome).split(".").pop().toLowerCase()];

function paraDataUri(bytes, nome) {
  const tipo = TIPOS[String(nome).split(".").pop().toLowerCase()] || "application/octet-stream";
  let bin = "";
  const bloco = 0x8000;
  for (let i = 0; i < bytes.length; i += bloco) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + bloco));
  }
  return `data:${tipo};base64,${btoa(bin)}`;
}

/* ── limpeza do HTML das notas, preservando as imagens ──────────── */
function limparCampo(html) {
  let s = String(html || "");
  const imagens = [];
  s = s.replace(/<img[^>]*src\s*=\s*["']([^"']+)["'][^>]*>/gi, (m, src) => {
    const nome = decodeURIComponent(src.split("/").pop().split("?")[0]);
    imagens.push(nome);
    return ` [[img:${nome}]] `;
  });
  s = s.replace(/\[sound:[^\]]*\]/gi, " ");
  s = s.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(div|p|li|tr)>/gi, "\n");
  s = s.replace(/<[^>]+>/g, "");
  s = s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  s = s.replace(/\n{3,}/g, "\n\n").trim();
  return { texto: s, imagens };
}

/* ── o motor do SQLite, buscado só quando é preciso ─────────────── */
let sqlPromessa = null;

function baixarScript(url) {
  return new Promise((ok, falha) => {
    const s = document.createElement("script");
    s.src = url;
    s.onload = () => ok(true);
    s.onerror = () => falha(new Error("falhou " + url));
    document.head.appendChild(s);
  });
}

function carregarSQL() {
  if (sqlPromessa) return sqlPromessa;
  sqlPromessa = (async () => {
    if (!window.initSqlJs) {
      try { await baixarScript(SQL_LOCAL); }
      catch (e) {
        try { await baixarScript(SQL_CDN); }
        catch (e2) {
          throw new Error(
            "Não consegui carregar o leitor de banco. Confira se o arquivo "
            + "sql-asm.js foi publicado junto com o site."
          );
        }
      }
    }
    if (!window.initSqlJs) throw new Error("O leitor de banco não iniciou.");
    return window.initSqlJs();
  })();
  return sqlPromessa;
}

/* Lê o .apkg e devolve os cartões prontos. `aviso` recebe o andamento. */
async function lerApkg(arquivo, aviso) {
  aviso("abrindo o arquivo");
  const bytes = new Uint8Array(await arquivo.arrayBuffer());

  let zip;
  try { zip = unzipSync(bytes); }
  catch (e) { throw new Error("Esse arquivo não parece um .apkg válido."); }

  const nomes = Object.keys(zip);
  const banco = nomes.find((n) => n === "collection.anki2")
    || nomes.find((n) => n === "collection.anki21")
    || nomes.find((n) => /collection\.anki2\d?$/.test(n));

  if (!banco) {
    if (nomes.some((n) => /collection\.anki21b$/.test(n))) {
      throw new Error(
        "Esse arquivo veio no formato novo e compactado do Anki, que o navegador não abre. "
        + "Exporte de novo marcando a opção de compatibilidade com versões antigas do Anki."
      );
    }
    throw new Error("Não achei a coleção dentro do arquivo.");
  }

  aviso("carregando o leitor de banco");
  const SQL = await carregarSQL();

  aviso("lendo as notas");
  const db = new SQL.Database(zip[banco]);
  let linhas = [];
  try {
    const r = db.exec("SELECT flds, tags FROM notes");
    linhas = r.length ? r[0].values : [];
  } catch (e) {
    db.close();
    throw new Error("Não consegui ler as notas dessa coleção.");
  }

  /* nome do baralho, quando dá para descobrir */
  let nomeBaralho = arquivo.name.replace(/\.apkg$/i, "").slice(0, 40) || "Anki";
  try {
    const d = db.exec("SELECT decks FROM col");
    if (d.length && d[0].values[0] && d[0].values[0][0]) {
      const decks = JSON.parse(d[0].values[0][0]);
      const nomesDecks = Object.values(decks)
        .map((x) => x && x.name)
        .filter((n) => n && n !== "Default");
      if (nomesDecks.length === 1) nomeBaralho = String(nomesDecks[0]).split("::").pop().slice(0, 40);
    }
  } catch (e) { /* segue com o nome do arquivo */ }
  db.close();

  /* mapa dos arquivos de mídia: {"0":"figura.png"} */
  let mapa = {};
  if (zip.media) {
    try { mapa = JSON.parse(strFromU8(zip.media)); } catch (e) { mapa = {}; }
  }

  const cartoes = [];
  const usadas = new Set();
  for (const [flds] of linhas) {
    const campos = String(flds).split("\u001f");
    const a = limparCampo(campos[0]);
    const b = limparCampo(campos.slice(1).join("\n\n"));
    if (!a.texto && a.imagens.length === 0) continue;
    if (!b.texto && b.imagens.length === 0) continue;
    for (const n of a.imagens.concat(b.imagens)) usadas.add(n);
    const c = novoCartao(a.texto || "(imagem)", b.texto || "(imagem)", null, nomeBaralho);
    c.imgFrente = a.imagens;
    c.imgVerso = b.imagens;
    cartoes.push(c);
  }

  /* guarda só as imagens que algum cartão realmente usa */
  const porNome = {};
  for (const [num, nome] of Object.entries(mapa)) porNome[nome] = num;
  let salvas = 0, pesoTotal = 0;
  const alvo = [...usadas];
  for (let i = 0; i < alvo.length; i++) {
    const nome = alvo[i];
    const num = porNome[nome];
    if (num === undefined || !zip[num] || !ehImagem(nome)) continue;
    if (zip[num].length > 4 * 1024 * 1024) continue;      // pula figuras enormes
    try {
      await guardarMidia(nome, paraDataUri(zip[num], nome));
      cacheMidia.delete(nome);
      salvas += 1;
      pesoTotal += zip[num].length;
    } catch (e) { /* segue sem essa imagem */ }
    if (i % 12 === 0) aviso(`guardando imagens ${i + 1} de ${alvo.length}`);
  }

  return { cartoes, baralho: nomeBaralho, imagens: salvas, peso: pesoTotal };
}

/* ── mostra uma imagem guardada no IndexedDB ────────────────────── */
function Figura({ nome, altura = 260 }) {
  const [uri, setUri] = useState(() => cacheMidia.get(nome) || null);

  /* Ao trocar de cartão muda o nome, mas o componente é o mesmo, e com ele
     o estado. O `if (!uri)` de antes fazia o efeito desistir de buscar
     justamente quando já havia uma imagem carregada: o cartão novo ficava
     mostrando a imagem do cartão anterior. Zerar e buscar sempre resolve os
     dois casos. */
  useEffect(() => {
    let vivo = true;
    setUri(cacheMidia.get(nome) || null);
    lerMidia(nome).then((v) => { if (vivo) setUri(v); });
    return () => { vivo = false; };
  }, [nome]);

  if (!uri) {
    /* O nome do arquivo entra no aviso: sem ele não dá para saber se a
       imagem faltou na importação, se veio com outro nome, ou se foi
       importada noutro navegador — o depósito é por aparelho. */
    return (
      <span title={`Não achei "${nome}" no depósito de imagens deste navegador.`}
        style={{
          display: "inline-block", padding: "6px 10px", borderRadius: 4,
          border: `1px dashed ${T.line2}`, color: T.faint, fontSize: 12.5,
        }}>imagem indisponível · {nome}</span>
    );
  }
  return (
    <img src={uri} alt=""
      style={{
        display: "block", maxWidth: "100%", maxHeight: altura, margin: "12px auto",
        borderRadius: 5, border: `1px solid ${T.line}`,
      }} />
  );
}

/* Texto de um lado do cartão, com as imagens no lugar dos marcadores */
function LadoDoCartao({ texto, imagens, tamanho, peso, altura }) {
  const partes = String(texto || "").split(/(\[\[img:[^\]]+\]\])/g);
  const soltas = (imagens || []).filter(
    (n) => String(texto || "").indexOf(`[[img:${n}]]`) < 0
  );
  return (
    <>
      {partes.map((p, i) => {
        const m = p.match(/^\[\[img:([^\]]+)\]\]$/);
        if (m) return <Figura key={i} nome={m[1]} altura={altura} />;
        if (!p.trim()) return null;
        return (
          <span key={i} style={{
            display: "block", fontSize: tamanho, fontWeight: peso,
            lineHeight: 1.5, color: T.ink, whiteSpace: "pre-wrap",
          }}>{p}</span>
        );
      })}
      {soltas.map((n) => <Figura key={n} nome={n} altura={altura} />)}
    </>
  );
}

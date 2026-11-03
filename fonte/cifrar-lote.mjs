/* Cifra um lote de questões autorais para fonte/banco-autoral/.
   node fonte/cifrar-lote.mjs fonte/banco-autoral/chave-publica.pem lote.json fonte/banco-autoral/lote-002.cifra
   O lote.json aberto nunca entra no repositório (ele é público). */
import { readFileSync, writeFileSync } from "node:fs";
import { publicEncrypt, randomBytes, createCipheriv, constants } from "node:crypto";
const [pem, ent, sai] = process.argv.slice(2);
const chave = randomBytes(32), iv = randomBytes(12);
const c = createCipheriv("aes-256-gcm", chave, iv);
const dados = Buffer.concat([c.update(readFileSync(ent)), c.final()]);
writeFileSync(sai, JSON.stringify({
  chave: publicEncrypt({ key: readFileSync(pem, "utf8"), padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" }, chave).toString("base64"),
  iv: iv.toString("base64"), tag: c.getAuthTag().toString("base64"), dados: dados.toString("base64"),
}));
console.log("cifrado", sai);

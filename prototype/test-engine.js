const fs = require("fs"), nodeCrypto = require("crypto"), assert = require("assert");
const src = fs.readFileSync(process.argv[2], "utf8");
const ZE = new Function("TextEncoder", "btoa", "atob", "crypto", src + "\nreturn ZE;")(TextEncoder, btoa, atob, globalThis.crypto);

// SHA-256 against Node
for (const s of ["", "abc", "زيمارا للفوترة", "x".repeat(1000)]) {
  assert.strictEqual(ZE.hex(ZE.sha256(s)), nodeCrypto.createHash("sha256").update(s, "utf8").digest("hex"), "sha256 " + s.length);
}
// First PIH constant
assert.strictEqual(Buffer.from(ZE.FIRST_PIH, "base64").toString(), nodeCrypto.createHash("sha256").update("0").digest("hex"));

// ECDSA: our signature verifies in Node (OpenSSL), and Node's verifies in ours
const k = ZE.keygen();
const pub = nodeCrypto.createPublicKey({ key: Buffer.from(ZE.spki(k.pubX, k.pubY)), format: "der", type: "spki" });
assert.strictEqual(pub.asymmetricKeyDetails.namedCurve, "secp256k1");
const msg = ZE.utf8("invoice-hash-test");
let t0 = Date.now();
const sig = ZE.sign(msg, k.priv);
const signMs = Date.now() - t0;
assert.ok(nodeCrypto.verify("sha256", Buffer.from(msg), pub, Buffer.from(sig)), "node verifies our sig");
assert.ok(ZE.verify(msg, sig, k.pubX, k.pubY), "we verify our sig");
assert.ok(!ZE.verify(ZE.utf8("tampered"), sig, k.pubX, k.pubY), "tamper detected");
const priv = nodeCrypto.createPrivateKey({ key: { kty: "EC", crv: "secp256k1", d: Buffer.from(k.priv, "hex").toString("base64url"), x: Buffer.from(k.pubX, "hex").toString("base64url"), y: Buffer.from(k.pubY, "hex").toString("base64url") }, format: "jwk" });
const nsig = nodeCrypto.sign("sha256", Buffer.from(msg), priv);
assert.ok(ZE.verify(msg, new Uint8Array(nsig), k.pubX, k.pubY), "we verify node sig");

// Totals
const tt = ZE.totals([{ qty: 3, price: 33.33, discount: 0, cat: "S" }, { qty: 1, price: 100, discount: 10, cat: "E", reason: "VATEX-SA-29" }]);
assert.strictEqual(tt.net, 189.99); assert.strictEqual(tt.vat, 15); assert.strictEqual(tt.gross, 204.99);

// XML: strip(full) === hashXml
const company = { nameAr: "شركة زيمارا & شركاه", vat: "300000000000003", cr: "1010101010", street: "طريق الملك فهد", building: "1234", postal: "12345", city: "الرياض", district: "العليا" };
const customer = { name: "مؤسسة النور", vat: "311111111111113", street: "شارع التحلية", building: "4321", postal: "54321", city: "جدة", district: "الروضة" };
const doc = { number: "INV-000001", uuid: "8e6000cf-1a98-4174-b3e7-b5d5954bc10d", issueDate: "2026-11-06", issueTime: "10:00:00", kind: "standard", docType: "invoice", icv: 1, pih: ZE.FIRST_PIH, supplyDate: "2026-11-06", payMeans: "30", lines: [{ name: "استشارة <تقنية>", qty: 5, price: 400, discount: 0, cat: "S" }] };
doc.totals = ZE.totals(doc.lines);
const hx = ZE.buildHashXml(doc, company, customer, null);
const hash = ZE.invoiceHash(hx);
const s2 = ZE.sign(ZE.unb64(hash), k.priv);
const q = ZE.qr({ sellerName: company.nameAr, vat: company.vat, timestamp: "2026-11-06T10:00:00", total: "2300.00", vatTotal: "300.00", hash: hash, signature: ZE.b64(s2), publicKey: ZE.spki(k.pubX, k.pubY), certSignature: s2 });
const full = ZE.insertSignatureParts(hx, { hash: hash, signature: ZE.b64(s2), cert: "TUlJ", qr: q });
assert.strictEqual(ZE.stripForHash(full), hx, "strip restores hash xml");
assert.ok(full.includes("<ext:UBLExtensions>") && full.includes("<cbc:ID>QR</cbc:ID>") && full.includes("<cac:Signature>"));
assert.ok(hx.includes("&amp;") && hx.includes("&lt;تقنية&gt;"));
// QR round trip
const pq = ZE.parseQr(q);
assert.strictEqual(Buffer.from(pq[1]).toString(), company.nameAr);
assert.strictEqual(Buffer.from(pq[6]).toString(), hash);
assert.strictEqual(pq[8].length, 88);
// XML well-formed check via simple parse of tags balance
const open = (full.match(/<[A-Za-z][\w:.-]*(\s+[\w:.-]+="[^"]*")*\s*>/g) || []).length, close = (full.match(/<\/[^>]+>/g) || []).length;
assert.strictEqual(open, close, "tag balance");

// Validation
assert.strictEqual(ZE.validateCompany(company).length, 0);
assert.ok(ZE.validateCompany({ vat: "123" }).some(e => e.code === "BR-KSA-39"));
const d2 = { kind: "standard", docType: "invoice", supplyDate: "2026-11-06", lines: [{ name: "x", qty: 1, price: 10, cat: "Z" }] };
assert.ok(ZE.validateDraft(d2, company, customer).some(e => e.code === "BR-KSA-69"));
assert.ok(ZE.validateDraft({ kind: "simplified", docType: "credit", lines: [{ name: "x", qty: 1, price: 1, cat: "S" }] }, company, null, null).some(e => e.code === "BR-KSA-56"));
assert.strictEqual(ZE.validateDraft({ kind: "simplified", docType: "invoice", lines: [{ name: "x", qty: 1, price: 1, cat: "S" }] }, company, null).filter(e => e.level === "error").length, 0);
fs.writeFileSync("sample.xml", full);
console.log("engine OK; sign took " + signMs + "ms; xml bytes " + full.length);

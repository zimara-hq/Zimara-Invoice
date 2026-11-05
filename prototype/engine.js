/* ===== Zimara ZATCA engine: SHA-256, secp256k1 ECDSA, TLV QR, UBL 2.1 XML, validation ===== */
var ZE = (function () {
  var enc = new TextEncoder();
  function utf8(s) { return enc.encode(s); }
  function concat(arrs) {
    var n = 0; arrs.forEach(function (a) { n += a.length; });
    var out = new Uint8Array(n), o = 0;
    arrs.forEach(function (a) { out.set(a, o); o += a.length; });
    return out;
  }
  function b64(bytes) {
    var s = ""; for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
  }
  function unb64(str) {
    var s = atob(str), out = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }
  function hex(bytes) { return Array.prototype.map.call(bytes, function (b) { return b.toString(16).padStart(2, "0"); }).join(""); }
  function unhex(h) { var out = new Uint8Array(h.length / 2); for (var i = 0; i < out.length; i++) out[i] = parseInt(h.substr(i * 2, 2), 16); return out; }

  /* --- SHA-256 --- */
  var K = new Uint32Array([0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
  function sha256(msg) {
    if (typeof msg === "string") msg = utf8(msg);
    var l = msg.length, nBlocks = ((l + 9 + 63) >> 6);
    var buf = new Uint8Array(nBlocks * 64); buf.set(msg); buf[l] = 0x80;
    var bits = l * 8, dv = new DataView(buf.buffer);
    dv.setUint32(buf.length - 4, bits >>> 0); dv.setUint32(buf.length - 8, Math.floor(bits / 4294967296));
    var H = new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);
    var W = new Uint32Array(64);
    for (var b = 0; b < nBlocks; b++) {
      for (var t = 0; t < 16; t++) W[t] = dv.getUint32(b * 64 + t * 4);
      for (t = 16; t < 64; t++) {
        var x = W[t - 15], y = W[t - 2];
        var s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
        var s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
        W[t] = (W[t - 16] + s0 + W[t - 7] + s1) >>> 0;
      }
      var a = H[0], c1 = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (t = 0; t < 64; t++) {
        var S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
        var ch = (e & f) ^ (~e & g);
        var t1 = (h + S1 + ch + K[t] + W[t]) >>> 0;
        var S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
        var mj = (a & c1) ^ (a & c) ^ (c1 & c);
        var t2 = (S0 + mj) >>> 0;
        h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = c1; c1 = a; a = (t1 + t2) >>> 0;
      }
      H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + c1) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
      H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
    }
    var out = new Uint8Array(32), odv = new DataView(out.buffer);
    for (var i = 0; i < 8; i++) odv.setUint32(i * 4, H[i]);
    return out;
  }

  /* --- secp256k1 ECDSA --- */
  var P = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2Fn;
  var N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n;
  var G = { x: 0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798n, y: 0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8n };
  function mod(a, m) { var r = a % m; return r >= 0n ? r : r + m; }
  function inv(a, m) {
    var lm = 1n, hm = 0n, low = mod(a, m), high = m;
    while (low > 1n) { var r = high / low; var nm = hm - lm * r, nw = high - low * r; hm = lm; lm = nm; high = low; low = nw; }
    return mod(lm, m);
  }
  function add(p, q) {
    if (!p) return q; if (!q) return p;
    var l;
    if (p.x === q.x) {
      if (mod(p.y + q.y, P) === 0n) return null;
      l = mod(3n * p.x * p.x * inv(2n * p.y, P), P);
    } else {
      l = mod((q.y - p.y) * inv(q.x - p.x, P), P);
    }
    var x = mod(l * l - p.x - q.x, P);
    return { x: x, y: mod(l * (p.x - x) - p.y, P) };
  }
  function mul(k, pt) {
    var r = null, a = pt;
    while (k > 0n) { if (k & 1n) r = add(r, a); a = add(a, a); k >>= 1n; }
    return r;
  }
  function toBig(bytes) { return bytes.length ? BigInt("0x" + hex(bytes)) : 0n; }
  function to32(n) { return unhex(n.toString(16).padStart(64, "0")); }
  function randScalar() {
    for (;;) {
      var b = new Uint8Array(32); crypto.getRandomValues(b);
      var k = toBig(b); if (k > 0n && k < N) return k;
    }
  }
  function keygen() {
    var d = randScalar(), Q = mul(d, G);
    return { priv: hex(to32(d)), pubX: hex(to32(Q.x)), pubY: hex(to32(Q.y)) };
  }
  /* ECDSA with SHA-256 over msg (bytes) */
  function sign(msg, privHex) {
    var d = BigInt("0x" + privHex), z = toBig(sha256(msg));
    for (;;) {
      var k = randScalar(), R = mul(k, G), r = mod(R.x, N);
      if (r === 0n) continue;
      var s = mod(inv(k, N) * (z + r * d), N);
      if (s === 0n) continue;
      if (s > N / 2n) s = N - s;
      return derSig(r, s);
    }
  }
  function verify(msg, sigDer, pubX, pubY) {
    var rs = parseDerSig(sigDer); if (!rs) return false;
    var r = rs[0], s = rs[1];
    if (r <= 0n || r >= N || s <= 0n || s >= N) return false;
    var z = toBig(sha256(msg)), w = inv(s, N);
    var X = add(mul(mod(z * w, N), G), mul(mod(r * w, N), { x: BigInt("0x" + pubX), y: BigInt("0x" + pubY) }));
    return !!X && mod(X.x, N) === r;
  }
  function derInt(n) {
    var b = unhex(n.toString(16).padStart(64, "0")), i = 0;
    while (i < b.length - 1 && b[i] === 0) i++;
    b = b.slice(i);
    if (b[0] & 0x80) b = concat([new Uint8Array([0]), b]);
    return concat([new Uint8Array([0x02, b.length]), b]);
  }
  function derSig(r, s) {
    var body = concat([derInt(r), derInt(s)]);
    return concat([new Uint8Array([0x30, body.length]), body]);
  }
  function parseDerSig(b) {
    if (b[0] !== 0x30) return null;
    var i = 2; if (b[i] !== 0x02) return null;
    var lr = b[i + 1], r = toBig(b.slice(i + 2, i + 2 + lr)); i = i + 2 + lr;
    if (b[i] !== 0x02) return null;
    var ls = b[i + 1], s = toBig(b.slice(i + 2, i + 2 + ls));
    return [r, s];
  }
  function spki(pubX, pubY) {
    return concat([unhex("3056301006072a8648ce3d020106052b8104000a034200"), new Uint8Array([4]), unhex(pubX), unhex(pubY)]);
  }

  /* --- TLV QR (ZATCA tags 1-9) --- */
  function tlv(tag, value) {
    var v = typeof value === "string" ? utf8(value) : value;
    var len = v.length;
    var lenBytes = len < 128 ? new Uint8Array([len]) : (len < 256 ? new Uint8Array([0x81, len]) : new Uint8Array([0x82, len >> 8, len & 255]));
    return concat([new Uint8Array([tag]), lenBytes, v]);
  }
  function qr(fields) {
    var parts = [
      tlv(1, fields.sellerName), tlv(2, fields.vat), tlv(3, fields.timestamp),
      tlv(4, fields.total), tlv(5, fields.vatTotal), tlv(6, fields.hash),
      tlv(7, fields.signature), tlv(8, fields.publicKey)
    ];
    if (fields.certSignature) parts.push(tlv(9, fields.certSignature));
    return b64(concat(parts));
  }
  function parseQr(base64) {
    var b = unb64(base64), i = 0, out = {};
    while (i < b.length) {
      var tag = b[i], len = b[i + 1], off = 2;
      if (len === 0x81) { len = b[i + 2]; off = 3; } else if (len === 0x82) { len = (b[i + 2] << 8) | b[i + 3]; off = 4; }
      out[tag] = b.slice(i + off, i + off + len); i += off + len;
    }
    return out;
  }

  /* --- money and tax maths --- */
  function r2(n) { return Math.round((Number(n) + Number.EPSILON) * 100) / 100; }
  function f2(n) { return r2(n).toFixed(2); }
  var RATES = { S: 0.15, Z: 0, E: 0, O: 0 };
  function totals(lines) {
    var subs = {}, lineExt = 0, out = [];
    (lines || []).forEach(function (ln) {
      var net = r2(Number(ln.qty || 0) * Number(ln.price || 0) - Number(ln.discount || 0));
      var cat = ln.cat || "S", rate = RATES[cat] == null ? 0.15 : RATES[cat];
      var vat = r2(net * rate);
      lineExt = r2(lineExt + net);
      var key = cat + "|" + (cat === "S" ? "" : (ln.reason || ""));
      if (!subs[key]) subs[key] = { cat: cat, rate: rate, reason: cat === "S" ? "" : (ln.reason || ""), taxable: 0, tax: 0 };
      subs[key].taxable = r2(subs[key].taxable + net);
      out.push({ net: net, vat: vat, gross: r2(net + vat), rate: rate, cat: cat });
    });
    var vatTotal = 0;
    Object.keys(subs).forEach(function (k) { subs[k].tax = r2(subs[k].taxable * subs[k].rate); vatTotal = r2(vatTotal + subs[k].tax); });
    return { lines: out, subtotals: Object.keys(subs).map(function (k) { return subs[k]; }), net: lineExt, vat: vatTotal, gross: r2(lineExt + vatTotal) };
  }

  /* --- reference data --- */
  var EXEMPTIONS = {
    "VATEX-SA-29": "الخدمات المالية",
    "VATEX-SA-30": "العقارات السكنية",
    "VATEX-SA-32": "تصدير السلع",
    "VATEX-SA-33": "تصدير الخدمات",
    "VATEX-SA-34-1": "النقل الدولي للسلع",
    "VATEX-SA-34-2": "النقل الدولي للركاب",
    "VATEX-SA-35": "الأدوية والمعدات الطبية",
    "VATEX-SA-36": "المعادن المؤهلة",
    "VATEX-SA-EDU": "التعليم الخاص للمواطنين",
    "VATEX-SA-HEA": "الرعاية الصحية الخاصة للمواطنين",
    "VATEX-SA-OOS": "خارج نطاق الضريبة"
  };
  var CAT_NAMES = { S: "خاضع 15%", Z: "نسبة صفرية", E: "معفى", O: "خارج النطاق" };
  var DOC = {
    invoice: { code: "388", ar: "فاتورة", en: "Invoice" },
    credit: { code: "381", ar: "إشعار دائن", en: "Credit Note" },
    debit: { code: "383", ar: "إشعار مدين", en: "Debit Note" }
  };
  /* first PIH defined by ZATCA: base64 of SHA-256("0") hex */
  var FIRST_PIH = "NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjNzljMmRiYzIzOWRkNGU5MWI0NjcyOWQ3M2EyN2ZiNTdlOQ==";

  /* --- validation --- */
  var reVat = /^3\d{13}3$/, reBld = /^\d{4}$/, rePost = /^\d{5}$/, reCr = /^\d{10}$/;
  function validateCompany(c) {
    var e = [];
    function req(v, code, msg) { if (!v || !String(v).trim()) e.push({ level: "error", code: code, msg: msg }); }
    c = c || {};
    req(c.nameAr, "BR-KSA-CO-1", "اسم المنشأة بالعربي مطلوب");
    if (!reVat.test(c.vat || "")) e.push({ level: "error", code: "BR-KSA-39", msg: "الرقم الضريبي لازم يكون 15 رقم، يبدأ بـ 3 وينتهي بـ 3" });
    if (!reCr.test(c.cr || "")) e.push({ level: "error", code: "BR-KSA-08", msg: "رقم السجل التجاري لازم يكون 10 أرقام" });
    req(c.street, "BR-KSA-09", "اسم الشارع مطلوب");
    if (!reBld.test(c.building || "")) e.push({ level: "error", code: "BR-KSA-37", msg: "رقم المبنى لازم يكون 4 أرقام" });
    if (!rePost.test(c.postal || "")) e.push({ level: "error", code: "BR-KSA-66", msg: "الرمز البريدي لازم يكون 5 أرقام" });
    req(c.city, "BR-KSA-09", "المدينة مطلوبة");
    req(c.district, "BR-KSA-09", "الحي مطلوب");
    return e;
  }
  function validateDraft(d, company, customer, original) {
    var e = [];
    function err(code, msg) { e.push({ level: "error", code: code, msg: msg }); }
    function warn(code, msg) { e.push({ level: "warning", code: code, msg: msg }); }
    if (validateCompany(company).length) err("SELLER", "بيانات منشأتك ناقصة. كمّلها من صفحة المنشأة");
    var std = d.kind === "standard";
    if (std) {
      if (!customer) err("BR-KSA-42", "الفاتورة الضريبية (B2B) تحتاج عميل");
      else {
        if (!customer.name) err("BR-KSA-42", "اسم المشتري مطلوب في الفاتورة الضريبية");
        if (customer.vat && !reVat.test(customer.vat)) err("BR-KSA-44", "الرقم الضريبي للمشتري غير صحيح (15 رقم يبدأ وينتهي بـ 3)");
        if (!customer.vat && !customer.otherId) warn("BR-KSA-14", "المشتري بدون رقم ضريبي ولا سجل تجاري. الفاتورة تنقبل مع تحذير، والأفضل تحدّث بياناته");
        if (!customer.street || !customer.city || !customer.district) err("BR-KSA-63", "عنوان المشتري (الشارع، الحي، المدينة) مطلوب في الفاتورة الضريبية");
        if (customer.building && !reBld.test(customer.building)) err("BR-KSA-37", "رقم مبنى المشتري لازم يكون 4 أرقام");
        if (customer.postal && !rePost.test(customer.postal)) err("BR-KSA-67", "الرمز البريدي للمشتري لازم يكون 5 أرقام");
        if (!customer.building || !customer.postal) err("BR-KSA-63", "رقم المبنى والرمز البريدي للمشتري مطلوبين");
      }
      if (!d.supplyDate) err("BR-KSA-15", "تاريخ التوريد مطلوب في الفاتورة الضريبية");
    }
    if (!d.lines || !d.lines.length) err("BR-16", "أضف بند واحد على الأقل");
    (d.lines || []).forEach(function (ln, i) {
      var n = "البند " + (i + 1) + ": ";
      if (!ln.name || !String(ln.name).trim()) err("BR-25", n + "اسم الصنف مطلوب");
      if (!(Number(ln.qty) > 0)) err("BR-KSA-F-04", n + "الكمية لازم تكون أكبر من صفر");
      if (!(Number(ln.price) >= 0) || ln.price === "") err("BR-27", n + "السعر لازم يكون صفر أو أكثر");
      if (Number(ln.discount || 0) < 0) err("BR-41", n + "الخصم ما يكون سالب");
      if (Number(ln.discount || 0) > Number(ln.qty || 0) * Number(ln.price || 0)) err("BR-41", n + "الخصم أكبر من قيمة البند");
      if (ln.cat && ln.cat !== "S" && !ln.reason) err("BR-KSA-69", n + "البند غير الخاضع لـ 15% يحتاج سبب إعفاء");
      if (String(ln.price).split(".")[1] && String(ln.price).split(".")[1].length > 2) warn("BR-DEC-01", n + "السعر فيه أكثر من خانتين عشريتين، بيتقرب");
    });
    if (d.docType !== "invoice") {
      if (!original) err("BR-KSA-56", "الإشعار لازم يشير للفاتورة الأصلية (المادة 54 من اللائحة)");
      if (!d.reason || !String(d.reason).trim()) err("BR-KSA-17", "سبب إصدار الإشعار مطلوب");
      if (original && d.docType === "credit") {
        var t = totals(d.lines).gross;
        if (t > Number(original.totals.gross) + 0.001) warn("BR-CN-01", "مبلغ الإشعار الدائن أكبر من الفاتورة الأصلية");
      }
    }
    var tt = totals(d.lines);
    if (tt.gross < 0) err("BR-CO-25", "إجمالي المستند ما يكون سالب");
    if (d.kind === "simplified" && tt.gross >= 1000 && !customer) warn("BR-KSA-25", "مبلغ كبير بدون اسم عميل. يُفضّل تسجيل اسم المشتري");
    return e;
  }

  /* --- UBL 2.1 XML --- */
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function party(tag, p, isSeller) {
    var x = [];
    x.push("  <cac:" + tag + ">", "    <cac:Party>");
    if (isSeller) x.push('      <cac:PartyIdentification><cbc:ID schemeID="CRN">' + esc(p.cr) + "</cbc:ID></cac:PartyIdentification>");
    else if (p && p.otherId) x.push('      <cac:PartyIdentification><cbc:ID schemeID="CRN">' + esc(p.otherId) + "</cbc:ID></cac:PartyIdentification>");
    if (p && (p.street || p.city)) {
      x.push("      <cac:PostalAddress>");
      if (p.street) x.push("        <cbc:StreetName>" + esc(p.street) + "</cbc:StreetName>");
      if (p.building) x.push("        <cbc:BuildingNumber>" + esc(p.building) + "</cbc:BuildingNumber>");
      if (p.district) x.push("        <cbc:CitySubdivisionName>" + esc(p.district) + "</cbc:CitySubdivisionName>");
      if (p.city) x.push("        <cbc:CityName>" + esc(p.city) + "</cbc:CityName>");
      if (p.postal) x.push("        <cbc:PostalZone>" + esc(p.postal) + "</cbc:PostalZone>");
      x.push("        <cac:Country><cbc:IdentificationCode>SA</cbc:IdentificationCode></cac:Country>", "      </cac:PostalAddress>");
    }
    if (p && p.vat) x.push("      <cac:PartyTaxScheme><cbc:CompanyID>" + esc(p.vat) + "</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>");
    else if (!isSeller) x.push("      <cac:PartyTaxScheme><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>");
    var nm = isSeller ? p.nameAr : (p && p.name);
    if (nm) x.push("      <cac:PartyLegalEntity><cbc:RegistrationName>" + esc(nm) + "</cbc:RegistrationName></cac:PartyLegalEntity>");
    x.push("    </cac:Party>", "  </cac:" + tag + ">");
    return x.join("\n");
  }
  function cat(c, rate, reason) {
    var x = "<cbc:ID>" + c + "</cbc:ID><cbc:Percent>" + (rate * 100).toFixed(2) + "</cbc:Percent>";
    if (c !== "S" && reason) x += "<cbc:TaxExemptionReasonCode>" + esc(reason) + "</cbc:TaxExemptionReasonCode><cbc:TaxExemptionReason>" + esc(EXEMPTIONS[reason] || reason) + "</cbc:TaxExemptionReason>";
    return x + "<cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>";
  }
  /* Build the hashable document (no UBLExtensions, QR reference or Signature). */
  function buildHashXml(doc, company, customer, original) {
    var t = doc.totals, cur = ' currencyID="SAR"';
    var x = [];
    x.push('<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2">');
    x.push("  <cbc:ProfileID>reporting:1.0</cbc:ProfileID>");
    x.push("  <cbc:ID>" + esc(doc.number) + "</cbc:ID>");
    x.push("  <cbc:UUID>" + doc.uuid + "</cbc:UUID>");
    x.push("  <cbc:IssueDate>" + doc.issueDate + "</cbc:IssueDate>");
    x.push("  <cbc:IssueTime>" + doc.issueTime + "</cbc:IssueTime>");
    x.push('  <cbc:InvoiceTypeCode name="' + (doc.kind === "standard" ? "0100000" : "0200000") + '">' + DOC[doc.docType].code + "</cbc:InvoiceTypeCode>");
    if (doc.notes) x.push('  <cbc:Note languageID="ar">' + esc(doc.notes) + "</cbc:Note>");
    x.push("  <cbc:DocumentCurrencyCode>SAR</cbc:DocumentCurrencyCode>");
    x.push("  <cbc:TaxCurrencyCode>SAR</cbc:TaxCurrencyCode>");
    if (original) x.push("  <cac:BillingReference><cac:InvoiceDocumentReference><cbc:ID>" + esc(original.number) + "</cbc:ID></cac:InvoiceDocumentReference></cac:BillingReference>");
    x.push("  <cac:AdditionalDocumentReference><cbc:ID>ICV</cbc:ID><cbc:UUID>" + doc.icv + "</cbc:UUID></cac:AdditionalDocumentReference>");
    x.push('  <cac:AdditionalDocumentReference><cbc:ID>PIH</cbc:ID><cac:Attachment><cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">' + doc.pih + "</cbc:EmbeddedDocumentBinaryObject></cac:Attachment></cac:AdditionalDocumentReference>");
    x.push(party("AccountingSupplierParty", company, true));
    x.push(party("AccountingCustomerParty", customer, false));
    if (doc.supplyDate) x.push("  <cac:Delivery><cbc:ActualDeliveryDate>" + doc.supplyDate + "</cbc:ActualDeliveryDate></cac:Delivery>");
    x.push("  <cac:PaymentMeans><cbc:PaymentMeansCode>" + esc(doc.payMeans || "10") + "</cbc:PaymentMeansCode>" + (doc.reason ? "<cbc:InstructionNote>" + esc(doc.reason) + "</cbc:InstructionNote>" : "") + "</cac:PaymentMeans>");
    x.push("  <cac:TaxTotal><cbc:TaxAmount" + cur + ">" + f2(t.vat) + "</cbc:TaxAmount></cac:TaxTotal>");
    x.push("  <cac:TaxTotal>", "    <cbc:TaxAmount" + cur + ">" + f2(t.vat) + "</cbc:TaxAmount>");
    t.subtotals.forEach(function (s) {
      x.push("    <cac:TaxSubtotal><cbc:TaxableAmount" + cur + ">" + f2(s.taxable) + "</cbc:TaxableAmount><cbc:TaxAmount" + cur + ">" + f2(s.tax) + "</cbc:TaxAmount><cac:TaxCategory>" + cat(s.cat, s.rate, s.reason) + "</cac:TaxCategory></cac:TaxSubtotal>");
    });
    x.push("  </cac:TaxTotal>");
    x.push("  <cac:LegalMonetaryTotal><cbc:LineExtensionAmount" + cur + ">" + f2(t.net) + "</cbc:LineExtensionAmount><cbc:TaxExclusiveAmount" + cur + ">" + f2(t.net) + "</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount" + cur + ">" + f2(t.gross) + "</cbc:TaxInclusiveAmount><cbc:AllowanceTotalAmount" + cur + ">0.00</cbc:AllowanceTotalAmount><cbc:PrepaidAmount" + cur + ">0.00</cbc:PrepaidAmount><cbc:PayableAmount" + cur + ">" + f2(t.gross) + "</cbc:PayableAmount></cac:LegalMonetaryTotal>");
    doc.lines.forEach(function (ln, i) {
      var lt = t.lines[i];
      x.push("  <cac:InvoiceLine>");
      x.push("    <cbc:ID>" + (i + 1) + "</cbc:ID>");
      x.push('    <cbc:InvoicedQuantity unitCode="' + esc(ln.unit || "PCE") + '">' + Number(ln.qty).toFixed(6) + "</cbc:InvoicedQuantity>");
      x.push("    <cbc:LineExtensionAmount" + cur + ">" + f2(lt.net) + "</cbc:LineExtensionAmount>");
      if (Number(ln.discount || 0) > 0) x.push("    <cac:AllowanceCharge><cbc:ChargeIndicator>false</cbc:ChargeIndicator><cbc:AllowanceChargeReason>discount</cbc:AllowanceChargeReason><cbc:Amount" + cur + ">" + f2(ln.discount) + "</cbc:Amount></cac:AllowanceCharge>");
      x.push("    <cac:TaxTotal><cbc:TaxAmount" + cur + ">" + f2(lt.vat) + "</cbc:TaxAmount><cbc:RoundingAmount" + cur + ">" + f2(lt.gross) + "</cbc:RoundingAmount></cac:TaxTotal>");
      x.push("    <cac:Item><cbc:Name>" + esc(ln.name) + "</cbc:Name><cac:ClassifiedTaxCategory>" + cat(lt.cat, lt.rate, null) + "</cac:ClassifiedTaxCategory></cac:Item>");
      x.push("    <cac:Price><cbc:PriceAmount" + cur + ">" + f2(ln.price) + "</cbc:PriceAmount></cac:Price>");
      x.push("  </cac:InvoiceLine>");
    });
    x.push("</Invoice>");
    return x.join("\n");
  }
  function insertSignatureParts(hashXml, parts) {
    var ext = [
      "  <ext:UBLExtensions>",
      "    <ext:UBLExtension>",
      "      <ext:ExtensionURI>urn:oasis:names:specification:ubl:dsig:enveloped:xades</ext:ExtensionURI>",
      "      <ext:ExtensionContent>",
      '        <ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#" Id="signature">',
      "          <ds:SignedInfo><ds:SignatureMethod Algorithm=\"http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256\"></ds:SignatureMethod><ds:Reference Id=\"invoiceSignedData\" URI=\"\"><ds:DigestMethod Algorithm=\"http://www.w3.org/2001/04/xmlenc#sha256\"></ds:DigestMethod><ds:DigestValue>" + parts.hash + "</ds:DigestValue></ds:Reference></ds:SignedInfo>",
      "          <ds:SignatureValue>" + parts.signature + "</ds:SignatureValue>",
      "          <ds:KeyInfo><ds:X509Data><ds:X509Certificate>" + parts.cert + "</ds:X509Certificate></ds:X509Data></ds:KeyInfo>",
      "        </ds:Signature>",
      "      </ext:ExtensionContent>",
      "    </ext:UBLExtension>",
      "  </ext:UBLExtensions>"
    ].join("\n");
    var qrRef = '  <cac:AdditionalDocumentReference><cbc:ID>QR</cbc:ID><cac:Attachment><cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">' + parts.qr + "</cbc:EmbeddedDocumentBinaryObject></cac:Attachment></cac:AdditionalDocumentReference>";
    var sig = "  <cac:Signature><cbc:ID>urn:oasis:names:specification:ubl:signature:Invoice</cbc:ID><cbc:SignatureMethod>urn:oasis:names:specification:ubl:dsig:enveloped:xades</cbc:SignatureMethod></cac:Signature>";
    var lines = hashXml.split("\n");
    var out = [lines[0], ext];
    for (var i = 1; i < lines.length; i++) {
      out.push(lines[i]);
      if (lines[i].indexOf("<cbc:ID>PIH</cbc:ID>") > -1) { out.push(qrRef); out.push(sig); }
    }
    return out.join("\n");
  }
  /* The transform ZATCA applies before hashing: drop the three excluded parts. */
  function stripForHash(xml) {
    return xml
      .replace(/\n\s*<ext:UBLExtensions>[\s\S]*?<\/ext:UBLExtensions>/, "")
      .replace(/\n\s*<cac:AdditionalDocumentReference><cbc:ID>QR<\/cbc:ID>[\s\S]*?<\/cac:AdditionalDocumentReference>/, "")
      .replace(/\n\s*<cac:Signature>[\s\S]*?<\/cac:Signature>/, "");
  }
  function invoiceHash(hashXml) { return b64(sha256(hashXml)); }

  return {
    utf8: utf8, b64: b64, unb64: unb64, hex: hex, unhex: unhex, sha256: sha256,
    keygen: keygen, sign: sign, verify: verify, spki: spki, qr: qr, parseQr: parseQr,
    r2: r2, f2: f2, totals: totals, EXEMPTIONS: EXEMPTIONS, CAT_NAMES: CAT_NAMES, DOC: DOC, FIRST_PIH: FIRST_PIH,
    validateCompany: validateCompany, validateDraft: validateDraft,
    buildHashXml: buildHashXml, insertSignatureParts: insertSignatureParts, stripForHash: stripForHash, invoiceHash: invoiceHash
  };
})();

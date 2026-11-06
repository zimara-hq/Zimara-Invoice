/* ===================== Zimara app ===================== */
(function () {
"use strict";
var S = { docs: {}, mode: "loading", col: null, note: "", draft: null, ui: { q: "", ftype: "all", fstat: "all", period: "quarter" }, chat: [], chatBusy: false, pendingDraft: null, sample: null, dl: null, onboarding: null, chainResult: null };
var LS_KEY = "zimara.v1";
var $ = function (s, r) { return (r || document).querySelector(s); };
function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }
function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
function uuid() { if (crypto.randomUUID) return crypto.randomUUID(); var b = new Uint8Array(16); crypto.getRandomValues(b); b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128; var h = ZE.hex(b); return h.slice(0, 8) + "-" + h.slice(8, 12) + "-" + h.slice(12, 16) + "-" + h.slice(16, 20) + "-" + h.slice(20); }
function rid() { return uuid().split("-")[0] + uuid().split("-")[1]; }
function pad(n, w) { return String(n).padStart(w, "0"); }
function money(n) { return Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function sar(n) { return '<span class="num">' + money(n) + "</span> ر.س"; }
function riyadhNow() {
  var p = {}; new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).formatToParts(new Date()).forEach(function (x) { p[x.type] = x.value; });
  var hh = p.hour === "24" ? "00" : p.hour;
  return { date: p.year + "-" + p.month + "-" + p.day, time: hh + ":" + p.minute + ":" + p.second, ym: p.year + "-" + p.month, year: p.year };
}
function fmtDate(iso) { if (!iso) return "—"; var d = new Date(iso); return d.toLocaleDateString("ar-SA-u-nu-latn-ca-gregory", { year: "numeric", month: "short", day: "numeric" }); }
function fmtDT(iso) { if (!iso) return "—"; var d = new Date(iso); return d.toLocaleString("ar-SA-u-nu-latn-ca-gregory", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Riyadh" }); }
function toast(msg, kind) { var t = document.createElement("div"); t.className = "toast" + (kind ? " " + kind : ""); t.textContent = msg; $("#toast").appendChild(t); setTimeout(function () { t.remove(); }, 3800); }

/* ---------- store ---------- */
var chains = {};
function persist(id) {
  chains[id] = (chains[id] || Promise.resolve()).then(function () {
    var data = S.docs[id];
    if (S.mode === "db") return data === undefined ? S.col.doc(id).delete() : S.col.doc(id).set(data);
    saveLocal();
  }).catch(function (e) {
    var c = e && e.code;
    toast(c === "quota_exceeded" ? "امتلأت مساحة التخزين. احذف بيانات التجربة أو تواصل معنا" : "ما قدرت أحفظ التغيير. تأكد من الاتصال وحاول مرة ثانية", "bad");
  });
  return chains[id];
}
function put(id, data) { S.docs[id] = data; return persist(id); }
function del(id) { delete S.docs[id]; return persist(id); }
function saveLocal() { try { localStorage.setItem(LS_KEY, JSON.stringify(S.docs)); } catch (e) { /* storage unavailable */ } }
function loadLocal() { try { var v = localStorage.getItem(LS_KEY); return v ? JSON.parse(v) : {}; } catch (e) { return {}; } }
function useLocal(note) { S.mode = "local"; S.docs = loadLocal(); if (note) S.note = note; afterData(); }
function company() { return S.docs.company || null; }
function egs() { return S.docs.egs || null; }
function list(prefix) { return Object.keys(S.docs).filter(function (k) { return k.indexOf(prefix) === 0; }).map(function (k) { var o = S.docs[k]; return Object.assign({ id: k }, o); }); }
function customers() { return list("c_").sort(function (a, b) { return String(a.name).localeCompare(String(b.name), "ar"); }); }
function products() { return list("p_").sort(function (a, b) { return String(a.name).localeCompare(String(b.name), "ar"); }); }
function documents() { return list("d_").sort(function (a, b) { return b.icv - a.icv; }); }
function auditEntries() { var all = []; list("audit_").forEach(function (a) { (a.entries || []).forEach(function (e) { all.push(e); }); }); return all.sort(function (a, b) { return a.t < b.t ? 1 : -1; }); }
function audit(action, detail) {
  var k = "audit_" + riyadhNow().ym, cur = clone(S.docs[k]) || { entries: [] };
  cur.entries.push({ t: new Date().toISOString(), a: action, d: detail });
  return put(k, cur);
}

/* ---------- derived numbers ---------- */
function balanceOf(d) {
  if (d.docType !== "invoice") return 0;
  var paid = (d.payments || []).reduce(function (s, p) { return s + Number(p.amount); }, 0);
  var adj = documents().filter(function (x) { return x.refId === d.id; }).reduce(function (s, x) { return s + (x.docType === "credit" ? -x.totals.gross : x.totals.gross); }, 0);
  return ZE.r2(d.totals.gross + adj - paid);
}
function payState(d) {
  if (d.docType !== "invoice") return null;
  var b = balanceOf(d);
  if (b <= 0.004) return { k: "ok", t: "مدفوعة" };
  if ((d.payments || []).length) return { k: "warn", t: "مدفوعة جزئياً" };
  if (d.dueDate && d.dueDate < riyadhNow().date) return { k: "bad", t: "متأخرة" };
  return { k: "plain", t: "غير مدفوعة" };
}
function zatcaPill(d) {
  var s = d.zatca && d.zatca.status;
  if (s === "cleared") return '<span class="pill ok">معتمدة</span>';
  if (s === "reported") return '<span class="pill ok">تمت المشاركة</span>';
  if (s === "pending") return '<span class="pill warn">بانتظار المشاركة</span>';
  return '<span class="pill bad">مرفوضة</span>';
}
function docLabel(d) { var t = ZE.DOC[d.docType].ar; if (d.docType === "invoice") t = d.kind === "standard" ? "فاتورة ضريبية" : "فاتورة مبسطة"; return t; }
function inPeriod(iso, period) {
  var n = riyadhNow(), y = Number(n.year), m = Number(n.ym.slice(5));
  var dy = Number(iso.slice(0, 4)), dm = Number(iso.slice(5, 7));
  if (period === "month") return dy === y && dm === m;
  if (period === "year") return dy === y;
  return dy === y && Math.ceil(dm / 3) === Math.ceil(m / 3);
}
function vatSummary(period) {
  var rows = { S: { base: 0, vat: 0 }, Z: { base: 0, vat: 0 }, E: { base: 0, vat: 0 }, O: { base: 0, vat: 0 } }, adj = { base: 0, vat: 0 }, count = 0;
  documents().forEach(function (d) {
    if (!inPeriod(d.issueDate, period)) return;
    count++;
    d.totals.subtotals.forEach(function (s) {
      if (d.docType === "credit") { adj.base = ZE.r2(adj.base - s.taxable); adj.vat = ZE.r2(adj.vat - s.tax); }
      else { rows[s.cat].base = ZE.r2(rows[s.cat].base + s.taxable); rows[s.cat].vat = ZE.r2(rows[s.cat].vat + s.tax); }
    });
  });
  return { rows: rows, adj: adj, outputVat: ZE.r2(rows.S.vat + adj.vat), count: count };
}
function sigKeys() { var e = egs(); return e ? [{ pubX: e.pubX, pubY: e.pubY }].concat(e.prevKeys || []) : []; }
function verifySig(d) { return sigKeys().some(function (k) { return ZE.verify(ZE.unb64(d.hash), ZE.unb64(d.sig), k.pubX, k.pubY); }); }
function go(h, then) {
  if (location.hash.replace("#", "") === h) { S.rendered = null; renderView(); if (then) then(); }
  else { S.after = then || null; location.hash = h; }
}

/* ---------- ZATCA: onboarding ---------- */
function sampleCustomer() { return { name: "عميل اختبار الامتثال", vat: "399999999900003", otherId: "1010999999", street: "طريق الملك عبدالعزيز", building: "1111", postal: "11564", city: "الرياض", district: "الملز" }; }
function buildSigned(doc, comp, cust, original, key) {
  var hx = ZE.buildHashXml(doc, comp, cust, original ? { number: original.number } : null);
  var hash = ZE.invoiceHash(hx);
  var sig = ZE.sign(ZE.unb64(hash), key.priv);
  var q = ZE.qr({
    sellerName: comp.nameAr, vat: comp.vat, timestamp: doc.issueDate + "T" + doc.issueTime,
    total: ZE.f2(doc.totals.gross), vatTotal: ZE.f2(doc.totals.vat), hash: hash, signature: ZE.b64(sig),
    publicKey: ZE.spki(key.pubX, key.pubY), certSignature: doc.kind === "simplified" && key.certSig ? ZE.unb64(key.certSig) : null
  });
  var xml = ZE.insertSignatureParts(hx, { hash: hash, signature: ZE.b64(sig), cert: key.cert || "", qr: q });
  return { hx: hx, hash: hash, sig: ZE.b64(sig), qr: q, xml: xml };
}
function makeCert(comp, key, serial, env) {
  var ca = ZE.keygen();
  var now = new Date(), exp = new Date(now.getTime() + 365 * 864e5);
  var body = { v: 3, env: env, issuer: "CN=Zimara Simulation CA (not ZATCA)", subject: "CN=" + serial + ", O=" + comp.nameAr + ", OU=" + comp.cr + ", C=SA, UID=" + comp.vat, publicKey: ZE.b64(ZE.spki(key.pubX, key.pubY)), notBefore: now.toISOString(), notAfter: exp.toISOString() };
  var cert = ZE.b64(ZE.utf8(JSON.stringify(body)));
  var certSig = ZE.b64(ZE.sign(ZE.utf8(cert), ca.priv));
  return { cert: cert, certSig: certSig, notAfter: exp.toISOString() };
}
function complianceSuite(comp, key) {
  var cust = sampleCustomer(), n = riyadhNow(), results = [], pih = ZE.FIRST_PIH;
  var types = [["standard", "invoice", "فاتورة ضريبية"], ["standard", "credit", "إشعار دائن ضريبي"], ["standard", "debit", "إشعار مدين ضريبي"], ["simplified", "invoice", "فاتورة مبسطة"], ["simplified", "credit", "إشعار دائن مبسط"], ["simplified", "debit", "إشعار مدين مبسط"]];
  types.forEach(function (t, i) {
    var lines = [{ name: "صنف اختبار", qty: 2, price: 100, discount: 0, cat: "S", unit: "PCE" }, { name: "خدمة مالية", qty: 1, price: 50, discount: 0, cat: "E", reason: "VATEX-SA-29", unit: "PCE" }];
    var doc = { number: "CMP-" + (i + 1), uuid: uuid(), issueDate: n.date, issueTime: n.time, kind: t[0], docType: t[1], icv: i + 1, pih: pih, supplyDate: n.date, payMeans: "10", reason: t[1] === "invoice" ? "" : "اختبار امتثال", lines: lines };
    doc.totals = ZE.totals(lines);
    var original = t[1] === "invoice" ? null : { number: "CMP-" + (t[0] === "standard" ? 1 : 4), totals: { gross: 1e9 } };
    var issues = ZE.validateDraft(doc, comp, t[0] === "standard" ? cust : null, original).filter(function (e) { return e.level === "error"; });
    var s = buildSigned(doc, comp, t[0] === "standard" ? cust : null, original, key);
    var ok = !issues.length && ZE.stripForHash(s.xml) === s.hx && ZE.verify(ZE.unb64(s.hash), ZE.unb64(s.sig), key.pubX, key.pubY);
    results.push({ name: t[2], ok: ok, issues: issues });
    pih = s.hash;
  });
  return results;
}
function onboardCore(otp) {
  var comp = company(), prev = egs();
  var key = ZE.keygen();
  var serial = "1-Zimara|2-1.0|3-" + uuid();
  var compCert = makeCert(comp, key, serial, "compliance");
  var withCert = Object.assign({}, key, compCert);
  var checks = complianceSuite(comp, withCert);
  var prodCert = makeCert(comp, key, serial, "production");
  var rec = {
    serial: serial, priv: key.priv, pubX: key.pubX, pubY: key.pubY, cert: prodCert.cert, certSig: prodCert.certSig, expiresAt: prodCert.notAfter,
    onboardedAt: new Date().toISOString(), otpLast2: String(otp).slice(-2),
    prevKeys: prev ? (prev.prevKeys || []).concat([{ pubX: prev.pubX, pubY: prev.pubY }]) : [], icv: prev ? prev.icv : 0, lastHash: prev ? prev.lastHash : ZE.FIRST_PIH, seq: prev ? prev.seq : { INV: 0, SIN: 0, CRN: 0, DBN: 0 }
  };
  return { rec: rec, checks: checks };
}
async function runOnboarding(otp) {
  var steps = [
    "توليد المفتاح الخاص (secp256k1) داخل خزنة النظام",
    "إنشاء طلب الشهادة CSR ببيانات المنشأة",
    "طلب شهادة الامتثال (Compliance CSID)",
    "فحوصات الامتثال على 6 أنواع مستندات",
    "طلب شهادة الإنتاج (Production CSID)"
  ];
  S.onboarding = { steps: steps, done: 0, checks: null, error: null };
  renderView();
  var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  try {
    for (var i = 0; i < 3; i++) { await wait(420); S.onboarding.done = i + 1; renderView(); }
    var res = onboardCore(otp);
    S.onboarding.checks = res.checks; await wait(500); S.onboarding.done = 4; renderView();
    if (res.checks.some(function (c) { return !c.ok; })) throw new Error("فشل فحص امتثال");
    await wait(450);
    await put("egs", res.rec);
    S.onboarding.done = 5;
    await audit("egs.onboard", "تسجيل وحدة إصدار " + res.rec.serial.slice(-12));
    renderView(); toast("تم تسجيل وحدة الإصدار وتفعيل الفوترة");
  } catch (e) { S.onboarding.error = e.message || String(e); renderView(); }
}

/* ---------- ZATCA: issuing ---------- */
function normLines(lines) {
  return lines.map(function (l) { return { productId: l.productId || "", name: String(l.name || "").trim(), qty: Number(l.qty), price: ZE.r2(Number(l.price)), discount: ZE.r2(Number(l.discount || 0)), cat: l.cat || "S", reason: l.cat && l.cat !== "S" ? (l.reason || "") : "", unit: l.unit || "PCE" }; });
}
async function issue(draft) {
  var comp = company(), e = clone(egs());
  if (!comp || !e) throw new Error("سجّل وحدة الإصدار أول من صفحة المنشأة");
  var cust = draft.customerId ? S.docs[draft.customerId] : null;
  var original = draft.refId ? Object.assign({ id: draft.refId }, S.docs[draft.refId]) : null;
  var lines = normLines(draft.lines);
  var issues = ZE.validateDraft(Object.assign({}, draft, { lines: lines }), comp, cust, original);
  if (issues.some(function (x) { return x.level === "error"; })) throw new Error("فيه أخطاء لازم تتصحح قبل الإصدار");
  var n = riyadhNow();
  var prefix = draft.docType === "credit" ? "CRN" : draft.docType === "debit" ? "DBN" : (draft.kind === "standard" ? "INV" : "SIN");
  var seq = (e.seq[prefix] || 0) + 1, icv = e.icv + 1;
  var doc = {
    number: prefix + "-" + n.year + "-" + pad(seq, 5), uuid: uuid(), kind: draft.kind, docType: draft.docType, icv: icv, pih: e.lastHash,
    issueDate: n.date, issueTime: n.time, issuedAt: new Date().toISOString(), supplyDate: draft.supplyDate || n.date, dueDate: draft.dueDate || "",
    payMeans: draft.payMeans || "10", notes: draft.notes || "", reason: draft.docType === "invoice" ? "" : draft.reason, refId: original ? original.id : "", refNumber: original ? original.number : "",
    customerId: draft.customerId || "", customerSnap: cust ? clone(cust) : null, lines: lines
  };
  doc.totals = ZE.totals(lines);
  var s = buildSigned(doc, comp, cust, original, e);
  doc.hash = s.hash; doc.sig = s.sig; doc.qr = s.qr; doc.xml = s.xml;
  var warns = issues.filter(function (x) { return x.level === "warning"; }).map(function (x) { return x.code + ": " + x.msg; });
  doc.zatca = draft.kind === "standard" ? { status: "cleared", at: new Date().toISOString(), warnings: warns, mode: "simulation" } : { status: "pending", at: null, warnings: warns, mode: "simulation" };
  doc.payments = [];
  e.icv = icv; e.lastHash = s.hash; e.seq[prefix] = seq;
  var id = "d_" + pad(icv, 7);
  await put(id, doc);
  await put("egs", e);
  await audit("doc.issue", doc.number + " · " + docLabel(doc) + " · " + money(doc.totals.gross) + " ر.س");
  if (draft.kind === "simplified") setTimeout(processQueue, 2500);
  return id;
}
var queueBusy = {};
async function processQueue() {
  var due = documents().filter(function (d) { return d.zatca && d.zatca.status === "pending" && Date.now() - Date.parse(d.issuedAt) > 2000 && !queueBusy[d.id]; });
  for (var i = 0; i < due.length; i++) {
    var d = due[i]; queueBusy[d.id] = true;
    var body = clone(S.docs[d.id]); body.zatca.status = "reported"; body.zatca.at = new Date().toISOString();
    await put(d.id, body);
    await audit("zatca.report", d.number + " · تمت المشاركة مع المنصة (محاكاة)");
  }
  if (due.length) renderView();
}
function verifyChain(docsAsc, key, mutateIcv) {
  var prev = ZE.FIRST_PIH, out = { ok: true, checked: 0, problems: [] };
  docsAsc.forEach(function (d) {
    var xml = d.xml;
    if (mutateIcv === d.icv) xml = xml.replace(/<cbc:PayableAmount currencyID="SAR">[^<]+</, '<cbc:PayableAmount currencyID="SAR">1.00<');
    var h = ZE.invoiceHash(ZE.stripForHash(xml));
    out.checked++;
    if (h !== d.hash) { out.ok = false; out.problems.push(d.number + ": محتوى الفاتورة لا يطابق البصمة المخزنة (تلاعب)"); }
    if (d.pih !== prev) { out.ok = false; out.problems.push(d.number + ": السلسلة مقطوعة (بصمة الفاتورة السابقة لا تطابق)"); }
    if (!verifySig(d)) { out.ok = false; out.problems.push(d.number + ": التوقيع الرقمي غير صحيح"); }
    prev = d.hash;
  });
  return out;
}

/* ---------- demo data ---------- */
async function loadDemo() {
  toast("جاري تجهيز بيانات تجريبية…");
  if (!S.docs.account) await put("account", { name: "مستخدم تجريبي", termsVersion: "2026-11", termsAt: new Date().toISOString(), createdAt: new Date().toISOString(), demo: true });
  await put("company", { nameAr: "مؤسسة الريادة للحلول التقنية (تجريبي)", nameEn: "Al Riyada Tech Solutions (Demo)", vat: "310122393500003", cr: "1010654321", street: "طريق الملك فهد", building: "2451", postal: "12214", city: "الرياض", district: "العليا", phone: "0112345678", email: "billing@example.sa", createdAt: new Date().toISOString(), demo: true });
  var cs = [
    { name: "شركة الأفق للتجارة", type: "business", vat: "300456789100003", otherId: "4030123456", street: "شارع التحلية", building: "7788", postal: "23434", city: "جدة", district: "الروضة", phone: "966500000001" },
    { name: "مجموعة نخبة الخليج", type: "business", vat: "302233445500003", otherId: "2050987654", street: "طريق الأمير محمد بن فهد", building: "3120", postal: "32241", city: "الدمام", district: "الفيصلية", phone: "966500000002" },
    { name: "مؤسسة بناء المستقبل", type: "business", vat: "", otherId: "1010333222", street: "شارع العروبة", building: "6543", postal: "12333", city: "الرياض", district: "الورود", phone: "966500000003" },
    { name: "أحمد سالم", type: "individual", vat: "", otherId: "", street: "", building: "", postal: "", city: "الرياض", district: "", phone: "966500000004" }
  ];
  var cids = [];
  for (var i = 0; i < cs.length; i++) { var id = "c_" + rid(); cids.push(id); await put(id, cs[i]); }
  var ps = [
    { name: "استشارة تقنية (ساعة)", price: 450, cat: "S", unit: "HUR" },
    { name: "اشتراك استضافة سحابية (شهري)", price: 1200, cat: "S", unit: "MON" },
    { name: "تطوير موقع إلكتروني", price: 18000, cat: "S", unit: "PCE" },
    { name: "جهاز نقاط بيع", price: 2300, cat: "S", unit: "PCE" },
    { name: "تدريب فريق (يوم)", price: 3500, cat: "S", unit: "DAY" },
    { name: "خدمة تصدير برمجيات لعميل خارجي", price: 9000, cat: "Z", reason: "VATEX-SA-33", unit: "PCE" }
  ];
  var pids = [];
  for (i = 0; i < ps.length; i++) { var pid = "p_" + rid(); pids.push(pid); await put(pid, ps[i]); }
  var ob = onboardCore("123456"); await put("egs", ob.rec);
  await audit("egs.onboard", "تسجيل وحدة إصدار (بيانات تجريبية)");
  function L(pi, q, disc) { var p = S.docs[pids[pi]]; return { productId: pids[pi], name: p.name, qty: q, price: p.price, discount: disc || 0, cat: p.cat, reason: p.reason || "", unit: p.unit }; }
  var n = riyadhNow(), due = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10), past = new Date(Date.now() - 3 * 864e5).toISOString().slice(0, 10);
  var a = await issue({ docType: "invoice", kind: "standard", customerId: cids[0], supplyDate: n.date, dueDate: due, payMeans: "30", lines: [L(2, 1), L(0, 6)], notes: "شكراً لتعاملكم معنا" });
  var b = await issue({ docType: "invoice", kind: "standard", customerId: cids[1], supplyDate: n.date, dueDate: past, payMeans: "30", lines: [L(1, 12, 1200)] });
  await issue({ docType: "invoice", kind: "standard", customerId: cids[2], supplyDate: n.date, dueDate: due, payMeans: "30", lines: [L(4, 2), L(0, 4)] });
  await issue({ docType: "invoice", kind: "standard", customerId: cids[0], supplyDate: n.date, dueDate: due, payMeans: "30", lines: [L(5, 1)] });
  await issue({ docType: "invoice", kind: "simplified", customerId: cids[3], supplyDate: n.date, payMeans: "48", lines: [L(3, 1)] });
  await issue({ docType: "invoice", kind: "simplified", customerId: "", supplyDate: n.date, payMeans: "10", lines: [L(0, 1)] });
  await issue({ docType: "credit", kind: "standard", customerId: cids[0], refId: a, supplyDate: n.date, payMeans: "30", reason: "خصم متفق عليه بعد التسليم", lines: [L(0, 1)] });
  var pa = clone(S.docs[a]); pa.payments = [{ amount: 10000, method: "تحويل بنكي", at: new Date().toISOString() }]; await put(a, pa);
  var pb = clone(S.docs[b]); pb.payments = []; await put(b, pb);
  await audit("demo.load", "تحميل بيانات تجريبية");
  toast("جاهز. هذي بيانات تجريبية تقدر تحذفها من صفحة المنشأة");
  go("home");
}
async function resetAll() {
  var ids = Object.keys(S.docs);
  for (var i = 0; i < ids.length; i++) await del(ids[i]);
  S.draft = null; S.chat = []; S.chainResult = null; S.onboarding = null;
  toast("تمت إعادة ضبط بيئة المحاكاة");
  go("home");
}

/* ---------- icons & nav ---------- */
var IC = {
  home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  invoices: '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4M9 12h7M9 16h7"/>',
  new: '<path d="M12 5v14M5 12h14"/>',
  customers: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c1.8.8 3 2.6 3.5 5.2"/>',
  products: '<path d="M3 7l9-4 9 4-9 4zM3 7v10l9 4 9-4V7M12 11v10"/>',
  reports: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  assistant: '<path d="M12 3l1.8 4.6L18.5 9l-4.7 1.4L12 15l-1.8-4.6L5.5 9l4.7-1.4zM18 15l.9 2.1L21 18l-2.1.9L18 21l-.9-2.1L15 18l2.1-.9z"/>',
  audit: '<path d="M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  company: '<path d="M4 21V5l8-2v18M12 8l8 3v10M8 9v.01M8 13v.01M8 17v.01M16 14v.01M16 18v.01M2 21h20"/>',
  plans: '<path d="M3 7h18v10H3z"/><path d="M3 11h18M7 15h3"/>'
};
function icon(n) { return '<svg viewBox="0 0 24 24" aria-hidden="true">' + IC[n] + "</svg>"; }
var ROUTES = [
  ["home", "الرئيسية"], ["invoices", "المستندات"], ["new", "فاتورة جديدة"], ["customers", "العملاء"], ["products", "المنتجات والخدمات"], ["reports", "التقارير والضريبة"],
  ["sep"], ["assistant", "المساعد الذكي"], ["audit", "سجل التدقيق"], ["company", "المنشأة والربط"], ["plans", "الباقات"]
];
function route() { var h = (location.hash || "").replace("#", ""); return ROUTES.some(function (r) { return r[0] === h; }) ? h : "home"; }
function renderNav() {
  var r = route(), html = '<div class="brand"><img src="' + window.ZIMARA_LOGO + '" alt="زيمارا | ZIMARA"></div>';
  ROUTES.forEach(function (x) {
    if (x[0] === "sep") { html += '<div class="sep"></div>'; return; }
    html += '<a href="#' + x[0] + '"' + (x[0] === r ? ' aria-current="page"' : "") + ">" + icon(x[0]) + "<span>" + x[1] + "</span></a>";
  });
  var c = company(); var days = c ? Math.max(0, 14 - Math.floor((Date.now() - Date.parse(c.createdAt || Date.now())) / 864e5)) : 14;
  var acc = S.docs.account || {};
  html += '<div class="foot"><b>' + esc(c ? c.nameAr : "") + "</b><br>" + esc(acc.name || "") + '<br>تجربة مجانية · باقي <span class="num">' + days + "</span> يوم</div>";
  $("#nav").innerHTML = html;
}
function renderPills() {
  var p = '<span class="pill info" title="الفواتير موقّعة فعلياً، والإرسال للهيئة بالمحاكاة">بيئة المحاكاة</span>';
  if (S.mode === "db") p += '<span class="pill ok">محفوظ في حسابك</span>';
  else if (S.mode === "local") p += '<span class="pill warn" title="البيانات محفوظة في هذا المتصفح فقط">محفوظ في هذا المتصفح</span>';
  else p += '<span class="pill plain">جاري التحميل…</span>';
  var e = egs(); p += e ? '<span class="pill acc">الربط مفعّل</span>' : '<span class="pill bad">الربط غير مفعّل</span>';
  $("#envPills").innerHTML = p;
}

/* ---------- views ---------- */
var TITLES = { home: "الرئيسية", invoices: "المستندات", new: "فاتورة جديدة", customers: "العملاء", products: "المنتجات والخدمات", reports: "التقارير والإقرار الضريبي", assistant: "المساعد الذكي", audit: "سجل التدقيق", company: "المنشأة والربط مع الهيئة", plans: "الباقات والاشتراك" };
var FORM_VIEWS = { new: 1, company: 1, customers: 1, products: 1, assistant: 1 };
function renderView(force) {
  renderNav(); renderPills();
  var r = route();
  $("#pageTitle").textContent = TITLES[r];
  if (S.mode === "loading" || S.mode === "db-wait") {
    $("#view").innerHTML = '<div class="card"><div class="skel" style="width:40%"></div><div class="skel"></div><div class="skel" style="width:70%"></div>' + (S.note === "slow" ? '<p class="muted small">التخزين ما رد للحين. تأكد من الاتصال، والصفحة بتكمل التحميل تلقائياً.</p>' : "") + "</div>";
    return;
  }
  if (!S.docs.account) { showWelcome(); return; }
  $("#welcome").hidden = true; $("#app").hidden = false;
  var v = VIEWS[r]();
  $("#view").innerHTML = (S.note && S.note !== "slow" ? '<div class="notice warn" style="margin-bottom:14px">' + esc(S.note) + "</div>" : "") + v;
  if (r === "new") afterNewRender();
  if (r === "assistant") scrollChat();
}
function onData() {
  var r = route();
  if (FORM_VIEWS[r] && S.rendered === r) { renderNav(); renderPills(); if (r === "new") refreshNewSide(); return; }
  S.rendered = r; renderView();
}

function showWelcome() {
  $("#app").hidden = true;
  var w = $("#welcome");
  if (!w.hidden && w.innerHTML) return;
  w.hidden = false;
  w.innerHTML = '<div class="welcome"><aside class="side"><img src="' + window.ZIMARA_LOGO + '" alt="زيمارا | ZIMARA">' +
    '<div><h1>فوترة إلكترونية سعودية، <span class="mist">بذوق أوضح</span></h1><p>فواتير متوافقة مع المرحلة الثانية من هيئة الزكاة والضريبة والجمارك: موقّعة رقمياً، فيها رمز QR، ومربوطة بسلسلة ما تقبل التلاعب.</p></div>' +
    '<p class="small" style="color:#b6a8cf">Modern technology, distinctly refined. · من حائل</p></aside>' +
    '<div class="formside"><form id="signupForm" novalidate><h2 style="font-size:1.4rem;margin:0">أنشئ حسابك وابدأ التجربة</h2><p class="muted small" style="margin:0">14 يوم مجاناً، بدون بطاقة ائتمانية.</p>' +
    '<div class="notice bad" id="su-err" hidden></div>' +
    '<label class="f"><span class="req">اسمك</span><input class="in" id="su-name" name="name" autocomplete="name"></label>' +
    '<label class="f"><span class="req">اسم المنشأة</span><input class="in" id="su-company" name="company" autocomplete="organization"></label>' +
    '<label class="f"><span>البريد الإلكتروني</span><input class="in" id="su-email" name="email" type="email" dir="ltr" autocomplete="email"></label>' +
    '<label class="f"><span>الجوال</span><input class="in" id="su-phone" name="phone" type="tel" dir="ltr" placeholder="05xxxxxxxx" autocomplete="tel"></label>' +
    '<label class="check"><input type="checkbox" id="su-terms" name="terms"><span>أوافق على الشروط وسياسة الخصوصية، وعلى معالجة بياناتي لتقديم الخدمة.</span></label>' +
    '<details class="small muted"><summary>ملخص الشروط والخصوصية</summary><ul style="padding-inline-start:18px;margin:6px 0"><li>أنت المكلف النظامي والمسؤول عن صحة بيانات فواتيرك.</li><li>الفواتير الصادرة ما تنحذف ولا تتعدل، والتصحيح بإشعار دائن أو مدين.</li><li>نحفظ الفواتير 6 سنوات على الأقل حسب نظام ضريبة القيمة المضافة.</li><li>نجمع الحد الأدنى من البيانات، ولا نبيعها، ولك حق الوصول والتصحيح والإتلاف حسب نظام حماية البيانات الشخصية.</li><li>هذي بيئة محاكاة: الفواتير موقّعة فعلياً لكن ما تنرسل للهيئة.</li></ul></details>' +
    '<label class="check"><input type="checkbox" id="su-marketing" name="marketing"><span>أبي توصلني أخبار زيمارا وعروضه (اختياري)</span></label>' +
    '<button class="btn primary" type="submit" style="padding:11px">إنشاء الحساب</button>' +
    '<button class="btn" type="button" data-act="demoSignup">أو جرّب مباشرة ببيانات تجريبية</button>' +
    '<p class="small muted" style="margin:0">' + (S.mode === "db" ? "حسابك مرتبط بحسابك في Claude، وبياناتك خاصة فيك ومحفوظة." : "بياناتك محفوظة في هذا المتصفح فقط.") + "</p></form></div></div>";
}
async function createAccount(f) {
  var err = $("#su-err");
  var name = f.name.value.trim(), orgName = f.company.value.trim(), email = f.email.value.trim(), phone = f.phone.value.trim();
  var msg = !name ? "اكتب اسمك" : !orgName ? "اكتب اسم المنشأة" : email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? "البريد الإلكتروني غير صحيح" : phone && !/^(\+?966|0)?5\d{8}$/.test(phone) ? "رقم الجوال غير صحيح" : !f.terms.checked ? "لازم توافق على الشروط وسياسة الخصوصية" : "";
  if (msg) { err.textContent = msg; err.hidden = false; return; }
  var now = new Date().toISOString();
  await put("account", { name: name, email: email, phone: phone, marketing: f.marketing.checked, termsVersion: "2026-11", termsAt: now, createdAt: now });
  await put("company", Object.assign({}, company() || {}, { nameAr: orgName, email: email, phone: phone, createdAt: now }));
  await audit("account.signup", "إنشاء الحساب وبدء التجربة المجانية");
  $("#welcome").hidden = true; $("#welcome").innerHTML = "";
  go("company");
  toast("أهلاً " + name.split(" ")[0] + "! كمّل بيانات منشأتك عشان نفعّل الربط مع الهيئة");
}

var VIEWS = {};
VIEWS.home = function () {
  var c = company();
  if (!c) {
    return '<div class="card" style="padding:28px"><h2 style="font-size:1.4rem">أهلاً بك في زيمارا</h2><p class="muted" style="max-width:62ch">أصدر فواتير متوافقة مع المرحلة الثانية من الفوترة الإلكترونية: موقّعة رقمياً، فيها رمز QR، ومربوطة بسلسلة ما تقبل التلاعب. ابدأ ببيانات منشأتك، أو جرّب النظام ببيانات تجريبية جاهزة.</p>' +
      '<div class="row" style="margin-top:16px"><a class="btn primary" href="#company">ابدأ ببيانات منشأتي</a><button class="btn" data-act="demo">جرّب ببيانات تجريبية</button></div></div>' +
      '<div class="grid g3" style="margin-top:14px">' +
      '<div class="card"><h3>ربط مع الهيئة في دقائق</h3><p class="muted small">تدخل رمز OTP من بوابة فاتورة، والنظام يولّد المفتاح ويمرر فحوصات الامتثال الستة ويفعّل الشهادة.</p></div>' +
      '<div class="card"><h3>مدقق قبل الإصدار</h3><p class="muted small">يفحص الفاتورة على قواعد الهيئة ويشرح كل خطأ بالعربي قبل لا توصل للمنصة.</p></div>' +
      '<div class="card"><h3>مساعد ذكي</h3><p class="muted small">اكتب «فاتورة لشركة الأفق بست ساعات استشارة» وهو يجهز المسودة لك.</p></div></div>';
  }
  var docs = documents(), n = riyadhNow();
  var month = docs.filter(function (d) { return d.issueDate.slice(0, 7) === n.ym; });
  var sales = month.reduce(function (s, d) { return s + (d.docType === "credit" ? -d.totals.gross : d.totals.gross); }, 0);
  var vs = vatSummary("quarter");
  var unpaid = docs.filter(function (d) { return d.docType === "invoice"; }).reduce(function (s, d) { return s + Math.max(0, balanceOf(d)); }, 0);
  var overdue = docs.filter(function (d) { var p = payState(d); return p && p.k === "bad"; }).length;
  var pending = docs.filter(function (d) { return d.zatca.status === "pending"; }).length;
  var deadline = Date.parse("2027-02-01T00:00:00+03:00"), daysLeft = Math.max(0, Math.ceil((deadline - Date.now()) / 864e5));
  var e = egs();
  var h = "";
  if (c.demo) h += '<div class="notice info" style="margin-bottom:14px">تشوف بيانات تجريبية. تقدر تمسحها وتبدأ بمنشأتك من <a href="#company">صفحة المنشأة</a>.</div>';
  if (!e) h += '<div class="notice bad" style="margin-bottom:14px"><b>الربط مع الهيئة غير مفعّل.</b> ما تقدر تصدر فواتير قبل تسجيل وحدة الإصدار. <a href="#company">فعّل الربط الحين</a></div>';
  h += '<div class="grid kpis">' +
    kpi("مبيعات هذا الشهر", money(sales), "شامل الضريبة · " + month.length + " مستند") +
    kpi("ضريبة مخرجات الربع", money(vs.outputVat), "تقديرية حسب المستندات الصادرة") +
    kpi("مستحقات غير محصلة", money(unpaid), overdue ? overdue + " فاتورة متأخرة" : "ما فيه متأخرات") +
    kpi("بانتظار المشاركة", String(pending), "الفواتير المبسطة تُشارك خلال 24 ساعة") + "</div>";
  h += '<div class="grid homegrid" style="margin-top:14px">';
  h += '<div class="card"><div class="row" style="justify-content:space-between"><h2 style="margin:0">آخر المستندات</h2><a class="btn" href="#new">' + icon("new") + "فاتورة جديدة</a></div>" + docTable(docs.slice(0, 6), true) + "</div>";
  h += '<div class="stack">';
  h += '<div class="card"><h3>الموجة 25 من الربط</h3><p class="small muted">آخر موعد للمنشآت اللي تجاوزت إيراداتها 187,500 ر.س: 1 فبراير 2027</p><div class="kpi"><div class="value">' + daysLeft + ' <span style="font-size:.9rem;font-family:var(--body)">يوم متبقي</span></div></div></div>';
  h += '<div class="card"><h3>صحة الامتثال</h3>' + (e ? '<dl class="kv"><dt>وحدة الإصدار</dt><dd class="code">' + esc(e.serial.slice(-17)) + '</dd><dt>عداد الفواتير (ICV)</dt><dd class="num">' + e.icv + '</dd><dt>صلاحية الشهادة</dt><dd>' + fmtDate(e.expiresAt) + '</dd><dt>آخر بصمة</dt><dd class="code">' + esc(e.lastHash.slice(0, 22)) + '…</dd></dl><div class="row" style="margin-top:12px"><button class="btn" data-act="chain">افحص سلامة السلسلة</button><button class="btn ghost" data-act="tamper">اختبر كشف التلاعب</button></div>' + chainResultHtml() : '<p class="muted small">فعّل الربط عشان يبدأ النظام يبني سلسلة الفواتير.</p>') + "</div>";
  h += topCustomers(docs) + "</div></div>";
  return h;
};
function kpi(label, value, hint) { return '<div class="card kpi"><div class="label">' + esc(label) + '</div><div class="value">' + esc(value) + '</div><div class="hint">' + esc(hint) + "</div></div>"; }
function chainResultHtml() {
  var r = S.chainResult; if (!r) return "";
  if (r.tamper) return '<div class="notice ' + (r.ok ? "bad" : "ok") + '" style="margin-top:12px">' + (r.ok ? "ما انكشف التعديل!" : "<b>انكشف التلاعب.</b> عدّلنا مبلغ " + esc(r.target) + " في نسخة مؤقتة (بدون حفظ)، والفحص لقى:") + '<ul class="small" style="margin:6px 0 0;padding-inline-start:18px">' + r.problems.map(function (p) { return "<li>" + esc(p) + "</li>"; }).join("") + "</ul></div>";
  return '<div class="notice ' + (r.ok ? "ok" : "bad") + '" style="margin-top:12px">' + (r.ok ? "<b>السلسلة سليمة.</b> تم فحص " + r.checked + " مستند: البصمات والتواقيع وتسلسل PIH كلها مطابقة." : "<b>فيه مشكلة:</b>") + (r.problems.length ? '<ul class="small" style="margin:6px 0 0;padding-inline-start:18px">' + r.problems.map(function (p) { return "<li>" + esc(p) + "</li>"; }).join("") + "</ul>" : "") + "</div>";
}
function topCustomers(docs) {
  var m = {};
  docs.forEach(function (d) { if (d.docType !== "invoice") return; var n = d.customerSnap ? d.customerSnap.name : "عميل نقدي"; m[n] = (m[n] || 0) + d.totals.gross; });
  var arr = Object.keys(m).map(function (k) { return [k, m[k]]; }).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 5);
  if (!arr.length) return "";
  var max = arr[0][1];
  return '<div class="card"><h3>أكبر العملاء</h3><div class="bars">' + arr.map(function (x) { return '<div class="bar"><span>' + esc(x[0]) + '</span><span class="num">' + money(x[1]) + '</span><div class="track"><div class="fill" style="width:' + Math.max(4, x[1] / max * 100) + '%"></div></div></div>'; }).join("") + "</div></div>";
}
function docTable(docs, compact) {
  if (!docs.length) return '<div class="empty"><h3>ما فيه مستندات للحين</h3><p>أول فاتورة تصدرها بتظهر هنا مع حالتها في منصة فاتورة.</p><a class="btn primary" href="#new">أصدر أول فاتورة</a></div>';
  var h = '<div class="tbl" style="margin-top:12px"><table><thead><tr><th>الرقم</th><th>النوع</th><th>العميل</th>' + (compact ? "" : "<th>التاريخ</th>") + "<th>الإجمالي</th><th>الهيئة</th>" + (compact ? "" : "<th>السداد</th>") + "</tr></thead><tbody>";
  docs.forEach(function (d) {
    var p = payState(d);
    h += '<tr class="click" data-act="open" data-id="' + d.id + '" tabindex="0"><td class="num">' + esc(d.number) + "</td><td>" + docLabel(d) + "</td><td>" + esc(d.customerSnap ? d.customerSnap.name : "عميل نقدي") + "</td>" + (compact ? "" : "<td>" + fmtDate(d.issuedAt) + "</td>") + "<td>" + (d.docType === "credit" ? "−" : "") + sar(d.totals.gross) + "</td><td>" + zatcaPill(d) + "</td>" + (compact ? "" : "<td>" + (p ? '<span class="pill ' + p.k + '">' + p.t + "</span>" : "—") + "</td>") + "</tr>";
  });
  return h + "</tbody></table></div>";
}

VIEWS.invoices = function () {
  var docs = documents(), q = S.ui.q.trim();
  docs = docs.filter(function (d) {
    if (S.ui.ftype === "standard" && !(d.docType === "invoice" && d.kind === "standard")) return false;
    if (S.ui.ftype === "simplified" && !(d.docType === "invoice" && d.kind === "simplified")) return false;
    if (S.ui.ftype === "notes" && d.docType === "invoice") return false;
    if (S.ui.fstat === "unpaid") { var p = payState(d); if (!p || p.k === "ok") return false; }
    if (S.ui.fstat === "pending" && d.zatca.status !== "pending") return false;
    if (q && (d.number + " " + (d.customerSnap ? d.customerSnap.name : "")).indexOf(q) < 0) return false;
    return true;
  });
  var seg = function (key, opts) { return '<div class="seg" role="group">' + opts.map(function (o) { return '<button type="button" data-act="filter" data-k="' + key + '" data-v="' + o[0] + '" aria-pressed="' + (S.ui[key] === o[0]) + '">' + o[1] + "</button>"; }).join("") + "</div>"; };
  return '<div class="row" style="justify-content:space-between;margin-bottom:12px"><div class="row">' + seg("ftype", [["all", "الكل"], ["standard", "ضريبية"], ["simplified", "مبسطة"], ["notes", "إشعارات"]]) + seg("fstat", [["all", "كل الحالات"], ["unpaid", "غير مدفوعة"], ["pending", "بانتظار الهيئة"]]) + '</div><div class="row"><input class="in" id="q" data-f="search" placeholder="ابحث برقم الفاتورة أو العميل" value="' + esc(S.ui.q) + '" style="width:240px"><a class="btn primary" href="#new">' + icon("new") + "فاتورة جديدة</a></div></div>" +
    (documents().length && !docs.length ? '<div class="card empty"><h3>ما فيه نتائج</h3><p>غيّر الفلتر أو كلمة البحث.</p></div>' : docTable(docs, false));
};

/* ----- new invoice ----- */
function blankLine() { return { productId: "", name: "", qty: 1, price: "", discount: 0, cat: "S", reason: "", unit: "PCE" }; }
function newDraft() { return { docType: "invoice", kind: "standard", customerId: "", supplyDate: riyadhNow().date, dueDate: new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10), payMeans: "30", notes: "", reason: "", refId: "", lines: [blankLine()] }; }
VIEWS.new = function () {
  S.rendered = "new";
  if (!S.draft) S.draft = newDraft();
  var d = S.draft, c = company(), e = egs();
  if (!c) return '<div class="card empty"><h3>كمّل بيانات منشأتك أول</h3><p>الفاتورة تحتاج اسمك ورقمك الضريبي وعنوانك.</p><a class="btn primary" href="#company">بيانات المنشأة</a></div>';
  var orig = d.refId ? S.docs[d.refId] : null;
  var h = "";
  if (!e) h += '<div class="notice bad" style="margin-bottom:14px">الربط مع الهيئة غير مفعّل، فما تقدر تصدر للحين. <a href="#company">فعّل الربط</a></div>';
  if (d.docType === "invoice") {
    h += '<div class="ai" style="margin-bottom:14px"><h3>' + icon("assistant") + 'اكتب الفاتورة بكلامك</h3><div class="row" style="align-items:stretch"><textarea class="in" id="aiText" rows="2" style="flex:1;min-width:220px" placeholder="مثال: فاتورة ضريبية لشركة الأفق، 6 ساعات استشارة وتطوير موقع بخصم 1000"></textarea><button class="btn primary" data-act="aiFill" id="aiFillBtn">حوّلها لفاتورة</button></div><p class="small muted" id="aiNote" style="margin-bottom:0">' + (S.sample === null ? "المساعد الذكي متاح لما تفتح الصفحة في Claude وأنت مسجل دخول." : "المساعد يجهز المسودة فقط، وأنت تراجعها وتصدرها.") + "</p></div>";
  } else {
    h += '<div class="notice info" style="margin-bottom:14px"><b>' + ZE.DOC[d.docType].ar + "</b> على الفاتورة <span class=\"num\">" + esc(orig ? orig.number : "") + '</span>. التعديل على الفواتير الصادرة يكون بإشعار، مو بتعديل الفاتورة. <button class="btn ghost small" data-act="cancelNote">إلغاء</button></div>';
  }
  h += '<div class="grid" style="grid-template-columns:minmax(0,1fr) minmax(280px,340px);align-items:start" id="newGrid"><div class="stack">';
  h += '<div class="card"><div class="row" style="justify-content:space-between;margin-bottom:12px"><h2 style="margin:0">بيانات المستند</h2>' + (d.docType === "invoice" ? '<div class="seg" role="group" aria-label="نوع الفاتورة"><button type="button" data-act="kind" data-v="standard" aria-pressed="' + (d.kind === "standard") + '">ضريبية B2B</button><button type="button" data-act="kind" data-v="simplified" aria-pressed="' + (d.kind === "simplified") + '">مبسطة B2C</button></div>' : '<span class="pill acc plain">' + (d.kind === "standard" ? "ضريبي" : "مبسط") + "</span>") + "</div>";
  h += '<div class="fgrid">';
  h += '<label class="f"><span' + (d.kind === "standard" ? ' class="req"' : "") + '>العميل</span><select class="in" id="f-cust" data-f="customerId"' + (d.docType !== "invoice" ? " disabled" : "") + '><option value="">' + (d.kind === "standard" ? "اختر العميل" : "عميل نقدي (بدون اسم)") + "</option>" + customers().map(function (x) { return '<option value="' + x.id + '"' + (x.id === d.customerId ? " selected" : "") + ">" + esc(x.name) + "</option>"; }).join("") + "</select></label>";
  h += '<label class="f"><span class="req">تاريخ التوريد</span><input class="in" type="date" id="f-supply" data-f="supplyDate" value="' + esc(d.supplyDate) + '"></label>';
  h += '<label class="f"><span>تاريخ الاستحقاق</span><input class="in" type="date" id="f-due" data-f="dueDate" value="' + esc(d.dueDate) + '"></label>';
  h += '<label class="f"><span>طريقة الدفع</span><select class="in" id="f-pay" data-f="payMeans">' + [["10", "نقداً"], ["30", "تحويل بنكي"], ["48", "بطاقة (مدى/ائتمان)"], ["1", "غير محدد"]].map(function (o) { return '<option value="' + o[0] + '"' + (d.payMeans === o[0] ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select></label>";
  h += "</div>";
  h += '<p class="small muted" style="margin-top:10px">تاريخ ووقت الإصدار يتسجل تلقائياً بتوقيت الرياض لحظة الإصدار، وما يمكن تعديله (متطلب الهيئة).' + (d.kind === "standard" ? ' <a href="#customers">أضف عميل جديد</a>' : "") + "</p>";
  if (d.docType !== "invoice") h += '<label class="f" style="margin-top:10px"><span class="req">سبب الإشعار</span><input class="in" id="f-reason" data-f="reason" value="' + esc(d.reason) + '" placeholder="مثال: إرجاع جزء من البضاعة"></label>';
  h += "</div>";
  h += '<div class="card"><div class="row" style="justify-content:space-between;margin-bottom:12px"><h2 style="margin:0">البنود</h2><button class="btn" data-act="addLine">' + icon("new") + 'إضافة بند</button></div><div class="lines" id="lines">' + linesHtml() + "</div></div>";
  h += '<div class="card"><label class="f"><span>ملاحظات تظهر على الفاتورة</span><textarea class="in" id="f-notes" data-f="notes" rows="2">' + esc(d.notes) + "</textarea></label></div>";
  h += '</div><div class="stack" style="position:sticky;top:12px" id="newSide"></div></div>';
  return h;
};
function linesHtml() {
  var d = S.draft, ps = products(), tt = ZE.totals(normLines(d.lines));
  return d.lines.map(function (l, i) {
    var lt = tt.lines[i] || { net: 0, vat: 0, gross: 0 };
    return '<div class="line" data-i="' + i + '">' +
      '<label class="f name"><span class="req">الصنف أو الخدمة</span><input class="in" id="l' + i + '-name" data-l="name" list="plist" value="' + esc(l.name) + '" placeholder="اكتب أو اختر من المنتجات"></label>' +
      '<label class="f"><span class="req">الكمية</span><input class="in num" id="l' + i + '-qty" data-l="qty" inputmode="decimal" value="' + esc(l.qty) + '"></label>' +
      '<label class="f"><span class="req">سعر الوحدة</span><input class="in num" id="l' + i + '-price" data-l="price" inputmode="decimal" value="' + esc(l.price) + '" placeholder="0.00"></label>' +
      '<label class="f"><span>خصم</span><input class="in num" id="l' + i + '-disc" data-l="discount" inputmode="decimal" value="' + esc(l.discount) + '"></label>' +
      '<label class="f"><span>الضريبة</span><select class="in" id="l' + i + '-cat" data-l="cat">' + ["S", "Z", "E", "O"].map(function (k) { return '<option value="' + k + '"' + (l.cat === k ? " selected" : "") + ">" + ZE.CAT_NAMES[k] + "</option>"; }).join("") + "</select></label>" +
      '<button class="btn ghost" data-act="rmLine" data-i="' + i + '" aria-label="حذف البند"' + (d.lines.length < 2 ? " disabled" : "") + '><svg viewBox="0 0 24 24"><path d="M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg></button>' +
      (l.cat !== "S" ? '<label class="f reason"><span class="req">سبب الإعفاء أو النسبة الصفرية</span><select class="in" id="l' + i + '-reason" data-l="reason"><option value="">اختر السبب</option>' + Object.keys(ZE.EXEMPTIONS).map(function (k) { return '<option value="' + k + '"' + (l.reason === k ? " selected" : "") + ">" + ZE.EXEMPTIONS[k] + " (" + k + ")</option>"; }).join("") + "</select></label>" : "") +
      '<div class="lt"><span>الصافي ' + sar(lt.net) + "</span><span>الضريبة " + sar(lt.vat) + "</span><span>الإجمالي " + sar(lt.gross) + "</span></div></div>";
  }).join("") + '<datalist id="plist">' + ps.map(function (p) { return '<option value="' + esc(p.name) + '">'; }).join("") + "</datalist>";
}
function currentIssues() {
  var d = S.draft, c = company(), cust = d.customerId ? S.docs[d.customerId] : null, orig = d.refId ? S.docs[d.refId] : null;
  return ZE.validateDraft(Object.assign({}, d, { lines: normLines(d.lines) }), c, cust, orig);
}
function refreshNewSide() {
  var side = $("#newSide"); if (!side || !S.draft) return;
  var tt = ZE.totals(normLines(S.draft.lines)), issues = currentIssues();
  var errs = issues.filter(function (x) { return x.level === "error"; }), warns = issues.filter(function (x) { return x.level === "warning"; });
  var can = !errs.length && !!egs();
  var h = '<div class="card"><h2>الملخص</h2><div class="sum"><span>المجموع قبل الضريبة</span>' + "<span>" + sar(tt.net) + "</span>";
  tt.subtotals.forEach(function (s) { h += "<span class=\"muted\">" + ZE.CAT_NAMES[s.cat] + "</span><span class=\"muted\">" + sar(s.tax) + "</span>"; });
  h += '<span>ضريبة القيمة المضافة</span><span>' + sar(tt.vat) + '</span><span class="t">الإجمالي</span><span class="t">' + sar(tt.gross) + "</span></div></div>";
  h += '<div class="card"><div class="row" style="justify-content:space-between"><h2 style="margin:0">مدقق الهيئة</h2>' + (errs.length ? '<span class="pill bad">' + errs.length + " خطأ</span>" : '<span class="pill ok">جاهزة</span>') + "</div>";
  if (!issues.length) h += '<p class="small muted">الفاتورة مطابقة لكل القواعد المفحوصة.</p>';
  else h += '<ul class="checks" style="margin-top:10px">' + errs.concat(warns).map(function (x) { return '<li><span class="ic ' + (x.level === "error" ? "e" : "w") + '">' + (x.level === "error" ? "!" : "؟") + "</span><span>" + esc(x.msg) + ' <span class="code">' + esc(x.code) + "</span></span></li>"; }).join("") + "</ul>";
  if (issues.length && S.sample) h += '<button class="btn ghost small" style="margin-top:8px" data-act="aiExplain">اشرح لي وش أسوي</button><p class="small" id="aiExplain" style="white-space:pre-wrap"></p>';
  h += "</div>";
  if (S.confirmIssue) {
    h += '<div class="card" style="border-color:var(--gold)"><h3>تأكيد الإصدار</h3><p class="small">بعد الإصدار ما تقدر تعدّل أو تحذف المستند. أي تصحيح يكون بإشعار دائن أو مدين. ' + (S.draft.kind === "standard" ? "الفاتورة الضريبية تنرسل للاعتماد قبل تسليمها للعميل." : "الفاتورة المبسطة تنشارك مع الهيئة خلال 24 ساعة.") + '</p><div class="row"><button class="btn primary" data-act="doIssue" id="doIssueBtn">تأكيد وإصدار</button><button class="btn" data-act="noIssue">رجوع</button></div></div>';
  } else {
    h += '<button class="btn primary" style="width:100%;padding:11px" data-act="askIssue"' + (can ? "" : " disabled") + ">إصدار " + (S.draft.docType === "invoice" ? (S.draft.kind === "standard" ? "الفاتورة الضريبية" : "الفاتورة المبسطة") : ZE.DOC[S.draft.docType].ar) + "</button>";
    if (!egs()) h += '<p class="small muted">فعّل الربط مع الهيئة أول.</p>';
  }
  side.innerHTML = h;
}
function afterNewRender() { refreshNewSide(); }
function refreshLines() { var el = $("#lines"); if (!el) return; var a = document.activeElement, aid = a && a.id, pos = a && a.selectionStart; el.innerHTML = linesHtml(); if (aid) { var n = document.getElementById(aid); if (n) { n.focus(); try { if (pos != null) n.setSelectionRange(pos, pos); } catch (e) {} } } }

/* ----- invoice detail ----- */
function openDoc(id) {
  var d = Object.assign({ id: id }, S.docs[id]); if (!S.docs[id]) return;
  var c = company(), cust = d.customerSnap, e = egs();
  var qrSvg = "";
  try { var q = qrcode(0, "M"); q.addData(d.qr); q.make(); qrSvg = q.createSvgTag({ cellSize: 2, margin: 2, scalable: true }); } catch (err) { qrSvg = '<p class="small">تعذر رسم الرمز</p>'; }
  var title = d.docType === "invoice" ? (d.kind === "standard" ? ["فاتورة ضريبية", "Tax Invoice"] : ["فاتورة ضريبية مبسطة", "Simplified Tax Invoice"]) : [ZE.DOC[d.docType].ar, ZE.DOC[d.docType].en];
  var sigOk = verifySig(d);
  var hashOk = ZE.invoiceHash(ZE.stripForHash(d.xml)) === d.hash;
  var bal = balanceOf(d), p = payState(d);
  var paper = '<div class="paper"><div class="ph"><div><h2>' + title[0] + '</h2><div class="en">' + title[1] + '</div></div><div style="text-align:left"><div class="num" style="font-size:1rem;font-weight:600">' + esc(d.number) + '</div><div class="small">تاريخ الإصدار: <span class="num">' + d.issueDate + " " + d.issueTime + '</span></div><div class="small">تاريخ التوريد: <span class="num">' + esc(d.supplyDate) + "</span></div>" + (d.refNumber ? '<div class="small">مرجع الفاتورة: <span class="num">' + esc(d.refNumber) + "</span></div>" : "") + "</div></div>" +
    '<div class="parties"><div class="pbox"><b>البائع · Seller</b>' + esc(c ? c.nameAr : "") + '<br><span class="small">الرقم الضريبي: <span class="num">' + esc(c ? c.vat : "") + '</span></span><br><span class="small">السجل التجاري: <span class="num">' + esc(c ? c.cr : "") + '</span></span><br><span class="small">' + esc(c ? [c.street, c.building, c.district, c.city, c.postal].filter(Boolean).join("، ") : "") + "</span></div>" +
    '<div class="pbox"><b>المشتري · Buyer</b>' + (cust ? esc(cust.name) + (cust.vat ? '<br><span class="small">الرقم الضريبي: <span class="num">' + esc(cust.vat) + "</span></span>" : "") + (cust.otherId ? '<br><span class="small">السجل التجاري: <span class="num">' + esc(cust.otherId) + "</span></span>" : "") + '<br><span class="small">' + esc([cust.street, cust.building, cust.district, cust.city, cust.postal].filter(Boolean).join("، ")) + "</span>" : "عميل نقدي") + "</div></div>" +
    '<div class="tbl" style="border-color:#e3e8e6;background:#fff"><table><thead><tr><th>#</th><th>البيان</th><th>الكمية</th><th>السعر</th><th>الخصم</th><th>الضريبة</th><th>الإجمالي</th></tr></thead><tbody>' +
    d.lines.map(function (l, i) { var lt = d.totals.lines[i]; return "<tr><td>" + (i + 1) + '</td><td class="wrap-cell">' + esc(l.name) + (l.cat !== "S" ? '<br><span class="small" style="color:#5d6b69">' + ZE.CAT_NAMES[l.cat] + (l.reason ? " · " + esc(ZE.EXEMPTIONS[l.reason] || l.reason) : "") + "</span>" : "") + '</td><td class="num">' + l.qty + '</td><td class="num">' + money(l.price) + '</td><td class="num">' + money(l.discount) + '</td><td class="num">' + money(lt.vat) + '</td><td class="num">' + money(lt.gross) + "</td></tr>"; }).join("") +
    '</tbody></table></div><div class="totals"><div class="qr">' + qrSvg + '</div><div class="sum"><span>الإجمالي قبل الضريبة</span><span>' + sar(d.totals.net) + "</span><span>ضريبة القيمة المضافة</span><span>" + sar(d.totals.vat) + '</span><span class="t">الإجمالي المستحق</span><span class="t">' + sar(d.totals.gross) + "</span></div></div>" +
    (d.reason ? '<p class="small"><b>سبب الإشعار:</b> ' + esc(d.reason) + "</p>" : "") + (d.notes ? '<p class="small">' + esc(d.notes) + "</p>" : "") +
    '<div class="stamp">UUID ' + d.uuid + " · ICV " + d.icv + "<br>Hash " + esc(d.hash) + "</div></div>";
  var side = '<div class="stack"><div class="card"><h3>حالة الهيئة</h3><div class="row">' + zatcaPill(d) + '<span class="pill info plain">محاكاة</span></div><p class="small muted">' + (d.zatca.status === "cleared" ? "اعتُمدت الفاتورة قبل تسليمها للعميل" : d.zatca.status === "reported" ? "تمت مشاركتها " + fmtDT(d.zatca.at) : "بتنشارك تلقائياً خلال ثواني (المهلة النظامية 24 ساعة)") + "</p>" + (d.zatca.warnings && d.zatca.warnings.length ? '<ul class="checks">' + d.zatca.warnings.map(function (w) { return '<li><span class="ic w">؟</span><span class="small">' + esc(w) + "</span></li>"; }).join("") + "</ul>" : "") +
    '<ul class="checks" style="margin-top:8px"><li><span class="ic ' + (hashOk ? "o" : "e") + '">' + (hashOk ? "✓" : "!") + '</span><span class="small">البصمة مطابقة لمحتوى XML</span></li><li><span class="ic ' + (sigOk ? "o" : "e") + '">' + (sigOk ? "✓" : "!") + '</span><span class="small">' + (sigOk ? "التوقيع الرقمي صحيح" : "التوقيع غير صحيح") + "</span></li></ul></div>";
  if (d.docType === "invoice") {
    side += '<div class="card"><h3>السداد</h3><div class="row" style="justify-content:space-between"><span class="pill ' + p.k + '">' + p.t + '</span><span class="small">المتبقي ' + sar(Math.max(0, bal)) + "</span></div>" + ((d.payments || []).length ? '<ul class="small" style="padding-inline-start:18px;margin:8px 0">' + d.payments.map(function (x) { return "<li>" + sar(x.amount) + " · " + esc(x.method) + " · " + fmtDate(x.at) + "</li>"; }).join("") + "</ul>" : "") +
      (bal > 0.004 ? '<div class="stack" style="gap:8px;margin-top:10px"><label class="f"><span>مبلغ الدفعة</span><input class="in num" id="payAmt" inputmode="decimal" value="' + ZE.f2(bal) + '"></label><label class="f"><span>طريقة الدفع</span><select class="in" id="payMethod"><option>تحويل بنكي</option><option>مدى</option><option>نقداً</option><option>Apple Pay</option></select></label><button class="btn" data-act="pay" data-id="' + id + '">تسجيل الدفعة</button></div>' : "") + "</div>";
  }
  var wa = "https://wa.me/" + (cust && cust.phone ? String(cust.phone).replace(/\D/g, "") : "") + "?text=" + encodeURIComponent((c ? c.nameAr : "") + "\n" + title[0] + " رقم " + d.number + "\nالإجمالي: " + money(d.totals.gross) + " ر.س" + (d.dueDate ? "\nتاريخ الاستحقاق: " + d.dueDate : ""));
  side += '<div class="card"><h3>إجراءات</h3><div class="stack" style="gap:8px"><button class="btn" data-act="dlxml" data-id="' + id + '">تنزيل ملف XML</button><a class="btn" href="' + esc(wa) + '" target="_blank" rel="noopener">إرسال عبر واتساب</a>' +
    (d.docType === "invoice" ? '<button class="btn" data-act="note" data-type="credit" data-id="' + id + '">إصدار إشعار دائن</button><button class="btn" data-act="note" data-type="debit" data-id="' + id + '">إصدار إشعار مدين</button>' : "") + '<button class="btn ghost" data-act="toggleXml">عرض XML</button></div><p class="small muted" style="margin-bottom:0">ما فيه تعديل أو حذف للمستند الصادر. هذا متطلب نظامي.</p></div>';
  side += '<div class="card"><h3>بيانات التشفير</h3><dl class="kv"><dt>UUID</dt><dd class="code">' + d.uuid + '</dd><dt>ICV</dt><dd class="num">' + d.icv + '</dd><dt>PIH</dt><dd class="code">' + esc(d.pih) + '</dd><dt>Hash</dt><dd class="code">' + esc(d.hash) + "</dd></dl></div></div>";
  $("#modal").innerHTML = '<div class="sheet" role="dialog" aria-modal="true" aria-label="' + esc(d.number) + '"><div class="sheet-head"><b class="num" style="font-size:1.05rem">' + esc(d.number) + "</b>" + zatcaPill(d) + '<span class="spacer" style="flex:1"></span><button class="btn" data-act="close" id="closeModal">إغلاق</button></div><div class="sheet-body"><div class="stack" style="min-width:0">' + paper + '<pre class="xml" id="xmlView" hidden>' + esc(d.xml) + "</pre></div>" + side + "</div></div>";
  $("#modal").hidden = false; S.openId = id;
  setTimeout(function () { var b = $("#closeModal"); if (b) b.focus(); }, 0);
}
function closeModal() { $("#modal").hidden = true; $("#modal").innerHTML = ""; S.openId = null; }

/* ----- customers & products ----- */
VIEWS.customers = function () {
  S.rendered = "customers";
  var cs = customers(), ed = S.editCust;
  var h = '<div class="grid" style="grid-template-columns:minmax(0,1fr) minmax(280px,380px);align-items:start"><div>';
  if (!cs.length) h += '<div class="card empty"><h3>ما أضفت عملاء للحين</h3><p>العميل في الفاتورة الضريبية يحتاج اسم ورقم ضريبي وعنوان وطني كامل.</p></div>';
  else h += '<div class="tbl"><table><thead><tr><th>العميل</th><th>الرقم الضريبي</th><th>المدينة</th><th>الرصيد المستحق</th><th></th></tr></thead><tbody>' + cs.map(function (x) {
    var bal = documents().filter(function (d) { return d.customerId === x.id && d.docType === "invoice"; }).reduce(function (s, d) { return s + Math.max(0, balanceOf(d)); }, 0);
    return "<tr><td>" + esc(x.name) + (x.type === "individual" ? ' <span class="pill plain">فرد</span>' : "") + '</td><td class="num">' + esc(x.vat || "—") + "</td><td>" + esc(x.city || "—") + "</td><td>" + sar(bal) + '</td><td><button class="btn ghost" data-act="editCust" data-id="' + x.id + '">تعديل</button></td></tr>';
  }).join("") + "</tbody></table></div>";
  h += "</div>" + entityForm("cust", ed, [["name", "اسم العميل", true], ["vat", "الرقم الضريبي (15 رقم)"], ["otherId", "السجل التجاري"], ["phone", "جوال (للواتساب)"], ["email", "البريد"], ["street", "الشارع"], ["building", "رقم المبنى (4 أرقام)"], ["district", "الحي"], ["city", "المدينة"], ["postal", "الرمز البريدي (5 أرقام)"]]) + "</div>";
  return h;
};
VIEWS.products = function () {
  S.rendered = "products";
  var ps = products(), ed = S.editProd;
  var h = '<div class="grid" style="grid-template-columns:minmax(0,1fr) minmax(280px,380px);align-items:start"><div>';
  if (!ps.length) h += '<div class="card empty"><h3>ما أضفت منتجات للحين</h3><p>أضف منتجاتك وخدماتك بأسعارها عشان تختارها بسرعة في الفاتورة.</p></div>';
  else h += '<div class="tbl"><table><thead><tr><th>المنتج أو الخدمة</th><th>السعر</th><th>الضريبة</th><th></th></tr></thead><tbody>' + ps.map(function (x) { return "<tr><td>" + esc(x.name) + "</td><td>" + sar(x.price) + "</td><td>" + ZE.CAT_NAMES[x.cat || "S"] + '</td><td><button class="btn ghost" data-act="editProd" data-id="' + x.id + '">تعديل</button></td></tr>'; }).join("") + "</tbody></table></div>";
  h += "</div>" + entityForm("prod", ed, [["name", "الاسم", true], ["price", "السعر قبل الضريبة", true], ["cat", "الضريبة"], ["reason", "سبب الإعفاء"]]) + "</div>";
  return h;
};
function entityForm(kind, id, fields) {
  var o = id ? S.docs[id] || {} : {};
  var h = '<form class="card" id="form-' + kind + '" data-kind="' + kind + '"><h2>' + (id ? "تعديل" : "إضافة") + (kind === "cust" ? " عميل" : " منتج أو خدمة") + '</h2><div class="stack" style="gap:10px">';
  if (kind === "cust") h += '<label class="f"><span>النوع</span><select class="in" id="cust-type" name="type"><option value="business"' + (o.type !== "individual" ? " selected" : "") + '>منشأة</option><option value="individual"' + (o.type === "individual" ? " selected" : "") + ">فرد</option></select></label>";
  fields.forEach(function (f) {
    if (f[0] === "cat") { h += '<label class="f"><span>الضريبة</span><select class="in" id="prod-cat" name="cat">' + ["S", "Z", "E", "O"].map(function (k) { return '<option value="' + k + '"' + ((o.cat || "S") === k ? " selected" : "") + ">" + ZE.CAT_NAMES[k] + "</option>"; }).join("") + "</select></label>"; return; }
    if (f[0] === "reason") { h += '<label class="f"><span>سبب الإعفاء (إذا غير خاضع 15%)</span><select class="in" id="prod-reason" name="reason"><option value="">—</option>' + Object.keys(ZE.EXEMPTIONS).map(function (k) { return '<option value="' + k + '"' + (o.reason === k ? " selected" : "") + ">" + ZE.EXEMPTIONS[k] + "</option>"; }).join("") + "</select></label>"; return; }
    h += '<label class="f"><span' + (f[2] ? ' class="req"' : "") + ">" + f[1] + '</span><input class="in" id="' + kind + "-" + f[0] + '" name="' + f[0] + '" value="' + esc(o[f[0]] == null ? "" : o[f[0]]) + '"' + (f[2] ? " required" : "") + "></label>";
  });
  h += '<div class="row"><button class="btn primary" type="submit">حفظ</button>' + (id ? '<button class="btn" type="button" data-act="cancelEdit">إلغاء</button>' : "") + '</div><p class="small muted" id="' + kind + '-msg"></p></div></form>';
  return h;
}

/* ----- reports ----- */
VIEWS.reports = function () {
  var per = S.ui.period, v = vatSummary(per), docs = documents();
  var seg = '<div class="seg" role="group">' + [["month", "هذا الشهر"], ["quarter", "هذا الربع"], ["year", "هذه السنة"]].map(function (o) { return '<button type="button" data-act="period" data-v="' + o[0] + '" aria-pressed="' + (per === o[0]) + '">' + o[1] + "</button>"; }).join("") + "</div>";
  var h = '<div class="row" style="justify-content:space-between;margin-bottom:14px">' + seg + '<button class="btn" data-act="csv">تصدير CSV</button></div>';
  h += '<div class="grid g2"><div class="card"><h2>مسودة إقرار ضريبة القيمة المضافة (المبيعات)</h2><div class="tbl"><table><thead><tr><th>البند</th><th>المبلغ</th><th>الضريبة</th></tr></thead><tbody>' +
    "<tr><td>المبيعات الخاضعة للنسبة الأساسية 15%</td><td>" + sar(v.rows.S.base) + "</td><td>" + sar(v.rows.S.vat) + "</td></tr>" +
    "<tr><td>المبيعات الخاضعة للنسبة الصفرية</td><td>" + sar(v.rows.Z.base) + "</td><td>" + sar(0) + "</td></tr>" +
    "<tr><td>المبيعات المعفاة</td><td>" + sar(v.rows.E.base) + "</td><td>" + sar(0) + "</td></tr>" +
    "<tr><td>خارج نطاق الضريبة</td><td>" + sar(v.rows.O.base) + "</td><td>" + sar(0) + "</td></tr>" +
    "<tr><td>تعديلات (إشعارات دائنة)</td><td>" + sar(v.adj.base) + "</td><td>" + sar(v.adj.vat) + "</td></tr>" +
    '<tr><td><b>إجمالي ضريبة المخرجات</b></td><td></td><td><b>' + sar(v.outputVat) + "</b></td></tr></tbody></table></div>" +
    '<p class="small muted">مبني على ' + v.count + " مستند صادر في الفترة. المشتريات وضريبة المدخلات تنضاف في وحدة المشتريات. راجع الأرقام مع محاسبك قبل تقديم الإقرار.</p></div>";
  var buckets = [0, 0, 0, 0], today = Date.parse(riyadhNow().date);
  docs.forEach(function (d) { if (d.docType !== "invoice") return; var b = balanceOf(d); if (b <= 0.004) return; var age = Math.floor((today - Date.parse(d.dueDate || d.issueDate)) / 864e5); buckets[age <= 0 ? 0 : age <= 30 ? 1 : age <= 60 ? 2 : 3] += b; });
  var labels = ["لم تستحق", "متأخرة 1–30 يوم", "متأخرة 31–60 يوم", "متأخرة أكثر من 60 يوم"], mx = Math.max.apply(null, buckets.concat([1]));
  h += '<div class="card"><h2>أعمار الذمم المدينة</h2><div class="bars">' + buckets.map(function (b, i) { return '<div class="bar"><span>' + labels[i] + '</span><span class="num">' + money(b) + '</span><div class="track"><div class="fill" style="width:' + (b ? Math.max(3, b / mx * 100) : 0) + "%;" + (i >= 2 ? "background:var(--bad)" : i === 1 ? "background:var(--gold)" : "") + '"></div></div></div>'; }).join("") + "</div></div></div>";
  return h;
};

/* ----- audit ----- */
VIEWS.audit = function () {
  var en = auditEntries();
  var NAMES = { "account.signup": "إنشاء الحساب", "doc.issue": "إصدار مستند", "zatca.report": "مشاركة مع الهيئة", "egs.onboard": "تسجيل وحدة إصدار", "company.save": "تعديل بيانات المنشأة", "cust.save": "حفظ عميل", "prod.save": "حفظ منتج", "pay.add": "تسجيل دفعة", "demo.load": "بيانات تجريبية", "chain.check": "فحص السلسلة" };
  return '<div class="notice info" style="margin-bottom:14px">كل عملية في النظام تنسجل هنا بطابع زمني، والسجل ما يقبل التعديل من واجهة النظام (متطلب الهيئة: منع العبث بالسجلات).</div>' +
    (en.length ? '<div class="tbl"><table><thead><tr><th>الوقت</th><th>العملية</th><th>التفاصيل</th></tr></thead><tbody>' + en.slice(0, 300).map(function (e) { return "<tr><td>" + fmtDT(e.t) + "</td><td>" + esc(NAMES[e.a] || e.a) + '</td><td class="wrap-cell">' + esc(e.d) + "</td></tr>"; }).join("") + "</tbody></table></div>" : '<div class="card empty"><h3>السجل فاضي</h3><p>أول عملية تسويها بتظهر هنا.</p></div>');
};

/* ----- plans ----- */
VIEWS.plans = function () {
  var y = S.ui.yearly;
  var P = [
    ["انطلاقة", 59, "للمنشآت الصغيرة في الموجة 25", ["فواتير وإشعارات بلا حد", "مستخدمين اثنين، ووحدة إصدار وحدة", "عملاء ومنتجات بلا حد", "رابط دفع في الفاتورة", "30 عملية ذكاء اصطناعي شهرياً", "أرشفة 6 سنوات"]],
    ["نمو", 129, "للشركات اللي تبيع وتشتري", ["كل ميزات انطلاقة", "5 مستخدمين وفرعين", "مشتريات ومصروفات", "فواتير متكررة واشتراكات", "واتساب وتذكيرات تحصيل", "سلة وزد وووكومرس", "200 عملية ذكاء اصطناعي"]],
    ["احترافي", 249, "للمنشآت اللي تبي نظام متكامل", ["كل ميزات نمو", "15 مستخدم و5 فروع", "مخزون ومستودعات", "وحدة الأقساط وبوابة العميل", "واجهة برمجية API", "ذكاء اصطناعي بلا حد (استخدام معقول)", "بوابة المحاسب"]],
    ["مؤسسات", 599, "للمجموعات وأنظمة ERP", ["كل ميزات احترافي", "مستخدمين وفروع بلا حد", "شركات متعددة ومجموعة ضريبية", "دخول موحد SSO", "اتفاقية خدمة 99.9%", "مدير حساب خاص"]]
  ];
  return '<div class="row" style="justify-content:space-between;margin-bottom:14px"><p class="muted" style="margin:0">أنت في <b>التجربة المجانية</b> (14 يوم، بدون بطاقة). الأسعار بالريال قبل ضريبة القيمة المضافة.</p><div class="seg" role="group"><button type="button" data-act="yearly" data-v="0" aria-pressed="' + !y + '">شهري</button><button type="button" data-act="yearly" data-v="1" aria-pressed="' + !!y + '">سنوي · شهرين مجاناً</button></div></div>' +
    '<div class="grid g4">' + P.map(function (p, i) { return '<div class="card plan' + (i === 1 ? " hot" : "") + '"><div class="row" style="justify-content:space-between"><h2 style="margin:0">' + p[0] + "</h2>" + (i === 1 ? '<span class="pill acc plain">الأكثر طلباً</span>' : "") + '</div><p class="small muted" style="margin:0">' + p[2] + '</p><div class="price">' + (y ? (p[1] * 10).toLocaleString("en-US") : p[1]) + '</div><div class="small muted">' + (y ? "ريال / سنة" : "ريال / شهر") + (i === 3 ? " · يبدأ من" : "") + "</div><ul>" + p[3].map(function (f) { return "<li>" + f + "</li>"; }).join("") + '</ul><button class="btn' + (i === 1 ? " primary" : "") + '" data-act="subscribe" data-v="' + p[0] + '" style="margin-top:auto">اختر ' + p[0] + "</button></div>"; }).join("") + "</div>" +
    '<p class="small muted" style="margin-top:12px">الدفع الإلكتروني (مدى وApple Pay وSTC Pay) يتفعّل بعد ربط بوابة الدفع باسم الشركة.</p>';
};

/* ----- company & onboarding ----- */
VIEWS.company = function () {
  S.rendered = "company";
  var c = company() || {}, e = egs(), errs = ZE.validateCompany(c);
  var F = [["nameAr", "اسم المنشأة بالعربي", true], ["nameEn", "الاسم بالإنجليزي"], ["vat", "الرقم الضريبي (15 رقم)", true], ["cr", "السجل التجاري (10 أرقام)", true], ["street", "الشارع", true], ["building", "رقم المبنى (4 أرقام)", true], ["district", "الحي", true], ["city", "المدينة", true], ["postal", "الرمز البريدي (5 أرقام)", true], ["phone", "الهاتف"], ["email", "البريد الإلكتروني"]];
  var h = '<div class="grid g2" style="align-items:start"><form class="card" id="form-company"><h2>بيانات المنشأة</h2><p class="small muted">تظهر في كل فاتورة وفي شهادة التشفير. لازم تطابق بياناتك في الهيئة.</p><div class="fgrid">' +
    F.map(function (f) { return '<label class="f"><span' + (f[2] ? ' class="req"' : "") + ">" + f[1] + '</span><input class="in" id="co-' + f[0] + '" name="' + f[0] + '" value="' + esc(c[f[0]] || "") + '"></label>'; }).join("") +
    '</div><div class="row" style="margin-top:14px"><button class="btn primary" type="submit">حفظ البيانات</button>' + (company() ? "" : '<button class="btn" type="button" data-act="demo">أو جرّب ببيانات تجريبية</button>') + '</div><ul class="checks" id="co-errs" style="margin-top:12px">' + (company() ? errs.map(function (x) { return '<li><span class="ic e">!</span><span class="small">' + esc(x.msg) + "</span></li>"; }).join("") : "") + "</ul></form>";
  h += '<div class="stack"><div class="card"><h2>الربط مع منصة فاتورة</h2>';
  var ob = S.onboarding;
  if (ob && ob.done < 5 && !ob.error) {
    h += '<ul class="steps">' + ob.steps.map(function (s, i) { return '<li><span class="ic ' + (i < ob.done ? "o" : "p") + '" style="width:22px;height:22px;border-radius:50%;display:grid;place-items:center;font-size:.72rem;flex:none">' + (i < ob.done ? "✓" : i + 1) + "</span><span>" + s + "</span></li>"; }).join("") + "</ul>";
  } else if (e) {
    h += '<div class="notice ok"><b>الربط مفعّل.</b> وحدة الإصدار مسجلة وتقدر تصدر فواتير.</div><dl class="kv" style="margin-top:12px"><dt>الرقم التسلسلي</dt><dd class="code">' + esc(e.serial) + "</dd><dt>تاريخ التسجيل</dt><dd>" + fmtDT(e.onboardedAt) + "</dd><dt>صلاحية الشهادة</dt><dd>" + fmtDate(e.expiresAt) + '</dd><dt>المفتاح العام</dt><dd class="code">' + esc(e.pubX.slice(0, 24)) + '…</dd><dt>المفتاح الخاص</dt><dd>محفوظ ولا يُعرض</dd></dl>';
    if (ob && ob.checks) h += '<h3 style="margin-top:14px">نتيجة فحوصات الامتثال</h3><ul class="checks">' + ob.checks.map(function (k) { return '<li><span class="ic ' + (k.ok ? "o" : "e") + '">' + (k.ok ? "✓" : "!") + "</span><span>" + esc(k.name) + "</span></li>"; }).join("") + "</ul>";
    h += '<details style="margin-top:12px"><summary class="small">تجديد الشهادة</summary><div class="row" style="margin-top:8px"><input class="in num" id="otp" inputmode="numeric" maxlength="6" placeholder="رمز OTP" style="width:140px"><button class="btn" data-act="onboard">تجديد</button></div><p class="small muted">التجديد يولّد مفتاح جديد ويكمّل نفس سلسلة الفواتير.</p></details>';
  } else {
    if (ob && ob.error) h += '<div class="notice bad">ما اكتمل التسجيل: ' + esc(ob.error) + "</div>";
    h += '<ol class="small" style="padding-inline-start:20px"><li>ادخل على بوابة فاتورة (fatoora.zatca.gov.sa) بحساب منشأتك</li><li>اختر «تسجيل وحدة حل جديدة» وولّد رمز OTP</li><li>الصق الرمز هنا خلال ساعة من توليده</li></ol>' +
      (errs.length ? '<div class="notice warn">كمّل بيانات المنشأة أول (' + errs.length + " ملاحظة).</div>" : "") +
      '<div class="row" style="margin-top:10px"><label class="f"><span>رمز OTP (6 أرقام)</span><input class="in num" id="otp" inputmode="numeric" maxlength="6" placeholder="123456" style="width:160px"></label><button class="btn primary" data-act="onboard" style="align-self:end"' + (errs.length ? " disabled" : "") + '>سجّل وحدة الإصدار</button></div><p class="small muted">في بيئة المحاكاة أي 6 أرقام تشتغل. المفاتيح والتواقيع حقيقية، والشهادة صادرة من جهة محاكاة.</p>';
  }
  h += "</div>";
  h += '<div class="card"><h3>إعادة ضبط بيئة المحاكاة</h3><p class="small muted">تمسح كل البيانات في هذي البيئة عشان تبدأ من جديد. في بيئة الإنتاج ما فيه حذف للفواتير أبداً.</p>' + (S.confirmReset ? '<div class="row"><button class="btn danger" data-act="doReset">امسح كل بيانات المحاكاة</button><button class="btn" data-act="noReset">رجوع</button></div>' : '<button class="btn danger" data-act="askReset"' + (Object.keys(S.docs).length ? "" : " disabled") + ">إعادة الضبط</button>") + "</div></div></div>";
  return h;
};

/* ----- assistant ----- */
VIEWS.assistant = function () {
  S.rendered = "assistant";
  if (S.sample === null) return '<div class="card empty"><h3>المساعد الذكي غير متاح هنا</h3><p>افتح الصفحة داخل Claude وأنت مسجل دخول عشان يشتغل المساعد.</p></div>';
  var h = '<div class="card" style="max-width:860px"><div class="chat" id="chat">';
  if (!S.chat.length) h += '<div class="msg a">هلا! أنا مساعدك المالي في زيمارا. أقدر أقرأ فواتيرك وعملاءك وأحسب لك الضريبة، وأجهز لك مسودات فواتير. وش تبي تعرف؟</div>';
  S.chat.forEach(function (m) { h += '<div class="msg ' + (m.role === "user" ? "u" : m.role === "tool" ? "tool" : "a") + '">' + esc(m.content) + "</div>"; });
  if (S.chatBusy) h += '<div class="msg a" id="streaming">' + esc(S.streamText || "أفكر…") + "</div>";
  h += "</div>";
  if (S.pendingDraft) h += '<div class="notice ok" style="margin-top:12px">جهزت لك مسودة فاتورة. <button class="btn primary" data-act="openDraft">افتح المسودة وراجعها</button></div>';
  if (!S.chat.length) h += '<div class="chips" style="margin-top:14px">' + ["كم الضريبة المستحقة علي هذا الربع؟", "مين العملاء المتأخرين بالسداد؟", "لخص لي مبيعات هذا الشهر", "جهز فاتورة لأكبر عميل بساعتين استشارة"].map(function (q) { return '<button class="chip" data-act="ask" data-q="' + esc(q) + '">' + esc(q) + "</button>"; }).join("") + "</div>";
  h += '<form id="chatForm" class="row" style="margin-top:14px;align-items:stretch"><input class="in" id="chatIn" placeholder="اكتب سؤالك…" style="flex:1;min-width:200px"' + (S.chatBusy ? " disabled" : "") + '><button class="btn primary" type="submit"' + (S.chatBusy ? " disabled" : "") + ">إرسال</button></form></div>";
  return h;
};
function scrollChat() { var c = $("#chat"); if (c) c.lastElementChild && c.lastElementChild.scrollIntoView({ block: "nearest" }); }

/* ---------- AI ---------- */
function ctxCustomers() { return customers().map(function (c) { return { id: c.id, name: c.name, vat: c.vat || "", type: c.type || "business" }; }); }
function ctxProducts() { return products().map(function (p) { return { id: p.id, name: p.name, price: p.price, cat: p.cat || "S", reason: p.reason || "" }; }); }
function applyAiDraft(r) {
  var d = newDraft();
  if (r.kind === "simplified" || r.kind === "standard") d.kind = r.kind;
  if (r.customerId && S.docs[r.customerId]) d.customerId = r.customerId;
  var lines = Array.isArray(r.lines) ? r.lines : [];
  d.lines = lines.slice(0, 30).map(function (l) {
    var p = l.productId && S.docs[l.productId] ? S.docs[l.productId] : null;
    var cat = ["S", "Z", "E", "O"].indexOf(l.cat) > -1 ? l.cat : (p ? p.cat || "S" : "S");
    return { productId: p ? l.productId : "", name: String(l.name || (p ? p.name : "")), qty: Number(l.qty) > 0 ? Number(l.qty) : 1, price: l.price != null && l.price !== "" ? Number(l.price) : (p ? p.price : ""), discount: Number(l.discount) > 0 ? Number(l.discount) : 0, cat: cat, reason: cat !== "S" ? (l.reason || (p && p.reason) || "") : "", unit: p ? p.unit || "PCE" : "PCE" };
  });
  if (!d.lines.length) d.lines = [blankLine()];
  if (r.notes) d.notes = String(r.notes);
  return d;
}
async function aiFill() {
  var txt = ($("#aiText") || {}).value || ""; if (!txt.trim() || !S.sample) return;
  var btn = $("#aiFillBtn"), note = $("#aiNote"); btn.disabled = true; note.textContent = "أجهز المسودة…";
  var prompt = "أنت مساعد فوترة سعودي داخل نظام زيمارا. حوّل طلب المستخدم إلى مسودة فاتورة.\nالعملاء المتاحين (JSON): " + JSON.stringify(ctxCustomers()) + "\nالمنتجات المتاحة (JSON): " + JSON.stringify(ctxProducts()) +
    '\nرد بـ JSON فقط بهذا الشكل: {"kind":"standard أو simplified","customerId":"معرّف العميل من القائمة أو فاضي","customerName":"اسم العميل إذا ما لقيته في القائمة","lines":[{"productId":"معرّف المنتج أو فاضي","name":"","qty":1,"price":0,"discount":0,"cat":"S|Z|E|O"}],"notes":""}\n' +
    "القواعد: الفاتورة الضريبية (standard) للمنشآت، والمبسطة (simplified) للأفراد أو البيع النقدي. استخدم سعر المنتج من القائمة إذا المستخدم ما حدد سعر. الأسعار قبل الضريبة. الخصم مبلغ بالريال على البند.\nطلب المستخدم: " + txt;
  try {
    var r = await S.sample.json(prompt, { modelTier: "default" });
    S.draft = applyAiDraft(r || {});
    S.confirmIssue = false;
    renderView();
    var n = $("#aiNote"); if (n) n.textContent = (r && r.customerName && !r.customerId ? "ما لقيت العميل «" + r.customerName + "» في القائمة. أضفه من صفحة العملاء. " : "") + "جهزت المسودة. راجع البنود قبل الإصدار.";
  } catch (e) {
    note.textContent = e && e.code === "not_granted" ? "ما انسمح للمساعد بالعمل. فعّله من صلاحيات الصفحة." : e && e.code === "rate_limited" ? "وصلت حد الاستخدام مؤقتاً. حاول بعد شوي." : "ما قدرت أفهم الطلب. جرّب تكتبه بتفاصيل أكثر.";
    btn.disabled = false;
  }
}
async function aiExplain() {
  var el = $("#aiExplain"); if (!el || !S.sample) return;
  var issues = currentIssues(); el.textContent = "…";
  try {
    var r = await S.sample("أنت خبير فوترة إلكترونية سعودية. اشرح للمستخدم بلهجة سعودية بسيطة وباختصار (نقاط قصيرة) وش يعني كل خطأ وكيف يصلحه في الشاشة. لا تستخدم Markdown.\nالأخطاء: " + JSON.stringify(issues.map(function (x) { return x.code + ": " + x.msg; })), { modelTier: "quick", onText: function (u) { el.textContent = u.text; } });
    el.textContent = r.text;
  } catch (e) { el.textContent = "ما قدرت أجيب الشرح الحين."; }
}
var AI_TOOLS = function () {
  return [
    { name: "get_overview", description: "يرجع ملخص المنشأة: المبيعات هذا الشهر، المستحقات غير المحصلة، عدد المستندات، حالة الربط مع الهيئة.", execute: function () {
      var docs = documents(), n = riyadhNow();
      return { company: company() ? company().nameAr : null, linked: !!egs(), docs: docs.length, salesThisMonth: ZE.r2(docs.filter(function (d) { return d.issueDate.slice(0, 7) === n.ym; }).reduce(function (s, d) { return s + (d.docType === "credit" ? -d.totals.gross : d.totals.gross); }, 0)), unpaid: ZE.r2(docs.filter(function (d) { return d.docType === "invoice"; }).reduce(function (s, d) { return s + Math.max(0, balanceOf(d)); }, 0)), today: n.date };
    } },
    { name: "list_documents", description: "يرجع قائمة المستندات (الأحدث أولاً) مع العميل والإجمالي وحالة السداد وحالة الهيئة. فلتر اختياري: status = unpaid أو overdue أو all.", inputSchema: { type: "object", properties: { status: { type: "string", enum: ["all", "unpaid", "overdue"] }, limit: { type: "number" } } }, execute: function (i) {
      var st = String(i.status || "all"), lim = Math.min(50, Number(i.limit) || 20);
      return documents().filter(function (d) { var p = payState(d); if (st === "unpaid") return p && p.k !== "ok"; if (st === "overdue") return p && p.k === "bad"; return true; }).slice(0, lim).map(function (d) { var p = payState(d); return { number: d.number, type: docLabel(d), customer: d.customerSnap ? d.customerSnap.name : "عميل نقدي", gross: d.totals.gross, vat: d.totals.vat, balance: d.docType === "invoice" ? balanceOf(d) : 0, payment: p ? p.t : null, dueDate: d.dueDate, zatca: d.zatca.status }; });
    } },
    { name: "get_vat_summary", description: "يحسب ملخص ضريبة القيمة المضافة على المبيعات للفترة: month أو quarter أو year.", inputSchema: { type: "object", properties: { period: { type: "string", enum: ["month", "quarter", "year"] } } }, execute: function (i) { var v = vatSummary(["month", "quarter", "year"].indexOf(i.period) > -1 ? i.period : "quarter"); return { standardBase: v.rows.S.base, standardVat: v.rows.S.vat, zeroRated: v.rows.Z.base, exempt: v.rows.E.base, creditAdjustVat: v.adj.vat, totalOutputVat: v.outputVat, documents: v.count }; } },
    { name: "list_customers_products", description: "يرجع العملاء (id, name) والمنتجات (id, name, price, cat). استخدمه قبل تجهيز مسودة.", execute: function () { return { customers: ctxCustomers(), products: ctxProducts() }; } },
    { name: "prepare_invoice_draft", description: "يجهز مسودة فاتورة (ما يصدرها). المستخدم يراجعها ويصدرها بنفسه. kind: standard للمنشآت أو simplified للأفراد. lines: بنود فيها productId اختياري و name و qty و price (قبل الضريبة) و cat.", inputSchema: { type: "object", properties: { kind: { type: "string", enum: ["standard", "simplified"] }, customerId: { type: "string" }, lines: { type: "array", items: { type: "object", properties: { productId: { type: "string" }, name: { type: "string" }, qty: { type: "number" }, price: { type: "number" }, cat: { type: "string" } } } }, notes: { type: "string" } }, required: ["lines"] }, execute: function (i) { S.pendingDraft = applyAiDraft(i); return "تم تجهيز المسودة. قل للمستخدم يضغط زر «افتح المسودة» ويراجعها قبل الإصدار."; } }
  ];
};
async function ask(q) {
  if (!q.trim() || S.chatBusy || !S.sample) return;
  S.chat.push({ role: "user", content: q }); S.chatBusy = true; S.streamText = ""; renderView();
  var intro = "أنت المساعد المالي داخل نظام زيمارا للفوترة الإلكترونية السعودية. تكلم بلهجة سعودية مهذبة وواضحة وباختصار، بدون Markdown. استخدم الأدوات لقراءة بيانات المستخدم الحقيقية ولا تخترع أرقام. المبالغ بالريال السعودي. لا تصدر فواتير، فقط جهز مسودات بأداة prepare_invoice_draft. إذا سُئلت عن أمور نظامية، اذكر أن المرجع هو هيئة الزكاة والضريبة والجمارك.\n\n";
  var msgs = S.chat.filter(function (m) { return m.role === "user" || m.role === "assistant"; }).map(function (m, i) { return { role: m.role, content: i === 0 ? intro + m.content : m.content }; });
  try {
    var r = await S.sample(msgs, { tools: AI_TOOLS(), cache: false, onText: function (u) { S.streamText = u.text; var el = $("#streaming"); if (el) { el.textContent = u.text; scrollChat(); } } });
    S.chat.push({ role: "assistant", content: r.text || "تم." });
  } catch (e) {
    S.chat.push({ role: "assistant", content: e && e.code === "rate_limited" ? "وصلت حد الاستخدام مؤقتاً. حاول بعد شوي." : e && e.code === "not_granted" ? "ما انسمح للمساعد بالعمل. فعّله من صلاحيات الصفحة." : "صار خطأ وما قدرت أكمل. حاول مرة ثانية." });
  }
  S.chatBusy = false; S.streamText = ""; renderView();
  var inp = $("#chatIn"); if (inp) inp.focus();
}

/* ---------- export ---------- */
async function saveFile(name, data) {
  if (S.dl) { try { await S.dl.save({ filename: name, data: data }); toast("تم حفظ الملف"); return; } catch (e) { if (e && e.code === "cancelled") return; } }
  toast("التنزيل غير متاح هنا. استخدم «عرض XML» وانسخ المحتوى", "bad");
}

/* ---------- events ---------- */
document.addEventListener("click", function (ev) {
  var t = ev.target.closest("[data-act]"); if (!t) { if (ev.target.id === "modal") closeModal(); return; }
  var act = t.getAttribute("data-act"), id = t.getAttribute("data-id");
  switch (act) {
    case "demoSignup":
      t.disabled = true;
      put("account", { name: "مستخدم تجريبي", termsVersion: "2026-11", termsAt: new Date().toISOString(), createdAt: new Date().toISOString(), demo: true })
        .then(function () { $("#welcome").hidden = true; $("#welcome").innerHTML = ""; return loadDemo(); })
        .catch(function (e) { toast(e.message || "تعذر التحميل", "bad"); }); break;
    case "demo": t.disabled = true; loadDemo().catch(function (e) { toast(e.message || "تعذر التحميل", "bad"); }); break;
    case "open": openDoc(id); break;
    case "close": closeModal(); break;
    case "toggleXml": var x = $("#xmlView"); x.hidden = !x.hidden; t.textContent = x.hidden ? "عرض XML" : "إخفاء XML"; break;
    case "dlxml": var dd = S.docs[id]; saveFile(company().vat + "_" + dd.issueDate.replace(/-/g, "") + "T" + dd.issueTime.replace(/:/g, "") + "_" + dd.number + ".xml", dd.xml); break;
    case "pay":
      var amt = ZE.r2(Number(($("#payAmt") || {}).value)), bal = balanceOf(Object.assign({ id: id }, S.docs[id]));
      if (!(amt > 0) || amt > bal + 0.004) { toast("المبلغ لازم يكون أكبر من صفر وما يتجاوز المتبقي", "bad"); break; }
      var body = clone(S.docs[id]); body.payments = (body.payments || []).concat([{ amount: amt, method: $("#payMethod").value, at: new Date().toISOString() }]);
      put(id, body).then(function () { return audit("pay.add", body.number + " · " + money(amt) + " ر.س"); }); openDoc(id); renderView(); toast("تم تسجيل الدفعة"); break;
    case "note":
      var src = Object.assign({ id: id }, S.docs[id]);
      S.draft = { docType: t.getAttribute("data-type"), kind: src.kind, customerId: src.customerId, supplyDate: riyadhNow().date, dueDate: "", payMeans: src.payMeans, notes: "", reason: "", refId: id, lines: src.lines.map(function (l) { return clone(l); }) };
      S.confirmIssue = false; closeModal(); go("new"); break;
    case "cancelNote": S.draft = null; renderView(); break;
    case "filter": S.ui[t.getAttribute("data-k")] = t.getAttribute("data-v"); renderView(); break;
    case "period": S.ui.period = t.getAttribute("data-v"); renderView(); break;
    case "yearly": S.ui.yearly = t.getAttribute("data-v") === "1"; renderView(); break;
    case "subscribe": toast("الاشتراك في باقة «" + t.getAttribute("data-v") + "» يتفعّل بعد ربط بوابة الدفع. أنت حالياً في التجربة المجانية"); break;
    case "kind": S.draft.kind = t.getAttribute("data-v"); if (S.draft.kind === "simplified") S.draft.payMeans = "10"; S.confirmIssue = false; renderView(); break;
    case "addLine": S.draft.lines.push(blankLine()); refreshLines(); refreshNewSide(); break;
    case "rmLine": S.draft.lines.splice(Number(t.getAttribute("data-i")), 1); refreshLines(); refreshNewSide(); break;
    case "askIssue": S.confirmIssue = true; refreshNewSide(); break;
    case "noIssue": S.confirmIssue = false; refreshNewSide(); break;
    case "doIssue":
      t.disabled = true;
      issue(S.draft).then(function (nid) { S.draft = null; S.confirmIssue = false; go("invoices", function () { openDoc(nid); }); toast("تم إصدار المستند وتوقيعه"); })
        .catch(function (e) { S.confirmIssue = false; refreshNewSide(); toast(e.message, "bad"); }); break;
    case "aiFill": aiFill(); break;
    case "aiExplain": aiExplain(); break;
    case "editCust": S.editCust = id; renderView(); break;
    case "editProd": S.editProd = id; renderView(); break;
    case "cancelEdit": S.editCust = null; S.editProd = null; renderView(); break;
    case "onboard":
      var otp = ($("#otp") || {}).value || "";
      if (!/^\d{6}$/.test(otp)) { toast("رمز OTP لازم يكون 6 أرقام", "bad"); break; }
      runOnboarding(otp); break;
    case "chain":
      var e1 = egs(); S.chainResult = verifyChain(documents().slice().reverse(), e1); audit("chain.check", S.chainResult.ok ? "السلسلة سليمة (" + S.chainResult.checked + ")" : "مشاكل: " + S.chainResult.problems.length); renderView(); break;
    case "tamper":
      var asc = documents().slice().reverse(); if (!asc.length) { toast("أصدر فاتورة أول عشان نختبر"); break; }
      var tgt = asc[Math.floor(asc.length / 2)], r = verifyChain(asc, egs(), tgt.icv); r.tamper = true; r.target = tgt.number; S.chainResult = r; renderView(); break;
    case "askReset": S.confirmReset = true; renderView(); break;
    case "noReset": S.confirmReset = false; renderView(); break;
    case "doReset": S.confirmReset = false; t.disabled = true; resetAll(); break;
    case "ask": ask(t.getAttribute("data-q")); break;
    case "openDraft": S.draft = S.pendingDraft; S.pendingDraft = null; S.confirmIssue = false; go("new"); break;
    case "csv":
      var rows = [["number", "type", "customer", "issue_date", "net", "vat", "gross", "zatca_status"]].concat(documents().filter(function (d) { return inPeriod(d.issueDate, S.ui.period); }).map(function (d) { return [d.number, docLabel(d), d.customerSnap ? d.customerSnap.name : "عميل نقدي", d.issueDate, d.totals.net, d.totals.vat, (d.docType === "credit" ? -1 : 1) * d.totals.gross, d.zatca.status]; }));
      saveFile("zimara-sales-" + S.ui.period + ".csv", "﻿" + rows.map(function (r) { return r.map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(","); }).join("\n")); break;
  }
});
document.addEventListener("keydown", function (ev) {
  if (ev.key === "Escape" && !$("#modal").hidden) closeModal();
  if (ev.key === "Enter" && ev.target.matches && ev.target.matches("tr.click")) openDoc(ev.target.getAttribute("data-id"));
});
document.addEventListener("input", function (ev) {
  var t = ev.target;
  if (t.getAttribute("data-f") === "search") { S.ui.q = t.value; var pos = t.selectionStart; renderView(); var q = $("#q"); if (q) { q.focus(); try { q.setSelectionRange(pos, pos); } catch (e) {} } return; }
  if (!S.draft) return;
  var f = t.getAttribute("data-f");
  if (f) { S.draft[f] = t.value; S.confirmIssue = false; refreshNewSide(); return; }
  var l = t.getAttribute("data-l");
  if (l) {
    var i = Number(t.closest(".line").getAttribute("data-i")), ln = S.draft.lines[i];
    ln[l] = t.value; S.confirmIssue = false;
    if (l === "name") { var p = products().filter(function (x) { return x.name === t.value; })[0]; if (p) { ln.productId = p.id; ln.price = p.price; ln.cat = p.cat || "S"; ln.reason = p.reason || ""; ln.unit = p.unit || "PCE"; refreshLines(); } else ln.productId = ""; }
    if (l === "cat") refreshLines(); else { var lt = ZE.totals(normLines(S.draft.lines)).lines[i], row = t.closest(".line").querySelector(".lt"); if (row && lt) row.innerHTML = "<span>الصافي " + sar(lt.net) + "</span><span>الضريبة " + sar(lt.vat) + "</span><span>الإجمالي " + sar(lt.gross) + "</span>"; }
    refreshNewSide();
  }
});
document.addEventListener("change", function (ev) {
  if (ev.target.getAttribute("data-f") === "customerId" && S.draft) { S.draft.customerId = ev.target.value; refreshNewSide(); }
});
document.addEventListener("submit", function (ev) {
  ev.preventDefault();
  var f = ev.target, data = {};
  Array.prototype.forEach.call(f.elements, function (el) { if (el.name) data[el.name] = el.value.trim(); });
  if (f.id === "form-company") {
    var prev = company() || { createdAt: new Date().toISOString() };
    var next = Object.assign({}, prev, data);
    if (egs() && (prev.vat !== next.vat)) { toast("ما تقدر تغيّر الرقم الضريبي بعد تسجيل وحدة الإصدار", "bad"); return; }
    put("company", next).then(function () { return audit("company.save", "تحديث بيانات المنشأة"); });
    toast(ZE.validateCompany(next).length ? "انحفظت البيانات، وفيه ملاحظات لازم تكمّلها" : "انحفظت بيانات المنشأة"); renderView(true); return;
  }
  if (f.id === "signupForm") { createAccount(f).catch(function () { toast("ما قدرت أنشئ الحساب. حاول مرة ثانية", "bad"); }); return; }
  if (f.id === "chatForm") { var inp = $("#chatIn"); var q = inp.value; inp.value = ""; ask(q); return; }
  var kind = f.getAttribute("data-kind");
  if (kind === "cust") {
    if (!data.name) { $("#cust-msg").textContent = "اسم العميل مطلوب"; return; }
    if (data.vat && !/^3\d{13}3$/.test(data.vat)) { $("#cust-msg").textContent = "الرقم الضريبي لازم 15 رقم يبدأ وينتهي بـ 3"; return; }
    var cid = S.editCust || "c_" + rid(); put(cid, data).then(function () { return audit("cust.save", data.name); }); S.editCust = null; toast("انحفظ العميل"); renderView(true); return;
  }
  if (kind === "prod") {
    if (!data.name || !(Number(data.price) >= 0) || data.price === "") { $("#prod-msg").textContent = "الاسم والسعر مطلوبين"; return; }
    if (data.cat !== "S" && !data.reason) { $("#prod-msg").textContent = "اختر سبب الإعفاء"; return; }
    data.price = ZE.r2(Number(data.price)); var pid = S.editProd || "p_" + rid(); put(pid, data).then(function () { return audit("prod.save", data.name); }); S.editProd = null; toast("انحفظ المنتج"); renderView(true);
  }
});
window.addEventListener("hashchange", function () { closeModal(); S.confirmReset = false; S.rendered = null; renderView(); window.scrollTo(0, 0); var a = S.after; S.after = null; if (a) a(); });

/* ---------- boot ---------- */
function afterData() { S.rendered = null; onData(); processQueue(); }
async function boot() {
  renderView();
  if (!window.claude || typeof window.claude.use !== "function") { useLocal(); return; }
  claude.use("sample").then(function (s) { S.sample = s; if (S.mode !== "loading") onData(); });
  claude.use("downloads").then(function (d) { S.dl = d; });
  var db = await claude.use("db"), user = await claude.use("user");
  var uid = null; try { uid = user ? await user.id() : null; } catch (e) { uid = null; }
  if (!db || !uid) { useLocal(); return; }
  S.mode = "db-wait"; S.col = db.collection("data/users/" + uid); renderView();
  var timer = setTimeout(function () { if (S.mode === "db-wait") { S.note = "slow"; renderView(); } }, 10000);
  var first = true;
  S.col.onSnapshot(function (snap) {
    var m = {}; snap.docs.forEach(function (d) { if (d.exists) m[d.id] = d.data(); });
    S.docs = m;
    if (!snap.metadata.fromCache) clearTimeout(timer);
    S.mode = "db"; if (S.note === "slow" && !snap.metadata.fromCache) S.note = "";
    if (first) { first = false; afterData(); } else onData();
  }, function () { clearTimeout(timer); useLocal("ما قدرنا نوصل لحسابك، فالبيانات الحين محفوظة في هذا المتصفح فقط."); });
}
boot();
})();

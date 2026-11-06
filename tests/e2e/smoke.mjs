// End-to-end smoke test: node tests/e2e/smoke.mjs <baseUrl> <serverLogFile> <outDir>
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import fs from "node:fs";
import path from "node:path";

const [base, logFile, out] = process.argv.slice(2);
const errors = [];
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: "ar-SA" });
const p = await ctx.newPage();
p.on("pageerror", (e) => errors.push("pageerror: " + e.message));
p.on("console", (m) => { if (m.type() === "error" && !/fonts\.g/.test(m.text())) errors.push("console: " + m.text()); });
await p.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ body: "", contentType: "text/css" }));
const shot = (n) => p.screenshot({ path: path.join(out, n + ".png"), fullPage: true });
const step = (s) => console.log("•", s);

step("landing");
await p.goto(base + "/");
await shot("01-landing");

step("signup");
await p.goto(base + "/signup");
const email = `owner${Date.now()}@example.sa`;
await p.fill("#name", "عبدالله الشمري");
await p.fill("#company", "مؤسسة الريادة للحلول التقنية");
await p.fill("#email", email);
await p.fill("#phone", "0551234567");
await p.fill("#password", "abcdefghijk");
await p.check("#terms");
await p.click("button[type=submit]");
await p.waitForSelector(".notice.bad");
const weak = await p.textContent(".notice.bad");
await p.fill("#password", "Zimara2026secure");
await p.click("button[type=submit]");
await p.waitForURL("**/app/setup");
await shot("02-setup");

step("verify email from the dev mail log");
await p.waitForTimeout(300);
const log = fs.readFileSync(logFile, "utf8");
const m = [...log.matchAll(/\/verify\?token=([A-Za-z0-9_-]+)/g)].pop();
if (!m) throw new Error("verification link not found in server log");
await p.goto(base + "/verify?token=" + m[1]);
await p.click("button[type=submit]");
await p.waitForSelector(".notice.ok");

step("company details");
await p.goto(base + "/app/setup");
for (const [k, v] of Object.entries({ vat: "310122393500003", crn: "1010654321", street: "طريق الملك فهد", building: "2451", district: "العليا", city: "حائل", postal: "55431" })) await p.fill(`#co-${k}`, v);
await p.click("button[type=submit]");
await p.waitForURL("**/app/zatca");

step("onboard EGS (local simulation)");
await p.fill("#otp", "123456");
await p.click("button[type=submit]");
await p.waitForSelector(".notice.ok", { timeout: 30000 });
await shot("03-zatca");

step("add customer and product");
await p.goto(base + "/app/customers");
for (const [k, v] of Object.entries({ name: "شركة الأفق للتجارة", vat: "300456789100003", crn: "4030123456", street: "شارع التحلية", building: "7788", district: "الروضة", city: "جدة", postal: "23434" })) await p.fill(`#c-${k}`, v);
await p.click("form button[type=submit]");
await p.waitForSelector("td:has-text('شركة الأفق للتجارة')");
await p.goto(base + "/app/products");
await p.fill("#p-name", "استشارة تقنية (ساعة)");
await p.fill("#p-price", "450");
await p.selectOption("#p-unit", "HUR");
await p.click("form button[type=submit]");
await p.waitForSelector("td:has-text('استشارة تقنية')");

step("issue a B2B invoice");
await p.goto(base + "/app/invoices/new");
await p.selectOption("#f-customer", { label: "شركة الأفق للتجارة" });
await p.fill("#l0-name", "استشارة تقنية (ساعة)");
await p.fill("#l0-qty", "3");
await p.click("text=+ إضافة بند");
await p.fill("#l1-name", "خدمة مالية");
await p.fill("#l1-price", "200");
await p.selectOption("#l1-cat", "E");
const errBefore = await p.locator(".pill.bad").count();
await p.selectOption("#l1-reason", "VATEX-SA-29");
await shot("04-new-invoice");
await p.click("text=إصدار الفاتورة الضريبية");
await p.click("text=تأكيد وإصدار");
await p.waitForURL(/\/app\/invoices\/[0-9a-f-]+\?issued=1/, { timeout: 30000 });
const total = await p.locator(".paper .sum .t").last().textContent();
const checks = await p.locator(".dot.o").count();
await shot("05-invoice");

step("record a payment and issue a credit note");
await p.fill("#pay-amount", "500");
await p.click("text=تسجيل الدفعة");
await p.waitForSelector(".notice.ok.small");
await p.click("text=إصدار إشعار دائن");
await p.waitForURL(/type=credit/);
await p.fill("#f-reason", "خصم متفق عليه");
await p.fill("#l0-qty", "1");
await p.locator("button:has-text('حذف')").nth(1).click();
await p.click("text=إصدار الإشعار الدائن");
await p.click("text=تأكيد وإصدار");
await p.waitForURL(/\?issued=1/, { timeout: 30000 });

step("simplified invoice for cash customer");
await p.goto(base + "/app/invoices/new");
await p.click("text=مبسطة B2C");
await p.fill("#l0-name", "استشارة تقنية (ساعة)");
await p.click("text=إصدار الفاتورة المبسطة");
await p.click("text=تأكيد وإصدار");
await p.waitForURL(/\?issued=1/, { timeout: 30000 });

step("lists, reports, audit, XML download");
await p.goto(base + "/app/invoices");
const rows = await p.locator("tbody tr").count();
await shot("06-invoices");
await p.goto(base + "/app");
await shot("07-dashboard");
await p.goto(base + "/app/reports");
await shot("08-reports");
await p.goto(base + "/app/audit");
const auditRows = await p.locator("tbody tr").count();
const [dl] = await Promise.all([p.waitForEvent("download"), p.goto(base + "/app/invoices").then(() => p.locator("tbody tr a.rowlink").last().click()).then(() => p.click("text=تنزيل XML"))]);
const xmlName = dl.suggestedFilename();

step("logout and protected route");
await p.click("text=تسجيل الخروج");
await p.waitForURL("**/login");
await p.goto(base + "/app/invoices");
const redirected = p.url().includes("/login");

step("mobile layout");
const mob = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const mp = await mob.newPage();
await mp.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ body: "", contentType: "text/css" }));
for (const u of ["/", "/signup", "/legal/privacy"]) {
  await mp.goto(base + u);
  const ov = await mp.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (ov > 0) errors.push(`overflow ${u}: ${ov}`);
}
await mp.goto(base + "/");
await mp.screenshot({ path: path.join(out, "09-mobile-landing.png"), fullPage: true });

console.log(JSON.stringify({ weak, errBefore, total, checks, rows, auditRows, xmlName, redirected, errors }, null, 1));
await b.close();

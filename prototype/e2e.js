const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
(async () => {
  const dir = process.argv[2];
  const html = fs.readFileSync(path.join(dir, 'zimara-app.html'), 'utf8');
  const wrapped = '<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>' + html + '</body></html>';
  const qr = fs.readFileSync(path.join(dir, 'libs/node_modules/qrcode-generator/qrcode.js'), 'utf8');
  const b = await chromium.launch();
  const errors = [];
  async function run(width, theme, shots) {
    const ctx = await b.newContext({ viewport: { width, height: 900 }, colorScheme: theme });
    const p = await ctx.newPage();
    p.on('pageerror', e => errors.push(width + ' pageerror: ' + e.message));
    p.on('console', m => { if (m.type() === 'error') errors.push(width + ' console: ' + m.text()); });
    await p.route('https://cdn.jsdelivr.net/**', r => r.fulfill({ body: qr, contentType: 'application/javascript' }));
    await p.route('https://fonts.googleapis.com/**', r => r.fulfill({ body: '', contentType: 'text/css' }));
    await p.route('http://app.test/', r => r.fulfill({ body: wrapped, contentType: 'text/html' }));
    await p.goto('http://app.test/');
    await p.waitForTimeout(400);
    if (shots) await p.screenshot({ path: path.join(dir, 'shot-welcome-' + width + '.png') });
    await p.click('button[data-act="demoSignup"]');
    await p.waitForFunction(() => document.querySelectorAll('tr.click').length >= 6, null, { timeout: 30000 });
    await p.waitForTimeout(3500);
    if (shots) await p.screenshot({ path: path.join(dir, 'shot-home-' + width + '-' + theme + '.png'), fullPage: true });
    await p.click('button[data-act="chain"]');
    const chain = await p.textContent('.notice.ok, .notice.bad');
    await p.click('button[data-act="tamper"]');
    const tamper = await p.locator('.card .notice').last().textContent();
    // new invoice
    await p.goto('http://app.test/#new');
    await p.waitForTimeout(300);
    const indivErr = await (async()=>{ await p.selectOption('#f-cust', { label: 'أحمد سالم' }); await p.waitForTimeout(80); return p.locator('#newSide .ic.e').count(); })(); await p.selectOption('#f-cust', { label: 'شركة الأفق للتجارة' });
    await p.fill('#l0-name', 'استشارة تقنية (ساعة)');
    await p.fill('#l0-qty', '3');
    await p.click('button[data-act="addLine"]');
    await p.fill('#l1-name', 'خدمة مالية');
    await p.fill('#l1-price', '200');
    await p.selectOption('#l1-cat', 'E');
    const errsBefore = await p.locator('#newSide .ic.e').count();
    await p.selectOption('#l1-reason', 'VATEX-SA-29');
    await p.waitForTimeout(100);
    const errsAfter = await p.locator('#newSide .ic.e').count();
    const total = await p.textContent('#newSide .sum .t:last-child');
    if (shots) await p.screenshot({ path: path.join(dir, 'shot-new-' + width + '.png'), fullPage: true });
    console.log('side:', (await p.textContent('#newSide')).slice(0,400));
    await p.click('button[data-act="askIssue"]');
    await p.click('#doIssueBtn');
    await p.waitForSelector('.sheet', { timeout: 10000 });
    await p.waitForTimeout(300);
    if (shots) await p.screenshot({ path: path.join(dir, 'shot-doc-' + width + '.png'), fullPage: true });
    const checks = await p.locator('.sheet .checks .ic.o').count();
    await p.click('#closeModal');
    for (const r of ['customers', 'products', 'reports', 'audit', 'company', 'plans', 'assistant', 'invoices']) {
      await p.goto('http://app.test/#' + r); await p.waitForTimeout(150);
      const ov = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (ov > 0) errors.push(width + ' overflow on ' + r + ': ' + ov);
      if (shots && (r === 'reports' || r === 'company')) await p.screenshot({ path: path.join(dir, 'shot-' + r + '-' + width + '.png'), fullPage: true });
    }
    const docs = await p.locator('tr.click').count();
    const audit = await p.evaluate(() => JSON.parse(localStorage.getItem('zimara.v1')));
    const pend = Object.values(audit).filter(d => d.zatca && d.zatca.status === 'pending').length;
    console.log(JSON.stringify({ width, theme, chain: chain.slice(0, 60), tamper: tamper.slice(0, 50), indivErr, errsBefore, errsAfter, total, checks, docs, pend }));
    await ctx.close();
  }
  await run(1280, 'light', true);
  await run(390, 'dark', true);
  console.log('ERRORS', JSON.stringify(errors, null, 1));
  await b.close();
})();

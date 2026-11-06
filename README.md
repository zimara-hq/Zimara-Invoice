# زيمارا | ZIMARA — الفوترة الإلكترونية

> التقنية بذوق أوضح · Modern technology, distinctly refined.

نظام فوترة إلكترونية سحابي متوافق مع المرحلة الثانية (الربط والتكامل) من هيئة الزكاة والضريبة والجمارك.

- **الدليل الكامل بالعربي:** [docs/GUIDE-AR.md](docs/GUIDE-AR.md): التشغيل، قاعدة البيانات، الاستضافة، الربط مع الهيئة، المتطلبات النظامية.
- **مصفوفة الامتثال:** [docs/COMPLIANCE-AR.md](docs/COMPLIANCE-AR.md): كل متطلب، ومكان تطبيقه، وحالته.

## التشغيل السريع

```bash
npm install
cp .env.example .env    # عبّي DATABASE_URL و ZIMARA_KEY_ENCRYPTION_KEY
npm run db:migrate
npm run dev             # http://localhost:3000
```

## الأوامر

| الأمر | الوظيفة |
|---|---|
| `npm run dev` | تشغيل وضع التطوير |
| `npm run build` ثم `npm start` | بناء نسخة الإنتاج وتشغيلها |
| `npm run db:migrate` | تطبيق تحديثات قاعدة البيانات |
| `npm test` | الاختبارات (مع `TEST_DATABASE_URL` تشمل قاعدة البيانات) |
| `npm run zatca:sandbox-check` | اختبار حي مع بوابة مطوري الهيئة |
| `npm run typecheck` | فحص الأنواع |

## التقنيات

Next.js 15 (App Router) · TypeScript · PostgreSQL 16 · argon2id · Node crypto (secp256k1) · Claude API (اختياري) · Docker

## English summary

Zimara is a Saudi e-invoicing SaaS (ZATCA Phase 2). The ZATCA engine (`src/lib/zatca`) builds UBL 2.1 XML, signs with secp256k1, chains invoice hashes, builds TLV QR codes, generates ZATCA CSRs, and talks to the Fatoora APIs. PostgreSQL triggers enforce immutability of issued documents, the invoice counter and the audit log. See `docs/` for deployment and compliance details (Arabic).

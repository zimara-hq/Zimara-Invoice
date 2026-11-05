# Zimara prototype

Single-page prototype of the Zimara e-invoicing system (Arabic, RTL).

- `engine.js` — ZATCA engine: SHA-256, secp256k1 ECDSA, TLV QR (tags 1–9), UBL 2.1 XML, hash chain, validation rules.
- `app.js` — the app: storage, onboarding wizard (simulation), issuing, reports, audit log, AI assistant.
- `shell.html` — layout and styles. `build.py` combines the three into `index.html`.

```
python3 build.py . index.html          # build
node test-engine.js engine.js          # engine tests (signatures checked against OpenSSL)
node e2e.js .                          # browser test (needs Playwright, a built zimara-app.html and libs/)
```

Submission to ZATCA is simulated: documents are really signed and hashed, but the certificate comes from a simulation CA and nothing is sent to the Fatoora platform.

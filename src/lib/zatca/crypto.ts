import crypto from "node:crypto";

/** secp256k1 key pair. ZATCA requires this curve for e-invoicing cryptographic stamps. */
export interface KeyPair {
  privatePem: string; // PKCS#8
  publicDer: Buffer; // SubjectPublicKeyInfo
}

export function generateKeyPair(): KeyPair {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", { namedCurve: "secp256k1" });
  return {
    privatePem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    publicDer: publicKey.export({ type: "spki", format: "der" }) as Buffer,
  };
}

export function publicDerFromPrivate(privatePem: string): Buffer {
  return crypto.createPublicKey(privatePem).export({ type: "spki", format: "der" }) as Buffer;
}

export const sha256 = (data: string | Buffer) => crypto.createHash("sha256").update(data).digest();

/** ECDSA-SHA256 signature (DER) over `data`. */
export function sign(data: Buffer | string, privatePem: string): Buffer {
  return crypto.sign("sha256", typeof data === "string" ? Buffer.from(data, "utf8") : data, privatePem);
}

export function verify(data: Buffer | string, signature: Buffer, publicSpkiDer: Buffer): boolean {
  const key = crypto.createPublicKey({ key: publicSpkiDer, format: "der", type: "spki" });
  return crypto.verify("sha256", typeof data === "string" ? Buffer.from(data, "utf8") : data, key, signature);
}

/* ---------- at-rest encryption for private keys (AES-256-GCM) ---------- */

function masterKey(): Buffer {
  const raw = process.env.ZIMARA_KEY_ENCRYPTION_KEY;
  if (!raw) throw new Error("ZIMARA_KEY_ENCRYPTION_KEY is not set");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("ZIMARA_KEY_ENCRYPTION_KEY must be 32 bytes, base64-encoded");
  return key;
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", masterKey(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), enc.toString("base64")].join(".");
}

export function decryptSecret(blob: string): string {
  const [v, iv, tag, enc] = blob.split(".");
  if (v !== "v1") throw new Error("Unknown secret format");
  const d = crypto.createDecipheriv("aes-256-gcm", masterKey(), Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(enc, "base64")), d.final()]).toString("utf8");
}

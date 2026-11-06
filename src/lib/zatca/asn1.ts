/**
 * Minimal ASN.1 DER encoder/decoder — enough for ZATCA CSRs and X.509 certificates.
 */

export type Der = Buffer;

function lenBytes(n: number): Buffer {
  if (n < 0x80) return Buffer.from([n]);
  const bytes: number[] = [];
  while (n > 0) {
    bytes.unshift(n & 0xff);
    n >>= 8;
  }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

export function tlv(tag: number, value: Buffer): Der {
  return Buffer.concat([Buffer.from([tag]), lenBytes(value.length), value]);
}

export const seq = (...items: Der[]) => tlv(0x30, Buffer.concat(items));
export const set = (...items: Der[]) => tlv(0x31, Buffer.concat(items));
export const ctx = (n: number, value: Buffer, constructed = true) => tlv((constructed ? 0xa0 : 0x80) | n, value);
export const utf8 = (s: string) => tlv(0x0c, Buffer.from(s, "utf8"));
export const printable = (s: string) => tlv(0x13, Buffer.from(s, "ascii"));
export const octets = (b: Buffer) => tlv(0x04, b);
export const bitString = (b: Buffer) => tlv(0x03, Buffer.concat([Buffer.from([0]), b]));
export const nul = () => Buffer.from([0x05, 0x00]);
export const bool = (v: boolean) => tlv(0x01, Buffer.from([v ? 0xff : 0x00]));

export function integer(v: bigint | number): Der {
  let n = BigInt(v);
  if (n === 0n) return tlv(0x02, Buffer.from([0]));
  let hex = n.toString(16);
  if (hex.length % 2) hex = "0" + hex;
  let b = Buffer.from(hex, "hex");
  if (b[0] & 0x80) b = Buffer.concat([Buffer.from([0]), b]);
  return tlv(0x02, b);
}

export function oid(dotted: string): Der {
  const parts = dotted.split(".").map((p) => BigInt(p));
  const out: number[] = [Number(parts[0] * 40n + parts[1])];
  for (const p of parts.slice(2)) {
    const stack: number[] = [];
    let v = p;
    stack.push(Number(v & 0x7fn));
    v >>= 7n;
    while (v > 0n) {
      stack.push(Number((v & 0x7fn) | 0x80n));
      v >>= 7n;
    }
    out.push(...stack.reverse());
  }
  return tlv(0x06, Buffer.from(out));
}

export function utcTime(d: Date): Der {
  const p = (n: number) => String(n).padStart(2, "0");
  const s = `${p(d.getUTCFullYear() % 100)}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
  return tlv(0x17, Buffer.from(s, "ascii"));
}

/* ---------- decoding ---------- */

export interface Node {
  tag: number;
  /** offset of the full TLV in the source buffer */
  start: number;
  /** offset of the value */
  valueStart: number;
  end: number;
  value: Buffer;
  /** full TLV bytes */
  raw: Buffer;
  children?: Node[];
}

export function decode(buf: Buffer, offset = 0, end = buf.length): Node[] {
  const nodes: Node[] = [];
  let i = offset;
  while (i < end) {
    const start = i;
    const tag = buf[i++];
    let len = buf[i++];
    if (len & 0x80) {
      const nb = len & 0x7f;
      len = 0;
      for (let k = 0; k < nb; k++) len = (len << 8) | buf[i++];
    }
    const valueStart = i;
    const valueEnd = i + len;
    if (valueEnd > end) throw new Error("ASN.1: length exceeds buffer");
    const node: Node = { tag, start, valueStart, end: valueEnd, value: buf.subarray(valueStart, valueEnd), raw: buf.subarray(start, valueEnd) };
    if (tag & 0x20) node.children = decode(buf, valueStart, valueEnd);
    nodes.push(node);
    i = valueEnd;
  }
  return nodes;
}

export function decodeOid(b: Buffer): string {
  const out: bigint[] = [];
  const first = b[0];
  out.push(BigInt(Math.floor(first / 40)), BigInt(first % 40));
  let v = 0n;
  for (let i = 1; i < b.length; i++) {
    v = (v << 7n) | BigInt(b[i] & 0x7f);
    if (!(b[i] & 0x80)) {
      out.push(v);
      v = 0n;
    }
  }
  return out.join(".");
}

export function pemToDer(pem: string): Buffer {
  return Buffer.from(pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, ""), "base64");
}

export function derToPem(der: Buffer, label: string): string {
  const b64 = der.toString("base64").match(/.{1,64}/g)!.join("\n");
  return `-----BEGIN ${label}-----\n${b64}\n-----END ${label}-----\n`;
}

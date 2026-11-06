import { hash, verify } from "@node-rs/argon2";

// argon2id with OWASP-recommended parameters (19 MiB, 2 iterations)
const OPTS = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

export const hashPassword = (pw: string) => hash(pw, OPTS);
export async function verifyPassword(hashStr: string, pw: string) {
  try {
    return await verify(hashStr, pw);
  } catch {
    return false;
  }
}

export function passwordProblems(pw: string, email: string): string | null {
  if (pw.length < 10) return "كلمة المرور لازم تكون 10 أحرف على الأقل";
  if (pw.length > 128) return "كلمة المرور طويلة جداً";
  if (!/[A-Za-z؀-ۿ]/.test(pw) || !/\d/.test(pw)) return "كلمة المرور لازم تحتوي حروف وأرقام";
  const local = email.split("@")[0]?.toLowerCase();
  if (local && local.length >= 4 && pw.toLowerCase().includes(local)) return "كلمة المرور ما تكون فيها بداية بريدك";
  return null;
}

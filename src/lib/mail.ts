import "server-only";
import nodemailer from "nodemailer";

const FROM = process.env.MAIL_FROM ?? "زيمارا <no-reply@zimara.co>";

/** Sends via SMTP_URL when configured; otherwise prints the message to the server log (development). */
export async function sendMail(to: string, subject: string, text: string) {
  const url = process.env.SMTP_URL;
  if (!url) {
    console.log(`\n[mail:dev] to=${to}\nsubject: ${subject}\n${text}\n`);
    return;
  }
  const t = nodemailer.createTransport(url);
  await t.sendMail({ from: FROM, to, subject, text });
}

export function appUrl(path: string) {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "") + path;
}

// SMTP sanity check: verifies the connection and (optionally) sends one email.
// Usage:  node scripts/test-mail.mjs [recipient@example.com]
import { config } from "dotenv";
import nodemailer from "nodemailer";

config();

const { MAIL_HOST, MAIL_PORT, MAIL_USER, MAIL_PASS } = process.env;
if (!MAIL_HOST || !MAIL_USER || !MAIL_PASS) {
  console.error("MAIL_HOST / MAIL_USER / MAIL_PASS missing in server/.env");
  process.exit(1);
}

const port = Number(MAIL_PORT || 587);
const transporter = nodemailer.createTransport({
  host: MAIL_HOST,
  port,
  secure: port === 465,
  auth: { user: MAIL_USER, pass: MAIL_PASS },
});

const to = process.argv[2] ?? MAIL_USER;

try {
  await transporter.verify();
  console.log(`CONNECT_OK ${MAIL_HOST}:${port} as ${MAIL_USER}`);

  const info = await transporter.sendMail({
    from: `"AI CV Maker" <${MAIL_USER}>`,
    to,
    subject: "SMTP check — AI CV Maker",
    text: "The booking email SMTP settings work.",
  });
  console.log(`SEND_OK -> ${to} (${info.messageId})`);
} catch (err) {
  console.error("FAIL:", err.code ?? "", err.response ?? err.message);
  process.exit(1);
}

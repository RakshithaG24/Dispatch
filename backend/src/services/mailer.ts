import nodemailer, { Transporter } from 'nodemailer';
import { EmailRow, SenderRow } from '../types';

const transports = new Map<string, Transporter>();

function transportFor(sender: SenderRow): Transporter {
  let transport = transports.get(sender.id);
  if (!transport) {
    transport = nodemailer.createTransport({
      host: sender.smtp_host,
      port: sender.smtp_port,
      secure: false,
      auth: { user: sender.smtp_user, pass: sender.smtp_pass },
      // Pooled connections keep SMTP handshakes off the hot path under load.
      pool: true,
      maxConnections: 2,
    });
    transports.set(sender.id, transport);
  }
  return transport;
}

export interface SendResult {
  messageId: string;
  previewUrl: string | null;
}

/**
 * Sends one email through the sender's Ethereal account. The Message-ID is
 * derived from the email row id, so a duplicate delivery after a crash is at
 * least recognisable as the same message by any mail client.
 */
export async function sendEmail(email: EmailRow, sender: SenderRow): Promise<SendResult> {
  const messageId = `<${email.id}@dispatch.local>`;
  const info = await transportFor(sender).sendMail({
    from: { name: sender.display_name, address: sender.email },
    to: email.recipient,
    subject: email.subject,
    text: email.body,
    messageId,
  });
  const preview = nodemailer.getTestMessageUrl(info);
  return { messageId: info.messageId || messageId, previewUrl: preview || null };
}

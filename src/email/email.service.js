import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

const escapeHtml = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

export function createNotificationEmailSender({
  smtp = env.smtp,
  createTransport = nodemailer.createTransport,
} = {}) {
  let transporter;

  return async function sendNotificationEmail({ to, notification }) {
    if (!smtp.host) {
      const error = new Error('SMTP_HOST is required to deliver enabled email notifications');
      error.code = 'SMTP_NOT_CONFIGURED';
      throw error;
    }

    if (!transporter) {
      const auth = smtp.user && smtp.password
        ? { user: smtp.user, pass: smtp.password }
        : undefined;
      transporter = createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.secure,
        ...(auth ? { auth } : {}),
      });
    }

    const escapedTitle = escapeHtml(notification.title);
    const escapedMessage = escapeHtml(notification.message);
    const result = await transporter.sendMail({
      from: smtp.from,
      to,
      subject: notification.title,
      text: `${notification.title}\n\n${notification.message}`,
      html: `<h1>${escapedTitle}</h1><p>${escapedMessage}</p>`,
      messageId: `<${notification.eventId}@pulse-notifications>`,
    });

    if (!result.accepted?.length || result.rejected?.includes(to)) {
      const error = new Error(`SMTP provider did not accept notification email for ${to}`);
      error.code = 'SMTP_RECIPIENT_REJECTED';
      throw error;
    }
    return result;
  };
}

export const sendNotificationEmail = createNotificationEmailSender();

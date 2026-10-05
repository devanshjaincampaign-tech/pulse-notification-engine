import { describe, expect, it, vi } from 'vitest';
import { createNotificationEmailSender } from './email.service.js';

const notification = {
  eventId: '00000000-0000-4000-8000-000000000001',
  title: '<Security alert>',
  message: 'Review <a> & "confirm" this activity.',
};

describe('notification email sender', () => {
  it('configures SMTP and sends safe text and escaped HTML', async () => {
    const sendMail = vi.fn().mockResolvedValue({ accepted: ['user@example.com'], rejected: [] });
    const createTransport = vi.fn().mockReturnValue({ sendMail });
    const sendEmail = createNotificationEmailSender({
      smtp: {
        host: 'smtp.example.com',
        port: 587,
        secure: false,
        user: 'smtp-user',
        password: 'smtp-password',
        from: 'Pulse <notifications@example.com>',
      },
      createTransport,
    });

    await sendEmail({ to: 'user@example.com', notification });

    expect(createTransport).toHaveBeenCalledWith({
      host: 'smtp.example.com',
      port: 587,
      secure: false,
      auth: { user: 'smtp-user', pass: 'smtp-password' },
    });
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'user@example.com',
      subject: '<Security alert>',
      text: '<Security alert>\n\nReview <a> & "confirm" this activity.',
      html: '<h1>&lt;Security alert&gt;</h1><p>Review &lt;a&gt; &amp; &quot;confirm&quot; this activity.</p>',
      messageId: `<${notification.eventId}@pulse-notifications>`,
    }));
  });

  it('throws a retryable explicit error when SMTP is not configured', async () => {
    const sendEmail = createNotificationEmailSender({
      smtp: { host: null },
      createTransport: vi.fn(),
    });

    await expect(sendEmail({ to: 'user@example.com', notification }))
      .rejects.toMatchObject({
        code: 'SMTP_NOT_CONFIGURED',
        message: expect.stringContaining('SMTP_HOST'),
      });
  });

  it('throws when the SMTP server rejects the recipient', async () => {
    const sendEmail = createNotificationEmailSender({
      smtp: { host: 'smtp.example.com', port: 2525, secure: false, from: 'notifications@example.com' },
      createTransport: () => ({
        sendMail: vi.fn().mockResolvedValue({ accepted: [], rejected: ['user@example.com'] }),
      }),
    });

    await expect(sendEmail({ to: 'user@example.com', notification }))
      .rejects.toMatchObject({ code: 'SMTP_RECIPIENT_REJECTED' });
  });
});

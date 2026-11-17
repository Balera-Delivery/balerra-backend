import { Resend } from 'resend';

const resendApiKey = process.env.RESEND_API_KEY || 're_test_mock_key';
const resend = new Resend(resendApiKey);

export class EmailUtils {
  /**
   * Send transactional email to admin staff
   */
  static async sendStaffAlert(options: {
    to?: string;
    subject: string;
    html: string;
  }): Promise<{ success: boolean; id?: string; error?: string }> {
    try {
      const recipient = options.to || process.env.ADMIN_ALERT_EMAIL || 'admin@balera.com';
      const fromEmail = process.env.RESEND_FROM_EMAIL || 'Balerra Delivery <notifications@balera.com>';

      if (!process.env.RESEND_API_KEY || process.env.RESEND_API_KEY === 're_test_mock_key') {
        console.log(`[Resend Mock Email] To: ${recipient} | Subject: ${options.subject}`);
        return { success: true, id: 'mock-email-id' };
      }

      const response = await resend.emails.send({
        from: fromEmail,
        to: recipient,
        subject: options.subject,
        html: options.html,
      });

      if (response.error) {
        console.error('[Resend Error]:', response.error);
        return { success: false, error: response.error.message };
      }

      return { success: true, id: response.data?.id };
    } catch (err: any) {
      console.error('[EmailUtils Exception]:', err.message);
      return { success: false, error: err.message };
    }
  }
}

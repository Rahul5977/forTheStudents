// OTP delivery for the .ac.in college-email check. SES when a verified sender is configured
// (OTP_EMAIL_FROM); otherwise nothing is sent — non-prod returns a devOtp instead and prod
// refuses loudly (see domain/application.ts). The SES sender identity must be verified and the
// account out of the SES sandbox before this works for real students (see integrations-setup.md).
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { getEnv } from '@sc/config';
import { createLogger } from '@sc/shared';

const logger = createLogger('marketplace.email');
let client: SESClient | null = null;
const ses = () => (client ??= new SESClient({ region: process.env.AWS_REGION ?? 'ap-south-1' }));

export interface OtpMailer { send(to: string, code: string): Promise<boolean> }

export const sesOtpMailer: OtpMailer = {
  /** @returns true when an email was actually handed to SES. */
  async send(to: string, code: string): Promise<boolean> {
    const from = getEnv().OTP_EMAIL_FROM;
    if (!from) return false;
    await ses().send(new SendEmailCommand({
      Source: from,
      Destination: { ToAddresses: [to] },
      Message: {
        Subject: { Data: `${code} is your Student-Counselor mentor verification code` },
        Body: {
          Text: { Data: `Your verification code is ${code}. It expires in 10 minutes.\n\nIf you did not apply to become a mentor on Student-Counselor, ignore this email.` },
        },
      },
    }));
    logger.info('otp email sent', { toDomain: to.split('@')[1] }); // never log the address or the code
    return true;
  },
};

let mailer: OtpMailer = sesOtpMailer;
export const getOtpMailer = () => mailer;
/** Test hook. */
export const setOtpMailer = (m: OtpMailer | null) => { mailer = m ?? sesOtpMailer; };

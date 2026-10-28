import nodemailer from "nodemailer";

export interface SendOtpResult {
  success: boolean;
  devMode?: boolean;
  error?: string;
}

export async function sendOtpEmail(toEmail: string, otp: string): Promise<SendOtpResult> {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || `"ChronoGraph" <noreply@chronograph.dev>`;

  if (!host || !user || !pass) {
    // In local dev without SMTP configured, log to console
    console.log(`[SMTP DevMode] One-time verification code for ${toEmail}: ${otp}`);
    return { success: true, devMode: true };
  }

  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
      tls: {
        rejectUnauthorized: process.env.NODE_ENV === "production",
      },
    });

    await transporter.sendMail({
      from,
      to: toEmail,
      subject: `Your ChronoGraph Login Code: ${otp}`,
      text: `Your ChronoGraph verification code is: ${otp}\n\nThis code expires in 5 minutes. If you did not request this, please ignore this email.`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 460px; margin: 0 auto; padding: 24px; background: #141A15; border-radius: 16px; border: 1px solid #243026; color: #E8ECE4;">
          <h2 style="margin: 0 0 8px 0; color: #7FBF6A; font-size: 20px; font-weight: 700;">ChronoGraph Login</h2>
          <p style="margin: 0 0 20px 0; font-size: 13px; color: #8B968B;">Enter the 6-digit code below to access your cluster workflows and telemetry.</p>
          <div style="background: #0C100D; padding: 16px; border-radius: 12px; text-align: center; border: 1px solid #243026; margin: 20px 0;">
            <span style="font-family: monospace; font-size: 32px; font-weight: 700; letter-spacing: 6px; color: #7FBF6A;">${otp}</span>
          </div>
          <p style="margin: 20px 0 0 0; font-size: 11px; color: #5E695E;">This verification code will expire in 5 minutes. Never share this code with anyone.</p>
        </div>
      `,
    });

    return { success: true, devMode: false };
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.warn(`[SMTP Fallback] Failed to send email via SMTP (${errMsg}); falling back to local dev mode for ${toEmail}: ${otp}`);
    return { success: true, devMode: true, error: errMsg };
  }
}


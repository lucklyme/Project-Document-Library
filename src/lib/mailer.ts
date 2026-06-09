import nodemailer from "nodemailer";
import { getMailSettings } from "@/lib/settings";

export async function sendPasswordResetEmail(to: string, resetUrl: string) {
  const settings = getMailSettings();
  if (!settings) {
    throw new Error("邮件服务尚未配置。");
  }

  const transporter = nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    auth: {
      user: settings.username,
      pass: settings.password
    }
  });

  await transporter.sendMail({
    from: `"${settings.fromName}" <${settings.fromEmail}>`,
    to,
    subject: "文档管理系统密码重置",
    text: `请在 30 分钟内打开以下链接重置密码：\n${resetUrl}\n\n如果不是你本人操作，请忽略此邮件。`,
    html: `<p>请在 30 分钟内打开以下链接重置密码：</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>如果不是你本人操作，请忽略此邮件。</p>`
  });
}

export async function sendTestEmail(to: string) {
  const settings = getMailSettings();
  if (!settings) {
    throw new Error("邮件服务尚未配置。");
  }

  const transporter = nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    auth: {
      user: settings.username,
      pass: settings.password
    }
  });

  await transporter.sendMail({
    from: `"${settings.fromName}" <${settings.fromEmail}>`,
    to,
    subject: "文档管理系统测试邮件",
    text: "如果你收到这封邮件，说明 SMTP 配置可用。"
  });
}

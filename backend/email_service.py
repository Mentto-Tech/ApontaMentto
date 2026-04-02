import smtplib
import os
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

SMTP_SERVER = os.getenv("SMTP_SERVER", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", 587))
SMTP_USERNAME = os.getenv("SMTP_USERNAME", "mentto.tech@gmail.com")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
DEFAULT_FROM_EMAIL = os.getenv("DEFAULT_FROM_EMAIL", SMTP_USERNAME)


class EmailService:
    @staticmethod
    def send_email(to_email: str, subject: str, body: str):
        try:
            msg = MIMEMultipart()
            msg["From"] = DEFAULT_FROM_EMAIL
            msg["To"] = to_email
            msg["Subject"] = subject
            msg.attach(MIMEText(body, "plain"))
            with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
                server.starttls()
                server.login(SMTP_USERNAME, SMTP_PASSWORD)
                server.sendmail(DEFAULT_FROM_EMAIL, to_email, msg.as_string())
            print(f"Email sent to {to_email}")
        except Exception as e:
            print(f"Failed to send email: {e}")

    @staticmethod
    def send_html_email(to_email: str, subject: str, html: str):
        try:
            msg = MIMEMultipart("alternative")
            msg["From"] = DEFAULT_FROM_EMAIL
            msg["To"] = to_email
            msg["Subject"] = subject
            msg.attach(MIMEText(html, "html"))
            with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
                server.starttls()
                server.login(SMTP_USERNAME, SMTP_PASSWORD)
                server.sendmail(DEFAULT_FROM_EMAIL, to_email, msg.as_string())
            print(f"HTML email sent to {to_email}")
        except Exception as e:
            print(f"Failed to send HTML email: {e}")

    @staticmethod
    def send_sign_request(to_email: str, employee_name: str, manager_name: str, month_label: str, sign_url: str):
        subject = f"Folha de Ponto {month_label} — Aguardando sua assinatura"
        html = f"""
        <div style="font-family:sans-serif;max-width:560px;margin:auto;padding:24px">
          <h2 style="color:#1e293b">Folha de Ponto — {month_label}</h2>
          <p>Olá <strong>{employee_name}</strong>,</p>
          <p>O gestor <strong>{manager_name}</strong> assinou a folha de ponto referente a <strong>{month_label}</strong>
          e está aguardando a sua assinatura.</p>
          <p style="margin:32px 0">
            <a href="{sign_url}"
               style="background:#6366f1;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">
              Visualizar e Assinar
            </a>
          </p>
          <p style="color:#64748b;font-size:13px">O link expira em 3 dias. Caso tenha dúvidas, entre em contato com seu gestor.</p>
        </div>
        """
        EmailService.send_html_email(to_email, subject, html)

    @staticmethod
    def send_employee_signed_notification(to_email: str, manager_name: str, employee_name: str, month_label: str, download_url: str):
        subject = f"Folha de Ponto {month_label} — Assinada por {employee_name}"
        html = f"""
        <div style="font-family:sans-serif;max-width:560px;margin:auto;padding:24px">
          <h2 style="color:#1e293b">Folha de Ponto Completa — {month_label}</h2>
          <p>Olá <strong>{manager_name}</strong>,</p>
          <p><strong>{employee_name}</strong> assinou a folha de ponto de <strong>{month_label}</strong>.</p>
          <p>O documento com ambas as assinaturas está disponível para download.</p>
          <p style="margin:32px 0">
            <a href="{download_url}"
               style="background:#16a34a;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">
              Baixar PDF Assinado
            </a>
          </p>
        </div>
        """
        EmailService.send_html_email(to_email, subject, html)

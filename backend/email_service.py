import smtplib
import os
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def _clean(val: str) -> str:
    """Remove surrounding quotes that some env injection methods leave in."""
    return val.strip('"').strip("'").strip()

SMTP_SERVER = _clean(os.getenv("SMTP_SERVER") or os.getenv("MAIL_SERVER") or "smtp.gmail.com")
SMTP_PORT = int(_clean(os.getenv("SMTP_PORT") or os.getenv("MAIL_PORT") or "587"))
SMTP_USERNAME = _clean(os.getenv("SMTP_USERNAME") or os.getenv("MAIL_USERNAME") or "mentto.tech@gmail.com")
SMTP_PASSWORD = _clean(os.getenv("SMTP_PASSWORD") or os.getenv("MAIL_PASSWORD") or "")
DEFAULT_FROM_EMAIL = _clean(os.getenv("DEFAULT_FROM_EMAIL") or SMTP_USERNAME)

# Log configuration on startup (without password)
logger.info(f"Email config: SMTP_SERVER={SMTP_SERVER}, SMTP_PORT={SMTP_PORT}, SMTP_USERNAME={SMTP_USERNAME}, FROM={DEFAULT_FROM_EMAIL}")


class EmailService:
    @staticmethod
    def send_email(to_email: str, subject: str, body: str):
        try:
            if not SMTP_PASSWORD:
                logger.error("SMTP_PASSWORD not configured - cannot send email")
                raise ValueError("SMTP_PASSWORD not configured")
            
            logger.info(f"Attempting to send email to {to_email} with subject: {subject}")
            msg = MIMEMultipart()
            msg["From"] = DEFAULT_FROM_EMAIL
            msg["To"] = to_email
            msg["Subject"] = subject
            msg.attach(MIMEText(body, "plain"))
            
            with smtplib.SMTP(SMTP_SERVER, SMTP_PORT, timeout=10) as server:
                server.starttls()
                server.login(SMTP_USERNAME, SMTP_PASSWORD)
                server.sendmail(DEFAULT_FROM_EMAIL, to_email, msg.as_string())
            
            logger.info(f"✓ Email sent successfully to {to_email}")
        except Exception as e:
            logger.error(f"✗ Failed to send email to {to_email}: {type(e).__name__}: {e}", exc_info=True)
            raise

    @staticmethod
    def send_html_email(to_email: str, subject: str, html: str):
        try:
            if not SMTP_PASSWORD:
                logger.error("SMTP_PASSWORD not configured - cannot send email")
                raise ValueError("SMTP_PASSWORD not configured")
            
            logger.info(f"Attempting to send HTML email to {to_email} with subject: {subject}")
            msg = MIMEMultipart("alternative")
            msg["From"] = DEFAULT_FROM_EMAIL
            msg["To"] = to_email
            msg["Subject"] = subject
            msg.attach(MIMEText(html, "html"))
            
            with smtplib.SMTP(SMTP_SERVER, SMTP_PORT, timeout=10) as server:
                server.starttls()
                server.login(SMTP_USERNAME, SMTP_PASSWORD)
                server.sendmail(DEFAULT_FROM_EMAIL, to_email, msg.as_string())
            
            logger.info(f"✓ HTML email sent successfully to {to_email}")
        except Exception as e:
            logger.error(f"✗ Failed to send HTML email to {to_email}: {type(e).__name__}: {e}", exc_info=True)
            raise

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

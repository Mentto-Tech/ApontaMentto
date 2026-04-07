import os
import logging
import httpx

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def _clean(val: str) -> str:
    """Remove surrounding quotes that some env injection methods leave in."""
    if not val:
        return ""
    return val.strip('"').strip("'").strip()

RESEND_API_KEY = _clean(os.getenv("RESEND_API_KEY", ""))
RESEND_FROM = _clean(os.getenv("RESEND_FROM", ""))

# Log configuration on startup
logger.info(f"Email config: RESEND_API_KEY={'configured' if RESEND_API_KEY else 'missing'}, RESEND_FROM={RESEND_FROM}")

class EmailService:
    @staticmethod
    def _send_via_resend(to_email: str, subject: str, text: str = None, html: str = None):
        if not RESEND_API_KEY:
            logger.error("RESEND_API_KEY not configured - cannot send email")
            raise ValueError("RESEND_API_KEY not configured")
        if not RESEND_FROM:
            logger.error("RESEND_FROM not configured - cannot send email")
            raise ValueError("RESEND_FROM not configured")

        headers = {
            "Authorization": f"Bearer {RESEND_API_KEY}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "from": RESEND_FROM,
            "to": [to_email],
            "subject": subject,
        }
        if html:
            payload["html"] = html
        if text:
            payload["text"] = text

        try:
            logger.info(f"Attempting to send email to {to_email} with subject: {subject} via Resend")
            response = httpx.post("https://api.resend.com/emails", json=payload, headers=headers, timeout=10.0)
            
            # Raise exception if status is not 2xx
            response.raise_for_status()
            
            logger.info(f"✓ Email sent successfully to {to_email} via Resend")
        except httpx.HTTPStatusError as e:
            logger.error(f"✗ Failed to send email via Resend API: {e.response.status_code} {e.response.text}")
            raise
        except Exception as e:
            logger.error(f"✗ Failed to send email to {to_email}: {type(e).__name__}: {e}", exc_info=True)
            raise

    @staticmethod
    def send_email(to_email: str, subject: str, body: str):
        EmailService._send_via_resend(to_email=to_email, subject=subject, text=body)

    @staticmethod
    def send_html_email(to_email: str, subject: str, html: str):
        EmailService._send_via_resend(to_email=to_email, subject=subject, html=html)

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


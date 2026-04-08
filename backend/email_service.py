import logging
import os
import httpx

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")
RESEND_FROM = os.getenv("RESEND_FROM", "")  # e.g. "Mentto <noreply@seudominio.com>"

logger.info(f"Email config: RESEND_FROM={RESEND_FROM}, API_KEY={'✓' if RESEND_API_KEY else '✗ MISSING'}")


class EmailService:
    @staticmethod
    def _send(to_email: str, subject: str, html: str):
        if not RESEND_API_KEY:
            logger.error("RESEND_API_KEY not configured")
            raise ValueError("RESEND_API_KEY not configured")

        response = httpx.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {RESEND_API_KEY}"},
            json={"from": RESEND_FROM, "to": [to_email], "subject": subject, "html": html},
            timeout=15,
        )

        if response.status_code >= 400:
            logger.error(f"Resend error {response.status_code}: {response.text}")
            raise RuntimeError(f"Resend API error {response.status_code}: {response.text}")

        logger.info(f"✓ Email sent to {to_email} (id={response.json().get('id')})")

    @staticmethod
    def send_email(to_email: str, subject: str, body: str):
        EmailService._send(to_email, subject, f"<pre>{body}</pre>")

    @staticmethod
    def send_html_email(to_email: str, subject: str, html: str):
        EmailService._send(to_email, subject, html)

    @staticmethod
    def send_sign_request(to_email: str, employee_name: str, manager_name: str, month_label: str, sign_url: str):
        subject = f"Folha de Ponto {month_label} — Aguardando sua assinatura"
        html = f"""
        <div style="font-family:sans-serif;max-width:560px;margin:auto;padding:24px">
          <h2 style="color:#1e293b">Folha de Ponto — {month_label}</h2>
          <p>Olá <strong>{employee_name}</strong>,</p>
          <p>A folha de ponto referente a <strong>{month_label}</strong>
          foi assinada e está aguardando a sua assinatura.</p>
          <p style="margin:32px 0">
            <a href="{sign_url}"
               style="background:#6366f1;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">
              Visualizar e Assinar
            </a>
          </p>
          <p style="color:#64748b;font-size:13px">O link expira em 3 dias. Caso tenha dúvidas, entre em contato com seu gestor.</p>
        </div>
        """
        EmailService._send(to_email, subject, html)

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
        EmailService._send(to_email, subject, html)

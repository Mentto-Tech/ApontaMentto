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

    @staticmethod
    def send_password_reset_email(to_email: str, user_name: str, reset_url: str):
        subject = "Redefinição de senha — ApontaMentto"
        html = f"""
        <div style="font-family:sans-serif;max-width:560px;margin:auto;padding:24px">
          <div style="text-align:center;margin-bottom:24px">
            <h1 style="color:#6366f1;font-size:24px;margin:0">ApontaMentto</h1>
          </div>
          <h2 style="color:#1e293b;font-size:20px">Redefinição de Senha</h2>
          <p>Olá <strong>{user_name}</strong>,</p>
          <p>Recebemos uma solicitação para redefinir a senha da sua conta.
          Clique no botão abaixo para criar uma nova senha:</p>
          <p style="margin:32px 0;text-align:center">
            <a href="{reset_url}"
               style="background:#6366f1;color:#fff;padding:14px 28px;border-radius:8px;
                      text-decoration:none;font-weight:600;font-size:15px">
              Redefinir Senha
            </a>
          </p>
          <p style="color:#64748b;font-size:13px">
            Este link é válido por <strong>1 hora</strong>. Se você não solicitou a
            redefinição de senha, ignore este email — sua senha permanece a mesma.
          </p>
          <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0" />
          <p style="color:#94a3b8;font-size:12px;text-align:center">
            ApontaMentto · Mentto Tech
          </p>
        </div>
        """
        EmailService._send(to_email, subject, html)

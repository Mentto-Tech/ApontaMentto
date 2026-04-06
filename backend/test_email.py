#!/usr/bin/env python3
"""
Script para testar configuração de email.
Uso: python test_email.py <email_destino>
"""
import sys
from email_service import (
    EmailService, SMTP_SERVER, SMTP_PORT,
    SMTP_USERNAME, SMTP_PASSWORD, DEFAULT_FROM_EMAIL
)

def main():
    print("=" * 60)
    print("TESTE DE CONFIGURAÇÃO DE EMAIL")
    print("=" * 60)
    print(f"SMTP_SERVER:        {SMTP_SERVER}")
    print(f"SMTP_PORT:          {SMTP_PORT}")
    print(f"SMTP_USERNAME:      {SMTP_USERNAME}")
    print(f"DEFAULT_FROM_EMAIL: {DEFAULT_FROM_EMAIL}")
    print(f"SMTP_PASSWORD:      {'✓ configurado' if SMTP_PASSWORD else '✗ NÃO CONFIGURADO'}")
    print("=" * 60)

    if not SMTP_PASSWORD:
        print("\n❌ SMTP_PASSWORD não está configurado!")
        print("Configure no .env com a senha de app do Gmail.")
        print("Gere uma em: https://myaccount.google.com/apppasswords")
        sys.exit(1)

    if len(sys.argv) < 2:
        print("\nUso: python test_email.py <email_destino>")
        sys.exit(1)

    to_email = sys.argv[1]
    print(f"\n📧 Enviando email de teste para: {to_email}")

    try:
        EmailService.send_html_email(
            to_email=to_email,
            subject="Teste de Email — Sistema de Folha de Ponto",
            html=f"""
            <div style="font-family:sans-serif;max-width:560px;margin:auto;padding:24px">
              <h2 style="color:#1e293b">✓ Email de Teste</h2>
              <p>Configuração funcionando corretamente.</p>
              <hr style="margin:24px 0;border:none;border-top:1px solid #e2e8f0">
              <p style="color:#64748b;font-size:13px">
                Servidor: {SMTP_SERVER}:{SMTP_PORT}<br>
                De: {DEFAULT_FROM_EMAIL}
              </p>
            </div>
            """
        )
        print("✓ Email enviado com sucesso! Verifique a caixa de entrada (e spam).")
    except Exception as e:
        print(f"✗ Erro: {type(e).__name__}: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()

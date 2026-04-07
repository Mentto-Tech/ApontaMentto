#!/usr/bin/env python3
"""
Script para testar configuração de email usando Resend API.
Uso: python test_email.py <email_destino>
"""
import sys
from email_service import EmailService, RESEND_API_KEY, RESEND_FROM

def main():
    print("=" * 60)
    print("TESTE DE CONFIGURAÇÃO DE EMAIL (RESEND)")
    print("=" * 60)
    print(f"RESEND_FROM:        {RESEND_FROM}")
    print(f"RESEND_API_KEY:     {'✓ configurada' if RESEND_API_KEY else '✗ NÃO CONFIGURADA'}")
    print("=" * 60)

    if not RESEND_API_KEY:
        print("\n❌ RESEND_API_KEY não está configurado!")
        print("Configure no .env com sua chave do Resend.")
        sys.exit(1)

    if not RESEND_FROM:
        print("\n❌ RESEND_FROM não está configurado!")
        print("Configure no .env (DICA: O Resend não permite enviar emails com @gmail.com. Use seu domínio verificado ou onboarding@resend.dev)")
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
              <h2 style="color:#1e293b">✓ Email de Teste via Resend</h2>
              <p>Configuração da API do Resend funcionando corretamente.</p>
              <hr style="margin:24px 0;border:none;border-top:1px solid #e2e8f0">
              <p style="color:#64748b;font-size:13px">
                De: {RESEND_FROM}
              </p>
            </div>
            """
        )
        print("✓ Email enviado com sucesso via Resend! Verifique a caixa de entrada (e spam).")
    except Exception as e:
        print(f"✗ Erro: {type(e).__name__}: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()


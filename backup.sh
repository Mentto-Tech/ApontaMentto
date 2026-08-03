#!/bin/bash
# backup.sh — Backup automático do Apontamentto
# Faz login na API, exporta os dados e mantém apenas os 3 últimos backups.

set -euo pipefail

# ── Configuração ──────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"
BACKUP_DIR="$SCRIPT_DIR/arquitetura/backups"
API_URL="http://localhost:8001/api"
MAX_BACKUPS=3

# ── Carregar variáveis do .env ────────────────────────────────────────────────
if [ -f "$ENV_FILE" ]; then
    export $(grep -E '^(ADMIN_EMAIL|ADMIN_PASSWORD)=' "$ENV_FILE" | xargs)
fi

if [ -z "${ADMIN_EMAIL:-}" ] || [ -z "${ADMIN_PASSWORD:-}" ]; then
    echo "[ERROR] ADMIN_EMAIL ou ADMIN_PASSWORD não encontrados no .env"
    exit 1
fi

# ── Login para obter token ────────────────────────────────────────────────────
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Obtendo token de autenticação..."

TOKEN=$(curl -sf -X POST "$API_URL/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"${ADMIN_EMAIL}\",\"password\":\"${ADMIN_PASSWORD}\"}" \
    | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
    echo "[ERROR] Falha ao obter token. Verifique credenciais ou URL da API."
    exit 1
fi

# ── Exportar dados ────────────────────────────────────────────────────────────
TIMESTAMP=$(date '+%d-%m-%Y')
OUTPUT_FILE="$BACKUP_DIR/apontamentto-export-${TIMESTAMP}.json"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Exportando dados para $OUTPUT_FILE..."

HTTP_STATUS=$(curl -sf -o "$OUTPUT_FILE" -w "%{http_code}" \
    -H "Authorization: Bearer $TOKEN" \
    "$API_URL/admin/export")

if [ "$HTTP_STATUS" != "200" ]; then
    echo "[ERROR] Export falhou com status HTTP $HTTP_STATUS"
    rm -f "$OUTPUT_FILE"
    exit 1
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Backup salvo: $OUTPUT_FILE"

# ── Manter apenas os últimos N backups ───────────────────────────────────────
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Limpando backups antigos (mantendo $MAX_BACKUPS)..."

ls -t "$BACKUP_DIR"/apontamentto-export-*.json 2>/dev/null \
    | tail -n +$((MAX_BACKUPS + 1)) \
    | while read -r old_file; do
        echo "  Removendo: $old_file"
        rm -f "$old_file"
    done

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Backup concluído."

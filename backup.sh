#!/bin/bash
# backup.sh — Backup automático do Apontamentto
#
# O que faz:
#   1. pg_dump do container Docker → arquivo .sql.gz
#   2. Upload para S3 (bucket já existente)
#   3. Limpa arquivos locais com mais de N dias
#   4. (opcional) Export JSON via API como backup secundário
#
# Agendar via cron (diário às 03:00):
#   crontab -e
#   0 3 * * * /home/ubuntu/apontamentto/ApontaMentto/backup.sh >> /var/log/apontamentto-backup.log 2>&1

set -euo pipefail

# ── Configuração ───────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"
BACKUP_DIR="$SCRIPT_DIR/arquitetura/backups"
LOCAL_RETENTION_DAYS=7
API_URL="http://localhost:8001/api"

mkdir -p "$BACKUP_DIR"

# ── Carregar variáveis do .env ─────────────────────────────────────────────────
if [ -f "$ENV_FILE" ]; then
    export $(grep -E '^(ADMIN_EMAIL|ADMIN_PASSWORD|POSTGRES_USER|POSTGRES_DB|S3_BUCKET|AWS_REGION|AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY)=' "$ENV_FILE" | xargs)
fi

: "${POSTGRES_USER:?POSTGRES_USER nao definido no .env}"
: "${POSTGRES_DB:?POSTGRES_DB nao definido no .env}"
: "${S3_BUCKET:?S3_BUCKET nao definido no .env}"
: "${AWS_REGION:?AWS_REGION nao definido no .env}"
: "${AWS_ACCESS_KEY_ID:?AWS_ACCESS_KEY_ID nao definido no .env}"
: "${AWS_SECRET_ACCESS_KEY:?AWS_SECRET_ACCESS_KEY nao definido no .env}"

TIMESTAMP=$(date '+%Y-%m-%d_%H-%M-%S')
SQL_FILE="$BACKUP_DIR/apontamentto-db-${TIMESTAMP}.sql.gz"
S3_KEY="backups/postgres/apontamentto-db-${TIMESTAMP}.sql.gz"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

# ── 1. pg_dump via Docker ──────────────────────────────────────────────────────
log "Iniciando pg_dump do container db..."

docker compose -f "$SCRIPT_DIR/docker-compose.yml" exec -T db \
    pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" \
    | gzip > "$SQL_FILE"

SIZE=$(du -sh "$SQL_FILE" | cut -f1)
log "Dump concluido: $SQL_FILE ($SIZE)"

# ── 2. Upload para S3 ─────────────────────────────────────────────────────────
log "Enviando para S3: s3://${S3_BUCKET}/${S3_KEY}..."

AWS_ACCESS_KEY_ID="$AWS_ACCESS_KEY_ID" \
AWS_SECRET_ACCESS_KEY="$AWS_SECRET_ACCESS_KEY" \
aws s3 cp "$SQL_FILE" "s3://${S3_BUCKET}/${S3_KEY}" \
    --region "$AWS_REGION" \
    --storage-class STANDARD_IA

log "Upload concluido: s3://${S3_BUCKET}/${S3_KEY}"

# ── 3. Limpeza de arquivos locais antigos ─────────────────────────────────────
log "Removendo backups locais com mais de ${LOCAL_RETENTION_DAYS} dias..."
find "$BACKUP_DIR" -name "apontamentto-db-*.sql.gz" -mtime +${LOCAL_RETENTION_DAYS} -delete
log "Limpeza local concluida."

# ── 4. (Opcional) Export JSON via API como backup secundario ──────────────────
if [ -n "${ADMIN_EMAIL:-}" ] && [ -n "${ADMIN_PASSWORD:-}" ]; then
    log "Gerando backup JSON secundario via API..."

    TOKEN=$(curl -sf -X POST "$API_URL/auth/login" \
        -H "Content-Type: application/json" \
        -d "{\"email\":\"${ADMIN_EMAIL}\",\"password\":\"${ADMIN_PASSWORD}\"}" \
        | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4 || true)

    if [ -n "$TOKEN" ]; then
        JSON_FILE="$BACKUP_DIR/apontamentto-export-${TIMESTAMP}.json"
        HTTP_STATUS=$(curl -sf -o "$JSON_FILE" -w "%{http_code}" \
            -H "Authorization: Bearer $TOKEN" \
            "$API_URL/admin/export" || echo "000")

        if [ "$HTTP_STATUS" = "200" ]; then
            log "Backup JSON salvo: $JSON_FILE"
            AWS_ACCESS_KEY_ID="$AWS_ACCESS_KEY_ID" \
            AWS_SECRET_ACCESS_KEY="$AWS_SECRET_ACCESS_KEY" \
            aws s3 cp "$JSON_FILE" "s3://${S3_BUCKET}/backups/json/apontamentto-export-${TIMESTAMP}.json" \
                --region "$AWS_REGION" --storage-class STANDARD_IA
            log "JSON enviado para S3."
        else
            log "AVISO: Export JSON falhou (HTTP $HTTP_STATUS). Backup SQL ja esta seguro no S3."
            rm -f "$JSON_FILE"
        fi
    else
        log "AVISO: Nao foi possivel obter token da API. Backup SQL ja esta seguro no S3."
    fi
fi

log "Backup completo."

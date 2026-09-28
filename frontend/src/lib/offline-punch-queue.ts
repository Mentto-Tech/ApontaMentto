/**
 * offline-punch-queue.ts
 *
 * Persiste batidas de ponto no localStorage quando o dispositivo está offline
 * (ou quando a requisição falha por erro de rede) e as reenvia automaticamente
 * assim que a conexão for restabelecida.
 *
 * Regras importantes:
 * - O horário registrado é SEMPRE o momento em que o usuário clicou "Bater Ponto",
 *   nunca o momento em que a requisição chegou ao servidor.
 * - Entradas duplicadas (mesmo date + field) são ignoradas — o servidor também
 *   rejeita sobrescritas, então a primeira batida sempre vence.
 * - A fila é limitada a 20 entradas para evitar acúmulo infinito.
 */

const QUEUE_KEY = "punch_offline_queue";
const MAX_QUEUE_SIZE = 20;

export interface OfflinePunch {
  /** ISO timestamp do momento em que o usuário bateu o ponto (não o envio) */
  capturedAt: string;
  /** Payload que seria enviado para PUT /api/daily-records */
  payload: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Leitura / escrita no localStorage
// ---------------------------------------------------------------------------

function readQueue(): OfflinePunch[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(queue: OfflinePunch[]): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // QuotaExceededError — ignora silenciosamente
  }
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

/**
 * Retorna uma cópia snapshot da fila atual (leitura).
 */
export function getOfflineQueue(): OfflinePunch[] {
  return readQueue();
}

/**
 * Retorna quantas batidas ainda estão pendentes de envio.
 */
export function pendingCount(): number {
  return readQueue().length;
}

/**
 * Enfileira uma batida para envio posterior.
 * Se já existir uma entrada para o mesmo date + campo, a nova é descartada
 * (a primeira batida sempre tem prioridade — o servidor teria rejeitado a segunda).
 */
export function enqueuePunch(payload: Record<string, unknown>): void {
  const queue = readQueue();

  // Deduplicação por date + field principal
  const date = payload["date"] as string | undefined;
  const fields = ["in1", "out1", "in2", "out2", "extraIn", "extraOut", "lunch"];
  const newField = fields.find((f) => payload[f] !== undefined && payload[f] !== null);

  if (date && newField) {
    const alreadyQueued = queue.some((item) => {
      const p = item.payload;
      return p["date"] === date && p[newField] !== undefined && p[newField] !== null;
    });
    if (alreadyQueued) {
      console.warn("[OfflineQueue] Batida duplicada descartada:", date, newField);
      return;
    }
  }

  if (queue.length >= MAX_QUEUE_SIZE) {
    console.warn("[OfflineQueue] Fila cheia — batida mais antiga removida para liberar espaço.");
    queue.shift();
  }

  queue.push({ capturedAt: new Date().toISOString(), payload });
  writeQueue(queue);
  console.info("[OfflineQueue] Batida enfileirada:", payload);
}

/**
 * Remove a primeira entrada da fila (já enviada com sucesso).
 */
function dequeueFirst(): void {
  const queue = readQueue();
  queue.shift();
  writeQueue(queue);
}

/**
 * Tenta enviar todas as batidas pendentes em ordem FIFO.
 * Param `sendFn` deve chamar PUT /api/daily-records e rejeitar em caso de erro.
 * Retorna o número de batidas enviadas com sucesso.
 */
export async function flushOfflineQueue(
  sendFn: (payload: Record<string, unknown>) => Promise<void>
): Promise<number> {
  const queue = readQueue();
  if (queue.length === 0) return 0;

  console.info(`[OfflineQueue] Tentando enviar ${queue.length} batida(s) pendente(s)…`);

  let sent = 0;
  for (const item of [...queue]) {
    try {
      await sendFn(item.payload);
      dequeueFirst();
      sent++;
      console.info("[OfflineQueue] Batida enviada com sucesso:", item.payload);
    } catch (err) {
      // Para no primeiro erro para não enviar fora de ordem
      console.warn("[OfflineQueue] Falha ao enviar batida, tentará novamente mais tarde:", err);
      break;
    }
  }

  return sent;
}

/**
 * Registra um listener para o evento `online` do navegador.
 * Quando a conexão voltar, chama `flushOfflineQueue` automaticamente.
 * Retorna uma função para cancelar o listener.
 */
export function watchOnlineAndFlush(
  sendFn: (payload: Record<string, unknown>) => Promise<void>,
  onFlushed?: (count: number) => void
): () => void {
  const handler = async () => {
    const count = await flushOfflineQueue(sendFn);
    if (count > 0 && onFlushed) {
      onFlushed(count);
    }
  };

  window.addEventListener("online", handler);
  return () => window.removeEventListener("online", handler);
}

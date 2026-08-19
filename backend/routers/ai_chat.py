"""
Assistente de registros por IA (OpenRouter).

Fluxo:
1. Usuário envia texto ou áudio (áudio é transcrito em /transcribe).
2. A IA extrai as atividades (dia, início, fim, projeto, local) com base na
   lista real de projetos e locais vinda do banco.
3. A IA apresenta as inferências e pergunta o que faltar.
4. Usuário valida (digitando ou clicando em "Confirmar").
5. A IA (ou o endpoint /confirm) faz os POSTs de time_entries.
"""

import base64
import json
import logging
import re
import uuid
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional
from zoneinfo import ZoneInfo

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import get_current_user
from models import Location, Project, TimeEntry, User

logger = logging.getLogger(__name__)

router = APIRouter()

OPENROUTER_BASE = "https://openrouter.ai/api/v1"
OPENROUTER_API_KEY = ""
MODEL = "google/gemini-2.5-flash-lite"
AUDIO_MODEL = "google/gemini-2.5-flash"
BRAZIL_TZ = ZoneInfo("America/Sao_Paulo")

# Sessões pendentes em memória (user_id -> lista de entradas propostas)
_pending: Dict[str, List[dict]] = {}


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------
class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    history: List[ChatMessage] = []


class ChatResponse(BaseModel):
    reply: str = ""
    entries: List[dict] = []  # entradas propostas (para exibição/confirmação)
    saved: List[dict] = []  # entradas salvas no banco
    pending: List[dict] = []  # pendências ativas após esta resposta


class TranscribeResponse(BaseModel):
    text: str


class ConfirmRequest(BaseModel):
    entries: List[dict]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _env() -> None:
    global OPENROUTER_API_KEY, MODEL, AUDIO_MODEL
    import os

    OPENROUTER_API_KEY = os.getenv("OPEN_ROUTER_API_KEY", "")
    MODEL = os.getenv("MODEL", "google/gemini-2.5-flash-lite")
    AUDIO_MODEL = os.getenv("AUDIO_MODEL", "google/gemini-2.5-flash")


def _normalize_time(value: Any) -> Optional[str]:
    if value is None:
        return None
    s = str(value).strip().lower().replace("h", ":").replace(" ", "")
    m = re.match(r"^(\d{1,2})[:.](\d{2})$", s)
    if m:
        h, mi = int(m.group(1)), int(m.group(2))
        if 0 <= h <= 23 and 0 <= mi <= 59:
            return f"{h:02d}:{mi:02d}"
    m = re.match(r"^(\d{1,2})(\d{2})$", s)
    if m:
        h, mi = int(m.group(1)), int(m.group(2))
        if 0 <= h <= 23 and 0 <= mi <= 59:
            return f"{h:02d}:{mi:02d}"
    return None


def _normalize_date(value: Any) -> Optional[str]:
    if value is None:
        return None
    s = str(value).strip()
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})$", s)
    if m:
        y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if 1 <= mo <= 12 and 1 <= d <= 31:
            return f"{y:04d}-{mo:02d}-{d:02d}"
    m = re.match(r"^(\d{1,2})/(\d{1,2})/(\d{4})$", s)
    if m:
        d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if 1 <= mo <= 12 and 1 <= d <= 31:
            return f"{y:04d}-{mo:02d}-{d:02d}"
    return None


def _extract_json(text: str) -> Optional[dict]:
    text = text.strip()
    # Remove fences de markdown
    text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.MULTILINE).strip()
    text = re.sub(r"\s*```$", "", text).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    # Fallback: primeiro bloco {...}
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end > start:
        try:
            return json.loads(text[start : end + 1])
        except json.JSONDecodeError:
            pass
    return None


async def _call_openrouter(
    messages: List[dict],
    model: Optional[str] = None,
    temperature: float = 0.2,
) -> str:
    _env()
    if not OPENROUTER_API_KEY:
        raise HTTPException(
            503, "OPEN_ROUTER_API_KEY não configurada no servidor."
        )
    url = f"{OPENROUTER_BASE}/chat/completions"
    payload: dict = {
        "model": model or MODEL,
        "messages": messages,
        "temperature": temperature,
    }
    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient(timeout=90) as client:
        resp = await client.post(url, json=payload, headers=headers)
    if resp.status_code != 200:
        logger.error("OpenRouter error %s: %s", resp.status_code, resp.text[:500])
        raise HTTPException(502, "Falha ao chamar o modelo de IA.")
    data = resp.json()
    try:
        return data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError):
        logger.error("OpenRouter unexpected payload: %s", json.dumps(data)[:500])
        raise HTTPException(502, "Resposta inesperada do modelo de IA.")


def _today_brazil() -> str:
    return datetime.now(BRAZIL_TZ).strftime("%Y-%m-%d")


def _build_system_prompt(projects: List[Project], locations: List[Location]) -> str:
    proj_lines = [
        {"id": p.id, "name": p.name, "description": p.description or ""}
        for p in projects
    ]
    loc_lines = [
        {"id": l.id, "name": l.name, "address": l.address or ""}
        for l in locations
    ]
    return (
        "Você é o assistente de registro de atividades do app ApontaMentto (folha de ponto). "
        "O usuário descreve atividades de trabalho que realizou. Sua tarefa é extrair os dados "
        "de CADA atividade em uma conversa de confirmação com o usuário.\n\n"
        "Campos de cada atividade:\n"
        "- date: dia em YYYY-MM-DD\n"
        "- start_time: início em HH:mm\n"
        "- end_time: término em HH:mm\n"
        "- project_id: id do projeto (escolha da lista o que melhor corresponder ao que o usuário disse; null se não houver)\n"
        "- location_id: id do local (idem)\n"
        "- project_name: se o usuário citar um projeto que NÃO existe na lista, coloque o nome mencionado aqui (e project_id=null)\n"
        "- location_name: idem para local inexistente\n"
        "- notes: observações curtas ou \"\" \n\n"
        f"PROJETOS disponíveis (id | nome | descrição):\n{json.dumps(proj_lines, ensure_ascii=False)}\n\n"
        f"LOCAIS disponíveis (id | nome | endereço):\n{json.dumps(loc_lines, ensure_ascii=False)}\n\n"
        f"Data de hoje (Brasília): {_today_brazil()}\n\n"
        "Regras:\n"
        "1. Se um campo faltar, NÃO invente data/projeto/local. Pergunte apenas o que falta, de forma curta e natural, em pt-BR.\n"
        "2. Se o usuário mencionar um projeto ou local, escolha o id mais próximo pelo nome/descrição. "
        "Se não houver correspondência com a lista, NÃO invente um id: deixe project_id/location_id como null e "
        "preencha project_name/location_name com o nome dito pelo usuário, avisando que esse projeto/local não existe "
        "e perguntando se ele quer que você o CRIE ao salvar (ou se prefere salvar sem projeto/local). "
        "Você pode CRIAR (POST) projetos e locais novos ao salvar, mas NUNCA pode alterar (update) nem excluir (delete) os existentes.\n"
        "3. Pode haver VÁRIAS atividades numa mesma mensagem — extraia todas.\n"
        "4. INTERPRETAÇÃO DE HORÁRIOS: considere o período do dia que o usuário disser para converter a hora.\n"
        "   - \"da manhã\" = entre 00:00 e 11:59\n"
        "   - \"da tarde\" = entre 12:00 e 17:59\n"
        "   - \"da noite\" = entre 18:00 e 23:59\n"
        "   - Ex.: \"11 da noite\" = 23:00; \"11:30 da noite\" = 23:30; \"3 da tarde\" = 15:00; "
        "\"meio-dia\" = 12:00; \"meia-noite\" = 00:00.\n"
        "   - Se o horário de início e término vierem juntos, os dois devem respeitar o MESMO período (ex.: "
        "\"das 11 às 11:30 da noite\" = 23:00 às 23:30, NUNCA 11:00 às 23:30).\n"
        "5. Quando o usuário disser que algo vale para TUDO ou para TODAS as atividades (ex.: \"foi tudo no CITAP\", "
        "\"tudo no mesmo projeto\", \"as demais também no escritório\", \"o resto igual\"), aplique esse projeto/local "
        "a TODAS as entradas que ainda não têm projeto/local definido, inclusive as já mencionadas antes.\n"
        "6. Quando uma atividade estiver completa, inclua-a em \"entries\" para o usuário confirmar (mesmo com ready_to_save=false).\n"
        "7. Quando o usuário confirmar explicitamente (\"confirmar\", \"ok\", \"pode salvar\", \"tudo certo\"...), "
        "responda com ready_to_save=true e repita TODAS as entradas pendentes em \"entries\".\n"
        "8. NUNCA invente project_id/location_id que não vieram da lista fornecida. Para projeto/local NOVO (inexistente na lista), "
        "sempre use project_id=null + project_name (ou location_id=null + location_name) com o nome dito pelo usuário, "
        "INCLUSIVE na resposta final de confirmação (ready_to_save=true). O sistema criará o projeto/local pelo nome.\n"
        "9. Nunca marque ready_to_save=true sem confirmação explícita do usuário.\n\n"
        'Responda SEMPRE apenas com JSON válido, sem markdown, neste formato:\n'
        '{"reply": "mensagem amigável em pt-BR", '
        '"entries": [{"date": "YYYY-MM-DD", "start_time": "HH:mm", "end_time": "HH:mm", '
        '"project_id": "id ou null", "location_id": "id ou null", '
        '"project_name": "nome novo ou null", "location_name": "nome novo ou null", "notes": ""}], '
        '"ready_to_save": false}'
    )


def _normalize_entry(entry: dict) -> dict:
    return {
        "date": _normalize_date(entry.get("date")) or _today_brazil(),
        "start_time": _normalize_time(entry.get("start_time")) or "",
        "end_time": _normalize_time(entry.get("end_time")) or "",
        "project_id": entry.get("project_id") or None,
        "location_id": entry.get("location_id") or None,
        "project_name": (entry.get("project_name") or "").strip() or None,
        "location_name": (entry.get("location_name") or "").strip() or None,
        "notes": (entry.get("notes") or "").strip(),
    }


async def _resolve_or_create_project(db: AsyncSession, name: str) -> str:
    """Cria (POST) um projeto novo se ainda não existir pelo nome (ci)."""
    result = await db.execute(
        select(Project).where(func.lower(Project.name) == name.lower())
    )
    existing = result.scalar_one_or_none()
    if existing:
        return existing.id
    project = Project(id=str(uuid.uuid4()), name=name, created_at=datetime.utcnow())
    db.add(project)
    await db.flush()
    return project.id


async def _resolve_or_create_location(db: AsyncSession, name: str) -> str:
    """Cria (POST) um local novo se ainda não existir pelo nome (ci)."""
    result = await db.execute(
        select(Location).where(func.lower(Location.name) == name.lower())
    )
    existing = result.scalar_one_or_none()
    if existing:
        return existing.id
    location = Location(id=str(uuid.uuid4()), name=name, created_at=datetime.utcnow())
    db.add(location)
    await db.flush()
    return location.id


def _merge_pending_names(
    entries: List[dict], pending: List[dict]
) -> List[dict]:
    """Reaproveita nomes de projeto/local novos que o modelo pode ter esquecido
    de repetir na confirmação final (match por data+início+fim)."""
    pending_by_key = {
        (e.get("date"), e.get("start_time"), e.get("end_time")): e
        for e in pending
    }
    merged = []
    for e in entries:
        key = (e.get("date"), e.get("start_time"), e.get("end_time"))
        p = pending_by_key.get(key) or {}
        if not e.get("project_id") and not e.get("project_name"):
            e["project_name"] = p.get("project_name") or None
        if not e.get("location_id") and not e.get("location_name"):
            e["location_name"] = p.get("location_name") or None
        merged.append(e)
    return merged


async def _save_entries(db: AsyncSession, user_id: str, entries: List[dict]) -> List[dict]:
    saved: List[dict] = []
    for raw in entries:
        entry = _normalize_entry(raw)
        if not entry["start_time"] or not entry["end_time"]:
            continue

        # Valida ids vindos do modelo (evita id inventado -> erro de FK).
        if entry["project_id"]:
            if await db.get(Project, entry["project_id"]) is None:
                entry["project_id"] = None
        if entry["location_id"]:
            if await db.get(Location, entry["location_id"]) is None:
                entry["location_id"] = None

        # Projeto/local inexistente mencionado pelo usuário: cria (POST) ao salvar.
        if not entry["project_id"] and entry["project_name"]:
            entry["project_id"] = await _resolve_or_create_project(db, entry["project_name"])
        if not entry["location_id"] and entry["location_name"]:
            entry["location_id"] = await _resolve_or_create_location(db, entry["location_name"])

        row = TimeEntry(
            id=str(uuid.uuid4()),
            date=entry["date"],
            start_time=entry["start_time"],
            end_time=entry["end_time"],
            project_id=entry["project_id"],
            location_id=entry["location_id"],
            notes=entry["notes"],
            entry_type="work",
            is_overtime=False,
            user_id=user_id,
            created_at=datetime.utcnow(),
        )
        db.add(row)
        saved.append(
            {
                "id": row.id,
                "date": row.date,
                "start_time": row.start_time,
                "end_time": row.end_time,
                "project_id": row.project_id,
                "location_id": row.location_id,
                "project_name": entry["project_name"],
                "location_name": entry["location_name"],
                "notes": row.notes,
            }
        )
    if saved:
        await db.commit()
    return saved


async def _load_projects_locations(db: AsyncSession):
    projects = (await db.execute(select(Project).order_by(Project.name))).scalars().all()
    locations = (
        (await db.execute(select(Location).order_by(Location.name))).scalars().all()
    )
    return projects, locations


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
@router.post("/chat", response_model=ChatResponse)
async def ai_chat(
    data: ChatRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    projects, locations = await _load_projects_locations(db)

    system_prompt = _build_system_prompt(projects, locations)

    history = [
        {"role": m.role, "content": m.content}
        for m in data.history[-20:]
        if m.role in {"user", "assistant"}
    ]
    messages: List[dict] = [{"role": "system", "content": system_prompt}]
    messages.extend(history)
    messages.append({"role": "user", "content": data.message})

    raw = await _call_openrouter(messages)
    parsed = _extract_json(raw) or {}

    reply = str(parsed.get("reply") or "").strip()
    entries = [_normalize_entry(e) for e in (parsed.get("entries") or []) if isinstance(e, dict)]
    ready_to_save = bool(parsed.get("ready_to_save"))

    if ready_to_save:
        # Fallback: se o modelo confirmar mas não repetir as entradas,
        # usa as pendências guardadas da última proposta.
        if not entries:
            entries = _pending.get(current_user.id, [])
        else:
            entries = _merge_pending_names(entries, _pending.get(current_user.id, []))
        if entries:
            if not reply:
                reply = "Perfeito! Vou salvar os registros."
            saved = await _save_entries(db, current_user.id, entries)
            _pending.pop(current_user.id, None)
            if not saved and not reply:
                reply = "Não consegui salvar — os registros estavam incompletos."
            return ChatResponse(
                reply=reply,
                entries=[],
                saved=saved,
                pending=_pending.get(current_user.id, []),
            )
        if not reply:
            reply = "Não identifiquei registros para salvar. Pode repetir as atividades?"

    # Ainda não confirmado: guarda as propostas como pendências
    if entries:
        _pending[current_user.id] = entries

    return ChatResponse(
        reply=reply,
        entries=entries,
        saved=[],
        pending=_pending.get(current_user.id, []),
    )


@router.post("/confirm", response_model=ChatResponse)
async def ai_confirm(
    data: ConfirmRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    entries = [_normalize_entry(e) for e in data.entries if isinstance(e, dict)]
    saved = await _save_entries(db, current_user.id, entries)
    _pending.pop(current_user.id, None)
    reply = (
        f"Registros salvos ({len(saved)})."
        if saved
        else "Não consegui salvar — os registros estavam incompletos."
    )
    return ChatResponse(reply=reply, entries=[], saved=saved, pending=[])


@router.post("/transcribe", response_model=TranscribeResponse)
async def ai_transcribe(
    file: UploadFile = File(...),
    _: User = Depends(get_current_user),
):
    _env()
    if not OPENROUTER_API_KEY:
        raise HTTPException(
            503, "OPEN_ROUTER_API_KEY não configurada no servidor."
        )

    raw = await file.read()
    if not raw:
        raise HTTPException(400, "Arquivo de áudio vazio.")

    mime = (file.content_type or "audio/webm").lower()
    fmt_map = {
        "audio/webm": "webm",
        "audio/mp4": "mp4",
        "audio/m4a": "m4a",
        "audio/mpeg": "mp3",
        "audio/mp3": "mp3",
        "audio/wav": "wav",
        "audio/x-wav": "wav",
        "audio/ogg": "ogg",
        "audio/opus": "opus",
    }
    fmt = fmt_map.get(mime, "webm")
    b64 = base64.b64encode(raw).decode("ascii")

    messages = [
        {
            "role": "system",
            "content": "Transcreva fielmente o áudio em português. Retorne APENAS o texto transcrito, sem comentários.",
        },
        {
            "role": "user",
            "content": [
                {"type": "text", "text": "Transcreva este áudio:"},
                {
                    "type": "input_audio",
                    "input_audio": {"data": b64, "format": fmt},
                },
            ],
        },
    ]

    text = await _call_openrouter(messages, model=AUDIO_MODEL, temperature=0.0)
    return TranscribeResponse(text=text.strip())
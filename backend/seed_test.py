# seed_test.py — ESTE ARQUIVO É IGNORADO PELO GIT (ver .gitignore)
# Popula o banco com 3 usuários de teste + projetos + locais + 1 mês de lançamentos.
# Execute: python seed_test.py  (ou docker compose exec backend python seed_test.py)

import asyncio
import random
import uuid
from datetime import date, timedelta

from database import AsyncSessionLocal
from models import Location, Project, TimeEntry, User
from security import hash_password
from sqlalchemy import select

# ─── Configuração ─────────────────────────────────────────────────────────────

# Mês de referência para os lançamentos (ajuste se quiser outro mês)
ANO = 2026
MES = 2  # Fevereiro

TEST_PASSWORD = "Teste123_"

USERS = [
    {"name": "Ana Souza",    "email": "ana.souza@teste.com",    "hourly_rate": 45.0},
    {"name": "Bruno Lima",   "email": "bruno.lima@teste.com",   "hourly_rate": 55.0},
    {"name": "Carla Mendes", "email": "carla.mendes@teste.com", "hourly_rate": 50.0},
]

PROJECTS = [
    {"name": "MenttoSys", "color": "#0f766e", "description": ""},
    {"name": "InovaSys", "color": "#7c3aed", "description": ""},
    {"name": "ApontaMentto", "color": "#b45309", "description": ""},
    {"name": "SentinelaAPP", "color": "#b45309", "description": ""},
    {"name": "InovaSkill","color": "#1d4ed8", "description": ""},
    {"name": "CCDs","color": "#1d4ed8", "description": ""},
]

LOCATIONS = [
    {"name": "CITAP",  "address": "Av. Shunji Nishimura, 605 - Pompéia, SP"},
    {"name": "Mentto House","address": "R. Dázio Ferreira Lessa, 166 - Jardim São Luiz, Pompéia - SP"},
    {"name": "Home Office", "address": ""},
]

NOTES = [
    "Desenvolvimento de novas funcionalidades",
    "Revisão de código e code review",
    "Reunião de alinhamento com o time",
    "Correção de bugs reportados",
    "Documentação do projeto",
    "Planejamento do sprint",
    "Integração com API externa",
    "Testes automatizados",
    "Deploy em homologação",
    "Atendimento ao cliente",
    "",
]

# Horários de entrada possíveis (HH:mm)
START_TIMES = ["08:00", "08:30", "09:00", "09:30"]
# Duração do turno em horas (meia jornada ou jornada completa)
DURATIONS = [4, 5, 6, 7, 8, 8, 8]  # maioria jornada completa


# ─── Helpers ──────────────────────────────────────────────────────────────────

def working_days(year: int, month: int) -> list[date]:
    """Retorna todos os dias úteis (seg–sex) do mês."""
    d = date(year, month, 1)
    days = []
    while d.month == month:
        if d.weekday() < 5:  # 0=seg … 4=sex
            days.append(d)
        d += timedelta(days=1)
    return days


def add_hours(time_str: str, hours: int) -> str:
    h, m = map(int, time_str.split(":"))
    total_min = h * 60 + m + hours * 60
    return f"{total_min // 60:02d}:{total_min % 60:02d}"


# ─── Seed ─────────────────────────────────────────────────────────────────────

async def seed_test() -> None:
    async with AsyncSessionLocal() as session:

        # ── Projetos ──────────────────────────────────────────────────────────
        project_objs: list[Project] = []
        for p in PROJECTS:
            res = await session.execute(select(Project).where(Project.name == p["name"]))
            obj = res.scalar_one_or_none()
            if obj is None:
                obj = Project(id=str(uuid.uuid4()), **p)
                session.add(obj)
                print(f"  + Projeto: {p['name']}")
            else:
                print(f"  = Projeto já existe: {p['name']}")
            project_objs.append(obj)

        # ── Locais ────────────────────────────────────────────────────────────
        location_objs: list[Location] = []
        for l in LOCATIONS:
            res = await session.execute(select(Location).where(Location.name == l["name"]))
            obj = res.scalar_one_or_none()
            if obj is None:
                obj = Location(id=str(uuid.uuid4()), **l)
                session.add(obj)
                print(f"  + Local: {l['name']}")
            else:
                print(f"  = Local já existe: {l['name']}")
            location_objs.append(obj)

        await session.flush()  # garante IDs antes de criar lançamentos

        # ── Usuários + lançamentos ────────────────────────────────────────────
        days = working_days(ANO, MES)
        total_entries = 0

        for u in USERS:
            res = await session.execute(select(User).where(User.email == u["email"]))
            user_obj = res.scalar_one_or_none()

            if user_obj is None:
                user_obj = User(
                    id=str(uuid.uuid4()),
                    username=u["name"],
                    email=u["email"],
                    hashed_password=hash_password(TEST_PASSWORD),
                    role="user",
                    hourly_rate=u["hourly_rate"],
                )
                session.add(user_obj)
                print(f"  + Usuário: {u['email']}")
            else:
                print(f"  = Usuário já existe: {u['email']}")

            await session.flush()

            # Verificar se usuário já tem lançamentos no mês
            existing = await session.execute(
                select(TimeEntry).where(
                    TimeEntry.user_id == user_obj.id,
                    TimeEntry.date.like(f"{ANO}-{MES:02d}-%"),
                )
            )
            if existing.scalars().first() is not None:
                print(f"    → Lançamentos já existem para {u['email']} em {ANO}-{MES:02d}. Pulando.")
                continue

            # ~80% chance de trabalhar em cada dia útil (simula faltas/feriados)
            rng = random.Random(u["email"])  # seed determinístico por usuário
            worked_days = [d for d in days if rng.random() < 0.85]

            for day in worked_days:
                # Cada dia pode ter 1 ou 2 lançamentos (ex: manhã + tarde)
                num_entries = rng.choices([1, 2], weights=[60, 40])[0]
                start = rng.choice(START_TIMES)
                duration = rng.choice(DURATIONS)

                for i in range(num_entries):
                    if i == 1:
                        # turno da tarde começa ~1h depois do fim do primeiro
                        start = add_hours(add_hours(start, duration), 1)
                        duration = rng.choice([2, 3, 4])

                    end = add_hours(start, duration)
                    entry = TimeEntry(
                        id=str(uuid.uuid4()),
                        date=day.isoformat(),
                        start_time=start,
                        end_time=end,
                        notes=rng.choice(NOTES),
                        user_id=user_obj.id,
                        project_id=rng.choice(project_objs).id,
                        location_id=rng.choice(location_objs).id,
                    )
                    session.add(entry)
                    total_entries += 1

        await session.commit()
        print(f"\n✓ Seed de teste concluído — {total_entries} lançamentos criados.")
        print(f"  Senha dos 3 usuários: {TEST_PASSWORD}")


if __name__ == "__main__":
    asyncio.run(seed_test())

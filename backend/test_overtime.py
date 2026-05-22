"""
Testa a função _auto_overtime_minutes sem precisar subir o servidor.
Execute com: python test_overtime.py
"""

from routers.daily_records import _auto_overtime_minutes


def check(label: str, got: int, expected: int):
    status = "✅" if got == expected else "❌"
    print(f"  {status} {label}: {got}min (esperado: {expected}min)")


print("\n=== CLT (8h = 480min) — dia de semana ===")
# Exato 8h → sem HE
check("8h exatas",
      _auto_overtime_minutes("clt", "2026-04-15", "08:00", "12:00", "13:00", "17:00"),
      0)

# 8h30 → 30min HE
check("8h30 trabalhadas (blocos)",
      _auto_overtime_minutes("clt", "2026-04-15", "08:00", "12:00", "13:00", "17:30"),
      30)

# 9h → 60min HE
check("9h trabalhadas",
      _auto_overtime_minutes("clt", "2026-04-15", "08:00", "12:00", "13:00", "18:00"),
      60)

# Só in1+out2 sem almoço (legado) — 8h30 → 30min HE
check("Legado 8h30 (só in1+out2)",
      _auto_overtime_minutes("clt", "2026-04-15", "08:00", None, None, "16:30"),
      30)

# Incompleto (sem out2) → 0
check("Incompleto (sem out2)",
      _auto_overtime_minutes("clt", "2026-04-15", "08:00", "12:00", "13:00", None),
      0)


print("\n=== Estagiário (6h = 360min) — dia de semana ===")
# Exato 6h → sem HE
check("6h exatas",
      _auto_overtime_minutes("estagiario", "2026-04-15", "09:00", None, None, "15:00"),
      0)

# 6h30 → 30min HE
check("6h30 trabalhadas",
      _auto_overtime_minutes("estagiario", "2026-04-15", "09:00", None, None, "15:30"),
      30)

# 7h → 60min HE
check("7h trabalhadas",
      _auto_overtime_minutes("estagiario", "2026-04-15", "09:00", None, None, "16:00"),
      60)

# Incompleto (sem out2) → 0
check("Incompleto (sem out2)",
      _auto_overtime_minutes("estagiario", "2026-04-15", "09:00", None, None, None),
      0)

# 5h → sem HE (abaixo da jornada)
check("5h trabalhadas (abaixo da jornada)",
      _auto_overtime_minutes("estagiario", "2026-04-15", "09:00", None, None, "14:00"),
      0)


print("\n=== Final de semana (tudo é HE) ===")
# CLT sábado: 4h → 4h de HE
check("CLT sábado 4h (só in1+out2)",
      _auto_overtime_minutes("clt", "2026-04-18", "09:00", None, None, "13:00"),
      240)

# Estagiário domingo: 1h → 1h HE
check("Estagiário domingo 1h",
      _auto_overtime_minutes("estagiario", "2026-04-19", "10:00", None, None, "11:00"),
      60)

# CLT sábado com 4 horários: (11-9)+(14-12) = 2+2 = 4h = 240min, threshold=0 logo tudo é HE
check("CLT sábado 4h (blocos com almoço)",
      _auto_overtime_minutes("clt", "2026-04-18", "09:00", "11:00", "12:00", "14:00"),
      240)

check("CLT sábado 4h (blocos)",
      _auto_overtime_minutes("clt", "2026-04-18", "09:00", "11:00", "12:00", "14:00"),
      240)


print("\n=== PJ / Dono (sem cálculo) ===")
check("PJ sem HE mesmo trabalhando 12h",
      _auto_overtime_minutes("pj", "2026-04-15", "08:00", "12:00", "13:00", "21:00"),
      0)

check("Dono sem HE",
      _auto_overtime_minutes("dono", "2026-04-15", "08:00", None, None, "22:00"),
      0)



print("\n=== extra_in/extra_out (input manual de hora extra) ===")
# CLT 8h exatas + 1h extra explícita → HE = 1h (sem duplicidade)
check("CLT 8h + 1h extra explícita",
      _auto_overtime_minutes("clt", "2026-04-15", "08:00", "12:00", "13:00", "17:00",
                             extra_in="17:00", extra_out="18:00"),
      60)

# CLT 8h30 (já HE) + 30min extra explícita → HE = 60min (30 auto + 30 extra, sem duplicidade)
check("CLT 8h30 + 30min extra",
      _auto_overtime_minutes("clt", "2026-04-15", "08:00", "12:00", "13:00", "17:30",
                             extra_in="18:00", extra_out="18:30"),
      60)

# CLT 7h (abaixo da jornada) + 2h extra explícita → HE = 1h (7+2=9h - 8h threshold)
check("CLT 7h + 2h extra (cobre gap + gera HE)",
      _auto_overtime_minutes("clt", "2026-04-15", "08:00", "12:00", "13:00", "16:00",
                             extra_in="17:00", extra_out="19:00"),
      60)

# CLT 8h + 2h extra, extra contíguo ao out2 → HE = 2h
check("CLT 8h + 2h extra contíguo",
      _auto_overtime_minutes("clt", "2026-04-15", "08:00", "12:00", "13:00", "17:00",
                             extra_in="17:00", extra_out="19:00"),
      120)

# Estagiário 6h + 1h extra → HE = 1h
check("Estagiário 6h + 1h extra",
      _auto_overtime_minutes("estagiario", "2026-04-15", "09:00", None, None, "15:00",
                             extra_in="16:00", extra_out="17:00"),
      60)

# Fim de semana com extra_in/extra_out → tudo é HE
check("Sábado CLT 2h + 1h extra = 3h HE",
      _auto_overtime_minutes("clt", "2026-04-18", "09:00", None, None, "11:00",
                             extra_in="12:00", extra_out="13:00"),
      180)

# PJ com extra_in/extra_out → retorna extra_worked (horas normais não geram HE, mas extra explícito sim)
check("PJ com 1h extra explícita",
      _auto_overtime_minutes("pj", "2026-04-15", "08:00", "12:00", "13:00", "17:00",
                             extra_in="17:00", extra_out="18:00"),
      60)

print()

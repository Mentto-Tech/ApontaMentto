"""
Testa a função _auto_overtime_minutes (regra automática de horas extras).

Roda junto com a suíte (pytest) ou standalone:
    python test_overtime.py
"""

import pytest

from routers.daily_records import _auto_overtime_minutes

# (label, category, date, in1, out1, in2, out2, extra_in, extra_out, expected_min)
CASES = [
    # --- CLT (8h = 480min) — dia de semana ---
    ("8h exatas", "clt", "2026-04-15", "08:00", "12:00", "13:00", "17:00", None, None, 0),
    ("8h30 trabalhadas (blocos)", "clt", "2026-04-15", "08:00", "12:00", "13:00", "17:30", None, None, 30),
    ("9h trabalhadas", "clt", "2026-04-15", "08:00", "12:00", "13:00", "18:00", None, None, 60),
    ("Legado 8h30 (só in1+out2)", "clt", "2026-04-15", "08:00", None, None, "16:30", None, None, 30),
    ("Incompleto (sem out2)", "clt", "2026-04-15", "08:00", "12:00", "13:00", None, None, None, 0),
    # --- Estagiário (6h = 360min) — dia de semana ---
    ("6h exatas", "estagiario", "2026-04-15", "09:00", None, None, "15:00", None, None, 0),
    ("6h30 trabalhadas", "estagiario", "2026-04-15", "09:00", None, None, "15:30", None, None, 30),
    ("7h trabalhadas", "estagiario", "2026-04-15", "09:00", None, None, "16:00", None, None, 60),
    ("Incompleto (sem out2)", "estagiario", "2026-04-15", "09:00", None, None, None, None, None, 0),
    ("5h trabalhadas (abaixo da jornada)", "estagiario", "2026-04-15", "09:00", None, None, "14:00", None, None, 0),
    # --- Final de semana (tudo é HE) ---
    ("CLT sábado 4h (só in1+out2)", "clt", "2026-04-18", "09:00", None, None, "13:00", None, None, 240),
    ("Estagiário domingo 1h", "estagiario", "2026-04-19", "10:00", None, None, "11:00", None, None, 60),
    ("CLT sábado 4h (blocos com almoço)", "clt", "2026-04-18", "09:00", "11:00", "12:00", "14:00", None, None, 240),
    ("CLT sábado 4h (blocos)", "clt", "2026-04-18", "09:00", "11:00", "12:00", "14:00", None, None, 240),
    # --- PJ / Dono (sem cálculo) ---
    ("PJ sem HE mesmo trabalhando 12h", "pj", "2026-04-15", "08:00", "12:00", "13:00", "21:00", None, None, 0),
    ("Dono sem HE", "dono", "2026-04-15", "08:00", None, None, "22:00", None, None, 0),
    # --- extra_in/extra_out (input manual de hora extra) ---
    # Regra atual: o bloco extra explícito é contado integralmente como HE;
    # a base (pontos normais) gera HE só pelo excedente sobre a jornada.
    ("CLT 8h + 1h extra explícita", "clt", "2026-04-15", "08:00", "12:00", "13:00", "17:00", "17:00", "18:00", 60),
    ("CLT 8h30 + 30min extra", "clt", "2026-04-15", "08:00", "12:00", "13:00", "17:30", "18:00", "18:30", 60),
    ("CLT 7h + 2h extra (extra explícito integral)", "clt", "2026-04-15", "08:00", "12:00", "13:00", "16:00", "17:00", "19:00", 120),
    ("CLT 8h + 2h extra contíguo", "clt", "2026-04-15", "08:00", "12:00", "13:00", "17:00", "17:00", "19:00", 120),
    ("Estagiário 6h + 1h extra", "estagiario", "2026-04-15", "09:00", None, None, "15:00", "16:00", "17:00", 60),
    ("Sábado CLT 2h + 1h extra = 3h HE", "clt", "2026-04-18", "09:00", None, None, "11:00", "12:00", "13:00", 180),
    ("PJ com 1h extra explícita", "pj", "2026-04-15", "08:00", "12:00", "13:00", "17:00", "17:00", "18:00", 60),
]

_CASE_IDS = [c[0] for c in CASES]


@pytest.mark.parametrize(
    "label,category,date_str,in1,out1,in2,out2,extra_in,extra_out,expected",
    CASES,
    ids=_CASE_IDS,
)
def test_auto_overtime_minutes(
    label, category, date_str, in1, out1, in2, out2, extra_in, extra_out, expected
):
    got = _auto_overtime_minutes(
        category=category,
        date_str=date_str,
        in1=in1,
        out1=out1,
        in2=in2,
        out2=out2,
        extra_in=extra_in,
        extra_out=extra_out,
    )
    assert got == expected, f"{label}: esperado {expected}min, obteve {got}min"


if __name__ == "__main__":
    # Modo standalone (imprime o resultado de cada caso)
    print()
    current_section = None
    ok = True
    for label, category, date_str, in1, out1, in2, out2, extra_in, extra_out, expected in CASES:
        got = _auto_overtime_minutes(
            category=category,
            date_str=date_str,
            in1=in1,
            out1=out1,
            in2=in2,
            out2=out2,
            extra_in=extra_in,
            extra_out=extra_out,
        )
        status = "OK" if got == expected else "FAIL"
        ok = ok and got == expected
        print(f"  [{status}] {label}: {got}min (esperado: {expected}min)")
    print(f"\nResultado: {'TODOS PASSARAM' if ok else 'HOUVE FALHAS'}")
    raise SystemExit(0 if ok else 1)
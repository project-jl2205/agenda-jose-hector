"""Genera rrule_casos.json con las fechas esperadas según dateutil (la referencia de Python).
La web (js/recurrencia.js) debe dar exactamente las mismas: ver probar_recurrencia.mjs."""
import json, sys
from datetime import date, datetime
from dateutil.rrule import rrulestr

CASOS = [
    ("FREQ=DAILY", "2026-10-01", None, "2026-10-10", "2026-10-20"),
    ("FREQ=DAILY;INTERVAL=3", "2026-10-01", None, "2026-10-05", "2026-11-05"),
    ("FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR", "2026-09-30", None, "2026-10-01", "2026-10-31"),
    ("FREQ=DAILY;INTERVAL=2;BYDAY=MO,WE,FR", "2026-10-01", None, "2026-10-01", "2026-11-15"),
    ("FREQ=WEEKLY", "2026-10-08", None, "2026-10-01", "2026-12-31"),
    ("FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", "2026-10-03", None, "2026-10-01", "2026-10-25"),
    ("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE", "2026-10-08", None, "2026-10-01", "2026-12-31"),
    ("FREQ=WEEKLY;INTERVAL=3;BYDAY=SU", "2026-01-04", None, "2026-10-01", "2026-12-31"),
    ("FREQ=WEEKLY;BYDAY=TU,TH", "2026-09-29", "2026-10-22", "2026-10-01", "2026-12-31"),
    ("FREQ=MONTHLY", "2026-01-31", None, "2026-01-01", "2026-12-31"),
    ("FREQ=MONTHLY;BYMONTHDAY=15", "2026-10-20", None, "2026-10-01", "2027-03-31"),
    ("FREQ=MONTHLY;BYMONTHDAY=-1", "2026-01-10", None, "2026-01-01", "2026-12-31"),
    ("FREQ=MONTHLY;BYMONTHDAY=31", "2026-01-01", None, "2026-01-01", "2026-12-31"),
    ("FREQ=MONTHLY;BYDAY=1FR", "2026-10-01", None, "2026-10-01", "2027-06-30"),
    ("FREQ=MONTHLY;BYDAY=-1MO", "2026-10-01", None, "2026-10-01", "2027-06-30"),
    ("FREQ=MONTHLY;INTERVAL=2;BYDAY=2TU", "2026-10-01", None, "2026-10-01", "2027-12-31"),
    ("FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=1", "2026-02-01", None, "2026-05-15", "2027-12-31"),
    ("FREQ=DAILY", "2026-10-10", "2026-10-14", "2026-10-01", "2026-10-31"),
    ("FREQ=WEEKLY;BYDAY=SA,SU;UNTIL=20261115", "2026-10-01", None, "2026-10-01", "2026-12-31"),
    ("FREQ=DAILY;INTERVAL=7", "2026-03-25", None, "2026-03-20", "2026-04-30"),
    ("FREQ=WEEKLY;INTERVAL=2", "2026-12-30", None, "2026-12-01", "2027-02-28"),
]

def esperado(regla, inicio, hasta, desde, fin):
    d0 = datetime.fromisoformat(inicio)
    r = rrulestr(regla, dtstart=d0)
    a, b = datetime.fromisoformat(desde), datetime.fromisoformat(fin)
    if hasta:
        b = min(b, datetime.fromisoformat(hasta))
    return [x.date().isoformat() for x in r.between(a, b, inc=True)]

salida = [{"rrule": c[0], "fecha": c[1], "hasta": c[2], "desde": c[3], "fin": c[4], "esperado": esperado(*c)} for c in CASOS]
json.dump(salida, open(sys.argv[1], "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(f"{len(salida)} casos -> {sys.argv[1]}")

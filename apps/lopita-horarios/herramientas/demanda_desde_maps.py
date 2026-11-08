"""Convierte horario + concurrencia de Google Maps en tipos de dia de demanda.

  python herramientas/demanda_desde_maps.py datos/maps_lopita.json datos/ejemplo.json datos/propuesta_maps.json

El indice de Maps es relativo (100 = pico semanal), no clientes: la conversion a
personas usa UMBRALES que hay que calibrar con el TPV / la experiencia del equipo.
"""
import json, sys, math

UMBRALES = [(0, 2), (45, 3), (70, 4)]   # indice >= x  ->  personas
MIN_ABIERTO = 2                          # minimo de personas con el local abierto
PREP = 1                                 # personas 30 min antes de abrir y 30 min despues de cerrar

def m(h): h_, mm = h.split(":"); return int(h_) * 60 + int(mm)
def f(x): return f"{x // 60:02d}:{x % 60:02d}"
def personas(idx):
    p = MIN_ABIERTO
    for u, n in UMBRALES:
        if idx >= u: p = max(p, n)
    return p

def dia(horario, px, escala):
    a, c = m(horario[0]), m(horario[1])
    cells = [(a - 30, PREP)]
    for t in range(a, c, 30):
        idx = px.get(str(t // 60), 0) / escala * 100
        cells.append((t, personas(idx)))
    cells.append((c, PREP))
    out = []
    for t, p in cells:
        if out and out[-1]["personas"] == p and m(out[-1]["fin"]) == t:
            out[-1]["fin"] = f(t + 30)
        else:
            out.append({"inicio": f(t), "fin": f(t + 30), "personas": p})
    return out

def media(px_list):
    horas = set().union(*[p.keys() for p in px_list])
    return {h: sum(p.get(h, 0) for p in px_list) / len(px_list) for h in horas}

def main(maps_f, cfg_f, out_f):
    M = json.load(open(maps_f, encoding="utf-8")); cfg = json.load(open(cfg_f, encoding="utf-8"))
    E, H, P = M["escala_maximo_px"], M["horario"], M["concurrencia_px"]
    lj = ["lunes", "martes", "miercoles", "jueves"]
    tipos = {
        "laborable": dia(H["lunes"], media([P[d] for d in lj]), E),
        "viernes": dia(H["viernes"], P["viernes"], E),
        "sabado": dia(H["sabado"], P["sabado"], E),
        "domingo": dia(H["domingo"], P["domingo"], E),
    }
    cfg["tipos_dia"] = [{"nombre": n, "franjas": fr} for n, fr in tipos.items()]
    cfg["tipo_dia_por_semana"]["viernes"] = "viernes"
    cfg["tipo_dia_festivo"] = "domingo"
    json.dump(cfg, open(out_f, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    return tipos

if __name__ == "__main__":
    t = main(*sys.argv[1:4])
    for n, fr in t.items():
        print(n, " | ".join(f"{x['inicio']}-{x['fin']}:{x['personas']}" for x in fr))

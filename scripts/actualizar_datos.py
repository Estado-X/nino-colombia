#!/usr/bin/env python3
"""Baja los datos públicos del tablero y los guarda resumidos en data/.

Fuentes (todas abiertas y sin claves):
  - NOAA CPC: índice ONI (El Niño / La Niña).
  - IDEAM en datos.gov.co: lluvia (s54a-sgyg) y temperatura máxima (ccvq-rp9s).
  - XM: volumen útil de los embalses y aportes hídricos (servapibi.xm.com.co).
  - NASA FIRMS: focos de calor VIIRS de las últimas 24 horas.

Solo usa la biblioteca estándar de Python 3.9+.
Uso: python scripts/actualizar_datos.py
"""
import csv
import io
import json
import socket
import sys
import time
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

# Algunos servidores (NASA FIRMS) publican una dirección IPv6 que los equipos de GitHub
# Actions no alcanzan ("Network is unreachable"). Se fuerza IPv4 para todas las consultas.
_getaddrinfo = socket.getaddrinfo


def _solo_ipv4(host, port, family=0, *args, **kwargs):
    return _getaddrinfo(host, port, socket.AF_INET, *args, **kwargs)


socket.getaddrinfo = _solo_ipv4

RAIZ = Path(__file__).resolve().parent.parent
DATOS = RAIZ / "data"
AGENTE = "nino-colombia/1.0 (+https://github.com/Estado-X/nino-colombia)"
HOY = datetime.now(timezone.utc).date()

# Límites de control de calidad (valores fuera de rango = error del sensor).
LLUVIA30_MAX = 2000.0   # mm en 30 días; supera los máximos mensuales registrados en Colombia
LLUVIA7_MAX = 800.0     # mm en 7 días
TMAX_MIN, TMAX_MAX = 5.0, 45.0  # °C de temperatura máxima plausible en estaciones colombianas


def bajar(url, datos=None, intentos=3, espera=60):
    cabeceras = {"User-Agent": AGENTE}
    cuerpo = None
    if datos is not None:
        cuerpo = json.dumps(datos).encode("utf-8")
        cabeceras["Content-Type"] = "application/json"
    for n in range(1, intentos + 1):
        try:
            req = urllib.request.Request(url, data=cuerpo, headers=cabeceras)
            with urllib.request.urlopen(req, timeout=espera) as r:
                return r.read()
        except Exception as e:  # red o servidor caído: se reintenta
            if n == intentos:
                raise
            print(f"  reintento {n} ({e})", file=sys.stderr)
            time.sleep(5 * n)


def guardar(nombre, obj):
    (DATOS / nombre).write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"  data/{nombre} listo")


# ---------------------------------------------------------------- ONI (NOAA)
def oni():
    print("ONI · NOAA CPC")
    txt = bajar("https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt").decode()
    serie = []
    for linea in txt.splitlines()[1:]:
        p = linea.split()
        if len(p) == 4 and int(p[1]) >= 2015:
            serie.append({"trimestre": p[0], "anio": int(p[1]), "anomalia": float(p[3])})
    ultimo = serie[-1]
    guardar("oni.json", {
        "fuente": "NOAA Climate Prediction Center, Oceanic Niño Index (ONI)",
        "url": "https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt",
        "actualizado": HOY.isoformat(),
        "ultimo": ultimo,
        "serie": serie,
    })


# ------------------------------------------------------ IDEAM (datos.gov.co)
def socrata(recurso, select, where, group):
    q = urllib.parse.urlencode({"$select": select, "$where": where, "$group": group, "$limit": 50000})
    return json.loads(bajar(f"https://www.datos.gov.co/resource/{recurso}.json?{q}", espera=180))


def num(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


def estaciones_lluvia(dias):
    desde = (HOY - timedelta(days=dias)).isoformat() + "T00:00:00"
    filas = socrata(
        "s54a-sgyg",
        "codigoestacion,codigosensor,nombreestacion,municipio,departamento,latitud,longitud,"
        "sum(valorobservado) as mm,count(*) as n,max(fechaobservacion) as ultima",
        f"fechaobservacion >= '{desde}'",
        "codigoestacion,codigosensor,nombreestacion,municipio,departamento,latitud,longitud",
    )
    # Algunas estaciones reportan por dos sensores (0240 y 0257): se toma el que más datos tiene.
    mejor = {}
    for f in filas:
        k = f["codigoestacion"]
        if k not in mejor or int(f["n"]) > int(mejor[k]["n"]):
            mejor[k] = f
    return mejor


def ideam():
    print("Lluvia · IDEAM")
    s7 = estaciones_lluvia(7)
    s30 = estaciones_lluvia(30)
    print("Temperatura máxima · IDEAM")
    desde7 = (HOY - timedelta(days=7)).isoformat() + "T00:00:00"
    tmax = socrata(
        "ccvq-rp9s",
        "codigoestacion,nombreestacion,municipio,departamento,latitud,longitud,max(valorobservado) as tmax,max(fechaobservacion) as ultima",
        f"fechaobservacion >= '{desde7}'",
        "codigoestacion,nombreestacion,municipio,departamento,latitud,longitud",
    )
    est = {}
    for k, f in s30.items():
        lat, lon = num(f["latitud"]), num(f["longitud"])
        if lat is None or lon is None:
            continue
        l30 = num(f["mm"])
        l7 = num(s7[k]["mm"]) if k in s7 else None
        # Control de calidad: acumulados imposibles son errores del sensor y no se muestran.
        if l30 is not None and l30 > LLUVIA30_MAX:
            l30 = None
        if l7 is not None and l7 > LLUVIA7_MAX:
            l7 = None
        ultima = f["ultima"][:10]
        est[k] = {
            "id": k, "nombre": f["nombreestacion"], "municipio": f["municipio"].title(),
            "departamento": f["departamento"].title(), "lat": round(lat, 5), "lon": round(lon, 5),
            "lluvia30": round(l30, 1) if l30 is not None else None,
            "lluvia7": round(l7, 1) if l7 is not None else None,
            "tmax7": None, "ultimaLluvia": ultima,
            "reciente": ultima >= (HOY - timedelta(days=3)).isoformat(),
        }
    for f in tmax:
        lat, lon = num(f["latitud"]), num(f["longitud"])
        t = num(f["tmax"])
        if lat is None or lon is None or t is None or not (TMAX_MIN <= t <= TMAX_MAX):
            continue
        k = f["codigoestacion"]
        if k not in est:
            est[k] = {"id": k, "nombre": f["nombreestacion"], "municipio": f["municipio"].title(),
                      "departamento": f["departamento"].title(), "lat": round(lat, 5), "lon": round(lon, 5),
                      "lluvia30": None, "lluvia7": None, "ultimaLluvia": None, "reciente": True}
        est[k]["tmax7"] = round(t, 1)
    guardar("estaciones.json", {
        "fuente": "IDEAM, datos abiertos en datos.gov.co: Precipitación (s54a-sgyg) y Temperatura Máxima del Aire (ccvq-rp9s)",
        "url": "https://www.datos.gov.co/resource/s54a-sgyg",
        "actualizado": HOY.isoformat(),
        "nota": "Lluvia acumulada en milímetros (7 y 30 días) y temperatura máxima de los últimos 7 días en °C. Son datos de estaciones automáticas sin validar: se descartan valores imposibles (más de 2.000 mm en 30 días, más de 800 mm en 7 días o máximas fuera de 5 a 45 °C). 'reciente' es falso si la estación no reporta lluvia hace más de 3 días.",
        "estaciones": sorted(est.values(), key=lambda e: (e["departamento"], e["municipio"], e["nombre"])),
    })


# ----------------------------------------------------------------- XM
def xm_diario(metrica, entidad, dias):
    puntos = []
    fin = HOY - timedelta(days=1)
    inicio_total = fin - timedelta(days=dias - 1)
    a = inicio_total
    while a <= fin:
        b = min(a + timedelta(days=29), fin)
        r = json.loads(bajar("https://servapibi.xm.com.co/daily", {
            "MetricId": metrica, "StartDate": a.isoformat(), "EndDate": b.isoformat(),
            "Entity": entidad, "Filter": []}, espera=120))
        for it in r.get("Items", []):
            for e in it["DailyEntities"]:
                puntos.append({"fecha": it["Date"][:10], "nombre": e.get("Name", entidad), "valor": num(e["Value"])})
        a = b + timedelta(days=1)
    return puntos


def xm():
    print("Embalses · XM")
    vol = xm_diario("PorcVoluUtilDiar", "Sistema", 120)
    apo = xm_diario("PorcApor", "Sistema", 120)
    fin = HOY - timedelta(days=1)
    ult = []
    for d in range(0, 5):  # el último día con datos por embalse
        ult = xm_diario("PorcVoluUtilDiar", "Embalse", 1) if d == 0 else ult
        if ult:
            break
    por_embalse = sorted(
        [{"nombre": p["nombre"].title(), "valor": round(p["valor"] * 100, 1)} for p in ult if p["valor"] is not None],
        key=lambda x: x["valor"])
    guardar("embalses.json", {
        "fuente": "XM S.A. E.S.P., API de datos (servapibi.xm.com.co): PorcVoluUtilDiar y PorcApor",
        "url": "https://www.xm.com.co/",
        "actualizado": HOY.isoformat(),
        "volumenSistema": [{"fecha": p["fecha"], "valor": round(p["valor"] * 100, 1)} for p in vol if p["valor"] is not None],
        "aportesSistema": [{"fecha": p["fecha"], "valor": round(p["valor"] * 100, 1)} for p in apo if p["valor"] is not None],
        "porEmbalse": por_embalse,
        "fechaEmbalses": ult[0]["fecha"] if ult else None,
        "nota": "Volumen útil: porcentaje del agua aprovechable para generar energía. Aportes: caudal que llega a los embalses frente a la media histórica del mismo día (100 % = normal).",
    })


# ------------------------------------------------------------- NASA FIRMS
def dentro(lon, lat, anillo):
    adentro = False
    j = len(anillo) - 1
    for i in range(len(anillo)):
        xi, yi = anillo[i]
        xj, yj = anillo[j]
        if (yi > lat) != (yj > lat) and lon < (xj - xi) * (lat - yi) / (yj - yi) + xi:
            adentro = not adentro
        j = i
    return adentro


def incendios():
    print("Incendios · NASA FIRMS")
    col = json.loads((DATOS / "colombia.geojson").read_text(encoding="utf-8"))
    poligonos = col["features"][0]["geometry"]["coordinates"]
    url = "https://firms.modaps.eosdis.nasa.gov/data/active_fire/suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2_Global_24h.csv"
    texto = bajar(url, espera=180).decode("utf-8", "replace")
    focos = []
    for f in csv.DictReader(io.StringIO(texto)):
        lat, lon = float(f["latitude"]), float(f["longitude"])
        if not (-4.3 <= lat <= 13.6 and -82.0 <= lon <= -66.8):
            continue
        if any(dentro(lon, lat, poly[0]) for poly in poligonos):
            focos.append({"lat": round(lat, 4), "lon": round(lon, 4), "fecha": f["acq_date"],
                          "hora": f["acq_time"], "confianza": f["confidence"], "frp": num(f["frp"])})
    guardar("incendios.json", {
        "fuente": "NASA FIRMS, VIIRS S-NPP 375 m, últimas 24 horas",
        "url": "https://firms.modaps.eosdis.nasa.gov/",
        "actualizado": HOY.isoformat(),
        "nota": "Focos de calor detectados por satélite. No todos son incendios forestales: también aparecen quemas agrícolas y fuentes industriales.",
        "focos": focos,
    })


def main():
    DATOS.mkdir(exist_ok=True)
    errores = []
    for paso in (oni, ideam, xm, incendios):
        try:
            paso()
        except Exception as e:  # una fuente caída no tumba las demás: queda el archivo del día anterior
            errores.append(f"{paso.__name__}: {e}")
            print(f"  ERROR en {paso.__name__}: {e}", file=sys.stderr)
    estado = {"actualizado": datetime.now(timezone.utc).isoformat(timespec="minutes"), "errores": errores}
    guardar("corrida.json", estado)
    if len(errores) == 4:
        sys.exit(1)


if __name__ == "__main__":
    main()

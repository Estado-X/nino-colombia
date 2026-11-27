#!/usr/bin/env python3
"""Arma data/municipios.json con los municipios de Colombia y su punto de referencia.

Fuente: DANE, DIVIPOLA - Códigos municipios, en datos.gov.co (conjunto gdxc-w37w),
licencia Creative Commons Atribución-CompartirIgual 4.0. Se corre a mano cuando cambie
la división política; no es parte de la actualización diaria.

Solo usa la biblioteca estándar de Python 3.9+.
Uso: python scripts/armar_municipios.py
"""
import json
import re
import unicodedata
import urllib.request
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
URL = "https://www.datos.gov.co/resource/gdxc-w37w.json?$limit=5000"
AGENTE = "nino-colombia/1.0 (+https://github.com/Estado-X/nino-colombia)"

# Nombres con que el IDEAM llama a algunos municipios, cuando no coinciden con el del DANE.
# Clave: nombre del IDEAM sin tildes ni paréntesis · valor: código DANE del municipio.
ALIAS = {
    "cali|valle del cauca": "76001",
    "buga|valle del cauca": "76111",
    "cucuta|norte de santander": "54001",
    "tumaco|narino": "52835",
    "mariquita|tolima": "73443",
    "ubate|cundinamarca": "25843",
    "pivijai|magdalena": "47551",
    "pisva|boyaca": "15550",
    "el tablon|narino": "52258",
    "villa de leiva|boyaca": "15407",
    "san vicente|antioquia": "05674",
    "el carmen|choco": "27245",
    # La estación «San Andrés y Providencia (Santa Isabel)» queda en Providencia, no en San Andrés.
    "san andres y providencia|archipielago de san andres providencia y santa catalina": "88564",
}

MINUSCULAS = {"de", "del", "la", "las", "los", "el", "y", "e", "en"}


def clave(texto):
    """Minúsculas, sin tildes, sin lo que va entre paréntesis y sin signos."""
    t = re.sub(r"\(.*?\)", " ", texto or "")
    t = unicodedata.normalize("NFD", t.lower())
    t = "".join(c for c in t if unicodedata.category(c) != "Mn")
    return " ".join(re.sub(r"[^a-z0-9]+", " ", t).split())


def clave_dpto(texto):
    k = clave(texto)
    return "bogota" if k.startswith("bogota") else k


def bonito(texto):
    """MEDELLÍN → Medellín · SAN JOSÉ DEL GUAVIARE → San José del Guaviare."""
    partes = re.split(r"(\s+|-|,)", texto.strip().lower())
    salida = []
    for i, p in enumerate(partes):
        if p in MINUSCULAS and i > 0:
            salida.append(p)
        elif p in {"d.c.", "d.c"}:
            salida.append("D.C.")
        else:
            salida.append(p[:1].upper() + p[1:])
    return "".join(salida)


def main():
    req = urllib.request.Request(URL, headers={"User-Agent": AGENTE})
    with urllib.request.urlopen(req, timeout=120) as r:
        filas = json.loads(r.read())
    municipios = []
    for f in filas:
        try:
            lat = float(f["latitud"].replace(",", "."))
            lon = float(f["longitud"].replace(",", "."))
        except (KeyError, ValueError):
            continue
        municipios.append({
            "c": f["cod_mpio"],
            "n": bonito(f["nom_mpio"]),
            "d": "San Andrés y Providencia" if clave(f["dpto"]).startswith("archipielago") else bonito(f["dpto"]),
            "k": clave(f["nom_mpio"]) + "|" + clave_dpto(f["dpto"]),
            "lat": round(lat, 5),
            "lon": round(lon, 5),
        })
    municipios.sort(key=lambda m: m["c"])
    if len(municipios) < 1000:
        raise SystemExit(f"Solo llegaron {len(municipios)} municipios: no se guarda nada.")
    salida = {
        "fuente": "DANE, DIVIPOLA - Códigos municipios (datos.gov.co, conjunto gdxc-w37w)",
        "url": "https://www.datos.gov.co/Mapas-Nacionales/DIVIPOLA-C-digos-municipios/gdxc-w37w",
        "licencia": "Creative Commons Atribución-CompartirIgual 4.0 (CC BY-SA 4.0)",
        "nota": "Punto de referencia de cada municipio según el DANE (no es el contorno). 'k' es la clave para cruzar con el nombre que usa el IDEAM; 'alias' cubre los nombres que no coinciden.",
        "alias": ALIAS,
        "municipios": municipios,
    }
    destino = RAIZ / "data" / "municipios.json"
    destino.write_bytes(json.dumps(salida, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))
    print(f"data/municipios.json listo: {len(municipios)} municipios")


if __name__ == "__main__":
    main()

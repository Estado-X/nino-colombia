/* El Niño en Colombia · Estado X
   Lee los archivos de data/ (generados una vez al día por scripts/actualizar_datos.py) y arma el tablero. */
(function () {
  "use strict";

  const COLORES = {
    lluvia: [ // de seco (tierra) a húmedo (oliva oscuro)
      { hasta: 25, color: "#ca8248", etq: "Menos de 25 mm" },
      { hasta: 75, color: "#e3b483", etq: "25 a 75 mm" },
      { hasta: 150, color: "#d9d6c4", etq: "75 a 150 mm" },
      { hasta: 300, color: "#a9a688", etq: "150 a 300 mm" },
      { hasta: Infinity, color: "#565442", etq: "Más de 300 mm" },
    ],
    tmax: [
      { hasta: 25, color: "#d9d6c4", etq: "Menos de 25 °C" },
      { hasta: 30, color: "#e3b483", etq: "25 a 30 °C" },
      { hasta: 35, color: "#ca8248", etq: "30 a 35 °C" },
      { hasta: Infinity, color: "#a23b3b", etq: "35 °C o más" },
    ],
  };
  const CAPAS = {
    lluvia30: { campo: "lluvia30", escala: "lluvia", titulo: "Lluvia acumulada en los últimos 30 días", unidad: "mm" },
    lluvia7: { campo: "lluvia7", escala: "lluvia", titulo: "Lluvia acumulada en los últimos 7 días", unidad: "mm" },
    tmax7: { campo: "tmax7", escala: "tmax", titulo: "Temperatura máxima de los últimos 7 días", unidad: "°C" },
  };
  // El Niño de referencia y el actual, para la comparación del termómetro.
  const NINO_REFERENCIA = 2015, NINO_ACTUAL = 2026;

  const $ = (s) => document.querySelector(s);
  // Solo números de verdad: un texto en los datos nunca llega al HTML como si fuera una cifra.
  const fmt = (n, d = 0) => (typeof n === "number" && Number.isFinite(n) ? n.toLocaleString("es-CO", { minimumFractionDigits: d, maximumFractionDigits: d }) : "—");
  const conUnidad = (n, d, u) => (typeof n === "number" && Number.isFinite(n) ? `${fmt(n, d)} ${u}` : "—");
  const signo = (v) => (typeof v === "number" && v > 0 ? "+" : "");
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  // Solo enlaces http y https: nada de javascript: ni otros esquemas que vengan en los datos.
  const urlSegura = (u) => { try { const p = new URL(u, location.href); return /^https?:$/.test(p.protocol) ? p.href : "#"; } catch (_) { return "#"; } };
  const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const fechaLarga = (iso) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
    return m ? `${Number(m[3])} ${MESES[Number(m[2]) - 1]} ${m[1]}` : "—";
  };
  const TRIM = { DJF: "dic–feb", JFM: "ene–mar", FMA: "feb–abr", MAM: "mar–may", AMJ: "abr–jun", MJJ: "may–jul", JJA: "jun–ago", JAS: "jul–sep", ASO: "ago–oct", SON: "sep–nov", OND: "oct–dic", NDJ: "nov–ene" };
  const ORDEN_TRIM = ["DJF", "JFM", "FMA", "MAM", "AMJ", "MJJ", "JJA", "JAS", "ASO", "SON", "OND", "NDJ"];
  const nombreTrim = (t) => esc(TRIM[t] || t);
  // Fecha y hora en Bogotá: «26 nov 2026, 2:56 p. m.»
  const fechaHora = (iso) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return fechaLarga(iso);
    const p = Object.fromEntries(new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true }).formatToParts(d).map((x) => [x.type, x.value]));
    const ampm = /p/i.test(p.dayPeriod || "") ? "p. m." : "a. m.";
    return `${p.day} ${MESES[Number(p.month) - 1]} ${p.year}, ${p.hour}:${p.minute} ${ampm}`;
  };
  // Clave para cruzar nombres del IDEAM y del DANE: minúsculas, sin tildes, sin paréntesis ni signos.
  const clave = (t) => (t || "").replace(/\(.*?\)/g, " ").toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/[^a-z0-9]+/g, " ").trim();
  const claveDpto = (t) => { const k = clave(t); return k.startsWith("bogota") ? "bogota" : k; };
  const conEspera = (fn, ms = 150) => { let t; return () => { clearTimeout(t); t = setTimeout(fn, ms); }; };

  function nivelONI(v) {
    if (v >= 2.0) return "Niño muy fuerte";
    if (v >= 1.5) return "Niño fuerte";
    if (v >= 1.0) return "Niño moderado";
    if (v >= 0.5) return "Niño débil";
    if (v <= -0.5) return "La Niña";
    return "Neutral";
  }

  async function cargar(nombre) {
    const r = await fetch(`data/${nombre}`, { cache: "no-cache" });
    if (!r.ok) throw new Error(`No se pudo leer data/${nombre}`);
    return r.json();
  }

  // ---------------------------------------------------------------- Gráficas (SVG)
  const anchoDe = (sel) => Math.round(Math.max(240, Math.min(640, (document.querySelector(sel)?.clientWidth || 640))));

  function svgONI(serie, W = 640) {
    const datos = serie.filter((p) => p.anio >= 2023);
    const H = Math.max(230, Math.round(W * 0.42)), m = { t: 18, r: 78, b: 34, l: 36 };
    const min = Math.min(-1.5, ...datos.map((d) => d.anomalia)), max = Math.max(2.5, ...datos.map((d) => d.anomalia));
    const y = (v) => m.t + (max - v) / (max - min) * (H - m.t - m.b);
    const bw = (W - m.l - m.r) / datos.length;
    let s = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">`;
    [-1, 0, 0.5, 1, 1.5, 2].forEach((t) => {
      const yy = y(t);
      s += `<line x1="${m.l}" x2="${W - m.r}" y1="${yy}" y2="${yy}" stroke="${t === 0 ? "#cbc2ac" : "#e7decb"}" stroke-width="1"${t === 0.5 || t === 2 ? ' stroke-dasharray="4 3"' : ""}/>`;
      s += `<text x="${m.l - 6}" y="${yy + 4}" text-anchor="end">${signo(t)}${fmt(t, 1)}</text>`;
    });
    s += `<text x="${W - m.r + 6}" y="${y(2) + 4}">muy fuerte</text>`;
    s += `<text x="${W - m.r + 6}" y="${y(0.5) + 4}">El Niño</text>`;
    datos.forEach((d, i) => {
      const x = m.l + i * bw + bw * 0.15, w = bw * 0.7, v = d.anomalia;
      const y0 = y(0), y1 = y(v);
      const col = v >= 2 ? "#603338" : v >= 0.5 ? "#9c5635" : v <= -0.5 ? "#a9a688" : "#cbc2ac";
      s += `<rect x="${x}" y="${Math.min(y0, y1)}" width="${w}" height="${Math.max(1, Math.abs(y1 - y0))}" fill="${col}" rx="1"><title>${nombreTrim(d.trimestre)} ${esc(d.anio)}: ${signo(v)}${fmt(v, 2)} °C</title></rect>`;
      if (d.trimestre === "DJF") s += `<text x="${x + w / 2}" y="${H - 12}" text-anchor="middle">${esc(d.anio)}</text>`;
    });
    const u = datos[datos.length - 1], ux = m.l + (datos.length - 1) * bw + bw / 2;
    s += `<text x="${ux}" y="${y(u.anomalia) - 6}" text-anchor="end" style="fill:#603338;font-weight:700">${signo(u.anomalia)}${fmt(u.anomalia, 2)}</text>`;
    return s + "</svg>";
  }

  // Este Niño frente al de 2015–2016: las dos series desde dic–feb de su año, trimestre a trimestre.
  function serieDesde(serie, anio) {
    const i0 = serie.findIndex((p) => p.anio === anio && p.trimestre === "DJF");
    return i0 < 0 ? [] : serie.slice(i0, i0 + 15);
  }
  function svgComparar(serie, W = 640) {
    const a = serieDesde(serie, NINO_REFERENCIA), b = serieDesde(serie, NINO_ACTUAL);
    const n = 15, H = Math.max(240, Math.round(W * 0.44)), m = { t: 22, r: 16, b: 40, l: 36 };
    const todos = a.concat(b).map((p) => p.anomalia);
    const min = Math.min(-0.5, ...todos), max = Math.max(3, ...todos);
    const x = (i) => m.l + i / (n - 1) * (W - m.l - m.r);
    const y = (v) => m.t + (max - v) / (max - min) * (H - m.t - m.b);
    let s = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">`;
    [0, 0.5, 1, 1.5, 2, 2.5].forEach((t) => {
      s += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(t)}" y2="${y(t)}" stroke="${t === 0 ? "#cbc2ac" : "#e7decb"}"${t === 0.5 || t === 2 ? ' stroke-dasharray="4 3"' : ""}/>`;
      s += `<text x="${m.l - 6}" y="${y(t) + 4}" text-anchor="end">${signo(t)}${fmt(t, 1)}</text>`;
    });
    const etq = W < 500 ? [0, 4, 8, 12] : [0, 2, 4, 6, 8, 10, 12];
    etq.forEach((i) => { s += `<text x="${x(i)}" y="${H - 22}" text-anchor="middle">${nombreTrim(ORDEN_TRIM[i % 12])}</text>`; });
    s += `<text x="${x(0)}" y="${H - 6}" text-anchor="start">año del inicio</text><text x="${x(12)}" y="${H - 6}" text-anchor="middle">año siguiente</text>`;
    const linea = (arr, col, ancho, guion) => `<polyline fill="none" stroke="${col}" stroke-width="${ancho}" stroke-linejoin="round"${guion ? ' stroke-dasharray="6 4"' : ""} points="${arr.map((p, i) => `${x(i).toFixed(1)},${y(p.anomalia).toFixed(1)}`).join(" ")}"/>`;
    s += linea(a, "#a9a688", 2.2, true) + linea(b, "#603338", 3);
    if (b.length) {
      const u = b.length - 1, pa = a[u];
      s += `<circle cx="${x(u)}" cy="${y(b[u].anomalia)}" r="4.5" fill="#603338"/><text x="${x(u) - 8}" y="${y(b[u].anomalia) - 10}" text-anchor="end" style="fill:#603338;font-weight:700">${NINO_ACTUAL}: ${signo(b[u].anomalia)}${fmt(b[u].anomalia, 2)}</text>`;
      if (pa) s += `<circle cx="${x(u)}" cy="${y(pa.anomalia)}" r="4" fill="#73704f"/><text x="${x(u) + 8}" y="${y(pa.anomalia) + 16}" style="fill:#565442;font-weight:700">${NINO_REFERENCIA}: ${signo(pa.anomalia)}${fmt(pa.anomalia, 2)}</text>`;
    }
    s += `<g transform="translate(${m.l},4)"><rect width="14" height="3" y="4" fill="#603338"/><text x="20" y="9" style="fill:#2a231f">${NINO_ACTUAL}–${NINO_ACTUAL + 1}</text><rect x="104" width="14" height="3" y="4" fill="#a9a688"/><text x="124" y="9" style="fill:#2a231f">${NINO_REFERENCIA}–${NINO_REFERENCIA + 1}</text></g>`;
    return s + "</svg>";
  }
  // Descripción de la gráfica para lectores de pantalla, con el dato del día.
  function describirONI(serie, vista) {
    const u = serie[serie.length - 1];
    if (!u) return "Gráfica del índice ONI";
    const actual = `En ${TRIM[u.trimestre] || u.trimestre} de ${u.anio} el índice va en ${signo(u.anomalia)}${fmt(u.anomalia, 2)} °C`;
    if (vista !== "2015") return `Gráfica del índice ONI por trimestres desde 2023. ${actual}.`;
    const ref = serie.find((p) => p.anio === NINO_REFERENCIA && p.trimestre === u.trimestre);
    return `Comparación del índice ONI de ${NINO_ACTUAL} con el de ${NINO_REFERENCIA}. ${actual}${ref ? `; en el mismo trimestre de ${NINO_REFERENCIA} iba en ${signo(ref.anomalia)}${fmt(ref.anomalia, 2)} °C` : ""}.`;
  }

  function media7(arr) {
    return arr.map((p, i) => { const v = arr.slice(Math.max(0, i - 6), i + 1).map((q) => q.valor); return { fecha: p.fecha, valor: v.reduce((a, b) => a + b, 0) / v.length }; });
  }

  function svgEmbalses(vol, apoDiario, W = 640) {
    const apo = media7(apoDiario).slice(-vol.length);
    const angosto = W < 500;
    const H = Math.max(230, Math.round(W * 0.4)), m = { t: angosto ? 50 : 34, r: 12, b: 30, l: 36 };
    const n = vol.length;
    const max = Math.max(110, ...apo.map((p) => p.valor), ...vol.map((p) => p.valor));
    const x = (i) => m.l + i / (n - 1) * (W - m.l - m.r);
    const y = (v) => m.t + (max - v) / max * (H - m.t - m.b);
    let s = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">`;
    [0, 25, 50, 75, 100].forEach((t) => {
      s += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(t)}" y2="${y(t)}" stroke="${t === 100 ? "#cbc2ac" : "#e7decb"}"${t === 100 ? ' stroke-dasharray="4 3"' : ""}/><text x="${m.l - 6}" y="${y(t) + 4}" text-anchor="end">${t}%</text>`;
    });
    const linea = (arr, col, ancho) => `<polyline fill="none" stroke="${col}" stroke-width="${ancho}" stroke-linejoin="round" points="${arr.map((p, i) => `${x(i).toFixed(1)},${y(p.valor).toFixed(1)}`).join(" ")}"/>`;
    s += linea(apo.slice(-n), "#ca8248", 1.6) + linea(vol, "#603338", 2.6);
    [0, Math.floor(n / 2), n - 1].forEach((i) => { s += `<text x="${x(i)}" y="${H - 10}" text-anchor="${i === 0 ? "start" : i === n - 1 ? "end" : "middle"}">${fechaLarga(vol[i].fecha)}</text>`; });
    s += `<circle cx="${x(n - 1)}" cy="${y(vol[n - 1].valor)}" r="4" fill="#603338"/>`;
    s += `<g transform="translate(${m.l},4)"><rect width="10" height="3" y="4" fill="#603338"/><text x="16" y="9" style="fill:#2a231f">Volumen útil</text><rect x="${angosto ? 0 : 110}" width="10" height="3" y="${angosto ? 22 : 4}" fill="#ca8248"/><text x="${angosto ? 16 : 126}" y="${angosto ? 27 : 9}" style="fill:#2a231f">Agua que llega (media 7 días; 100 % = normal)</text></g>`;
    return s + "</svg>";
  }

  // ---------------------------------------------------------------- Mapa
  let mapa, estaciones = [], focos = [], sinDatosIncendios = true, capaActual = "lluvia30";

  function geojsonEstaciones() {
    return {
      type: "FeatureCollection",
      features: estaciones.map((e) => ({ type: "Feature", geometry: { type: "Point", coordinates: [e.lon, e.lat] }, properties: e })),
    };
  }

  function expresionColor(capa) {
    const c = CAPAS[capa], esc_ = COLORES[c.escala];
    const exp = ["step", ["get", c.campo], esc_[0].color];
    esc_.slice(0, -1).forEach((r, i) => exp.push(r.hasta, esc_[i + 1].color));
    return exp;
  }

  function pintarLeyenda() {
    const c = CAPAS[capaActual];
    $("#leyenda").innerHTML = `<span><strong>${c.titulo}:</strong></span>` +
      COLORES[c.escala].map((r) => `<span><i style="background:${r.color}"></i>${r.etq}</span>`).join("") +
      (sinDatosIncendios ? "" : `<span><i style="background:#a23b3b;border-color:#fff;width:9px;height:9px"></i>Incendio activo</span>`);
  }

  function cambiarCapa(capa) {
    if (!CAPAS[capa]) return;
    capaActual = capa;
    document.querySelectorAll(".capa[data-capa]").forEach((b) => { const on = b.dataset.capa === capa; b.classList.toggle("activa", on); b.setAttribute("aria-pressed", on); });
    if (mapa && mapa.getLayer("estaciones")) {
      mapa.setFilter("estaciones", ["!=", ["get", CAPAS[capa].campo], null]);
      mapa.setPaintProperty("estaciones", "circle-color", expresionColor(capa));
    }
    pintarLeyenda();
  }

  function iniciarMapa(colombia) {
    mapa = new maplibregl.Map({
      container: "mapa",
      style: "https://tiles.openfreemap.org/styles/positron",
      center: [-73.6, 4.6], zoom: 4.6, minZoom: 3.5, maxZoom: 12,
      attributionControl: false,
      // Que la rueda del ratón baje la página: el mapa se acerca con Ctrl + rueda o con dos dedos.
      cooperativeGestures: true,
      locale: {
        "CooperativeGesturesHandler.WindowsHelpText": "Usa Ctrl + rueda para acercar el mapa",
        "CooperativeGesturesHandler.MacHelpText": "Usa ⌘ + rueda para acercar el mapa",
        "CooperativeGesturesHandler.MobileHelpText": "Usa dos dedos para mover el mapa",
      },
    });
    mapa.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: "Datos: IDEAM, NASA FIRMS · Mapa: OpenFreeMap" }), "bottom-right");
    mapa.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    mapa.on("load", () => {
      document.querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show");
      mapa.addSource("colombia", { type: "geojson", data: colombia });
      mapa.addLayer({ id: "colombia-borde", type: "line", source: "colombia", paint: { "line-color": "#603338", "line-width": 1.2, "line-opacity": 0.6 } });
      mapa.addSource("estaciones", { type: "geojson", data: geojsonEstaciones() });
      mapa.addLayer({
        id: "estaciones", type: "circle", source: "estaciones",
        filter: ["!=", ["get", CAPAS[capaActual].campo], null],
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 4, 8, 8, 11, 12],
          "circle-color": expresionColor(capaActual),
          "circle-stroke-color": "#ffffff", "circle-stroke-width": 1,
          "circle-opacity": ["case", ["get", "reciente"], 0.95, 0.45],
        },
      });
      mapa.addSource("incendios", { type: "geojson", data: { type: "FeatureCollection", features: focos.map((f) => ({ type: "Feature", geometry: { type: "Point", coordinates: [f.lon, f.lat] }, properties: f })) } });
      mapa.addLayer({ id: "incendios", type: "circle", source: "incendios", paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 3, 10, 7], "circle-color": "#a23b3b", "circle-stroke-color": "#fff8f0", "circle-stroke-width": 1.2 } });

      const popup = new maplibregl.Popup({ closeButton: true, maxWidth: "280px" });
      mapa.on("click", "estaciones", (ev) => {
        const p = ev.features[0].properties;
        const v = (k) => (p[k] === "null" || p[k] == null ? null : Number(p[k]));
        popup.setLngLat(ev.lngLat).setHTML(
          `<strong>${esc(p.municipio)}</strong>, ${esc(p.departamento)}<br><span style="color:#6e6456">${esc(p.nombre)}</span><br>` +
          `Lluvia 7 días: <b>${conUnidad(v("lluvia7"), 1, "mm")}</b><br>Lluvia 30 días: <b>${conUnidad(v("lluvia30"), 1, "mm")}</b><br>Temp. máxima 7 días: <b>${conUnidad(v("tmax7"), 1, "°C")}</b>` +
          (p.reciente === false || p.reciente === "false" ? `<br><span style="color:#a23b3b">Sin datos de lluvia recientes</span>` : "")
        ).addTo(mapa);
      });
      mapa.on("click", "incendios", (ev) => {
        const p = ev.features[0].properties;
        const hora = /^\d{1,4}$/.test(String(p.hora)) ? String(p.hora).padStart(4, "0").replace(/(\d\d)(\d\d)/, "$1:$2") : "—";
        popup.setLngLat(ev.lngLat).setHTML(`<strong>Foco de calor</strong><br>Detectado el ${fechaLarga(p.fecha)} a las ${hora} (hora UTC)<br><span style="color:#6e6456">Puede ser un incendio forestal o una quema.</span>`).addTo(mapa);
      });
      ["estaciones", "incendios"].forEach((l) => { mapa.on("mouseenter", l, () => (mapa.getCanvas().style.cursor = "pointer")); mapa.on("mouseleave", l, () => (mapa.getCanvas().style.cursor = "")); });
    });
  }

  // ---------------------------------------------------------------- Municipio
  let municipios = [], porCodigo = new Map(), porEtiqueta = new Map(), porNombre = new Map(), estacionesDe = new Map();
  let ultimo = null; // { m, lista, recientes, cercanas, cerca, l7, l30, t, origen }
  let datosGlobales = {}; // oni, emb, oficial, corrida: para la ficha impresa

  function distanciaKm(a, b) {
    const R = 6371, rad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  const prom = (arr) => { const v = arr.filter((x) => typeof x === "number" && Number.isFinite(x)); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const mismoNombre = (m) => clave(m.n) === clave(m.d);
  const etiqueta = (m) => (mismoNombre(m) ? m.n : `${m.n}, ${m.d}`);
  const nombreEstacion = (e) => String(e.nombre || "").replace(/\s*\[\d+\]$/, "");
  const anunciar = (texto) => { $("#anuncio").textContent = texto; };

  // Une cada estación del IDEAM con su municipio del DANE (por nombre, o por la lista de alias).
  function prepararMunicipios(datos) {
    municipios = datos && Array.isArray(datos.municipios) ? datos.municipios : [];
    const porClave = new Map(municipios.map((m) => [m.k, m]));
    porCodigo = new Map(municipios.map((m) => [m.c, m]));
    porEtiqueta = new Map(municipios.map((m) => [clave(etiqueta(m)), m]));
    porNombre = new Map();
    municipios.forEach((m) => { const k = clave(m.n); porNombre.set(k, porNombre.has(k) ? null : m); }); // null = nombre repetido
    estacionesDe = new Map();
    estaciones.forEach((e) => {
      const k = `${clave(e.municipio)}|${claveDpto(e.departamento)}`;
      const m = porClave.get(k) || porCodigo.get((datos && datos.alias || {})[k]);
      if (!m) return;
      if (!estacionesDe.has(m.c)) estacionesDe.set(m.c, []);
      estacionesDe.get(m.c).push(e);
    });
  }

  // Acepta el código DANE (con o sin el cero inicial), la etiqueta «Neiva, Huila» o el nombre si no se repite.
  function buscarMunicipio(texto) {
    const t = String(texto || "").trim();
    if (!t) return null;
    if (/^\d{4,5}$/.test(t)) return porCodigo.get(t.padStart(5, "0")) || null;
    return porEtiqueta.get(clave(t)) || porNombre.get(clave(t)) || null;
  }

  const textoFocos = (cerca) => sinDatosIncendios
    ? "Hoy no hay datos de incendios de la NASA, así que no sabemos si hay focos de calor cerca. Si ves humo o fuego, llama al 123."
    : cerca
      ? `${cerca} ${cerca === 1 ? "foco de calor" : "focos de calor"} a menos de 25 km en las últimas 24 horas. Si ves humo o fuego, llama al 123.`
      : "Sin focos de calor a menos de 25 km en las últimas 24 horas.";

  function filaEstacion(e, conDistancia, m) {
    return `<tr><td>${esc(nombreEstacion(e))}${conDistancia ? `<br><span class="sub">${esc(e.municipio)} · ${fmt(distanciaKm(m, e), 0)} km</span>` : ""}${e.reciente === false ? ' <span class="rojo">(sin datos recientes)</span>' : ""}</td><td class="n">${fmt(e.lluvia7, 1)}</td><td class="n">${fmt(e.lluvia30, 1)}</td><td class="n">${typeof e.tmax7 === "number" ? fmt(e.tmax7, 1) + "°" : "—"}</td></tr>`;
  }

  function mostrarNoEncontrado(texto) {
    ultimo = null;
    $("#ficha").innerHTML = `<p class="aviso aviso--suave">No encontramos el municipio «${esc(texto)}». Escríbelo y elígelo de la lista, por ejemplo «Neiva, Huila».</p>`;
    anunciar("No encontramos ese municipio.");
  }

  function mostrarMunicipio(m, origen) {
    if (!m) return;
    const lista = estacionesDe.get(m.c) || [];
    // Solo cuentan las estaciones que reportan: una estación callada no es «0 mm».
    const recientes = lista.filter((e) => e.reciente);
    const cercanas = lista.length ? [] : estaciones
      .filter((e) => e.reciente && typeof e.lluvia30 === "number")
      .map((e) => ({ e, d: distanciaKm(m, e) }))
      .sort((a, b) => a.d - b.d).slice(0, 3).map((x) => x.e);
    const cerca = focos.filter((f) => distanciaKm(m, f) <= 25).length;
    const l7 = prom(recientes.map((e) => e.lluvia7)), l30 = prom(recientes.map((e) => e.lluvia30));
    const tmaxes = recientes.map((e) => e.tmax7).filter((v) => typeof v === "number");
    const t = tmaxes.length ? Math.max(...tmaxes) : null;
    ultimo = { m, lista, recientes, cercanas, cerca, l7, l30, t, origen };

    let html = `<h3>${esc(m.n)}</h3><p class="dep">${mismoNombre(m) ? "" : `${esc(m.d)} · `}${lista.length ? `${lista.length} ${lista.length === 1 ? "estación" : "estaciones"} del IDEAM` : "sin estación del IDEAM con datos"}</p>`;
    if (origen === "ubicacion") html += `<p class="nota nota--arriba">El municipio más cercano a tu ubicación (aproximado: se compara con el punto de referencia del DANE de cada municipio). Tu ubicación exacta no sale de tu navegador.</p>`;
    if (!estaciones.length) {
      html += `<p class="aviso">Hoy no se pudieron leer las estaciones del IDEAM. Vuelve a intentarlo más tarde.</p>`;
    } else if (lista.length) {
      const varias = recientes.length > 1 ? " (promedio)" : "";
      if (!recientes.length) html += `<p class="aviso aviso--suave">Las estaciones de este municipio no reportan hace más de 3 días.</p>`;
      html += `<div class="resumen-mun">
        <div><strong>${conUnidad(l7, 0, "mm")}</strong><span>lluvia 7 días${varias}</span></div>
        <div><strong>${conUnidad(l30, 0, "mm")}</strong><span>lluvia 30 días${varias}</span></div>
        <div><strong>${conUnidad(t, 1, "°C")}</strong><span>temp. máxima 7 días</span></div>
      </div>
      <div class="tabla-scroll"><table><thead><tr><th>Estación</th><th>7 días</th><th>30 días</th><th>Máx.</th></tr></thead><tbody>` +
        lista.map((e) => filaEstacion(e, false, m)).join("") + `</tbody></table></div>`;
    } else if (cercanas.length) {
      html += `<p class="aviso aviso--suave">${esc(m.n)} no tiene una estación automática del IDEAM con datos. Estas son las tres más cercanas:</p>
      <div class="tabla-scroll"><table><thead><tr><th>Estación cercana</th><th>7 días</th><th>30 días</th><th>Máx.</th></tr></thead><tbody>` +
        cercanas.map((e) => filaEstacion(e, true, m)).join("") + `</tbody></table></div>`;
    }
    html += `<p class="${sinDatosIncendios || cerca ? "aviso" : "nota"}">${esc(textoFocos(cerca))}</p>`;
    html += `<p class="nota">Lluvia en milímetros y temperatura en °C, de estaciones automáticas del IDEAM (datos sin validar).</p>`;
    html += `<div class="acciones-ficha">
      <button type="button" class="boton boton--principal" id="imprimir">Ficha para el consejo de gestión del riesgo</button>
      <button type="button" class="boton" id="copiar-enlace">Copiar enlace</button>
    </div><p class="nota" id="copiado" aria-live="polite"></p>`;
    $("#ficha").innerHTML = html;
    $("#imprimir").addEventListener("click", () => window.print());
    $("#copiar-enlace").addEventListener("click", copiarEnlace);
    $("#buscar").value = etiqueta(m);
    anunciar(`Mostrando ${etiqueta(m)}.`);
    try { history.replaceState(null, "", `?municipio=${m.c}`); } catch (_) { /* vista sin historial */ }
    const centro = recientes.length ? { lat: prom(recientes.map((e) => e.lat)), lon: prom(recientes.map((e) => e.lon)) } : m;
    if (mapa) mapa.flyTo({ center: [centro.lon, centro.lat], zoom: lista.length ? 9 : 8, speed: 1.4 });
  }

  async function copiarEnlace() {
    const url = location.href;
    try { await navigator.clipboard.writeText(url); $("#copiado").textContent = "Enlace copiado. Pégalo donde quieras compartir esta ficha."; }
    catch (_) { $("#copiado").textContent = `Copia este enlace: ${url}`; }
  }

  function usarUbicacion() {
    const estado = $("#ubicacion-estado");
    if (!municipios.length) { estado.textContent = "No se pudo cargar la lista de municipios."; return; }
    if (!navigator.geolocation) { estado.textContent = "Tu navegador no permite usar la ubicación. Escribe el nombre del municipio."; return; }
    estado.textContent = "Buscando tu ubicación…";
    navigator.geolocation.getCurrentPosition((pos) => {
      const yo = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      let mejor = null, dMin = Infinity;
      municipios.forEach((m) => { const d = distanciaKm(yo, m); if (d < dMin) { dMin = d; mejor = m; } });
      if (!mejor || dMin > 150) { estado.textContent = "Tu ubicación parece estar fuera de Colombia. Escribe el nombre del municipio."; return; }
      estado.textContent = "";
      mostrarMunicipio(mejor, "ubicacion");
    }, () => { estado.textContent = "No pudimos usar tu ubicación (no diste el permiso o no está disponible). Escribe el nombre del municipio."; },
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 });
  }

  // Ficha de una página para llevar al consejo municipal de gestión del riesgo (Ley 1523 de 2012).
  // Se arma justo antes de imprimir (botón o Ctrl+P) con el municipio que está en pantalla; sin municipio
  // queda vacía y se imprime la página normal.
  const MAX_FILAS_IMPRESAS = 6;
  const sitio = (url) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch (_) { return ""; } };
  function llenarFicha() {
    const caja = $("#impresion");
    if (!ultimo) { caja.innerHTML = ""; return; }
    const { m, lista, cercanas, cerca, l7, l30, t } = ultimo;
    const { oni, emb, oficial, corrida } = datosGlobales;
    const filasTodas = lista.length ? lista : cercanas;
    const filas = filasTodas.slice(0, MAX_FILAS_IMPRESAS).map((e) => `<tr><td>${esc(nombreEstacion(e))}${lista.length ? "" : ` (${esc(e.municipio)}, ${fmt(distanciaKm(m, e), 0)} km)`}${e.reciente === false ? " · sin datos recientes" : ""}</td><td>${fmt(e.lluvia7, 1)}</td><td>${fmt(e.lluvia30, 1)}</td><td>${conUnidad(e.tmax7, 1, "°C")}</td></tr>`).join("");
    const resto = filasTodas.length - MAX_FILAS_IMPRESAS;
    const u = oni && oni.ultimo;
    const v = emb && emb.volumenSistema && emb.volumenSistema.length ? emb.volumenSistema[emb.volumenSistema.length - 1] : null;
    const a = emb && emb.aportesSistema && emb.aportesSistema.length ? emb.aportesSistema[emb.aportesSistema.length - 1] : null;
    const enlace = `${location.origin}${location.pathname}?municipio=${m.c}`;
    let cuerpo;
    if (!estaciones.length) cuerpo = `<p>Hoy no se pudieron leer las estaciones del IDEAM.</p>`;
    else if (lista.length) cuerpo = `<div class="imp-cifras"><div><b>${conUnidad(l7, 0, "mm")}</b>lluvia 7 días</div><div><b>${conUnidad(l30, 0, "mm")}</b>lluvia 30 días</div><div><b>${conUnidad(t, 1, "°C")}</b>temperatura máxima 7 días</div></div>`;
    else cuerpo = `<p>${esc(m.n)} no tiene una estación automática del IDEAM con datos. Se muestran las tres más cercanas.</p>`;
    caja.innerHTML = `
      <p class="imp-kicker">El Niño en Colombia · ficha para el consejo municipal de gestión del riesgo</p>
      <h1>${esc(m.n)}${mismoNombre(m) ? "" : ` <span>${esc(m.d)}</span>`}</h1>
      <p class="imp-fecha">Datos actualizados el ${corrida ? fechaHora(corrida.actualizado) : "—"} (hora de Colombia).</p>
      ${cuerpo}
      ${filas ? `<table><thead><tr><th>Estación del IDEAM</th><th>Lluvia 7 días (mm)</th><th>Lluvia 30 días (mm)</th><th>Máxima 7 días</th></tr></thead><tbody>${filas}</tbody></table>` : ""}
      ${resto > 0 ? `<p class="imp-nota">Y ${resto} ${resto === 1 ? "estación más" : "estaciones más"} en la ficha en línea.</p>` : ""}
      <p><b>Incendios:</b> ${esc(textoFocos(cerca))}</p>
      <h2>El país</h2>
      <ul>
        ${u ? `<li><b>Índice de El Niño (ONI, NOAA):</b> ${signo(u.anomalia)}${fmt(u.anomalia, 2)} °C en ${nombreTrim(u.trimestre)} de ${esc(u.anio)} (${nivelONI(u.anomalia)}).</li>` : ""}
        ${v ? `<li><b>Embalses (XM):</b> volumen útil del ${fmt(v.valor, 1)} %${a ? `; el agua que llega está en ${fmt(a.valor, 0)} % de lo normal` : ""}, al ${fechaLarga(v.fecha)}.</li>` : ""}
        ${oficial ? `<li><b>${esc(oficial.titular)}.</b> ${esc(oficial.resumen)}</li>` : ""}
      </ul>
      <h2>Para consultar</h2>
      <ul>${oficial && Array.isArray(oficial.enlaces) ? oficial.enlaces.map((l) => `<li>${esc(l.texto)}${sitio(l.url) ? ` (${esc(sitio(l.url))})` : ""}</li>`).join("") : ""}<li>Esta ficha en línea: ${esc(enlace)}</li></ul>
      <p class="imp-limites">No es un pronóstico ni reemplaza las alertas del IDEAM ni de la UNGRD. Los datos de las estaciones automáticas no están validados y un foco de calor no siempre es un incendio forestal. Fuentes: NOAA, IDEAM, XM, NASA FIRMS y DANE. Tablero abierto de Estado X: github.com/Estado-X/nino-colombia.</p>`;
  }

  // Si una fuente falló hoy, su capa viene del día anterior: se avisa.
  const NOMBRES_FUENTE = { oni: "el índice ONI", ideam: "las estaciones del IDEAM", xm: "los embalses", incendios: "los incendios" };
  function avisoCorrida(corrida) {
    const errores = corrida && Array.isArray(corrida.errores) ? corrida.errores : [];
    const fuentes = [...new Set(errores.map((e) => NOMBRES_FUENTE[String(e).split(":")[0]]).filter(Boolean))];
    return fuentes.length ? ` En la última actualización no se pudo leer ${fuentes.join(", ")}: se muestran los datos anteriores.` : "";
  }

  // ---------------------------------------------------------------- Arranque
  async function iniciar() {
    let oni, est, emb, inc, oficial, colombia, corrida, munis;
    try {
      [oni, est, emb, inc, oficial, colombia, corrida, munis] = await Promise.all(["oni.json", "estaciones.json", "embalses.json", "incendios.json", "estado-oficial.json", "colombia.geojson", "corrida.json", "municipios.json"].map((n) => cargar(n).catch(() => null)));
    } catch (e) { console.error(e); }
    datosGlobales = { oni, emb, oficial, corrida };

    if (oni && oni.ultimo && Array.isArray(oni.serie)) {
      const u = oni.ultimo;
      $("#oni-valor").textContent = `${signo(u.anomalia)}${fmt(u.anomalia, 2)} °C`;
      $("#oni-periodo").textContent = `Trimestre ${TRIM[u.trimestre] || u.trimestre} de ${u.anio}`;
      $("#oni-nivel").textContent = nivelONI(u.anomalia);
      let vista = "reciente";
      const pintaOni = () => {
        $("#graf-oni").innerHTML = vista === "2015" ? svgComparar(oni.serie, anchoDe("#graf-oni")) : svgONI(oni.serie, anchoDe("#graf-oni"));
        $("#graf-oni").setAttribute("aria-label", describirONI(oni.serie, vista));
      };
      document.querySelectorAll(".vista-oni").forEach((b) => b.addEventListener("click", () => {
        vista = b.dataset.vista;
        document.querySelectorAll(".vista-oni").forEach((x) => { const on = x === b; x.classList.toggle("activa", on); x.setAttribute("aria-pressed", on); });
        $("#ayuda-oni").hidden = vista === "2015"; $("#ayuda-2015").hidden = vista !== "2015";
        pintaOni();
      }));
      pintaOni(); window.addEventListener("resize", conEspera(pintaOni));
    }
    if (oficial) {
      $("#estado-titular").textContent = oficial.titular || "";
      $("#estado-resumen").textContent = oficial.resumen || "";
      const mq = window.matchMedia("(max-width: 560px)"), boton = $("#leer-todo");
      const ajustarResumen = () => {
        $("#estado-resumen").classList.toggle("recortado", mq.matches);
        boton.hidden = !mq.matches; boton.textContent = "Leer todo"; boton.setAttribute("aria-expanded", "false");
      };
      boton.addEventListener("click", () => {
        const abierto = $("#estado-resumen").classList.toggle("recortado") === false;
        boton.textContent = abierto ? "Leer menos" : "Leer todo";
        boton.setAttribute("aria-expanded", abierto);
      });
      mq.addEventListener("change", ajustarResumen); ajustarResumen();
      const decl = Array.isArray(oficial.declaraciones) ? oficial.declaraciones : [];
      $("#declaraciones").innerHTML = decl.map((d) => `<div class="decl"><h3>${esc(d.entidad)}</h3><time datetime="${esc(d.fecha)}">${fechaLarga(d.fecha)}</time><p>${esc(d.texto)}</p><a href="${esc(urlSegura(d.url))}" rel="noopener">${esc(d.nombreFuente || "Ver la fuente")}</a></div>`).join("");
      const enl = Array.isArray(oficial.enlaces) ? oficial.enlaces : [];
      $("#enlaces").innerHTML = enl.map((l) => `<li><a href="${esc(urlSegura(l.url))}" rel="noopener">${esc(l.texto)}</a></li>`).join("");
    }
    if (emb && Array.isArray(emb.volumenSistema) && emb.volumenSistema.length) {
      const v = emb.volumenSistema, a = Array.isArray(emb.aportesSistema) ? emb.aportesSistema : [];
      $("#vol-hoy").textContent = conUnidad(v[v.length - 1].valor, 1, "%");
      $("#apo-hoy").textContent = a.length ? conUnidad(a[a.length - 1].valor, 0, "%") : "—";
      const pintaEmb = () => ($("#graf-emb").innerHTML = svgEmbalses(v, a, anchoDe("#graf-emb")));
      pintaEmb(); window.addEventListener("resize", conEspera(pintaEmb));
      $("#emb-lista").innerHTML = (emb.porEmbalse || []).slice(0, 12).map((e) => `<li>${esc(e.nombre)}: ${conUnidad(e.valor, 1, "%")}</li>`).join("");
      $("#emb-fuente").textContent = `Fuente: XM. Volumen útil y aportes del sistema eléctrico al ${fechaLarga(v[v.length - 1].fecha)}.`;
    }
    // Solo hay datos de incendios si el archivo lo dice: un archivo viejo o incompleto cuenta como «sin datos».
    sinDatosIncendios = !inc || inc.sinDatos !== false || !Array.isArray(inc.focos);
    focos = sinDatosIncendios ? [] : inc.focos;
    $("#txt-incendios").textContent = sinDatosIncendios
      ? "Hoy no hay datos de incendios de la NASA."
      : `Mostrar incendios activos de las últimas 24 horas: ${fmt(focos.length)} ${focos.length === 1 ? "foco" : "focos"}`;
    $("#ver-incendios").disabled = sinDatosIncendios;
    $("#sat-incendios").textContent = !sinDatosIncendios && inc.satelite ? `, satélite ${inc.satelite}` : "";

    estaciones = est && Array.isArray(est.estaciones) ? est.estaciones : [];
    prepararMunicipios(munis);
    if (!municipios.length) {
      $("#ficha").innerHTML = `<p class="aviso">No se pudo cargar la lista de municipios. Vuelve a intentarlo más tarde.</p>`;
      $("#buscar").disabled = true; $("#usar-ubicacion").disabled = true;
    }
    const etiquetas = municipios.map(etiqueta).sort((x, y) => x.localeCompare(y, "es"));
    $("#lista-municipios").innerHTML = etiquetas.map((c) => `<option value="${esc(c)}"></option>`).join("");
    const elegir = () => {
      const texto = $("#buscar").value;
      const m = buscarMunicipio(texto);
      if (m) { if (!ultimo || ultimo.m !== m) mostrarMunicipio(m, "busqueda"); }
      else if (texto.trim()) mostrarNoEncontrado(texto.trim());
    };
    $("#buscar").addEventListener("change", elegir);
    // Al escribir no se abre nada a medias; solo cuando se escoge una opción de la lista.
    $("#buscar").addEventListener("input", (e) => { if (e.inputType === "insertReplacementText" || e.inputType === undefined) elegir(); });
    $("#usar-ubicacion").addEventListener("click", usarUbicacion);
    $("#fecha-datos").textContent = (corrida ? fechaHora(corrida.actualizado) : est ? fechaLarga(est.actualizado) : "—");
    $("#aviso-corrida").textContent = avisoCorrida(corrida);
    document.querySelectorAll(".capa[data-capa]").forEach((b) => b.addEventListener("click", () => cambiarCapa(b.dataset.capa)));
    $("#ver-incendios").addEventListener("change", (e) => mapa && mapa.getLayer("incendios") && mapa.setLayoutProperty("incendios", "visibility", e.target.checked ? "visible" : "none"));
    pintarLeyenda();
    if (window.maplibregl && colombia) iniciarMapa(colombia);
    else $("#mapa").innerHTML = '<p style="padding:20px">No se pudo cargar el mapa. Revisa tu conexión y vuelve a intentarlo.</p>';
    window.addEventListener("beforeprint", llenarFicha);
    window.addEventListener("afterprint", () => { $("#impresion").innerHTML = ""; });
    // Enlace con municipio: ?municipio=41001 (código DANE), ?municipio=Neiva, Huila o ?municipio=Neiva
    const pedido = new URLSearchParams(location.search).get("municipio");
    if (pedido && municipios.length) {
      const m = buscarMunicipio(pedido);
      if (m) mostrarMunicipio(m, "enlace"); else mostrarNoEncontrado(pedido);
    }
  }
  iniciar();
})();

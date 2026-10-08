/* El Niño en Colombia · Estado X
   Lee los archivos de data/ (generados cada mañana por scripts/actualizar_datos.py) y arma el tablero. */
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

  const $ = (s) => document.querySelector(s);
  const fmt = (n, d = 0) => n == null || Number.isNaN(n) ? "—" : n.toLocaleString("es-CO", { minimumFractionDigits: d, maximumFractionDigits: d });
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const fechaLarga = (iso) => { if (!iso) return "—"; const [a, m, d] = iso.slice(0, 10).split("-").map(Number); return `${d} ${MESES[m - 1]} ${a}`; };
  const TRIM = { DJF: "dic–feb", JFM: "ene–mar", FMA: "feb–abr", MAM: "mar–may", AMJ: "abr–jun", MJJ: "may–jul", JJA: "jun–ago", JAS: "jul–sep", ASO: "ago–oct", SON: "sep–nov", OND: "oct–dic", NDJ: "nov–ene" };

  function nivelONI(v) {
    if (v >= 2.0) return "Niño muy fuerte";
    if (v >= 1.5) return "Niño fuerte";
    if (v >= 1.0) return "Niño moderado";
    if (v >= 0.5) return "Niño débil";
    if (v <= -0.5) return "La Niña";
    return "Neutral";
  }
  function colorDe(escala, v) { return COLORES[escala].find((c) => v < c.hasta).color; }

  async function cargar(nombre) {
    const r = await fetch(`data/${nombre}`, { cache: "no-cache" });
    if (!r.ok) throw new Error(`No se pudo leer data/${nombre}`);
    return r.json();
  }

  // ---------------------------------------------------------------- Gráficas (SVG)
  const anchoDe = (sel) => Math.round(Math.max(320, Math.min(640, (document.querySelector(sel)?.clientWidth || 640))));

  function svgONI(serie, W = 640) {
    const datos = serie.filter((p) => p.anio >= 2023);
    const H = Math.max(230, Math.round(W * 0.42)), m = { t: 18, r: 78, b: 34, l: 36 };
    const min = Math.min(-1.5, ...datos.map((d) => d.anomalia)), max = Math.max(2.5, ...datos.map((d) => d.anomalia));
    const y = (v) => m.t + (max - v) / (max - min) * (H - m.t - m.b);
    const bw = (W - m.l - m.r) / datos.length;
    let s = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`;
    [-1, 0, 0.5, 1, 1.5, 2].forEach((t) => {
      const yy = y(t);
      s += `<line x1="${m.l}" x2="${W - m.r}" y1="${yy}" y2="${yy}" stroke="${t === 0 ? "#cbc2ac" : "#e7decb"}" stroke-width="1"${t === 0.5 || t === 2 ? ' stroke-dasharray="4 3"' : ""}/>`;
      s += `<text x="${m.l - 6}" y="${yy + 4}" text-anchor="end">${t > 0 ? "+" : ""}${fmt(t, 1)}</text>`;
    });
    s += `<text x="${W - m.r + 6}" y="${y(2) + 4}">muy fuerte</text>`;
    s += `<text x="${W - m.r + 6}" y="${y(0.5) + 4}">El Niño</text>`;
    datos.forEach((d, i) => {
      const x = m.l + i * bw + bw * 0.15, w = bw * 0.7, v = d.anomalia;
      const y0 = y(0), y1 = y(v);
      const col = v >= 2 ? "#603338" : v >= 0.5 ? "#9c5635" : v <= -0.5 ? "#a9a688" : "#cbc2ac";
      s += `<rect x="${x}" y="${Math.min(y0, y1)}" width="${w}" height="${Math.max(1, Math.abs(y1 - y0))}" fill="${col}" rx="1"><title>${TRIM[d.trimestre] || d.trimestre} ${d.anio}: ${v > 0 ? "+" : ""}${fmt(v, 2)} °C</title></rect>`;
      if (d.trimestre === "DJF") s += `<text x="${x + w / 2}" y="${H - 12}" text-anchor="middle">${d.anio}</text>`;
    });
    const u = datos[datos.length - 1], ux = m.l + (datos.length - 1) * bw + bw / 2;
    s += `<text x="${ux}" y="${y(u.anomalia) - 6}" text-anchor="end" style="fill:#603338;font-weight:700">+${fmt(u.anomalia, 2)}</text>`;
    return s + "</svg>";
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
    let s = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`;
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
  let mapa, estaciones = [], focos = [], capaActual = "lluvia30";

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
      `<span><i style="background:#a23b3b;border-color:#fff;width:9px;height:9px"></i>Incendio activo</span>`;
  }

  function cambiarCapa(capa) {
    capaActual = capa;
    document.querySelectorAll(".capa").forEach((b) => { const on = b.dataset.capa === capa; b.classList.toggle("activa", on); b.setAttribute("aria-checked", on); });
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
          `Lluvia 7 días: <b>${fmt(v("lluvia7"), 1)} mm</b><br>Lluvia 30 días: <b>${fmt(v("lluvia30"), 1)} mm</b><br>Temp. máxima 7 días: <b>${fmt(v("tmax7"), 1)} °C</b>` +
          (p.reciente === false || p.reciente === "false" ? `<br><span style="color:#a23b3b">Sin datos de lluvia recientes</span>` : "")
        ).addTo(mapa);
      });
      mapa.on("click", "incendios", (ev) => {
        const p = ev.features[0].properties;
        popup.setLngLat(ev.lngLat).setHTML(`<strong>Foco de calor</strong><br>Detectado el ${fechaLarga(p.fecha)} a las ${String(p.hora).padStart(4, "0").replace(/(\d\d)(\d\d)/, "$1:$2")} (hora UTC)<br><span style="color:#6e6456">Puede ser un incendio forestal o una quema.</span>`).addTo(mapa);
      });
      ["estaciones", "incendios"].forEach((l) => { mapa.on("mouseenter", l, () => (mapa.getCanvas().style.cursor = "pointer")); mapa.on("mouseleave", l, () => (mapa.getCanvas().style.cursor = "")); });
    });
  }

  // ---------------------------------------------------------------- Municipio
  const claveMun = (e) => `${e.municipio}, ${e.departamento}`;
  function distanciaKm(a, b) {
    const R = 6371, rad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  const prom = (arr) => { const v = arr.filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };

  function mostrarMunicipio(clave) {
    const lista = estaciones.filter((e) => claveMun(e) === clave);
    if (!lista.length) return;
    const centro = { lat: prom(lista.map((e) => e.lat)), lon: prom(lista.map((e) => e.lon)) };
    const cerca = focos.filter((f) => distanciaKm(centro, f) <= 25).length;
    const l7 = prom(lista.map((e) => e.lluvia7)), l30 = prom(lista.map((e) => e.lluvia30)), t = Math.max(...lista.map((e) => e.tmax7 ?? -Infinity));
    const [mun, dep] = clave.split(", ");
    let html = `<h3>${esc(mun)}</h3><p class="dep">${esc(dep)} · ${lista.length} ${lista.length === 1 ? "estación" : "estaciones"} del IDEAM</p>
      <div class="resumen-mun">
        <div><strong>${fmt(l7, 0)} mm</strong><span>lluvia 7 días${lista.length > 1 ? " (promedio)" : ""}</span></div>
        <div><strong>${fmt(l30, 0)} mm</strong><span>lluvia 30 días${lista.length > 1 ? " (promedio)" : ""}</span></div>
        <div><strong>${Number.isFinite(t) ? fmt(t, 1) + " °C" : "—"}</strong><span>temp. máxima 7 días</span></div>
      </div>
      <div class="tabla-scroll"><table><thead><tr><th>Estación</th><th>7 días</th><th>30 días</th><th>Máx.</th></tr></thead><tbody>` +
      lista.map((e) => `<tr><td>${esc(e.nombre.replace(/\s*\[\d+\]$/, ""))}${e.reciente === false ? ' <span style="color:#a23b3b">(sin datos recientes)</span>' : ""}</td><td class="n">${fmt(e.lluvia7, 1)}</td><td class="n">${fmt(e.lluvia30, 1)}</td><td class="n">${e.tmax7 == null ? "—" : fmt(e.tmax7, 1) + "°"}</td></tr>`).join("") +
      `</tbody></table></div>`;
    html += cerca
      ? `<p class="aviso"><strong>${cerca} ${cerca === 1 ? "foco de calor" : "focos de calor"}</strong> a menos de 25 km en las últimas 24 horas. Si ves humo o fuego, llama al 123.</p>`
      : `<p class="nota">Sin focos de calor a menos de 25 km en las últimas 24 horas.</p>`;
    html += `<p class="nota">Lluvia en milímetros y temperatura en °C, de estaciones automáticas del IDEAM (datos sin validar). El IDEAM recomienda guardar agua de las lluvias de octubre y noviembre.</p>`;
    $("#ficha").innerHTML = html;
    if (mapa) mapa.flyTo({ center: [centro.lon, centro.lat], zoom: 9, speed: 1.4 });
  }

  // ---------------------------------------------------------------- Arranque
  async function iniciar() {
    let oni, est, emb, inc, oficial, colombia, corrida;
    try {
      [oni, est, emb, inc, oficial, colombia, corrida] = await Promise.all(["oni.json", "estaciones.json", "embalses.json", "incendios.json", "estado-oficial.json", "colombia.geojson", "corrida.json"].map((n) => cargar(n).catch(() => null)));
    } catch (e) { console.error(e); }

    if (oni) {
      const u = oni.ultimo;
      $("#oni-valor").textContent = `${u.anomalia > 0 ? "+" : ""}${fmt(u.anomalia, 2)} °C`;
      $("#oni-periodo").textContent = `Trimestre ${TRIM[u.trimestre] || u.trimestre} de ${u.anio}`;
      $("#oni-nivel").textContent = nivelONI(u.anomalia);
      const pintaOni = () => ($("#graf-oni").innerHTML = svgONI(oni.serie, anchoDe("#graf-oni")));
      pintaOni(); window.addEventListener("resize", pintaOni);
    }
    if (oficial) {
      $("#estado-titular").textContent = oficial.titular;
      $("#estado-resumen").textContent = oficial.resumen;
      $("#declaraciones").innerHTML = oficial.declaraciones.map((d) => `<div class="decl"><h3>${esc(d.entidad)}</h3><time datetime="${d.fecha}">${fechaLarga(d.fecha)}</time><p>${esc(d.texto)}</p><a href="${esc(d.url)}" rel="noopener">${esc(d.nombreFuente || "Ver la fuente")}</a></div>`).join("");
      $("#enlaces").innerHTML = oficial.enlaces.map((l) => `<li><a href="${esc(l.url)}" rel="noopener">${esc(l.texto)}</a></li>`).join("");
    }
    if (emb && emb.volumenSistema.length) {
      const v = emb.volumenSistema, a = emb.aportesSistema;
      $("#vol-hoy").textContent = `${fmt(v[v.length - 1].valor, 1)} %`;
      $("#apo-hoy").textContent = a.length ? `${fmt(a[a.length - 1].valor, 0)} %` : "—";
      const pintaEmb = () => ($("#graf-emb").innerHTML = svgEmbalses(v, a, anchoDe("#graf-emb")));
      pintaEmb(); window.addEventListener("resize", pintaEmb);
      $("#emb-lista").innerHTML = emb.porEmbalse.slice(0, 12).map((e) => `<li>${esc(e.nombre)}: ${fmt(e.valor, 1)} %</li>`).join("");
      $("#emb-fuente").textContent = `Fuente: XM. Volumen útil y aportes del sistema eléctrico al ${fechaLarga(v[v.length - 1].fecha)}.`;
    }
    focos = inc ? inc.focos : [];
    $("#n-incendios").textContent = fmt(focos.length);
    estaciones = est ? est.estaciones : [];
    const claves = [...new Set(estaciones.map(claveMun))].sort((x, y) => x.localeCompare(y, "es"));
    $("#lista-municipios").innerHTML = claves.map((c) => `<option value="${esc(c)}"></option>`).join("");
    $("#buscar").addEventListener("change", (e) => mostrarMunicipio(e.target.value.trim()));
    $("#buscar").addEventListener("input", (e) => { if (claves.includes(e.target.value.trim())) mostrarMunicipio(e.target.value.trim()); });
    $("#fecha-datos").textContent = corrida ? fechaLarga(corrida.actualizado) : est ? fechaLarga(est.actualizado) : "—";
    document.querySelectorAll(".capa").forEach((b) => b.addEventListener("click", () => cambiarCapa(b.dataset.capa)));
    $("#ver-incendios").addEventListener("change", (e) => mapa && mapa.getLayer("incendios") && mapa.setLayoutProperty("incendios", "visibility", e.target.checked ? "visible" : "none"));
    pintarLeyenda();
    if (window.maplibregl && colombia) iniciarMapa(colombia);
    else $("#mapa").innerHTML = '<p style="padding:20px">No se pudo cargar el mapa. Revisa tu conexión y vuelve a intentarlo.</p>';
  }
  iniciar();
})();

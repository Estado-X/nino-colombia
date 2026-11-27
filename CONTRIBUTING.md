# Cómo colaborar

Gracias por querer mejorar **El Niño en Colombia**. Es un tablero abierto y gratuito: cualquiera lo puede usar, copiar y mejorar. No hace falta saber programar para ayudar.

## Formas de ayudar

- **Cuéntanos si algo no funciona.** Un dato raro, una estación que no aparece, un municipio mal ubicado o algo que no se ve bien en tu celular. Abre un reporte con la plantilla «Algo no funciona».
- **Propón una mejora.** Una capa nueva, una forma más clara de mostrar algo o lo que le serviría a tu alcaldía. Usa la plantilla «Propón una mejora».
- **Propón una fuente de datos.** Si conoces una fuente oficial y abierta que debería estar aquí, usa la plantilla «Agrega una fuente».
- **Toma una tarea.** Busca los issues marcados como **buena primera tarea**: son cambios pequeños y bien explicados para empezar.

## Si vas a cambiar código

1. Haz un fork del repositorio y crea una rama para tu cambio.
2. Para probar en tu computador:
   ```
   python scripts/actualizar_datos.py
   python -m http.server
   ```
   y abre `http://localhost:8000`. Solo se usa la biblioteca estándar de Python 3.9 o superior; la página es HTML, CSS y JavaScript sin compilar.
3. Revisa la página en un celular (o a 390 px de ancho) y en un computador, y que la consola del navegador no muestre errores.
4. Abre un pull request que explique qué cambiaste y por qué, con una captura si cambia lo que se ve.

## Reglas de la casa

- **Solo datos oficiales y abiertos**, con su fuente y su fecha. Nada inventado: si un dato no se puede verificar, no entra.
- **Sin claves, sin servidor y sin rastreadores.** El tablero tiene que poder copiarse y funcionar gratis en GitHub Pages.
- **Lenguaje sencillo**, pensado para ciudadanos y alcaldías.
- **No es un pronóstico** ni reemplaza las alertas del IDEAM ni de la UNGRD; ningún cambio debe dar a entender lo contrario.
- No subas los archivos de `data/` que genera el flujo diario (`oni.json`, `estaciones.json`, `embalses.json`, `incendios.json`, `corrida.json`): se actualizan solos.
- Respeta las licencias: el código es MIT; la lista de municipios del DANE (`data/municipios.json`) es CC BY-SA 4.0.

## Trato

Sé amable y concreto. Todos los aportes se revisan con calma; si una propuesta no entra, te explicamos por qué.

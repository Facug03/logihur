# LogiHUR

Simulador de circuitos lógicos para estudiantes de la UNAHUR: una versión web, nativa y liviana de
**Logisim 2.7.1** que abre y guarda archivos `.circ` compatibles con el Logisim que se usa en clase.

## Comandos

```bash
bun install        # dependencias
bun run dev        # servidor de desarrollo
bun run build      # export estático en out/ + service worker (PWA offline)
bun run test       # tests (Vitest)
bun run lint       # Biome
bun run format     # Biome con fixes
bun run typecheck  # TypeScript
bun run golden     # regenera los casos contra Logisim real (requiere Java y el jar en .cache/)
bun run golden:io  # captura estados internos de E/S contra las fábricas Java originales
bun run golden:analyze  # graba el análisis combinacional de Logisim real (requiere Java)
bun run golden:libs     # graba la simulación de un proyecto con librerías .circ anidadas
```

## Uso del editor

Los botones de la barra permiten mostrar u ocultar Componentes/Circuitos y Atributos. En escritorio,
arrastrá los separadores para ajustar el ancho; doble clic restaura el tamaño original. Los paneles,
secciones y categorías recuerdan su estado al recargar. En móvil se cierran con el fondo o Escape.

**Atajos** en la barra inferior (o **?**) muestra la ayuda de teclado. Como en Logisim, con un componente
seleccionado (o su herramienta activa) los dígitos cambian sus entradas u otros parámetros y Alt + dígitos
el ancho de bits; Ctrl/⌘ + 1…9 eligen herramientas de la barra. Esa barra también indica la
herramienta activa y el autoguardado: es una copia en este navegador; **Guardar** descarga un `.circ`.
Con trackpad, Ctrl/⌘ + rueda o pellizco hace zoom en el circuito; la rueda desplaza el lienzo.

La herramienta **Texto (A)** permite crear etiquetas en vacío y editar las de componentes. Enter o
clic fuera confirma; Escape cancela. Los botones de simulación tienen ayudas al pasar el mouse o
enfocarlos. **Ctrl/⌘+I** avanza un paso de propagación; **Ctrl/⌘+T** avanza un tick de reloj.
El botón **Σ** abre el **Análisis combinacional**: *Analizar circuito* calcula tabla de verdad y
expresiones del circuito visible; la ventana también permite definir entradas/salidas a mano, editar la
tabla (clic o teclas 0/1/x), escribir expresiones, ver el mapa de Karnaugh y la expresión minimizada, y
**Crear circuito** (opcionalmente sólo con puertas de dos entradas o sólo NAND).
La revisión de funciones presentes y pendientes está en [COMPATIBILIDAD.md](COMPATIBILIDAD.md).

## Librerías `.circ`

Como en Logisim (*Proyecto → Cargar librería → Librería Logisim*), otro `.circ` puede usarse como
librería: sus circuitos se agregan como subcircuitos y se pueden ver por dentro pero no editar. En el
panel de componentes, **Cargar librería .circ…** la agrega; el archivo guardado conserva la referencia
`file#nombre.circ`, así que Logisim la encuentra si los archivos están en la misma carpeta. Al abrir un
proyecto que usa librerías podés elegir todos los archivos juntos; si falta alguno, un aviso permite
elegirlo después (mientras tanto sus componentes se conservan sin pérdida).

## Instalación y uso sin conexión

LogiHUR es una PWA: desde el menú de proyectos se puede **Instalar LogiHUR** (en iPhone/iPad:
Compartir → Agregar a inicio). Después de la primera visita funciona sin conexión, y la app
instalada en escritorio abre archivos `.circ` con doble clic. Cuando hay una versión nueva aparece
un aviso para actualizar; el trabajo queda guardado antes de recargar.

## Fidelidad

`tests/golden/` contiene circuitos (fixtures + aleatorios generados con semilla) cuya salida fue
grabada ejecutando Logisim 2.7.1 real (`-tty table`). `bun run test` verifica que LogiHUR produce
exactamente la misma tabla, y que Logisim puede abrir los `.circ` que escribe LogiHUR.
`tests/io-reference.test.ts` compara además 392 estados de E/S capturados de las fábricas Java
originales: incluye los displays, la matriz LED y el TTY, cuyo estado visible no sale por pines.
`tests/analyze-reference.test.ts` compara 511 casos del análisis combinacional con Logisim real:
minimización en ambos formatos, el parser de expresiones, análisis de circuitos (incluidos
realimentación y conflictos) y la construcción de circuitos con su diagramado exacto.

## Estructura

- `src/engine/` — núcleo sin DOM: valores de 4 estados (`value.ts`), red de cables (`netlist.ts`),
  propagador y estados de circuito (`simulation.ts`), apariencia de subcircuitos. Portado de
  `com.cburch.logisim.{data,circuit,instance}`.
- `src/components/` — librerías de componentes con los mismos nombres, atributos y valores por defecto
  que Logisim (`wiring/`, `gates/`, `plexers/`, `arith/`, `memory/`, `io/`, `base/`, subcircuitos).
- `src/format/` — lectura/escritura de `.circ` (port de `XmlReader`/`XmlWriter`).
- `src/analyze/` — análisis combinacional (port de `com.cburch.logisim.analyze` y `circuit.Analyze`,
  `std.gates.CircuitBuilder`).
- `src/sim/` — simulador headless (incluye el modo `-tty table` de Logisim).
- `src/render/` — dibujo en Canvas 2D con la misma geometría que Logisim.
- `src/ui/` — interfaz (Next.js, cliente).

## Licencia

Portado a partir del código fuente de Logisim 2.7.1 (© Carl Burch), distribuido bajo GPL v2;
este proyecto se distribuye bajo la misma licencia.

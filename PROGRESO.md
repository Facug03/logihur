# LogiHUR — estado del trabajo

Plan completo: `~/.claude/plans/quiero-hacer-un-https-logisim-app-breezy-stroustrup.md`.
Las fases 0–4 están implementadas y versionadas en git.

## Hecho

- **Fase 0–2**: motor, lectura/escritura `.circ`, render Canvas, editor completo (cables, selección,
  deshacer, atributos, subcircuitos, autoguardado), íconos originales.
- **Fase 3 (motor + componentes)**:
  - `src/components/plexers/plexers.ts`: Multiplexor, Demultiplexor, Decodificador, Codificador de
    prioridad, Selector de bit.
  - `src/components/arith/arith.ts`: Sumador, Restador, Multiplicador, Divisor, Negador, Comparador,
    Desplazador, Sumador de bits, Buscador de bits.
  - `src/components/memory/`: biestables D/T/JK/SR (`flipflops.ts`), Registro, Contador, Registro de
    desplazamiento, Aleatorio (`registers.ts`), RAM/ROM + tabla interna (`mem.ts`), `MemContents` +
    formato hex "v2.0 raw" (`mem-contents.ts`).
  - Registrados en `src/components/libraries.ts`, strings en `src/i18n/es.ts`.
  - `src/engine/version.ts` (compareVersion compartido), `AttributeSet.clone()` copia valores mutables
    (contenidos de ROM), tipo de atributo `"memory"`, target TS ES2020 (BigInt).
  - Poke con "cursor" de teclado: `Poker` tiene `init/paint/keyTyped/stopEditing`; `Workspace.pokeKey`,
    `pokeCaret`, `stopPoking`; el canvas dibuja el cursor rojo; `App.tsx` manda teclas al componente
    tocado (registros, contador, registro de desplazamiento, RAM/ROM).
- **Tests diferenciales**: `tests/golden/components.ts` genera 59 casos por componente (cada bit de
  entrada es un pin, buses armados con splitters/túneles). `bun run golden` regeneró todo:
  **141/141 coinciden con Logisim 2.7.1 real**. Total: 168 tests OK, Biome y tsc limpios.
- **Editor hexadecimal**: `src/ui/HexEditor.tsx`, modal con filas virtualizadas, celdas hexadecimales,
  flechas/Enter/Tab, salto a dirección, validación de valores, Cargar/Guardar imagen `v2.0 raw` y Borrar.
  Edita un clon; Cancelar/Escape descarta los cambios. Integrado en atributos `memory` y en acciones
  de una RAM/ROM seleccionada. `Workspace.memoryContents/setMemoryContents`: ROM con transacción y
  deshacer/rehacer; RAM sobre el estado de simulación de la instancia vista y propagación inmediata.
- **Verificación del editor**: 5 tests nuevos de imágenes, propagación, snapshots, persistencia `.circ`,
  undo/redo y aislamiento de RAM entre instancias de subcircuitos. Total: **173 tests OK**, Biome y tsc
  limpios. Chrome/Playwright en `localhost:3123`: cancelación, validación, flechas, carga/descarga,
  borrado, acciones de ROM seleccionada, direcciones de 24 bits, datos de 32 bits y modal móvil.
  Build estático OK con `bun run build -- --webpack`; Turbopack falla en este entorno al abrir un puerto
  interno (`Operation not permitted`), incluso en el reintento con permisos ampliados.
- **Verificación visual y poke de fase 3**: galería de los 24 componentes de Plexores/Aritmética/Memoria
  abierta en Chrome sin errores de navegador y revisada visualmente. Teclado probado en Registro y
  Contador (hex), Registro de desplazamiento (hex + espacio para cambiar etapa), RAM y ROM (hex + Tab).
  En memorias se verificaron los valores reales abriendo el editor hexadecimal después del poke.
  Capturas de esta sesión: `/private/tmp/logihur-gallery.png` y
  `/private/tmp/logihur-gallery-poked.png` (artefactos temporales, no versionados).
- **Golden ampliados**: 32 casos de plexores cubren las cuatro orientaciones y, cuando corresponde,
  ambas ubicaciones del selector. 4 casos nuevos de RAM combinada/asíncrona: barrido de controles y
  ciclos de escritura/lectura con búfer controlado externo. Los casos de lectura exigen observar datos
  almacenados distintos de cero con OE=1 y el búfer externo liberado. Referencias regeneradas ejecutando
  `bun run golden` contra Logisim 2.7.1: **177/177 coinciden**, **209 tests OK**, Biome y tsc limpios.
  Cerrados los pendientes de verificación de fase 3.
- **Fase 4 – E/S**: los ocho componentes de Logisim registrados en `#I/O` y traducidos:
  - `src/components/io/displays.ts`: LED, display de 7 segmentos y display hexadecimal; polaridad,
    colores y fondo RGBA, punto decimal, guion para entradas desconocidas o de error.
  - `controls.ts`: Botón momentáneo y Joystick (2–5 bits), arrastre, límites y retorno al centro.
  - `keyboard.ts`: Teclado con FIFO de 1–256 caracteres, cursor, inserción, Suprimir, Inicio/Fin,
    ASCII de 7 bits, disponibilidad, lectura por flanco y borrado. Backspace/Enter/Control+L se
    almacenan como caracteres de control, igual que en Java.
  - `tty.ts`: TTY con flancos configurables, enable/clear, salto de línea, retroceso, borrado,
    ajuste de tamaño, wrap y scroll.
  - `matrix.ts`: Matriz LED con buses de filas/columnas o selección multiplexada, persistencia en
    ticks y LED cuadrados/circulares; variantes de selección de una fila o columna.
  - Framework: `Poker.mouseDragged/keyPressed`, despacho de puntero/teclas en Workspace y App,
    ticks disponibles para el pintor. Al terminar el poke o cambiar la vista se liberan los controles.
    El editor de colores conserva/edita opacidad y el renderer respeta `labelcolor`.
- **Referencia Java para E/S**: `scripts/io-reference.java` ejecuta las fábricas del jar real con
  trazas compartidas en `tests/golden/io-cases.ts`. `bun run golden:io` captura 392 estados, incluidos
  los componentes sin salidas (displays, matriz, TTY), en `tests/golden/io-reference.json`.
  `tests/io-reference.test.ts` comprueba las 15 trazas sin requerir Java en cada ejecución.
  Además, `tests/io.test.ts` verifica simulación, controles, FIFO, matrices, `.circ` y el ejemplo.
- **Ejemplo E/S**: `public/examples/io-demo.circ`, disponible en el panel Ejemplos. Contiene los ocho
  componentes; teclado → TTY con reloj compartido, Botón → LED, joystick con pines X/Y, displays y
  matriz mostrando A. Logisim Java abre el archivo. Chrome/Playwright comprobó pulsación/liberación,
  arrastre/límites/centrado del joystick, edición de teclado y recepción de "Hola" en TTY, la paleta y
  el editor de transparencia, sin errores de navegador. Captura temporal:
  `/private/tmp/logihur-io-demo.png`. La escritura con teclado virtual móvil sigue para el pulido de
  fase 6; esta sesión verificó interacción con teclado físico y el layout móvil.
  Estado: **238 tests OK**, **177 casos de tablas + 392 estados E/S coinciden con Java**;
  Biome, TypeScript y build estático con Webpack OK.


- **UX del editor (sin cambiar la geometría ni los íconos de Logisim)**:
  - Paneles de componentes/circuitos y atributos ocultables también en escritorio. Separadores
    ajustables con arrastre, flechas, Inicio/Fin y doble clic para restaurar el ancho original.
    Anchos y visibilidad se recuerdan en `localStorage`, separados del archivo `.circ`.
  - Circuitos, Librerías y Ejemplos expandibles/contraíbles. Cada categoría (Cableado, Puertas,
    etc.) conserva su estado al recargar; ocultar un panel no reinicia sus secciones.
  - En móvil se abren como paneles superpuestos, con cierre por botón, fondo o Escape; acceso
    a ambos paneles al inicio de la barra y retorno al diseño de escritorio al ampliar la ventana.
  - `src/ui/ShortcutsDialog.tsx`: ayuda desde **Atajos** en la barra inferior o **?**. Modal nativo
    con foco y Escape; los atajos globales se suspenden en diálogos y campos de texto.
  - `sonner`: notificaciones de apertura, recuperación, descarga y errores; fallo HTTP y estado
    de carga de ejemplos. Los atributos inválidos explican el rechazo y conservan el valor anterior.
  - Barra inferior: ayuda de la herramienta activa, estado de simulación y autoguardado real
    (pendiente/guardado/error). Un guardado local no limpia el estado de cambios sin descargar.
    Abrir un proyecto reemplaza cualquier autoguardado pendiente y persiste el proyecto abierto.
    Si falla el almacenamiento se muestra un aviso para descargar el `.circ`, también en móvil.
  - Trackpad Mac: listener nativo `wheel` no pasivo cancela el zoom del navegador en el canvas
    con Ctrl/Meta, conservando el zoom del circuito. También cancela los eventos de gesto de Safari;
    fuera del canvas no se intercepta el zoom del navegador.
  - Chrome/Playwright: persistencia después de recargar, arrastre y teclado, ocultar/restaurar,
    ayuda de atajos, notificaciones, atributos inválidos, autoguardado, paneles móviles y resize
    de ventana. Eventos nativos Ctrl+rueda por CDP cambian el zoom del circuito sin alterar la
    escala del navegador; cancelación de gestos Safari comprobada con eventos sintéticos.
    Regresión de Botón/Joystick/Teclado/TTY completa sin errores. Capturas temporales:
    `/private/tmp/logihur-ux-desktop.png` y `/private/tmp/logihur-ux-mobile.png`.
  - **241 tests OK**, Biome, TypeScript y export estático con Webpack OK.

- **Revisión contra Logisim original: barra, Texto y Simular**:
  - `COMPATIBILIDAD.md` contrasta la documentación oficial 2.7 y las fuentes Java reales de
    TextTool, SimulationToolbarModel, ExplorerToolbarModel y ProjectToolbarModel. Distingue
    funciones implementadas y pendientes (menú contextual, árbol de simulación, reordenamiento,
    barra configurable y editor de apariencia).
  - Herramienta **Texto (A)** en la barra: etiquetas libres sin ajuste a grilla, edición de
    etiquetas existentes y de componentes, Enter/clic fuera confirma y Escape cancela. Campo
    web de una línea con cursor, selección/pegado y entrada móvil. Los borradores no modifican
    el circuito; agregar, editar y borrar se registran en deshacer/rehacer y se guardan en `.circ`.
    `src/ui/text-editing.ts` reproduce posición/alineamiento del campo de Logisim; si una etiqueta
    de componente ya tiene texto, se edita clickeando el texto, no el cuerpo.
  - `src/ui/Tooltip.tsx`: ayuda visible al pasar el mouse o enfocar los botones, incluso acciones
    deshabilitadas. Texto explicativo para herramientas y simulación; pausa/reanudar y ticks
    muestran la acción actual. Se usan los íconos de simulación originales de Logisim.
  - **Paso de simulación (Ctrl/⌘+I)** usa `Propagator.step()` existente; puntos cambiados con
    círculos azules y contorno azul en subcircuitos afectados. **Ctrl/⌘+E** pausa/reanuda.
    Al pausar también se suspenden los ticks automáticos, como `Simulator.updateTicker()` de Java;
    la preferencia de ticks se conserva para reanudar. Un paso de propagación no incrementa ticks.
  - Chrome/Playwright: tooltips con mouse/foco/Escape, textos según estado; texto libre, edición,
    cancelar, borrar, deshacer/rehacer y descarga/reapertura real de `.circ`; etiquetas de pines,
    botón/atajo de paso y entrada de texto móvil, sin errores. Captura temporal:
    `/private/tmp/logihur-text-step.png`.
  - **249 tests OK**, Biome, TypeScript y export estático con Webpack OK.

- **Trackpad: desplazamiento horizontal sin volver atrás**: el listener nativo no pasivo del
  canvas cancela el comportamiento de rueda del navegador en ambos ejes, manteniendo el pan/zoom
  del circuito; su contenedor usa `overscroll-behavior: contain` para impedir encadenamiento y
  navegación horizontal. No se interceptan eventos fuera del canvas. Chrome comprobó desplazamiento
  en ambos sentidos, cancelación del evento, historial sin cambios y continuidad del zoom.

- **Fase 5 – Análisis combinacional** (`src/analyze/`, `src/ui/analyzer/`):
  - Modelo portado 1:1 (`VariableList`, `TruthTable`, `OutputExpressions`, misma cadena de eventos):
    agregar/quitar/mover/renombrar variables mantiene tabla y expresiones consistentes.
  - Minimización Quine-McCluskey de `Implicant`, reproduciendo el orden de iteración de `HashMap`
    de Java para que los desempates del cubrimiento greedy den la misma expresión que Logisim.
  - Parser de expresiones con los mismos operadores, errores (en español) y rangos de error.
  - `analyze.ts`: expresiones propagadas por cables/compuertas y, si no se puede (componentes no
    soportados, referencia circular, salidas en conflicto), tabla por simulación, igual que Java.
  - `circuit-builder.ts`: `CircuitDetermination` + `CircuitBuilder` (dos entradas, sólo NAND,
    paridad para XOR de más de dos entradas, mismas posiciones de puertas, pines y cables).
  - UI: botón Σ con "Analizar Circuito" y "Análisis Combinacional"; pestañas Entradas, Salidas,
    Tabla (virtualizada, cursor de teclado como TableTabCaret), Expresión (vista con barras de
    negación), Minimizado (mapa de Karnaugh SVG con implicantes, SOP/POS) y Crear Circuito con
    confirmación de reemplazo; todo deshacible.
  - `scripts/analyze-reference.java` + `bun run golden:analyze`: 511 casos grabados de Logisim
    real (179 minimizaciones, 29 textos del parser, 257 circuitos —76 generados con cableado real,
    incluidos realimentación/conflictos/entradas abiertas— y 46 construcciones). Todos coinciden.
  - Playwright (escritorio y 390 px): analizar el semisumador, errores del parser, K-map, construir
    un circuito sólo NAND, definir una tabla a mano y obtener su expresión; sin errores de consola.
  - **262 tests OK**, Biome y TypeScript limpios.

- **Fase 6 – PWA**: `src/app/manifest.ts` (instalable, standalone, íconos propios incluido maskable,
  `file_handlers` para abrir `.circ` con doble clic en escritorio vía `launchQueue`). `bun run build`
  ejecuta `scripts/build-sw.ts`, que genera `out/sw.js` desde `src/pwa/sw.template.js` precacheando
  todo el export (≈2 MB) bajo una caché con hash de contenido: funciona sin conexión desde la primera
  visita y cada deploy reemplaza la caché anterior. `src/ui/pwa.ts`: registro sólo en producción,
  aviso "Hay una versión nueva" con Actualizar (guarda antes de recargar), "Instalar LogiHUR" en el
  menú de proyectos y la indicación Compartir → Agregar a inicio en iOS. Playwright sobre `out/`:
  recarga offline con editor y analizador operativos; actualización simulada muestra el aviso,
  recarga y borra la caché vieja.

- **Menús contextuales y reordenamiento** (`src/ui/ContextMenu.tsx`): Menu Tool en el lienzo
  (clic derecho, Ctrl+clic, pulsación larga de 500 ms en táctil) con los ítems de `MenuTool` y los
  `MenuExtender` de subcircuitos, memorias y separadores; menú de circuito en el panel (clic
  derecho o ⋯). Nueva operación deshacible `moveCircuit` en el historial. Popover manual (el
  light dismiss cerraba el menú al soltar la presión que lo abrió). Tests en
  `tests/context-menu.test.ts`; Playwright en escritorio y táctil.

## Siguiente (en este orden)

1. **Fase 5 (resto)**: editor de apariencia, logging, librerías `.circ`; copiar/pegar en la tabla.
2. **Fase 6 (resto)**: pulido móvil (incluido teclado virtual para el componente Teclado).

## Notas útiles

- Fuentes Java extraídas en `.cache/src/src/...`; traducciones oficiales en
  `.cache/res/resources/logisim/{es,en}/*.properties` (ISO-8859-1). Donde Logisim en español no traduce
  un texto dibujado en el componente (p. ej. "find/low/high", "reg", "ctr"), se deja en inglés igual
  que el original.
- Si `tsc` da errores raros de BigInt: borrar `tsconfig.tsbuildinfo`.
- Java: `/opt/homebrew/opt/openjdk/bin/java`; sólo lo necesita `bun run golden`.

# LogiHUR — estado del trabajo

Plan completo: `~/.claude/plans/quiero-hacer-un-https-logisim-app-breezy-stroustrup.md`.
La implementación sigue sin commitear; el directorio sí tiene repositorio git.

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

## Siguiente (en este orden)

1. Probar en el navegador (`bun run dev -- -p 3123`) que los componentes nuevos se dibujan bien y que
   el poke con teclado funciona.
2. Casos golden pendientes: RAM con bus combinado/asíncrono (necesita buffers controlados para manejar
   el bus), más orientaciones de plexores.
3. **Fase 4 – E/S**: LED, 7 segmentos, dígito hex, botón, joystick, teclado, matriz LED, TTY
   (fuentes Java en `.cache/src/src/com/cburch/logisim/std/io/`).
4. **Fase 5**: análisis combinacional, editor de apariencia, logging, librerías `.circ`.
5. **Fase 6**: PWA, pulido móvil.

## Notas útiles

- Fuentes Java extraídas en `.cache/src/src/...`; traducciones oficiales en
  `.cache/res/resources/logisim/{es,en}/*.properties` (ISO-8859-1). Donde Logisim en español no traduce
  un texto dibujado en el componente (p. ej. "find/low/high", "reg", "ctr"), se deja en inglés igual
  que el original.
- Si `tsc` da errores raros de BigInt: borrar `tsconfig.tsbuildinfo`.
- Java: `/opt/homebrew/opt/openjdk/bin/java`; sólo lo necesita `bun run golden`.

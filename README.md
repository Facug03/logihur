# LogiHUR

Simulador de circuitos lógicos para estudiantes de la UNAHUR: una versión web, nativa y liviana de
**Logisim 2.7.1** que abre y guarda archivos `.circ` compatibles con el Logisim que se usa en clase.

## Comandos

```bash
bun install        # dependencias
bun run dev        # servidor de desarrollo
bun run build      # export estático en out/
bun run test       # tests (Vitest)
bun run lint       # Biome
bun run format     # Biome con fixes
bun run typecheck  # TypeScript
bun run golden     # regenera los casos contra Logisim real (requiere Java y el jar en .cache/)
bun run golden:io  # captura estados internos de E/S contra las fábricas Java originales
```

## Uso del editor

Los botones de la barra permiten mostrar u ocultar Componentes/Circuitos y Atributos. En escritorio,
arrastrá los separadores para ajustar el ancho; doble clic restaura el tamaño original. Los paneles,
secciones y categorías recuerdan su estado al recargar. En móvil se cierran con el fondo o Escape.

**Atajos** en la barra inferior (o **?**) muestra la ayuda de teclado. Esa barra también indica la
herramienta activa y el autoguardado: es una copia en este navegador; **Guardar** descarga un `.circ`.
Con trackpad, Ctrl/⌘ + rueda o pellizco hace zoom en el circuito; la rueda desplaza el lienzo.

## Fidelidad

`tests/golden/` contiene circuitos (fixtures + aleatorios generados con semilla) cuya salida fue
grabada ejecutando Logisim 2.7.1 real (`-tty table`). `bun run test` verifica que LogiHUR produce
exactamente la misma tabla, y que Logisim puede abrir los `.circ` que escribe LogiHUR.
`tests/io-reference.test.ts` compara además 392 estados de E/S capturados de las fábricas Java
originales: incluye los displays, la matriz LED y el TTY, cuyo estado visible no sale por pines.

## Estructura

- `src/engine/` — núcleo sin DOM: valores de 4 estados (`value.ts`), red de cables (`netlist.ts`),
  propagador y estados de circuito (`simulation.ts`), apariencia de subcircuitos. Portado de
  `com.cburch.logisim.{data,circuit,instance}`.
- `src/components/` — librerías de componentes con los mismos nombres, atributos y valores por defecto
  que Logisim (`wiring/`, `gates/`, `plexers/`, `arith/`, `memory/`, `io/`, `base/`, subcircuitos).
- `src/format/` — lectura/escritura de `.circ` (port de `XmlReader`/`XmlWriter`).
- `src/sim/` — simulador headless (incluye el modo `-tty table` de Logisim).
- `src/render/` — dibujo en Canvas 2D con la misma geometría que Logisim.
- `src/ui/` — interfaz (Next.js, cliente).

## Licencia

Portado a partir del código fuente de Logisim 2.7.1 (© Carl Burch), distribuido bajo GPL v2;
este proyecto se distribuye bajo la misma licencia.

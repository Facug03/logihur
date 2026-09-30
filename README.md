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
```

## Fidelidad

`tests/golden/` contiene circuitos (fixtures + aleatorios generados con semilla) cuya salida fue
grabada ejecutando Logisim 2.7.1 real (`-tty table`). `bun run test` verifica que LogiHUR produce
exactamente la misma tabla, y que Logisim puede abrir los `.circ` que escribe LogiHUR.

## Estructura

- `src/engine/` — núcleo sin DOM: valores de 4 estados (`value.ts`), red de cables (`netlist.ts`),
  propagador y estados de circuito (`simulation.ts`), apariencia de subcircuitos. Portado de
  `com.cburch.logisim.{data,circuit,instance}`.
- `src/components/` — librerías de componentes con los mismos nombres, atributos y valores por defecto
  que Logisim (`wiring/`, `gates/`, `base/`, subcircuitos).
- `src/format/` — lectura/escritura de `.circ` (port de `XmlReader`/`XmlWriter`).
- `src/sim/` — simulador headless (incluye el modo `-tty table` de Logisim).
- `src/render/` — dibujo en Canvas 2D con la misma geometría que Logisim.
- `src/ui/` — interfaz (Next.js, cliente).

## Licencia

Portado a partir del código fuente de Logisim 2.7.1 (© Carl Burch), distribuido bajo GPL v2;
este proyecto se distribuye bajo la misma licencia.

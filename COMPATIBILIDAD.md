# Revisión del editor frente a Logisim 2.7.1

Revisión del 30/09/2026 centrada en la barra de herramientas, las herramientas Base y los controles
visibles en la captura del Logisim original. No es una declaración de paridad completa de la aplicación.

Se contrastó la documentación oficial y las fuentes del jar 2.7.1 extraídas en `.cache/src/src/`:
`tools/TextTool.java`, `instance/InstanceTextField.java`, `gui/main/SimulationToolbarModel.java`,
`gui/main/ExplorerToolbarModel.java`, `gui/main/ProjectToolbarModel.java` y `gui/menu/MenuSimulate.java`.

| Función original | Estado en LogiHUR |
| --- | --- |
| Mano / Tocar | Implementado: pines, relojes y pokers de componentes. |
| Editar, seleccionar, mover y cablear | Implementado como herramienta Editar y herramienta Cablear. Selección con Shift y por rectángulo. |
| Texto (A) | Implementado en la barra: crear etiqueta, editar texto existente o etiqueta de un componente. Enter/clic fuera confirma; Escape cancela. Operaciones reversibles. |
| Componente Etiqueta | Ya estaba en Base; distinto de la herramienta Texto. Conserva fuente, alineamiento y coordenadas `.circ`. |
| Pausar / reanudar propagación | Implementado, con ícono original de detener/reanudar, texto según estado y Ctrl/⌘+E. |
| Paso de simulación | Agregado: un paso del propagador, Ctrl/⌘+I, puntos cambiados en azul y contorno azul de subcircuitos afectados. Pausa la propagación automática. |
| Un tick / ticks automáticos / frecuencia | Implementado. Son controles diferentes de la propagación; íconos originales y tooltips explican la diferencia. Pausar la simulación suspende los ticks automáticos y reanudar conserva su configuración. |
| Reiniciar simulación | Implementado sobre toda la jerarquía del circuito raíz. |
| Tooltips de la barra | Visibles con mouse y foco, incluido sobre acciones deshabilitadas; las ayudas de simulación describen la acción y el estado. |
| Agregar / quitar circuitos | Implementado en el panel Circuitos. |
| Flechas para reordenar circuitos | Implementado como Mover Arriba / Mover Abajo en el menú de cada circuito (clic derecho o botón ⋯); deshacible, conserva el circuito principal y el orden se guarda en el `.circ`. |
| Llave: vista de librerías / árbol de simulación | Panel de librerías implementado. Árbol de instancias de simulación pendiente; hay navegación entrando en subcircuitos y volviendo con la ruta del lienzo. |
| Botones diseño / apariencia | Diseño implementado. Editor gráfico de apariencia pendiente de fase 5; se lee/dibuja la apariencia de subcircuitos. |
| Menu Tool / menú contextual de componentes | Implementado: clic derecho o Ctrl+clic (como Button3 / Ctrl Button1 de Logisim) y pulsación larga en táctil. Componente: Borrar, Mostrar Atributos y extensiones (Vista de subcircuito; Editar/Borrar Contenidos, Cargar/Salvar Imagen en RAM/ROM; Distribuir ascendente/descendente en separadores). Selección múltiple: Eliminar, Cortar y Copiar Selección. Menú de circuito: Editar, Analizar, Mover, Seleccionar como principal y Eliminar. Pendientes: Editar Apariencia y Estadísticas del circuito. |
| Barra configurable y mapeo de botones del mouse | Pendiente: la barra web es fija; no aplica la configuración de `<toolbar>` / `<mappings>` del archivo al editor. |
| Análisis combinacional | Implementado (botón Σ): Analizar Circuito y ventana con Entradas, Salidas, Tabla, Expresión y Minimizado, mapa de Karnaugh y Crear Circuito (dos entradas / sólo NAND, reemplazo con confirmación y deshacer). 511 casos verificados contra Logisim 2.7.1. Pendiente: copiar/pegar regiones de la tabla (TableTabClip). |
| Cargar librerías `.circ` | Implementado (`file#`): carga recursiva con detección de ciclos, circuitos de sólo lectura, Quitar si no se usa, referencias por nombre de archivo; simulación de librerías anidadas verificada contra Logisim 2.7.1. Librerías JAR fuera de alcance. |
| Logging | Pendiente de fase 5. |

La edición de texto usa un campo web de una línea sobre el lienzo. Conserva la regla original:
si un componente aún no tiene etiqueta, un clic en su cuerpo la edita; si ya tiene etiqueta, se edita
clickeando sobre el texto. Un clic fuera de una etiqueta editable crea una etiqueta libre. Las etiquetas
vacías nuevas no se agregan; vaciar una etiqueta libre existente la elimina. El campo web también
permite selección, pegado y teclado virtual, además de los controles básicos del original.

## Referencias oficiales

- [Herramienta Texto](https://cburch.com/logisim/docs/2.7/en/html/libs/base/text.html)
- [Librería Base](https://cburch.com/logisim/docs/2.7/en/html/libs/base/index.html)
- [Menú Simular](https://cburch.com/logisim/docs/2.7/en/html/guide/menu/simulate.html)
- [Menú Proyecto](https://cburch.com/logisim/docs/2.7/en/html/guide/menu/project.html)
- [Configuración de la barra](https://cburch.com/logisim/docs/2.7/en/html/guide/opts/toolbar.html)

# AGENTS.md

## Proyecto

- Backend: **NestJS + TypeScript**
- Contexto de cliente/data fetching: **SWR**
- Seguir la arquitectura, convenciones, patrones y dependencias existentes en el repositorio.

## Reglas principales

- **No ejecutar build.**
- **No ejecutar lint.**
- **No ejecutar tests.** Se pueden crear o modificar tests, pero serán ejecutados manualmente por el desarrollador.
- **No instalar, actualizar, eliminar ni introducir dependencias.**
- **No acceder a Internet ni consultar documentación externa.**
- **No asumir información faltante.** Detenerse y preguntar al desarrollador cuando sea necesario.
- **No leer archivos completos.** Buscar la palabra o frase clave del archivo usando la skill de codegraph y leer como máximo 200 lineas.

## Desarrollo

Antes de implementar:

1. Revisar el código relevante y las implementaciones existentes.
2. Inferir las convenciones y patrones del repositorio y seguirlos consistentemente.
3. Reutilizar abstracciones y dependencias existentes cuando corresponda, evitando crear patrones paralelos.
4. Realizar únicamente los cambios necesarios para cumplir la tarea.
5. No realizar refactors ni mejoras no relacionadas con la solicitud.
6. Si no estás seguro como implementar o usar alguna librería, puedes leer su documentación en /node_modules

## Incertidumbre

Si la tarea es ambigua o el repositorio no proporciona suficiente contexto para determinar el comportamiento correcto:

**Detenerse y realizar preguntas concretas antes de modificar código.**

No asumir reglas de negocio, contratos de API, decisiones arquitectónicas ni comportamientos esperados.

## Validación

Validar los cambios únicamente mediante inspección del código y razonamiento.

Nunca ejecutar:

- build
- lint
- tests
- instalación de dependencias
- comandos con efectos secundarios relevantes

Al finalizar, informar brevemente los archivos modificados y los tests creados o modificados.

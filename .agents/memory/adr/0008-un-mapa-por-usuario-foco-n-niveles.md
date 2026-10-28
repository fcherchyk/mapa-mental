---
id: 0008
titulo: Un mapa por usuario con navegación por foco y N niveles visibles
status: aceptado
fecha: 2026-10-27
aprobado_por: usuario (gate de arquitectura)
---

## Contexto

Un mapa grande no se puede mostrar entero; hay que navegarlo.

## Decisión

Cada usuario tiene un solo mapa, creado en el primer login con su nodo raíz. La pantalla muestra un nodo en foco y como mucho N niveles hacia abajo; a los más profundos se llega enfocándolos. El foco vive en la URL (`/` y `/n/:nodeId`) y se usa React Router. Existe la tabla `maps` con `owner_id` único.

## Consecuencias

Funcionan atrás, enlaces y recarga. Pasar a varios mapas o compartidos es quitar el `unique` sin migrar datos.

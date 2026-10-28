---
id: 0012
titulo: El servidor envía solo la ventana visible
status: aceptado
fecha: 2026-10-27
aprobado_por: usuario (gate de arquitectura)
---

## Contexto

Los mapas pueden crecer y no conviene bajarlos enteros.

## Decisión

`GET /nodes/{id}/view?depth=N` devuelve foco, ancestros y nodos hasta N niveles con `child_count`, mediante una CTE recursiva con tope de profundidad. El cliente cachea las ventanas visitadas y las invalida ante cambios.

## Consecuencias

Cada navegación puede pedir una ventana nueva. La consulta usa el índice `(parent_id, sort_key)`, y toda consulta hace join con `maps.owner_id` para evitar IDOR.

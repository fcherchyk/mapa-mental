---
id: 0013
titulo: Nodos con kind y props; referencias externas en tabla aparte
status: aceptado
fecha: 2026-10-27
aprobado_por: usuario (gate de arquitectura)
---

## Contexto

Más adelante un nodo podrá ser documento, planilla, proyecto, evento o tarea, integrados con servicios externos.

## Decisión

`nodes.kind` es texto (hoy `idea`) y los datos propios van en `props` (jsonb), validados con un esquema Pydantic por tipo en `node_types`. Las referencias externas van en la tabla `external_refs` (corte 2) y las integraciones tendrán una interfaz `Provider` por servicio. Si hacen falta enlaces entre ramas, se agrega una tabla `edges`.

## Consecuencias

Un tipo nuevo es un valor de `kind` más su esquema, sin migrar `nodes`.

---
id: 0002
titulo: Lienzo del mapa con React Flow
status: aceptado
fecha: 2026-10-27
aprobado_por: usuario (gate de arquitectura)
---

## Contexto

Hace falta un lienzo con zoom, desplazamiento y nodos personalizados por tipo.

## Decisión

Se usa React Flow como lienzo del mapa; `NodeRenderer` elige el componente según `kind`.

## Consecuencias

Se suma React Flow como dependencia del frontend. Los tipos de nodo futuros se agregan como componentes nuevos.

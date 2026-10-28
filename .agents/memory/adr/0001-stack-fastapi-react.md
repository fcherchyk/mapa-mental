---
id: 0001
titulo: Backend FastAPI y SPA React/TypeScript (Vite)
status: aceptado
fecha: 2026-10-27
aprobado_por: usuario (gate de arquitectura)
---

## Contexto

El pedido es web primero, con posible app móvil más adelante, así que la API tiene que estar separada del frontend.

## Decisión

API en FastAPI (Python 3.12) y SPA en React/TypeScript con Vite, comunicadas por HTTP/REST. El cliente de la API se genera del OpenAPI de FastAPI.

## Consecuencias

Una futura app móvil reutiliza la misma API. Hay dos bases de código y dos toolchains. Se aplica además como estándar del workspace (9A).

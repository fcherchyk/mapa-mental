---
id: 0010
titulo: N de niveles visibles como preferencia del usuario
status: aceptado
fecha: 2026-10-27
aprobado_por: usuario (gate de arquitectura)
---

## Contexto

La cantidad de niveles que conviene ver depende de cada persona.

## Decisión

N se guarda en `users.settings` (clave `depth`), va de 1 a 10 y por defecto es 3. Se edita con `PATCH /me/settings`.

## Consecuencias

El servidor valida el rango con Pydantic. La caché del cliente se indexa por `(nodeId, N)`.

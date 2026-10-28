---
id: 0007
titulo: Scopes mínimos y autorización incremental de Drive
status: aceptado
fecha: 2026-10-27
aprobado_por: usuario (gate de arquitectura)
---

## Contexto

El pedido original era dar acceso a Drive en el login; el usuario eligió apartarse de eso.

## Decisión

El primer corte pide solo `openid email profile`. El acceso a Drive (`drive.file`, con Google Picker) se pide de forma incremental en el corte 2, al crear el primer nodo documento. Cada servicio futuro (Calendar, Trello, GitHub) usa su propio OAuth al conectarlo.

## Consecuencias

El login no da acceso a Drive. Desde el corte 2 se suman las tablas `oauth_grants` (refresh tokens cifrados con Fernet) y `external_refs`, y la variable `TOKEN_ENCRYPTION_KEY`.

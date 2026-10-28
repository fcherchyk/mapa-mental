---
id: 0006
titulo: Login con Google, el backend hace el OAuth (BFF) y el navegador recibe una cookie HttpOnly
status: aceptado
fecha: 2026-10-27
aprobado_por: usuario (gate de arquitectura)
---

## Contexto

El pedido es login con la cuenta de Google. Los tokens no deben quedar al alcance de un XSS y la app móvil debe poder reutilizar el backend.

## Decisión

Flujo Authorization Code del lado del servidor con Authlib, con `state` y `nonce`. El navegador solo recibe una cookie de sesión `HttpOnly`, `SameSite=Lax` (`Secure` por variable de entorno). Las mutaciones exigen un header propio contra CSRF. La app queda en modo Testing de Google.

## Consecuencias

Los tokens de Google nunca llegan al navegador. En modo Testing los refresh tokens vencen a los 7 días, lo que afecta recién al corte 2. Hay tablas `users` y `sessions`.

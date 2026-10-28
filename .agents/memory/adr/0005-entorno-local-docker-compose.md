---
id: 0005
titulo: Primer corte local con docker compose
status: aceptado
fecha: 2026-10-27
aprobado_por: usuario (gate de arquitectura)
---

## Contexto

El primer corte no requiere deploy; los datos del usuario son privados.

## Decisión

Todo corre en local con docker compose: `db` (PostgreSQL 16 con volumen), `api` (FastAPI con recarga) y `web` (Vite con proxy de `/api`, mismo origen `localhost:5173`, sin CORS). Los secretos van en `.env` (en `.gitignore`) y el repo trae `.env.example`. Los puertos se publican solo en 127.0.0.1.

## Consecuencias

No hace falta CORS. El deploy fuera de local queda para el corte 5.

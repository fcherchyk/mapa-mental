---
id: 0004
titulo: PostgreSQL como base de datos
status: aceptado
fecha: 2026-10-27
aprobado_por: usuario (gate de arquitectura)
---

## Contexto

Se necesita consultar el árbol (CTE recursiva), jsonb para `props` y `settings`, y migraciones.

## Decisión

Base de datos PostgreSQL 16, con SQLAlchemy 2 y Alembic.

## Consecuencias

Se aprovechan CTE recursivas y jsonb. Pasa a estándar del workspace (9A).

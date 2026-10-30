# Progreso · corrida 4008c894: limpieza del repo (LICENSE, README en inglés, guía de OAuth, Roadmap)

Spec: `.agents/memory/specs/4008c894.md`. Solo documentación: `LICENSE` nuevo y `README.md` reescrito.

## Hecho

- [x] `LICENSE` en la raíz (MIT, `Copyright (c) 2026 Federico Cherchyk`).
- [x] `README.md` en inglés, mismo orden de secciones (Features, Installation, Usage, Tests, Structure, Roadmap, License)
      y las 19 viñetas de Features de la versión anterior.
- [x] Guía de Google OAuth paso a paso en `## Installation` (6 pasos de la spec, más la nota de `db-data` y `down -v`).
- [x] `## Roadmap` con checklist: 5 hechos y 5 pendientes.
- [x] `## License` con "MIT, see LICENSE".

## Verificado

- [x] Criterio 2: encabezados `##` en el orden pedido; 19 viñetas de Features; comandos, rutas y endpoints conservados.
- [x] Criterio 3 y 4: variables de la guía en `.env.example`; `db-data` en `docker-compose.yml`; redirect URI igual al
      default de `.env.example`; `.env` en `.gitignore`.
- [x] `pytest -q --cov=app --cov-fail-under=80`: 116 passed, cobertura 98,39%.
- [x] `pnpm --dir web exec vitest run --coverage`: 118 passed (9 archivos).
- [x] `git diff --name-only main`: además de `README.md`, aparecen `.agents/memory/specs/4008c894.md` y
      `.agents/runs/4008c894/*`, que vienen de commits previos del flujo (la spec), no de esta corrida.
      `LICENSE` es untracked hasta que se commitee.

## Decisiones

- Roadmap pendiente: los cuatro ítems del criterio 5 más "Move and reorder nodes by dragging" (corte 2 de
  `arquitectura.md`, pregunta 4 de la spec, pedido en el pedido original). Quedan afuera, sin listar: deshacer borrado,
  borrar varios nodos, varios mapas, mapas compartidos y `edges`. Pendiente de confirmar.
- Secciones `## Roadmap` y `## License` al final, como propone la spec. `codigo.md` no se toca.
- `## Usage` conserva `docker compose up --build` y la descripción de servicios (propuesta de la pregunta 3).
- UI citada en español con traducción entre paréntesis ("Borrar todo a partir de acá", "Tocá + o Tab…", "No encontrado").

## Rechazados / pendientes

- Rechazado por el arnés: `uv sync --directory api && { [ ! -d web ] || pnpm --dir web install --frozen-lockfile; }`
  (grupo con llaves). Se corrió en dos pasos sin llaves: `uv sync --directory api` y `pnpm --dir web install --frozen-lockfile`.
- Rechazado por el arnés: `test_command` tal cual (`pytest ... && { [ ! -d web ] || pnpm ... vitest ...; }`), por el
  grupo con llaves. Se corrieron los dos comandos por separado con los mismos argumentos; ambos salieron con código 0.
- Rechazado por el arnés: comandos compuestos con `;` y `grep` sobre el README, y un bucle con variable. Se usó la
  herramienta Grep para las verificaciones.
- No se hace commit: lo pide el paso de finalización, no esta corrida.

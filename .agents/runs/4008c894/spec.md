<!-- claude-readonly · claude-opus-5-5 · familia anthropic -->

Tengo el contexto que necesitaba: el README actual, `.env.example`, `docker-compose.yml`, los cortes de entrega de `arquitectura.md` y las notas "Queda afuera" de las specs. Esta es la spec:

# Spec: limpieza del repo (LICENSE, README en inglés, guía de OAuth, Roadmap)

## 1. Contexto

El repo se va a compartir públicamente, pero hoy no tiene licencia y su `README.md` está en español. Eso va contra la decisión del workspace del 2026-10-30, que pide el `README.md` en inglés. Además, la configuración de Google OAuth está resumida en dos viñetas y no alcanza para que alguien nuevo la siga. El cambio es solo de documentación. Sirve a quien clone el repo y a quien lo mantiene: aclara la licencia, cómo levantarlo desde cero y qué está hecho y qué falta.

## 2. Alcance

**Incluye**
- Un `LICENSE` nuevo en la raíz con el texto estándar de la licencia MIT y la línea `Copyright (c) 2026 Federico Cherchyk`.
- La traducción de `README.md` al inglés. Se mantienen el párrafo inicial, las viñetas de funcionalidades, los bloques de código, las rutas, los comandos y el árbol de `## Estructura`. Los comentarios del árbol también se traducen. Se mantiene el orden actual de secciones: intro, Funcionalidades, Instalación, Uso, Tests, Estructura.
- Una guía paso a paso de Google OAuth dentro de la sección de instalación, que reemplaza los pasos 1 a 3 actuales.
- Una sección `## Roadmap` con una checklist.
- Una sección `## License` con el texto "MIT, see LICENSE".

**Queda afuera**
- Cualquier cambio en `api/`, `web/`, `docker-compose.yml`, `.env.example` (cuyos comentarios siguen en español), `.agents/project.yaml` o los tests.
- Traducir los textos de la interfaz que el README cita, como "Borrar todo a partir de acá", "Niveles visibles" o "Tocá + o Tab…". La SPA está en español, así que se citan tal cual y, si hace falta, con la traducción entre paréntesis.
- La wiki y los documentos de `.agents/`, que siguen en español.
- Capturas de pantalla, badges y CI.

## 3. Criterios de aceptación

1. **LICENSE MIT**
   Dado el repo después del cambio, cuando se lee `LICENSE` en la raíz, entonces contiene el texto completo de la licencia MIT sin cambios, con la línea exacta `Copyright (c) 2026 Federico Cherchyk`.

2. **README en inglés con la estructura de siempre**
   Dado el `README.md` nuevo, cuando se listan sus encabezados `##`, entonces aparecen en este orden: `Features`, `Installation`, `Usage`, `Tests`, `Structure`, `Roadmap`, `License`. Además:
   - Cada viñeta de `Features` corresponde a una viñeta de la versión anterior, con la misma cantidad de viñetas.
   - Fuera de los textos de interfaz que se citan, no queda prosa en español.
   - Se mantienen todos los comandos, rutas de archivos y endpoints de la versión anterior: `docker compose up --build`, los comandos de tests, `pnpm --dir web gen:api`, `/api/nodes/{id}/view?depth=N`, etc.

3. **Guía de OAuth completa y en orden**
   Dado `## Installation`, cuando se lee la guía, entonces tiene pasos numerados en este orden:
   1. Crear un proyecto en Google Cloud.
   2. Configurar la pantalla de consentimiento de OAuth en modo *Testing* y agregar las cuentas que van a entrar como usuarios de prueba.
   3. Crear un cliente OAuth de tipo "Web application" con el redirect URI autorizado exacto `http://localhost:5173/api/auth/callback`.
   4. Ejecutar `cp .env.example .env` y copiar ahí `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET`, con una advertencia explícita de que `.env` nunca se commitea.
   5. Generar `SESSION_SECRET` con el mismo comando que figura en `.env.example`: `python -c "import secrets; print(secrets.token_urlsafe(32))"`. Elegir `POSTGRES_PASSWORD` y escribir la misma contraseña dentro de `DATABASE_URL`.
   6. Ejecutar `docker compose up --build` desde la carpeta del proyecto, o `docker compose --project-directory <path> up --build` desde otra carpeta.

   La guía dice además que los datos locales viven en el volumen de Docker `db-data` y que `docker compose down -v` los borra.

4. **La guía coincide con la configuración real**
   Dado el repo, cuando se comparan los nombres del README con `.env.example` y `docker-compose.yml`, entonces:
   - Cada variable que nombra la guía existe en `.env.example`.
   - El volumen que menciona se llama `db-data` en `docker-compose.yml`.
   - El redirect URI coincide con el valor por defecto que documenta `.env.example`.
   - `.env` figura en `.gitignore`.

5. **El Roadmap solo marca como hecho lo que existe**
   Dado `## Roadmap`, cuando se leen sus ítems, entonces todos tienen la forma `- [x]` o `- [ ]`.
   - Ítems `- [x]`: login con Google; mapa único con foco y N niveles visibles; crear, editar, colapsar y expandir nodos; acciones descubribles (botón "+", panel de atajos "?" y pista inicial); borrar nodos con la opción de borrar el subárbol o subir los hijos al padre. Cada uno tiene respaldo en un test existente o en un módulo citado en `## Structure`.
   - Ítems `- [ ]`:
     - otros tipos de nodo: documentos de Drive, planillas, eventos de calendario, tareas y repositorios o proyectos;
     - integraciones con Calendar, Trello y GitHub;
     - una app móvil que reutilice la API, empezando por una PWA;
     - deploy fuera de local.
   - Ningún ítem de `arquitectura.md` (cortes 2 a 5) ni de las notas "Queda afuera" de las specs aparece como `- [x]`.

6. **Sin cambios de comportamiento**
   Dado el branch después del cambio, cuando se ejecuta `git diff --name-only main`, entonces solo aparecen `LICENSE` y `README.md`. Además, el `test_command` de `.agents/project.yaml` pasa con la misma cobertura que en `main`.

## 4. Riesgos y preguntas abiertas

1. **Los nombres de las secciones chocan con el estándar.** `codigo.md` exige secciones con nombres en español (`## Funcionalidades`, `## Instalación`, `## Uso`, `## Estructura`). La decisión del 2026-10-30 pide el README en inglés. El criterio 2 propone `Features`, `Installation`, `Usage`, `Tests`, `Structure`. Hay que confirmar si con eso alcanza o si se actualiza `codigo.md` para nombrar las secciones en inglés. Esa actualización queda fuera de esta corrida.
2. **Secciones que el estándar no lista.** `## Roadmap` y `## License` no figuran en la lista de secciones de `codigo.md`. Hay que confirmar que se pueden sumar sin cambiar el estándar, y si van al final como propone la spec.
3. **La guía mueve contenido de Uso a Instalación.** `docker compose up --build` hoy está en `## Uso`. La guía lo agrega como último paso de la instalación. Hay que decidir si `## Usage` sigue con el comando y la descripción de los servicios `db`, `api` y `web` (la propuesta) o si queda solo la descripción para no repetir.
4. **Ítems del Roadmap que el pedido no nombra.** El pedido no menciona estas cosas, pero `arquitectura.md` y las specs las listan como pendientes:
   - mover y reordenar nodos arrastrando (corte 2);
   - varios mapas por usuario y mapas compartidos;
   - enlaces entre ramas (`edges`);
   - deshacer un borrado;
   - borrar varios nodos a la vez.

   La spec propone sumar el arrastre como `- [ ]`, porque es lo próximo en `arquitectura.md`, y dejar afuera el resto. Hay que confirmarlo.
5. **Fecha del copyright.** Se usa 2026 tal como lo pide el pedido, aunque el primer commit pueda ser de otro año.
6. **Cuándo actualizar el Roadmap.** Si más adelante se completa un corte, el Roadmap queda desactualizado. Hay que decidir si el paso `docs` de cada corrida tiene que actualizarlo. Hoy `codigo.md` no lo dice.
7. **Riesgo de la traducción.** Al traducir viñetas largas se puede perder algún detalle, como el `422`, el `404`, el `X-CSRF: 1` o el rango de 1 a 200 caracteres. El criterio 2 lo controla con la misma cantidad de viñetas y los mismos comandos, pero la revisión tiene que comparar viñeta por viñeta.

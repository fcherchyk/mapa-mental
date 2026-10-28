---
id: 0003
titulo: Disposición automática en árbol horizontal
status: aceptado
fecha: 2026-10-27
aprobado_por: usuario (gate de arquitectura)
---

## Contexto

Los usuarios crean ideas sin posicionarlas a mano; el mapa es un árbol.

## Decisión

La disposición en árbol horizontal se calcula automáticamente en el cliente sobre la ventana visible.

## Consecuencias

El modelo no guarda posiciones x/y. Mover y reordenar nodos arrastrando queda para el corte 2, usando `sort_key`.

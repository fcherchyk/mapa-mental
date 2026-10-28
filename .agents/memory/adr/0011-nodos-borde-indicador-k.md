---
id: 0011
titulo: Nodos del borde con indicador +k, no expandibles
status: aceptado
fecha: 2026-10-27
aprobado_por: usuario (gate de arquitectura)
---

## Contexto

Hay que mostrar que existe contenido más allá de los N niveles.

## Decisión

Los nodos del nivel N muestran "+k" con la cantidad de hijos directos ocultos y no se expanden en el lugar; para verlos hay que enfocarlos. `collapsed` se guarda por nodo y se respeta dentro de la ventana.

## Consecuencias

Cada nodo de la respuesta trae `child_count`.

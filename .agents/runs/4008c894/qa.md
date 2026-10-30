<!-- claude · claude-sonnet-5-5 · familia anthropic -->

Escribí 27 tests para los 6 criterios de la spec y todos pasan. La suite completa del backend da 143 pasados (116 anteriores más los 27 nuevos), con 98,4 % de cobertura. No corrí los tests del frontend con Vitest. Tampoco cambié código de producción.

Los tests están en `api/tests/test_repo_docs.py` y usan pytest, que ya usa el proyecto. Leen `LICENSE`, `README.md`, `.env.example`, `docker-compose.yml` y `.gitignore`. No usan base de datos.

| Criterio | Test | Resultado |
|---|---|---|
| 1. LICENSE MIT | `test_criterio_1_license_mit_con_copyright_exacto` | ✅ |
| | `test_criterio_1_license_tiene_el_texto_mit_completo` | ✅ |
| 2. README en inglés, misma estructura | `test_criterio_2_encabezados_h2_en_orden` (Features → License) | ✅ |
| | `test_criterio_2_features_mantiene_la_cantidad_de_vinetas` (compara con `main:README.md`) | ✅ |
| | `test_criterio_2_conserva_comandos_rutas_y_endpoints` | ✅ |
| | `test_criterio_2_no_queda_prosa_en_espanol` (ignora código y textos de interfaz entre comillas) | ✅ |
| | `test_criterio_2_seccion_license_referencia_el_archivo` | ✅ |
| 3. Guía de OAuth en orden | `test_criterio_3_guia_tiene_seis_pasos_numerados` | ✅ |
| | `test_criterio_3_paso_1_…`, `paso_2_…`, `paso_3_…`, `paso_4_…`, `paso_5_…`, `paso_6_…` (uno por paso) | ✅ ×6 |
| | `test_criterio_3_volumen_db_data_y_down_v` | ✅ |
| 4. La guía coincide con la configuración real | `test_criterio_4_variables_de_la_guia_existen_en_env_example` | ✅ |
| | `test_criterio_4_comando_de_secreto_coincide_con_env_example` | ✅ |
| | `test_criterio_4_volumen_db_data_en_compose` | ✅ |
| | `test_criterio_4_redirect_uri_coincide_con_env_example` | ✅ |
| | `test_criterio_4_env_esta_en_gitignore` | ✅ |
| | `test_criterio_4_database_url_de_la_guia_coincide_con_env_example` | ✅ |
| 5. Roadmap sin falsos "hecho" | `test_criterio_5_todos_los_items_son_checkbox` | ✅ |
| | `test_criterio_5_items_hechos_son_los_del_mvp` | ✅ |
| | `test_criterio_5_pendientes_cubren_lo_planificado` | ✅ |
| | `test_criterio_5_lo_hecho_tiene_respaldo_en_el_repo` (archivos y módulos en Structure) | ✅ |
| | `test_criterio_5_nada_de_los_cortes_futuros_figura_como_hecho` | ✅ |
| 6. Sin cambios de comportamiento | `test_criterio_6_solo_cambian_license_y_readme` (`git diff --name-only main...HEAD`) y la suite completa sin regresiones | ✅ |

No encontré defectos en `LICENSE` ni en `README.md`.

Hay cuatro puntos sobre cómo quedaron los tests:
- **Criterio 6:** el diff contra `main` incluye también los archivos que el orquestador escribe en `.agents/` (progress, runs, spec). El test los ignora, igual que a sí mismo. Leído al pie de la letra, el criterio 6 ("solo `LICENSE` y `README.md`") no se cumple. Conviene ajustar la spec o dejar la exclusión.
- **Archivo nuevo:** `api/tests/test_repo_docs.py` es un archivo nuevo en el diff, fuera de `LICENSE` y `README.md`.
- **Criterio 5:** "respaldo en un test o módulo" se comprueba por existencia de archivos y por la mención en Structure. No ejecuta los tests de esos módulos.
- **Criterio 2:** la comparación de viñetas depende de que `main` todavía tenga `## Funcionalidades`. Si ya tiene el README traducido, ese test se salta.

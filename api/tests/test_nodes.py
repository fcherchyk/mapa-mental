"""Criterios 8 y 11 a 17: ventana visible, aislamiento y edición de nodos."""

import uuid
from collections.abc import Callable

import pytest
from fastapi.testclient import TestClient

from tests.conftest import CSRF


def root_id(client: TestClient) -> str:
    return client.get("/api/me").json()["root_node_id"]


def add(client: TestClient, parent_id: str, title: str, **extra: object) -> dict:
    response = client.post(
        f"/api/nodes/{parent_id}/children", json={"title": title, **extra}, headers=CSRF
    )
    assert response.status_code == 201, response.text
    return response.json()


def view(client: TestClient, node_id: str, depth: int | None = None) -> dict:
    params = {} if depth is None else {"depth": depth}
    response = client.get(f"/api/nodes/{node_id}/view", params=params)
    assert response.status_code == 200, response.text
    return response.json()


def patch(client: TestClient, node: dict, **changes: object):
    body = {"version": node["version"], **changes}
    return client.patch(f"/api/nodes/{node['id']}", json=body, headers=CSRF)


def children_titles(window: dict, parent_id: str) -> list[str]:
    return [n["title"] for n in window["nodes"] if n["parent_id"] == parent_id]


@pytest.fixture
def tree(client: TestClient) -> dict[str, dict]:
    """raíz › A › F, y bajo F cinco niveles; L2a tiene 4 hijos y una cadena hasta el nivel 5."""
    nodes: dict[str, dict] = {"root": {"id": root_id(client)}}
    nodes["A"] = add(client, nodes["root"]["id"], "A")
    nodes["F"] = add(client, nodes["A"]["id"], "F")
    nodes["L1a"] = add(client, nodes["F"]["id"], "L1a")
    nodes["L1b"] = add(client, nodes["F"]["id"], "L1b")
    nodes["L2a"] = add(client, nodes["L1a"]["id"], "L2a")
    nodes["L2b"] = add(client, nodes["L1a"]["id"], "L2b")
    for name in ("L3a", "L3b", "L3c", "L3d"):
        nodes[name] = add(client, nodes["L2a"]["id"], name)
    nodes["L4"] = add(client, nodes["L3a"]["id"], "L4")
    nodes["L5"] = add(client, nodes["L4"]["id"], "L5")
    return nodes


def test_criterio_11_ventana_trae_foco_ancestros_y_dos_niveles(
    client: TestClient, tree: dict[str, dict]
) -> None:
    window = view(client, tree["F"]["id"], depth=2)

    assert window["focus"]["id"] == tree["F"]["id"]
    assert [a["id"] for a in window["ancestors"]] == [tree["root"]["id"], tree["A"]["id"]]
    by_title = {n["title"]: n for n in window["nodes"]}
    assert set(by_title) == {"L1a", "L1b", "L2a", "L2b"}
    assert {n["level"] for n in window["nodes"]} == {1, 2}
    assert children_titles(window, tree["F"]["id"]) == ["L1a", "L1b"]
    assert children_titles(window, tree["L1a"]["id"]) == ["L2a", "L2b"]


def test_criterio_11_cada_nodo_trae_su_child_count_real(
    client: TestClient, tree: dict[str, dict]
) -> None:
    window = view(client, tree["F"]["id"], depth=2)

    counts = {n["title"]: n["child_count"] for n in window["nodes"]}
    assert counts == {"L1a": 2, "L1b": 0, "L2a": 4, "L2b": 0}
    assert window["focus"]["child_count"] == 2
    assert [a["child_count"] for a in window["ancestors"]] == [1, 1]


def test_criterio_11_nodo_colapsado_oculta_hijos_y_conserva_child_count(
    client: TestClient, tree: dict[str, dict]
) -> None:
    assert patch(client, tree["L1a"], collapsed=True).status_code == 200

    window = view(client, tree["F"]["id"], depth=2)

    assert [n["title"] for n in window["nodes"]] == ["L1a", "L1b"]
    collapsed = window["nodes"][0]
    assert collapsed["collapsed"] is True
    assert collapsed["child_count"] == 2


def test_criterio_11_profundidad_maxima_llega_al_nivel_5(
    client: TestClient, tree: dict[str, dict]
) -> None:
    window = view(client, tree["F"]["id"], depth=10)

    assert max(n["level"] for n in window["nodes"]) == 5
    assert len(window["nodes"]) == 10


def test_criterio_11_raiz_no_tiene_ancestros(client: TestClient) -> None:
    window = view(client, root_id(client))

    assert window["ancestors"] == []
    assert window["focus"]["parent_id"] is None


def test_criterio_12_sin_depth_usa_la_preferencia_del_usuario(
    client: TestClient, tree: dict[str, dict]
) -> None:
    client.patch("/api/me/settings", json={"depth": 1}, headers=CSRF)

    window = view(client, tree["F"]["id"])

    assert [n["title"] for n in window["nodes"]] == ["L1a", "L1b"]


@pytest.mark.parametrize("depth", [0, 11])
def test_criterio_12_depth_fuera_de_rango_responde_422(client: TestClient, depth: int) -> None:
    response = client.get(f"/api/nodes/{root_id(client)}/view", params={"depth": depth})

    assert response.status_code == 422


def test_criterio_13_nodo_ajeno_responde_404_y_no_cambia(
    login: Callable[..., TestClient],
) -> None:
    owner = login(sub="sub-b", name="B")
    x = add(owner, root_id(owner), "X de B")
    before = view(owner, root_id(owner), depth=10)
    intruder = login(sub="sub-a", name="A")

    requests = [
        intruder.get(f"/api/nodes/{x['id']}/view"),
        intruder.post(f"/api/nodes/{x['id']}/children", json={"title": "intruso"}, headers=CSRF),
        patch(intruder, x, title="pisado"),
        intruder.delete(f"/api/nodes/{x['id']}", headers=CSRF),
    ]

    assert [r.status_code for r in requests] == [404, 404, 404, 404]
    assert view(owner, root_id(owner), depth=10) == before


def test_criterio_13_id_inexistente_responde_404(client: TestClient) -> None:
    missing = str(uuid.uuid4())

    requests = [
        client.get(f"/api/nodes/{missing}/view"),
        client.post(f"/api/nodes/{missing}/children", json={"title": "x"}, headers=CSRF),
        client.patch(f"/api/nodes/{missing}", json={"version": 1, "title": "x"}, headers=CSRF),
        client.delete(f"/api/nodes/{missing}", headers=CSRF),
    ]

    assert [r.status_code for r in requests] == [404, 404, 404, 404]


def test_criterio_14_crear_despues_de_un_hermano_lo_inserta_en_orden(client: TestClient) -> None:
    parent = add(client, root_id(client), "P")
    h1 = add(client, parent["id"], "H1")
    add(client, parent["id"], "H2")

    add(client, parent["id"], "N", after_sort_key=h1["sort_key"])

    window = view(client, parent["id"], depth=1)
    assert children_titles(window, parent["id"]) == ["H1", "N", "H2"]


def test_criterio_14_crear_sin_after_sort_key_queda_ultimo(client: TestClient) -> None:
    parent = add(client, root_id(client), "P")
    h1 = add(client, parent["id"], "H1")
    add(client, parent["id"], "H2")
    add(client, parent["id"], "H3", after_sort_key=h1["sort_key"])

    add(client, parent["id"], "Último")

    window = view(client, parent["id"], depth=1)
    assert children_titles(window, parent["id"]) == ["H1", "H3", "H2", "Último"]


def test_criterio_14_nodo_nuevo_trae_valores_iniciales(client: TestClient) -> None:
    node = add(client, root_id(client), "  Idea nueva  ")

    assert node["title"] == "Idea nueva"
    assert node["kind"] == "idea"
    assert node["props"] == {}
    assert node["collapsed"] is False
    assert node["version"] == 1
    assert node["child_count"] == 0


@pytest.mark.parametrize("title", ["", "   ", "x" * 201])
def test_criterio_14_titulo_vacio_o_largo_responde_422(client: TestClient, title: str) -> None:
    root = root_id(client)

    response = client.post(f"/api/nodes/{root}/children", json={"title": title}, headers=CSRF)

    assert response.status_code == 422
    assert view(client, root)["focus"]["child_count"] == 0


def test_criterio_15_patch_con_version_vigente_incrementa_version(client: TestClient) -> None:
    node = add(client, root_id(client), "Antes")

    response = patch(client, node, title="Después")

    assert response.status_code == 200
    assert response.json()["title"] == "Después"
    assert response.json()["version"] == node["version"] + 1


def test_criterio_15_patch_con_version_vieja_responde_409_y_no_cambia(client: TestClient) -> None:
    node = add(client, root_id(client), "Original")
    updated = patch(client, node, title="Primero").json()

    response = patch(client, {**updated, "version": updated["version"] - 1}, title="Pisado")

    assert response.status_code == 409
    child = view(client, root_id(client), depth=1)["nodes"][0]
    assert (child["title"], child["version"]) == ("Primero", updated["version"])


def test_criterio_15_patch_sin_version_responde_422(client: TestClient) -> None:
    node = add(client, root_id(client), "Sin versión")

    response = client.patch(f"/api/nodes/{node['id']}", json={"title": "x"}, headers=CSRF)

    assert response.status_code == 422


def test_criterio_15_patch_sort_key_reordena_y_valida_formato(client: TestClient) -> None:
    parent = add(client, root_id(client), "P")
    first = add(client, parent["id"], "Primero")
    add(client, parent["id"], "Segundo")

    assert patch(client, first, sort_key="z").status_code == 200
    assert patch(client, first, sort_key="a-b").status_code == 422

    window = view(client, parent["id"], depth=1)
    assert children_titles(window, parent["id"]) == ["Segundo", "Primero"]


def test_criterio_16_borrar_elimina_el_subarbol_y_baja_child_count(client: TestClient) -> None:
    root = root_id(client)
    target = add(client, root, "Borrar")
    add(client, root, "Queda")
    level1 = [add(client, target["id"], f"h{i}") for i in range(3)]
    level2 = [add(client, level1[0]["id"], f"n{i}") for i in range(3)]
    add(client, level2[0]["id"], "profundo")
    assert view(client, target["id"], depth=10)["focus"]["child_count"] == 3
    assert len(view(client, target["id"], depth=10)["nodes"]) == 7

    response = client.delete(f"/api/nodes/{target['id']}", headers=CSRF)

    assert response.status_code == 204
    window = view(client, root, depth=10)
    assert window["focus"]["child_count"] == 1
    assert [n["title"] for n in window["nodes"]] == ["Queda"]
    gone = client.get(f"/api/nodes/{level2[0]['id']}/view")
    assert gone.status_code == 404


def test_criterio_16_borrar_la_raiz_responde_422(client: TestClient) -> None:
    root = root_id(client)
    add(client, root, "hijo")

    response = client.delete(f"/api/nodes/{root}", headers=CSRF)

    assert response.status_code == 422
    assert view(client, root)["focus"]["child_count"] == 1


@pytest.mark.parametrize(
    "extra", [{"kind": "document"}, {"props": {"url": "https://x"}}, {"props": "texto"}]
)
def test_criterio_17_post_con_kind_o_props_invalidos_responde_422(
    client: TestClient, extra: dict
) -> None:
    root = root_id(client)

    response = client.post(
        f"/api/nodes/{root}/children", json={"title": "x", **extra}, headers=CSRF
    )

    assert response.status_code == 422
    assert view(client, root)["focus"]["child_count"] == 0


@pytest.mark.parametrize("extra", [{"kind": "document"}, {"props": {"url": "https://x"}}])
def test_criterio_17_patch_con_kind_o_props_invalidos_responde_422(
    client: TestClient, extra: dict
) -> None:
    node = add(client, root_id(client), "Idea")

    response = patch(client, node, title="cambiado", **extra)

    assert response.status_code == 422
    child = view(client, root_id(client), depth=1)["nodes"][0]
    assert (child["title"], child["kind"], child["props"], child["version"]) == (
        "Idea",
        "idea",
        {},
        1,
    )


def test_criterio_17_patch_con_kind_y_props_validos_se_acepta(client: TestClient) -> None:
    node = add(client, root_id(client), "Idea")

    response = patch(client, node, kind="idea", props={})

    assert response.status_code == 200


def test_criterio_8_mutaciones_de_nodos_sin_header_csrf_responden_403(
    client: TestClient,
) -> None:
    root = root_id(client)
    node = add(client, root, "Intacto")
    before = view(client, root, depth=10)

    requests = [
        client.post(f"/api/nodes/{root}/children", json={"title": "nuevo"}),
        client.patch(f"/api/nodes/{node['id']}", json={"version": 1, "title": "cambiado"}),
        client.delete(f"/api/nodes/{node['id']}"),
    ]

    assert [r.status_code for r in requests] == [403, 403, 403]
    assert view(client, root, depth=10) == before

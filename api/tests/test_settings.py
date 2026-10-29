"""Criterio 10: profundidad N como preferencia del usuario."""

from collections.abc import Callable

import pytest
from fastapi.testclient import TestClient

from app.models import User
from app.settings.schemas import DEPTH_DEFAULT
from app.settings.service import read_settings
from tests.conftest import CSRF


def test_criterio_10_patch_depth_se_guarda_y_sigue_en_sesion_nueva(
    login: Callable[..., TestClient],
) -> None:
    client = login(sub="sub-depth")

    response = client.patch("/api/me/settings", json={"depth": 5}, headers=CSRF)

    assert response.status_code == 200
    assert response.json() == {"depth": 5}
    assert client.get("/api/me").json()["settings"]["depth"] == 5
    assert login(sub="sub-depth").get("/api/me").json()["settings"]["depth"] == 5


@pytest.mark.parametrize("depth", [1, 10])
def test_criterio_10_depth_valores_limite_1_y_10_son_validos(
    client: TestClient, depth: int
) -> None:
    response = client.patch("/api/me/settings", json={"depth": depth}, headers=CSRF)

    assert response.status_code == 200
    assert response.json()["depth"] == depth
    assert client.get("/api/me").json()["settings"]["depth"] == depth


@pytest.mark.parametrize("depth", [0, 11, -1, 12, 2.5, "5", None, True])
def test_criterio_10_depth_invalido_responde_422_y_no_cambia(
    client: TestClient, depth: object
) -> None:
    response = client.patch("/api/me/settings", json={"depth": depth}, headers=CSRF)

    assert response.status_code == 422
    assert client.get("/api/me").json()["settings"]["depth"] == DEPTH_DEFAULT


def test_criterio_10_patch_body_invalido_o_extra_forbid_responde_422(client: TestClient) -> None:
    # Campos extra no permitidos (extra="forbid")
    res1 = client.patch("/api/me/settings", json={"depth": 4, "campo_extra": "no"}, headers=CSRF)
    assert res1.status_code == 422

    # Cuerpo vacío
    res2 = client.patch("/api/me/settings", json={}, headers=CSRF)
    assert res2.status_code == 422

    # Valor previo no cambió
    assert client.get("/api/me").json()["settings"]["depth"] == DEPTH_DEFAULT


def test_settings_guardados_invalidos_vuelven_al_valor_por_defecto() -> None:
    assert read_settings(User(settings={"depth": 99})).depth == DEPTH_DEFAULT
    assert read_settings(User(settings={})).depth == DEPTH_DEFAULT

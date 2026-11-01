"""Criterion 10: depth N as a user preference."""

from collections.abc import Callable

import pytest
from fastapi.testclient import TestClient

from app.models import User
from app.settings.schemas import DEPTH_DEFAULT
from app.settings.service import read_settings
from tests.conftest import CSRF


def test_criterion_10_patch_depth_is_saved_and_kept_in_a_new_session(
    login: Callable[..., TestClient],
) -> None:
    client = login(sub="sub-depth")

    response = client.patch("/api/me/settings", json={"depth": 5}, headers=CSRF)

    assert response.status_code == 200
    assert response.json() == {"depth": 5}
    assert client.get("/api/me").json()["settings"]["depth"] == 5
    assert login(sub="sub-depth").get("/api/me").json()["settings"]["depth"] == 5


@pytest.mark.parametrize("depth", [1, 10])
def test_criterion_10_depth_boundary_values_1_and_10_are_valid(
    client: TestClient, depth: int
) -> None:
    response = client.patch("/api/me/settings", json={"depth": depth}, headers=CSRF)

    assert response.status_code == 200
    assert response.json()["depth"] == depth
    assert client.get("/api/me").json()["settings"]["depth"] == depth


@pytest.mark.parametrize("depth", [0, 11, -1, 12, 2.5, "5", None, True])
def test_criterion_10_invalid_depth_returns_422_and_does_not_change(
    client: TestClient, depth: object
) -> None:
    response = client.patch("/api/me/settings", json={"depth": depth}, headers=CSRF)

    assert response.status_code == 422
    assert client.get("/api/me").json()["settings"]["depth"] == DEPTH_DEFAULT


def test_criterion_10_patch_invalid_body_or_forbidden_extra_returns_422(client: TestClient) -> None:
    # Extra fields are not allowed (extra="forbid")
    res1 = client.patch("/api/me/settings", json={"depth": 4, "extra_field": "no"}, headers=CSRF)
    assert res1.status_code == 422

    # Empty body
    res2 = client.patch("/api/me/settings", json={}, headers=CSRF)
    assert res2.status_code == 422

    # The previous value did not change
    assert client.get("/api/me").json()["settings"]["depth"] == DEPTH_DEFAULT


def test_invalid_stored_settings_fall_back_to_the_default_value() -> None:
    assert read_settings(User(settings={"depth": 99})).depth == DEPTH_DEFAULT
    assert read_settings(User(settings={})).depth == DEPTH_DEFAULT

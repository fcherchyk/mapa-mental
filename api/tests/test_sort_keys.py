"""Índices fraccionarios: siempre hay una clave entre dos y nunca termina en 0."""

import random

import pytest

from app.nodes.sort_keys import is_valid_sort_key, key_between


def test_key_between_sin_limites_y_al_final() -> None:
    first = key_between(None, None)
    second = key_between(first, None)

    assert first < second
    assert is_valid_sort_key(first) and is_valid_sort_key(second)


@pytest.mark.parametrize(
    ("lower", "upper"),
    [(None, "1"), ("V", "W"), ("z", None), ("a", "ab"), ("a1", "b"), (None, "01"), ("zz", None)],
)
def test_key_between_queda_estrictamente_en_el_medio(lower: str | None, upper: str | None) -> None:
    key = key_between(lower, upper)

    assert (lower or "") < key
    assert upper is None or key < upper
    assert is_valid_sort_key(key)


def test_key_between_rechaza_limites_invertidos() -> None:
    with pytest.raises(ValueError):
        key_between("b", "a")


def test_inserciones_repetidas_mantienen_el_orden() -> None:
    rng = random.Random(42)
    keys = [key_between(None, None)]
    for _ in range(300):
        position = rng.randrange(len(keys) + 1)
        lower = keys[position - 1] if position > 0 else None
        upper = keys[position] if position < len(keys) else None
        keys.insert(position, key_between(lower, upper))

    assert keys == sorted(keys)
    assert len(set(keys)) == len(keys)
    assert all(is_valid_sort_key(k) for k in keys)

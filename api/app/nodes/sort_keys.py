"""Índices fraccionarios en base 62 para ordenar hermanos sin renumerar.

Una clave es una cadena de dígitos `0-9A-Za-z` que no termina en `0`. Entre dos claves
siempre existe otra, así que insertar entre hermanos solo escribe el nodo nuevo.
"""

import re

DIGITS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
SORT_KEY_PATTERN = r"^[0-9A-Za-z]*[1-9A-Za-z]$"
_SORT_KEY_RE = re.compile(SORT_KEY_PATTERN)


def is_valid_sort_key(key: str) -> bool:
    return bool(_SORT_KEY_RE.match(key))


def key_between(lower: str | None, upper: str | None) -> str:
    """Devuelve una clave estrictamente entre `lower` y `upper` (None = sin límite)."""
    lower = lower or ""
    if upper is not None and lower >= upper:
        raise ValueError(f"{lower!r} no es menor que {upper!r}")
    return _midpoint(lower, upper)


def _midpoint(lower: str, upper: str | None) -> str:
    if upper is not None:
        prefix = _common_prefix_length(lower, upper)
        if prefix > 0:
            return upper[:prefix] + _midpoint(lower[prefix:], upper[prefix:])
    digit_low = DIGITS.index(lower[0]) if lower else 0
    digit_high = DIGITS.index(upper[0]) if upper is not None else len(DIGITS)
    if digit_high - digit_low > 1:
        return DIGITS[(digit_low + digit_high) // 2]
    if upper is not None and len(upper) > 1:
        return upper[0]
    return DIGITS[digit_low] + _midpoint(lower[1:], None)


def _common_prefix_length(lower: str, upper: str) -> int:
    """Largo del prefijo común, tomando `lower` completado con ceros a la derecha."""
    length = 0
    while length < len(upper) and (lower[length] if length < len(lower) else "0") == upper[length]:
        length += 1
    return length

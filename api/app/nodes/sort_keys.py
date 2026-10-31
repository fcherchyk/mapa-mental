"""Base-62 fractional indexes to order siblings without renumbering.

A key is a string of `0-9A-Za-z` digits that does not end in `0`. There is always another
key between any two keys, so inserting between siblings only writes the new node.
"""

import re

DIGITS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
SORT_KEY_PATTERN = r"^[0-9A-Za-z]*[1-9A-Za-z]$"
_SORT_KEY_RE = re.compile(SORT_KEY_PATTERN)


def is_valid_sort_key(key: str) -> bool:
    return bool(_SORT_KEY_RE.match(key))


def key_between(lower: str | None, upper: str | None) -> str:
    """Returns a key strictly between `lower` and `upper` (None = unbounded)."""
    lower = lower or ""
    if upper is not None and lower >= upper:
        raise ValueError(f"{lower!r} is not less than {upper!r}")
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
    """Length of the common prefix, taking `lower` padded with zeros on the right."""
    length = 0
    while length < len(upper) and (lower[length] if length < len(lower) else "0") == upper[length]:
        length += 1
    return length

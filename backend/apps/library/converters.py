"""Signed integers so reserved desktop node id (-1) matches URL paths."""


class SignedIntConverter:
    regex = r"-?[0-9]+"

    def to_python(self, value: str) -> int:
        return int(value)

    def to_url(self, value: int) -> str:
        return str(value)

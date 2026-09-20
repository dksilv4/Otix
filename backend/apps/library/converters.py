"""Signed integers so reserved Otix node ids (desktop -1, backend -2) match URL paths."""


class SignedIntConverter:
    regex = r"-?[0-9]+"

    def to_python(self, value: str) -> int:
        return int(value)

    def to_url(self, value: int) -> str:
        return str(value)

"""Default DRF pagination used across the API.

Configured as ``DEFAULT_PAGINATION_CLASS`` in ``config.settings.base``. Lists
return the standard DRF page envelope; clients page with ``?page=N`` and may
raise the per-page size up to ``max_page_size`` via ``?page_size=M``.
"""

from rest_framework.pagination import PageNumberPagination


class DefaultPagination(PageNumberPagination):
    page_size = 50
    page_size_query_param = "page_size"
    max_page_size = 200
    page_query_param = "page"

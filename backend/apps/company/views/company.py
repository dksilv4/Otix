"""Company API views: detail, follow/unfollow, and rating endpoints.

Authed routes rely on the global ``IsAuthenticated`` default (no explicit
permission_classes); the public GET detail opts out with ``AllowAny`` and treats
``request.user`` as anonymous when no valid token is present. Thin views: all
domain logic lives in ``apps/company/services/``.
"""

from rest_framework import permissions, status
from rest_framework.exceptions import NotFound
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.company import services
from apps.company.models import Company
from apps.company.serializers import CompanyDetailSerializer, CompanyRatingSerializer

COMPANY_NOT_FOUND = "Company not found"


def _get_company_or_404(company_id: str) -> Company:
    """Resolve a company for an authed mutation route or raise DRF's 404.

    The ``detail`` string matches the legacy FastAPI ``HTTPException`` so the
    JSON body is identical (``{"detail": "Company not found"}``).
    """
    company = services.get_company_by_id(company_id)
    if company is None:
        raise NotFound(COMPANY_NOT_FOUND)
    return company


class CompanyDetailView(APIView):
    """Public company detail. Optional auth adds the viewer's state.

    Serves anonymous visitors a 200 (legacy ``get_optional_user``) and, when a
    valid token is present, populates ``is_followed``/``user_rating``.
    """

    permission_classes = (permissions.AllowAny,)

    def get(self, request: Request, company_id: str) -> Response:
        user_id = request.user.id if request.user.is_authenticated else None
        company = services.get_company_detail(company_id, user_id)
        if company is None:
            raise NotFound(COMPANY_NOT_FOUND)
        return Response(CompanyDetailSerializer(company).data)


class CompanyFollowView(APIView):
    """Follow/unfollow a company. Both mutations are idempotent 204s."""

    def post(self, request: Request, company_id: str) -> Response:
        company = _get_company_or_404(company_id)
        services.follow_company(request.user.id, company)
        return Response(status=status.HTTP_204_NO_CONTENT)

    def delete(self, request: Request, company_id: str) -> Response:
        company = _get_company_or_404(company_id)
        services.unfollow_company(request.user.id, company)
        return Response(status=status.HTTP_204_NO_CONTENT)


class CompanyRatingView(APIView):
    """Set/update or remove the authenticated user's rating for a company."""

    def put(self, request: Request, company_id: str) -> Response:
        company = _get_company_or_404(company_id)
        serializer = CompanyRatingSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        services.rate_company(request.user.id, company, serializer.validated_data["score"])
        return Response(status=status.HTTP_204_NO_CONTENT)

    def delete(self, request: Request, company_id: str) -> Response:
        company = _get_company_or_404(company_id)
        services.unrate_company(request.user.id, company)
        return Response(status=status.HTTP_204_NO_CONTENT)

"""Person endpoints: list, search, detail, follow, rating.

Mirrors the accounts golden app: thin ``GenericAPIView``/``APIView`` subclasses
that delegate request/response shape to serializers and any query/mutation logic
to ``apps.people.services``.

Status codes match the legacy FastAPI routers (``backend/otix/api/people/**``):
list/search/detail return 200, follow/unfollow return 200 with a body, and
rating put/delete return 204 No Content.  Unknown ids are a 404 with legacy
detail ``"Person not found"``.
"""

from rest_framework import generics, permissions, status
from rest_framework.exceptions import NotFound, ParseError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.people import services
from apps.people.models import Person
from apps.people.serializers import (
    PersonDetailSerializer,
    PersonFollowResponseSerializer,
    PersonRatingBodySerializer,
    PersonSummarySerializer,
)


def _person_or_404(person_id: int) -> Person:
    try:
        return Person.objects.get(pk=person_id)
    except Person.DoesNotExist:
        raise NotFound("Person not found") from None


class PersonListView(generics.ListAPIView):
    """``GET /person`` — paginated list of people (public)."""

    permission_classes = (permissions.AllowAny,)
    serializer_class = PersonSummarySerializer

    def get_queryset(self):
        return services.list_people()


class PersonSearchView(generics.ListAPIView):
    """``GET /person/search?q=...`` — name search results (public).

    Legacy served this via pgvector; our schema defers embeddings, so search is a
    case-insensitive name-substring match (see ``services.search_people``).
    """

    permission_classes = (permissions.AllowAny,)
    serializer_class = PersonSummarySerializer

    def get_queryset(self):
        query = self.request.query_params.get("q")
        if not query or not query.strip():
            raise ParseError("The q query parameter is required.")
        return services.search_people(query.strip())


class PersonDetailView(generics.RetrieveAPIView):
    """``GET /person/{person_id}`` — public detail.

    When authenticated, ``is_followed``/``user_rating`` reflect the current
    user's state; for anonymous requests both are ``None`` (legacy
    ``get_optional_user`` behaviour).
    """

    permission_classes = (permissions.AllowAny,)
    serializer_class = PersonDetailSerializer

    def get_queryset(self):
        return services.person_detail_queryset()

    def get_object(self) -> Person:
        try:
            person = self.get_queryset().get(pk=self.kwargs["person_id"])
        except Person.DoesNotExist:
            raise NotFound("Person not found") from None
        self._person = person
        return person

    def get_serializer_context(self) -> dict:
        context = super().get_serializer_context()
        person = getattr(self, "_person", None)
        if person is not None:
            user = context["request"].user
            context["person_context"] = services.build_person_context(person.pk, user)
        return context


class PersonFollowView(APIView):
    """``POST``/``DELETE /person/{person_id}/follow`` (authenticated)."""

    def post(self, request, person_id: int) -> Response:
        _person_or_404(person_id)
        follower_count = services.follow_person(request.user, person_id)
        return Response(PersonFollowResponseSerializer(
            {"followed": True, "follower_count": follower_count}
        ).data)

    def delete(self, request, person_id: int) -> Response:
        _person_or_404(person_id)
        follower_count = services.unfollow_person(request.user, person_id)
        return Response(PersonFollowResponseSerializer(
            {"followed": False, "follower_count": follower_count}
        ).data)


class PersonRatingView(APIView):
    """``PUT``/``DELETE /person/{person_id}/rating`` (authenticated)."""

    def put(self, request, person_id: int) -> Response:
        _person_or_404(person_id)
        body = PersonRatingBodySerializer(data=request.data)
        body.is_valid(raise_exception=True)
        services.rate_person(request.user, person_id, body.validated_data["score"])
        return Response(status=status.HTTP_204_NO_CONTENT)

    def delete(self, request, person_id: int) -> Response:
        _person_or_404(person_id)
        services.unrate_person(request.user, person_id)
        return Response(status=status.HTTP_204_NO_CONTENT)

"""Person domain logic as plain callables over the models.

Port of the legacy ``PeopleService`` (``old-backend/otix/services/people_service.py``).
Search is a name-substring stand-in: the legacy endpoint is pgvector/trigram-backed
and our schema defers embeddings, so we match on ``name__icontains`` and order by a
prefix-boost then name/id.

Legacy person rows carried ``tmdb_id``/``imdb_id`` columns; ours live in the generic
``media.ExternalID`` table keyed by content type, so a small helper resolves them.
"""

from __future__ import annotations

from django.contrib.auth.models import AbstractBaseUser, AnonymousUser
from django.contrib.contenttypes.models import ContentType
from django.db.models import Avg, Case, Count, IntegerField, Prefetch, Value, When
from django.db.models.query import QuerySet

from apps.media.models import ExternalID
from apps.people.models import MediaCredit, Person, PersonRating, UserPersonFollow

PersonQuerySet = QuerySet[Person]

_User = AbstractBaseUser | AnonymousUser | None


def list_people() -> PersonQuerySet:
    """All people ordered the way legacy cursor-paged its first page (name, id)."""
    return Person.objects.order_by("name", "id")


def search_people(query: str) -> PersonQuerySet:
    """Name substring search; names starting with the query rank first."""
    prefix_boost = Case(
        When(name__istartswith=query, then=Value(0)),
        default=Value(1),
        output_field=IntegerField(),
    )
    return (
        Person.objects.filter(name__icontains=query)
        .annotate(_prefix_boost=prefix_boost)
        .order_by("_prefix_boost", "name", "id")
    )


def person_detail_queryset() -> PersonQuerySet:
    """A person queryset with credits (+ their media item, poster assets, and for
    shows the nested season/episode tree) prefetched for the detail serializer."""
    return Person.objects.prefetch_related(
        Prefetch(
            "credits",
            queryset=MediaCredit.objects.select_related("media_item").order_by("sort_order", "id"),
        ),
        "credits__media_item__assets",
        "credits__media_item__show__seasons__episodes",
    )


def person_external_ids(person_id: int) -> dict[str, int | str | None]:
    """Resolve the legacy ``tmdb_id``/``imdb_id`` columns from ExternalID rows."""
    content_type = ContentType.objects.get_for_model(Person)
    rows = ExternalID.objects.filter(
        content_type=content_type, object_id=person_id, provider__in=("tmdb", "imdb")
    ).values_list("provider", "external_id")
    result: dict[str, int | str | None] = {"tmdb_id": None, "imdb_id": None}
    for provider, external_id in rows:
        if provider == "tmdb":
            result["tmdb_id"] = int(external_id) if external_id.isdigit() else None
        elif provider == "imdb":
            result["imdb_id"] = external_id
    return result


def build_person_context(person_id: int, user: _User) -> dict:
    """Scalar payload for the detail response: aggregates, external ids and the
    requesting user's follow/rating state (None when unauthenticated).

    Mirrors the one-shot work the legacy service did inside ``get_person``.
    """
    context = person_external_ids(person_id)
    context["follower_count"] = UserPersonFollow.objects.filter(person_id=person_id).count()
    aggregate = PersonRating.objects.filter(person_id=person_id).aggregate(
        avg=Avg("score"), count=Count("id")
    )
    context["avg_rating"] = round(aggregate["avg"], 1) if aggregate["avg"] is not None else None
    context["rating_count"] = aggregate["count"] or 0
    is_followed: bool | None = None
    user_rating: int | None = None
    if user is not None and user.is_authenticated:
        is_followed = UserPersonFollow.objects.filter(user=user, person_id=person_id).exists()
        user_rating = (
            PersonRating.objects.filter(user=user, person_id=person_id)
            .values_list("score", flat=True)
            .first()
        )
    context["is_followed"] = is_followed
    context["user_rating"] = user_rating
    return context


def follow_person(user: AbstractBaseUser, person_id: int) -> int:
    """Record a follow (idempotent) and return the person's new follower count."""
    UserPersonFollow.objects.get_or_create(user=user, person_id=person_id)
    return UserPersonFollow.objects.filter(person_id=person_id).count()


def unfollow_person(user: AbstractBaseUser, person_id: int) -> int:
    """Remove a follow (idempotent) and return the person's new follower count."""
    UserPersonFollow.objects.filter(user=user, person_id=person_id).delete()
    return UserPersonFollow.objects.filter(person_id=person_id).count()


def rate_person(user: AbstractBaseUser, person_id: int, score: int) -> None:
    """Create or update the user's rating of the person."""
    rating, created = PersonRating.objects.get_or_create(
        user=user, person_id=person_id, defaults={"score": score}
    )
    if not created and rating.score != score:
        rating.score = score
        rating.save(update_fields=("score",))


def unrate_person(user: AbstractBaseUser, person_id: int) -> None:
    """Remove the user's rating of the person (idempotent)."""
    PersonRating.objects.filter(user=user, person_id=person_id).delete()

"""Blueprint domain logic as plain callables over the models.

Views stay thin; list/detail response assembly and the create/update/delete/like/
download mutations live here so their semantics are testable without HTTP. The
service mirrors the legacy ``BlueprintService``
(``old-backend/otix/services/blueprint_service.py``) for the routes under
``/api/v1/blueprints``.

Like the ported company/person areas, blueprint ids in the legacy API are
string-shaped; our greenfield rows use integer PKs, so route segments that do not
parse as integers resolve to "not found" -- the same 404 the legacy router
surfaced for an unknown ULID.
"""

from django.contrib.auth.models import AbstractBaseUser
from django.db.models import BooleanField, Count, Exists, OuterRef, Q, Value
from django.db.models.query import QuerySet

from apps.blueprint.models import Blueprint, BlueprintLike

BlueprintQuerySet = QuerySet[Blueprint]


def _parse_id(blueprint_id: str | int) -> int | None:
    """Parse a route segment into an int PK; ``None`` when not numeric."""
    if isinstance(blueprint_id, int):
        return blueprint_id
    try:
        return int(blueprint_id)
    except (TypeError, ValueError):
        return None


def _base_queryset(user_id: int | None) -> BlueprintQuerySet:
    """Blueprints with their author plus likes_count/has_liked state attached.

    ``has_liked`` is viewer-dependent: ``False`` for anonymous callers (legacy
    default), otherwise an ``Exists`` check scoped to the requesting user. The
    author row is ``select_related`` so ``author_name`` never triggers a per-row
    query in serializers.
    """
    queryset = Blueprint.objects.select_related("user").annotate(likes_count=Count("likes"))
    if user_id is None:
        return queryset.annotate(has_liked=Value(False, output_field=BooleanField()))
    liked = BlueprintLike.objects.filter(blueprint=OuterRef("pk"), user_id=user_id)
    return queryset.annotate(has_liked=Exists(liked))


def create_blueprint(
    user: AbstractBaseUser,
    *,
    title: str,
    blueprint_string: str,
    description: str | None = None,
    parsed_data: dict | None = None,
    tags: list[str] | None = None,
) -> Blueprint:
    """Create a blueprint owned by ``user``."""
    return Blueprint.objects.create(
        user=user,
        title=title,
        description=description,
        blueprint_string=blueprint_string,
        parsed_data=parsed_data,
        tags=tags,
    )


def get_blueprint(blueprint_id: str | int, user_id: int | None) -> Blueprint | None:
    """Fetch a single blueprint with viewer state; ``None`` when missing."""
    pk = _parse_id(blueprint_id)
    if pk is None:
        return None
    return _base_queryset(user_id).filter(pk=pk).first()


def get_blueprint_for_mutation(blueprint_id: str | int) -> Blueprint | None:
    """Fetch a blueprint without viewer state (existence checks for like/download)."""
    pk = _parse_id(blueprint_id)
    if pk is None:
        return None
    return Blueprint.objects.filter(pk=pk).first()


def list_blueprints(
    search: str | None,
    sort: str,
    user_id: int | None,
) -> BlueprintQuerySet:
    """List blueprints ordered the way legacy ordered them.

    ``search`` matches title/description substrings; ``sort`` of ``"downloads"``
    orders by downloads then recency, anything else orders by recency (legacy's
    ``created_at`` sort).
    """
    queryset = _base_queryset(user_id)
    if search:
        queryset = queryset.filter(Q(title__icontains=search) | Q(description__icontains=search))
    if sort == "downloads":
        return queryset.order_by("-downloads", "-created_at")
    return queryset.order_by("-created_at")


def update_blueprint(
    blueprint_id: str | int,
    user_id: int,
    fields: dict[str, object],
) -> Blueprint | None:
    """Partially update a blueprint the user owns.

    Mirrors the legacy service: fields whose value is ``None`` are left
    untouched (so an explicit ``null`` cannot clear a column), and only an owner
    can update. Returns ``None`` when the blueprint is missing or not owned.
    """
    pk = _parse_id(blueprint_id)
    if pk is None:
        return None
    blueprint = Blueprint.objects.filter(pk=pk, user_id=user_id).first()
    if blueprint is None:
        return None
    for field in ("title", "description", "blueprint_string", "parsed_data", "tags"):
        value = fields.get(field)
        if value is not None:
            setattr(blueprint, field, value)
    blueprint.save()
    return blueprint


def delete_blueprint(blueprint_id: str | int, user_id: int) -> bool:
    """Delete a blueprint the user owns; ``False`` when missing/not owned."""
    pk = _parse_id(blueprint_id)
    if pk is None:
        return False
    queryset = Blueprint.objects.filter(pk=pk, user_id=user_id)
    if not queryset.exists():
        return False
    queryset.delete()
    return True


def toggle_blueprint_like(user: AbstractBaseUser, blueprint: Blueprint) -> tuple[bool, int]:
    """Toggle the user's like on a blueprint; returns (is_liked, like_count).

    Idempotent by construction: a second like removes the first (legacy toggle),
    so a duplicate ``(user, blueprint)`` row is never created.
    """
    like = BlueprintLike.objects.filter(user=user, blueprint=blueprint).first()
    if like is None:
        BlueprintLike.objects.create(user=user, blueprint=blueprint)
        is_liked = True
    else:
        like.delete()
        is_liked = False
    like_count = BlueprintLike.objects.filter(blueprint=blueprint).count()
    return is_liked, like_count


def increment_blueprint_downloads(blueprint_id: str | int) -> Blueprint | None:
    """Increment a blueprint's download counter; ``None`` when missing."""
    pk = _parse_id(blueprint_id)
    if pk is None:
        return None
    blueprint = Blueprint.objects.filter(pk=pk).first()
    if blueprint is None:
        return None
    blueprint.downloads += 1
    blueprint.save(update_fields=("downloads",))
    return blueprint

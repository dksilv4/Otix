"""Character endpoints: list, search, and detail."""

from __future__ import annotations

from django.contrib.contenttypes.models import ContentType
from django.db.models import Q
from rest_framework import generics, permissions
from rest_framework.exceptions import NotFound
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.media.models import Character, ExternalID, MediaItem
from apps.media.serializers.catalog import CharacterOutSerializer


def _character_or_404(character_id: str) -> Character:
    qs = Character.objects.prefetch_related("assets", "external_ids")
    char = None
    if character_id.isdigit():
        char = qs.filter(pk=int(character_id)).first()
    if char is None:
        char = qs.filter(slug=character_id).first()
    if char is None:
        char_ct = ContentType.objects.get_for_model(Character)
        ext = ExternalID.objects.filter(
            content_type=char_ct, provider="igdb", external_id=character_id
        ).first()
        if ext:
            char = qs.filter(pk=ext.object_id).first()
    if char is None:
        raise NotFound("Character not found")
    return char


class CharacterDetailView(APIView):
    """GET /api/v1/character/<character_id> — character details and cross-game appearances."""

    permission_classes = (permissions.AllowAny,)

    def get(self, request, character_id: str):
        character = _character_or_404(character_id)
        char_data = CharacterOutSerializer(character).data

        from core.providers.wikidata import normalize_character_name

        norm_char_name = normalize_character_name(character.name)
        media_items = (
            MediaItem.objects.filter(characters__character=character)
            .distinct()
            .prefetch_related("assets", "credits__person")
            .order_by("-release_date", "title")
        )

        games = []
        for m in media_items:
            # resolve best poster in memory
            posters = [a for a in m.assets.all() if a.asset_type == "poster"]
            posters.sort(key=lambda a: getattr(a, "score", 0), reverse=True)
            poster_url = posters[0].url if posters else None

            # resolve voice actor in this game in memory
            actor = None
            for c in m.credits.all():
                if (
                    c.role == "cast"
                    and c.character_name
                    and normalize_character_name(c.character_name) == norm_char_name
                    and c.person
                ):
                    actor = {
                        "id": str(c.person.pk),
                        "name": c.person.name,
                        "photo_url": c.person.photo_url,
                    }
                    break

            games.append(
                {
                    "id": str(m.pk),
                    "media_type": m.media_type,
                    "title": m.title,
                    "slug": m.slug,
                    "poster_url": poster_url,
                    "release_date": str(m.release_date) if m.release_date else None,
                    "avg_rating": m.avg_rating,
                    "actor": actor,
                }
            )

        char_data["games"] = games
        return Response(char_data)


class CharacterListView(generics.ListAPIView):
    """GET /api/v1/character/ — list or search characters."""

    permission_classes = (permissions.AllowAny,)
    serializer_class = CharacterOutSerializer

    def get_queryset(self):
        qs = Character.objects.all()
        q = self.request.query_params.get("q") or self.request.query_params.get("search")
        if q and q.strip():
            qs = qs.filter(Q(name__icontains=q.strip()) | Q(slug__icontains=q.strip()))
        return qs.order_by("name")[:50]

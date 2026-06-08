# TODO: Review this file
from __future__ import annotations

from dataclasses import dataclass, field

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from otix.domain.user import User


@dataclass
class PreferenceProfile:
    preferred_media_types: list[str] = field(default_factory=lambda: ["movie", "show", "game", "music"])
    preferred_genres: list[str] = field(default_factory=list)
    preferred_languages: list[str] = field(default_factory=list)
    genre_affinity: dict[str, list[tuple[str, int]]] = field(default_factory=dict)
    discover_emphases: list[str] = field(default_factory=list)


_GENRE_LABELS: dict[str, str] = {
    "action": "Action",
    "adventure": "Adventure",
    "animation": "Animated",
    "comedy": "Comedy",
    "crime": "Crime",
    "documentary": "Documentary",
    "drama": "Drama",
    "family": "Family",
    "fantasy": "Fantasy",
    "history": "History",
    "horror": "Horror",
    "mystery": "Mystery",
    "romance": "Romance",
    "science-fiction": "Sci-Fi",
    "sci-fi": "Sci-Fi",
    "thriller": "Thriller",
    "war": "War",
    "western": "Western",
    "rpg": "RPG",
    "shooter": "Shooter",
    "strategy": "Strategy",
    "simulation": "Simulation",
    "sports": "Sports",
    "racing": "Racing",
    "puzzle": "Puzzle",
    "indie": "Indie",
    "fighting": "Fighting",
    "pop": "Pop",
    "rock": "Rock",
    "hip-hop": "Hip-Hop",
    "rap": "Rap",
    "r-b": "R&B",
    "electronic": "Electronic",
    "jazz": "Jazz",
    "classical": "Classical",
    "country": "Country",
    "metal": "Metal",
    "punk": "Punk",
    "folk": "Folk",
    "blues": "Blues",
    "reggae": "Reggae",
    "latin": "Latin",
    "k-pop": "K-Pop",
    "j-pop": "J-Pop",
    "soundtrack": "Soundtrack",
    "alternative": "Alternative",
    "soul": "Soul",
    "funk": "Funk",
}

_LANGUAGE_LABELS: dict[str, str] = {
    "ja": "Japanese",
    "ko": "Korean",
    "zh": "Chinese",
    "pt-PT": "Portuguese",
    "pt-BR": "Brazilian",
    "es": "Spanish",
    "fr": "French",
    "de": "German",
    "it": "Italian",
    "hi": "Hindi",
    "ar": "Arabic",
    "ru": "Russian",
    "th": "Thai",
    "tr": "Turkish",
    "pl": "Polish",
    "nl": "Dutch",
    "sv": "Swedish",
    "no": "Norwegian",
    "da": "Danish",
    "fi": "Finnish",
    "en": "English",
}

_MEDIA_LABELS: dict[str, str] = {
    "movie": "Movies",
    "show": "Shows",
    "game": "Games",
    "music": "Music",
}


@dataclass
class CombinedSignal:
    signal_id: str
    display_name: str
    match_genres: tuple[str, ...]
    match_languages: tuple[str, ...]
    media_types: tuple[str, ...]
    list_type: str
    reason: str
    use_is_anime: bool = False
    exclude_is_anime: bool = False
    skip_language_filter: bool = False


_COMBINED_SIGNALS: list[CombinedSignal] = [
    CombinedSignal(
        "anime",
        "Anime",
        ("animation",),
        ("ja",),
        ("movie", "show"),
        "trending",
        "Because you enjoy Japanese animation",
        use_is_anime=True,
        skip_language_filter=True,
    ),
    CombinedSignal(
        "k_drama",
        "K-Dramas",
        ("drama",),
        ("ko",),
        ("show",),
        "trending",
        "Because you enjoy Korean dramas",
    ),
    CombinedSignal(
        "k_pop",
        "K-Pop",
        ("pop", "k-pop"),
        ("ko",),
        ("music",),
        "trending",
        "Because you enjoy K-Pop",
    ),
    CombinedSignal(
        "j_pop",
        "J-Pop",
        ("pop", "j-pop"),
        ("ja",),
        ("music",),
        "trending",
        "Because you enjoy J-Pop",
    ),
    CombinedSignal(
        "j_drama",
        "Japanese Dramas",
        ("drama",),
        ("ja",),
        ("show",),
        "trending",
        "Because you enjoy Japanese dramas",
        exclude_is_anime=True,
    ),
    CombinedSignal(
        "c_drama",
        "Chinese Dramas",
        ("drama",),
        ("zh",),
        ("show",),
        "trending",
        "Because you enjoy Chinese dramas",
    ),
    CombinedSignal(
        "latin_music",
        "Latin Music",
        ("pop", "latin", "reggae"),
        ("es", "pt-PT", "pt-BR"),
        ("music",),
        "trending",
        "Because you enjoy Latin music",
    ),
    CombinedSignal(
        "bollywood",
        "Bollywood",
        ("drama", "romance", "action"),
        ("hi",),
        ("movie",),
        "trending",
        "Because you enjoy Hindi cinema",
    ),
]

_EMPHASIS_GENRE_BREAKDOWN: dict[str, list[tuple[str, str]]] = {
    "anime": [
        ("action", "Action"),
        ("fantasy", "Fantasy"),
        ("romance", "Romance"),
        ("sci-fi", "Sci-Fi"),
        ("thriller", "Thriller"),
        ("comedy", "Comedy"),
    ],
    "k_drama": [
        ("thriller", "Thriller"),
        ("romance", "Romantic"),
        ("action", "Action"),
        ("comedy", "Comedy"),
        ("fantasy", "Fantasy"),
        ("mystery", "Mystery"),
    ],
    "k_pop": [
        ("pop", "Pop"),
        ("k-pop", "K-Pop"),
        ("electronic", "Electronic"),
        ("hip-hop", "Hip-Hop"),
        ("r-b", "R&B"),
        ("rock", "Rock"),
    ],
    "j_pop": [
        ("pop", "Pop"),
        ("j-pop", "J-Pop"),
        ("electronic", "Electronic"),
        ("rock", "Rock"),
        ("jazz", "Jazz"),
    ],
    "j_drama": [
        ("thriller", "Thriller"),
        ("romance", "Romantic"),
        ("comedy", "Comedy"),
        ("action", "Action"),
        ("fantasy", "Fantasy"),
    ],
    "c_drama": [
        ("romance", "Romantic"),
        ("action", "Action"),
        ("fantasy", "Fantasy"),
        ("comedy", "Comedy"),
        ("mystery", "Mystery"),
    ],
    "latin_music": [
        ("pop", "Pop"),
        ("latin", "Latin"),
        ("reggae", "Reggae"),
        ("hip-hop", "Hip-Hop"),
        ("r-b", "R&B"),
        ("electronic", "Electronic"),
    ],
    "bollywood": [
        ("action", "Action"),
        ("romance", "Romantic"),
        ("comedy", "Comedy"),
        ("drama", "Drama"),
        ("thriller", "Thriller"),
    ],
}

_GENRE_MEDIA_TYPE_HINTS: dict[str, list[str]] = {
    "action": ["movie", "game"],
    "adventure": ["game", "movie"],
    "animation": ["movie", "show"],
    "comedy": ["movie", "show"],
    "crime": ["show", "movie"],
    "documentary": ["movie", "show"],
    "drama": ["show", "movie"],
    "family": ["movie", "show"],
    "fantasy": ["movie", "game"],
    "history": ["movie", "show"],
    "horror": ["movie", "game"],
    "mystery": ["show", "movie"],
    "romance": ["movie", "show"],
    "science-fiction": ["movie", "game"],
    "sci-fi": ["movie", "game"],
    "thriller": ["movie", "show"],
    "war": ["movie", "game"],
    "western": ["movie", "game"],
    "rpg": ["game"],
    "shooter": ["game"],
    "strategy": ["game"],
    "simulation": ["game"],
    "sports": ["game"],
    "racing": ["game"],
    "puzzle": ["game"],
    "indie": ["game"],
    "fighting": ["game"],
    "pop": ["music"],
    "rock": ["music"],
    "hip-hop": ["music"],
    "rap": ["music"],
    "r-b": ["music"],
    "jazz": ["music"],
    "electronic": ["music"],
    "classical": ["music"],
    "country": ["music"],
    "metal": ["music"],
    "punk": ["music"],
    "folk": ["music"],
    "blues": ["music"],
    "latin": ["music"],
    "k-pop": ["music"],
    "j-pop": ["music"],
    "reggae": ["music"],
    "soundtrack": ["music"],
    "alternative": ["music"],
    "soul": ["music"],
    "funk": ["music"],
}


def _genre_label(slug: str) -> str:
    return _GENRE_LABELS.get(slug, slug.replace("-", " ").title())


def _language_label(code: str) -> str:
    return _LANGUAGE_LABELS.get(code, code.upper())


def _media_label(media_type: str) -> str:
    return _MEDIA_LABELS.get(media_type, media_type)


def _jaccard(a: set, b: set) -> float:
    if not a and not b:
        return 0.0
    return len(a & b) / len(a | b)


class PersonalizationService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def compute_profile(self, user: User) -> PreferenceProfile:
        media_types = user.preferred_media_types or ["movie", "show", "game", "music"]
        genres = user.preferred_genres or []
        languages = user.preferred_languages or []

        interaction_affinity = await self._compute_genre_affinity(user.id)
        integration_affinity = await self._compute_integration_genre_affinity(user)

        genre_affinity = self._merge_affinities(
            interaction_affinity,
            integration_affinity,
            interaction_weight=0.7,
            integration_weight=0.3,
        )

        return PreferenceProfile(
            preferred_media_types=media_types,
            preferred_genres=genres,
            preferred_languages=languages,
            genre_affinity=genre_affinity,
            discover_emphases=user.discover_emphases or [],
        )

    async def _compute_genre_affinity(self, user_id: str) -> dict[str, list[tuple[str, int]]]:
        query = text("""
            SELECT mi.media_type, g.slug,
                   SUM(CASE
                       WHEN umi.interaction_type IN ('watched', 'played', 'listened') THEN 2
                       ELSE 1
                   END) as score
            FROM user_media_interactions umi
            JOIN media_items mi ON mi.id = umi.media_item_id
            JOIN media_genres mg ON mg.media_item_id = mi.id
            JOIN genres g ON g.id = mg.genre_id
            WHERE umi.user_id = :user_id
              AND umi.created_at >= NOW() - INTERVAL '90 days'
            GROUP BY mi.media_type, g.slug
            ORDER BY mi.media_type, score DESC
        """)
        result = await self.session.execute(query, {"user_id": user_id})
        rows = result.fetchall()

        affinity: dict[str, list[tuple[str, int]]] = {}
        for row in rows:
            media_type = row[0]
            slug = row[1]
            score = row[2]
            if media_type not in affinity:
                affinity[media_type] = []
            affinity[media_type].append((slug, score))

        for mt in affinity:
            affinity[mt] = affinity[mt][:5]

        return affinity

    def _genre_media_types(self, genre_slug: str, affinity: dict[str, list[tuple[str, int]]]) -> list[str]:
        """Return media types that have affinity for this genre, ordered by score."""
        scored: list[tuple[str, int]] = []
        for mt, genres in affinity.items():
            for g, score in genres:
                if g == genre_slug:
                    scored.append((mt, score))
        scored.sort(key=lambda x: x[1], reverse=True)
        return [mt for mt, _ in scored]

    @staticmethod
    def _guess_media_types_for_genre(genre_slug: str) -> list[str]:
        return _GENRE_MEDIA_TYPE_HINTS.get(genre_slug, ["movie"])

    @staticmethod
    def _score_sub_genres_by_affinity(
        breakdown: list[tuple[str, str]],
        signal: CombinedSignal,
        affinity: dict[str, list[tuple[str, int]]],
    ) -> list[tuple[str, str]]:
        """Sort sub-genres by user affinity within the signal's media types.

        Genres the user has interacted with more appear first.
        Genres with no interaction data preserve their original order.
        """
        genre_scores: dict[str, int] = {}
        for mt in signal.media_types:
            if mt in affinity:
                for g_slug, score in affinity[mt]:
                    if g_slug not in genre_scores or score > genre_scores[g_slug]:
                        genre_scores[g_slug] = score

        return sorted(breakdown, key=lambda item: genre_scores.get(item[0], 0), reverse=True)

    @staticmethod
    def _merge_affinities(
        primary: dict[str, list[tuple[str, int]]],
        secondary: dict[str, list[tuple[str, int]]],
        interaction_weight: float = 0.7,
        integration_weight: float = 0.3,
    ) -> dict[str, list[tuple[str, int]]]:
        merged: dict[str, dict[str, float]] = {}
        for mt, items in primary.items():
            merged.setdefault(mt, {})
            for slug, score in items:
                merged[mt][slug] = score * interaction_weight
        for mt, items in secondary.items():
            merged.setdefault(mt, {})
            for slug, score in items:
                existing = merged[mt].get(slug, 0)
                merged[mt][slug] = max(existing, score * integration_weight)
        result: dict[str, list[tuple[str, int]]] = {}
        for mt, genres in merged.items():
            sorted_genres = sorted(genres.items(), key=lambda x: x[1], reverse=True)[:5]
            result[mt] = [(slug, int(score)) for slug, score in sorted_genres]
        return result

    async def _compute_integration_genre_affinity(
        self,
        user: User,
    ) -> dict[str, list[tuple[str, int]]]:
        affinity: dict[str, dict[str, float]] = {}

        # Steam: mine genres from user's Steam library weighted by playtime
        if user.steam_id:
            steam_query = text("""
                SELECT g.slug, SUM(COALESCE(usg.playtime_forever, 1)) as score
                FROM user_steam_games usg
                JOIN media_items mi ON mi.id = usg.media_item_id
                JOIN media_genres mg ON mg.media_item_id = mi.id
                JOIN genres g ON g.id = mg.genre_id
                WHERE usg.user_id = :user_id
                  AND usg.media_item_id IS NOT NULL
                  AND usg.playtime_forever > 0
                GROUP BY g.slug
                ORDER BY score DESC
                LIMIT 20
            """)
            result = await self.session.execute(steam_query, {"user_id": user.id})
            for row in result.fetchall():
                affinity.setdefault("game", {})[row[0]] = affinity.setdefault("game", {}).get(row[0], 0) + row[1]

        # Plex: mine genres from Plex watch history weighted by view count
        if user.plex_id:
            plex_query = text("""
                SELECT g.slug, SUM(COALESCE(upi.view_count, 1)) as score
                FROM user_plex_items upi
                JOIN media_items mi ON mi.id = upi.media_item_id
                JOIN media_genres mg ON mg.media_item_id = mi.id
                JOIN genres g ON g.id = mg.genre_id
                WHERE upi.user_id = :user_id
                  AND upi.media_item_id IS NOT NULL
                  AND upi.viewed = true
                GROUP BY g.slug
                ORDER BY score DESC
                LIMIT 20
            """)
            result = await self.session.execute(plex_query, {"user_id": user.id})
            for row in result.fetchall():
                for mt in ("movie", "show"):
                    affinity.setdefault(mt, {})[row[0]] = affinity.setdefault(mt, {}).get(row[0], 0) + row[1]

        # Convert to sorted list-of-tuples format
        result: dict[str, list[tuple[str, int]]] = {}
        for mt, genres in affinity.items():
            sorted_genres = sorted(genres.items(), key=lambda x: x[1], reverse=True)[:10]
            result[mt] = [(slug, int(score)) for slug, score in sorted_genres]
        return result

    async def _find_similar_users(self, user: User, limit: int = 10) -> list[tuple[str, float]]:
        """Find users with similar preferences using Jaccard similarity.

        Composite score: 0.3 * media_type_jaccard + 0.4 * genre_jaccard + 0.3 * language_jaccard
        """
        my_types = set(user.preferred_media_types or ["movie", "show", "game", "music"])
        my_genres = set(user.preferred_genres or [])
        my_langs = set(user.preferred_languages or [])

        from sqlalchemy import String, cast, select
        from sqlalchemy.dialects.postgresql import ARRAY

        from otix.domain.user import User as UserModel

        query = select(
            UserModel.id,
            UserModel.preferred_media_types,
            UserModel.preferred_genres,
            UserModel.preferred_languages,
        ).where(UserModel.id != user.id)

        # Pre-filter: only consider users who share at least one preferred genre or media type
        if my_genres:
            query = query.where(UserModel.preferred_genres.op("?|")(cast(list(my_genres), ARRAY(String))))
        elif my_types:
            query = query.where(UserModel.preferred_media_types.op("?|")(cast(list(my_types), ARRAY(String))))

        # Safety cap: never load more than 2000 users into memory
        query = query.limit(2000)

        result = await self.session.execute(query)
        rows = result.fetchall()

        scored: list[tuple[str, float]] = []
        for row in rows:
            other_id = row[0]
            other_types = set(row[1] or ["movie", "show", "game", "music"])
            other_genres = set(row[2] or [])
            other_langs = set(row[3] or [])

            type_sim = _jaccard(my_types, other_types)
            genre_sim = _jaccard(my_genres, other_genres)
            lang_sim = _jaccard(my_langs, other_langs)

            composite = 0.3 * type_sim + 0.4 * genre_sim + 0.3 * lang_sim
            if composite > 0:
                scored.append((other_id, composite))

        scored.sort(key=lambda x: x[1], reverse=True)
        return scored[:limit]

    async def _get_collaborative_items(
        self,
        user_id: str,
        similar_users: list[tuple[str, float]],
        media_type: str,
        limit: int = 20,
    ) -> list[str]:
        """Get media IDs that similar users interacted with, excluding items the current user already knows."""
        if not similar_users:
            return []

        similar_ids = [uid for uid, _ in similar_users]
        query = text("""
            SELECT DISTINCT umi.media_item_id
            FROM user_media_interactions umi
            JOIN media_items mi ON mi.id = umi.media_item_id
            WHERE umi.user_id = ANY(:similar_ids)
              AND mi.media_type = :media_type
              AND umi.interaction_type IN ('liked', 'watched', 'played', 'listened', 'rated')
              AND umi.media_item_id NOT IN (
                  SELECT media_item_id FROM user_media_interactions WHERE user_id = :user_id
              )
            LIMIT :limit
        """)
        result = await self.session.execute(
            query,
            {
                "similar_ids": similar_ids,
                "media_type": media_type,
                "user_id": user_id,
                "limit": limit,
            },
        )
        return [row[0] for row in result.fetchall()]

    async def get_semantic_recommendations(
        self,
        user_id: str,
        media_type: str,
        limit: int = 20,
        exclude_adult: bool = True,
        exclude_media_id: str | None = None,
    ) -> list[str]:
        """Get items near the centroid of the user's top-rated content embeddings.

        Picks up to 10 highly-rated items, computes their embedding centroid,
        then finds nearest neighbors the user hasn't seen.
        """

        seed_query = text("""
            SELECT mi.embedding::text
            FROM user_media_interactions umi
            JOIN media_items mi ON mi.id = umi.media_item_id
            WHERE umi.user_id = :user_id
              AND mi.media_type = :media_type
              AND mi.embedding IS NOT NULL
              AND umi.interaction_type IN ('liked', 'rated', 'watched', 'played', 'listened')
            ORDER BY umi.created_at DESC
            LIMIT 10
        """)
        result = await self.session.execute(
            seed_query,
            {
                "user_id": user_id,
                "media_type": media_type,
            },
        )
        embeddings = []
        for row in result.fetchall():
            raw = row[0]
            if isinstance(raw, str):
                embeddings.append([float(x) for x in raw.strip("[]").split(",")])
            elif isinstance(raw, list):
                embeddings.append(list(raw))

        if not embeddings:
            return []

        # Compute centroid
        dim = len(embeddings[0])
        centroid = [sum(e[i] for e in embeddings) / len(embeddings) for i in range(dim)]

        # Find nearest neighbors the user hasn't interacted with.
        # pgvector accepts a text-format vector literal: '[0.1, 0.2, ...]'
        centroid_str = "[" + ",".join(f"{x:.6f}" for x in centroid) + "]"

        adult_filter = "AND mi.is_adult = FALSE" if exclude_adult else ""
        exclude_filter = "AND mi.id != :exclude_media_id" if exclude_media_id else ""

        knn_query = text(f"""
            SELECT mi.id
            FROM media_items mi
            WHERE mi.media_type = :media_type
              AND mi.embedding IS NOT NULL
              {adult_filter}
              {exclude_filter}
              AND mi.id NOT IN (
                  SELECT media_item_id FROM user_media_interactions WHERE user_id = :user_id
              )
            ORDER BY mi.embedding <=> :centroid::vector
            LIMIT :limit
        """)
        params: dict = {
            "media_type": media_type,
            "user_id": user_id,
            "centroid": centroid_str,
            "limit": limit * 3,
        }
        if exclude_media_id:
            params["exclude_media_id"] = exclude_media_id

        result = await self.session.execute(knn_query, params)
        return [row[0] for row in result.fetchall()]

    def generate_sections(self, profile: PreferenceProfile, user: User | None = None) -> list:
        from otix.schemas.discover import PersonalizedSection

        emphases = profile.discover_emphases
        MAX_SECTIONS = 12 if emphases else 8
        EMPHASIS_PER_SIGNAL = 3
        MAX_EMPHASIS_SECTIONS = 6

        sections: list[PersonalizedSection] = []
        covered: set[str] = set()

        prefs = profile
        user_genres = set(prefs.preferred_genres)
        user_langs = set(prefs.preferred_languages)
        user_types = prefs.preferred_media_types
        affinity = prefs.genre_affinity

        def _cover(mt: str, genre: str | None = None, lang: str | None = None) -> str:
            key = f"{mt}:{genre or ''}:{lang or ''}"
            covered.add(key)
            return key

        def _is_covered(mt: str, genre: str | None = None, lang: str | None = None) -> bool:
            return f"{mt}:{genre or ''}:{lang or ''}" in covered

        if emphases:
            # ── Tier 1B: Emphasis sub-genre sections ──
            signals_by_id = {sig.signal_id: sig for sig in _COMBINED_SIGNALS}
            emphasis_added = 0

            for signal_id in emphases:
                if emphasis_added >= MAX_EMPHASIS_SECTIONS:
                    break
                sig = signals_by_id.get(signal_id)
                if sig is None:
                    continue

                breakdown = _EMPHASIS_GENRE_BREAKDOWN.get(signal_id, [])
                if not breakdown:
                    continue

                scored = self._score_sub_genres_by_affinity(breakdown, sig, affinity)

                target_mt = next((mt for mt in sig.media_types if mt in user_types), None)
                if target_mt is None:
                    continue

                sub_count = 0
                for genre_slug, adjective_label in scored:
                    if emphasis_added >= MAX_EMPHASIS_SECTIONS:
                        break
                    if sub_count >= EMPHASIS_PER_SIGNAL:
                        break

                    key = f"{target_mt}:{genre_slug}:{signal_id}"
                    if key in covered:
                        continue
                    covered.add(key)

                    sections.append(
                        PersonalizedSection(
                            id=f"{target_mt}_emphasis_{signal_id}_{genre_slug}",
                            title=f"{adjective_label} {sig.display_name}",
                            media_type=target_mt,
                            list_type=sig.list_type,
                            genre=genre_slug,
                            language=None if sig.skip_language_filter else next(iter(sig.match_languages), None),
                            is_anime=True if sig.use_is_anime else (False if sig.exclude_is_anime else None),
                            is_personalized=True,
                            reason=f"Because you emphasized {sig.display_name.lower()}",
                        )
                    )
                    sub_count += 1
                    emphasis_added += 1
        else:
            # ── Tier 1: Combined signals (genre + language) ──
            for sig in _COMBINED_SIGNALS:
                if len(sections) >= MAX_SECTIONS - 2:
                    break
                if not (set(sig.match_genres) & user_genres):
                    continue
                if not (set(sig.match_languages) & user_langs):
                    continue
                matched_genre = next(g for g in sig.match_genres if g in user_genres)
                matched_lang = next(l for l in sig.match_languages if l in user_langs)
                for mt in sig.media_types:
                    if mt not in user_types:
                        continue
                    if len(sections) >= MAX_SECTIONS - 2:
                        break
                    if _is_covered(mt, genre=matched_genre, lang=matched_lang):
                        continue
                    _cover(mt, genre=matched_genre, lang=matched_lang)
                    sections.append(
                        PersonalizedSection(
                            id=f"{mt}_combined_{sig.signal_id}",
                            title=sig.display_name,
                            media_type=mt,
                            list_type=sig.list_type,
                            genre=matched_genre,
                            language=None if sig.skip_language_filter else matched_lang,
                            is_anime=True if sig.use_is_anime else (False if sig.exclude_is_anime else None),
                            is_personalized=True,
                            reason=sig.reason,
                        )
                    )

            # ── Tier 2: Genre affinity (top genres from interaction/integration data) ──
            genre_sections_added = 0
            for genre_slug in user_genres:
                if genre_sections_added >= 2 or len(sections) >= MAX_SECTIONS - 1:
                    break
                media_types = self._genre_media_types(genre_slug, affinity)
                if not media_types:
                    media_types = self._guess_media_types_for_genre(genre_slug)
                for mt in media_types:
                    if mt not in user_types:
                        continue
                    if genre_sections_added >= 2:
                        break
                    if _is_covered(mt, genre=genre_slug):
                        continue
                    _cover(mt, genre=genre_slug)
                    label = _genre_label(genre_slug)
                    media_label = _media_label(mt)
                    sections.append(
                        PersonalizedSection(
                            id=f"{mt}_{genre_slug}_affinity",
                            title=f"Trending {label} {media_label}",
                            media_type=mt,
                            list_type="trending",
                            genre=genre_slug,
                            is_personalized=True,
                            reason=f"Because you like {label.lower()}",
                        )
                    )
                    genre_sections_added += 1
                    break

        # ── Tier 3: Language-only (for languages not already in a combined signal) ──
        lang_added = 0
        for lang in user_langs:
            if lang_added >= 1 or len(sections) >= MAX_SECTIONS - 1:
                break
            if any(
                set(sig.match_languages) & {lang} and set(sig.match_genres) & user_genres for sig in _COMBINED_SIGNALS
            ):
                continue  # already covered by a combined signal
            for mt in user_types:
                if mt == "game":
                    continue
                if lang_added >= 1:
                    break
                if _is_covered(mt, lang=lang):
                    continue
                _cover(mt, lang=lang)
                label = _language_label(lang)
                media_label = _media_label(mt)
                sections.append(
                    PersonalizedSection(
                        id=f"{mt}_{lang}_lang",
                        title=f"{label} {media_label}",
                        media_type=mt,
                        list_type="trending",
                        genre=None,
                        language=lang,
                        is_personalized=True,
                        reason=f"Because you enjoy {label.lower()} content",
                    )
                )
                lang_added += 1
                break

        # ── Tier 4: Integration-aware sections ──
        if user:
            integration_added = 0
            if user.steam_id and "game" in user_types:
                if integration_added < 2 and len(sections) < MAX_SECTIONS:
                    if not _is_covered("game", lang="_integration"):
                        _cover("game", lang="_integration")
                        sections.append(
                            PersonalizedSection(
                                id="game_steam_library",
                                title="From Your Steam Library",
                                media_type="game",
                                list_type="integration_steam",
                                is_personalized=True,
                                reason="Based on game you play on Steam",
                            )
                        )
                        integration_added += 1
            if user.plex_id:
                for mt in ("movie", "show"):
                    if mt not in user_types:
                        continue
                    if integration_added >= 2 or len(sections) >= MAX_SECTIONS:
                        break
                    if _is_covered(mt, lang="_integration"):
                        continue
                    _cover(mt, lang="_integration")
                    media_label = _media_label(mt)
                    sections.append(
                        PersonalizedSection(
                            id=f"{mt}_plex_library",
                            title="From Your Plex Library",
                            media_type=mt,
                            list_type="integration_plex",
                            is_personalized=True,
                            reason=f"Inspired by {media_label.lower()} in your Plex library",
                        )
                    )
                    integration_added += 1

        # ── Tier 5: Collaborative (1 section) ──
        for mt in user_types:
            if len(sections) >= MAX_SECTIONS:
                break
            if _is_covered(mt, lang="_collab"):
                continue
            _cover(mt, lang="_collab")
            media_label = _media_label(mt)
            sections.append(
                PersonalizedSection(
                    id=f"{mt}_collaborative",
                    title=f"Because You Like {media_label}",
                    media_type=mt,
                    list_type="collaborative",
                    is_personalized=True,
                    reason="Users with similar taste enjoyed these",
                )
            )
            break  # Only one collaborative section

        # ── Tier 6: Generic fallbacks for uncovered media types ──
        for media_type in user_types:
            if len(sections) >= MAX_SECTIONS:
                break
            if any(s.media_type == media_type and s.is_personalized for s in sections):
                continue
            media_label = _media_label(media_type)
            sections.append(
                PersonalizedSection(
                    id=f"{media_type}_trending",
                    title=f"Trending {media_label}",
                    media_type=media_type,
                    list_type="trending",
                )
            )

        return sections

    @staticmethod
    def default_sections() -> list:
        from otix.schemas.discover import PersonalizedSection

        return [
            PersonalizedSection(
                id="trending_movies", title="Trending Movies", media_type="movie", list_type="trending"
            ),
            PersonalizedSection(id="trending_shows", title="Trending Shows", media_type="show", list_type="trending"),
            PersonalizedSection(id="popular_games", title="Popular Games", media_type="game", list_type="popular"),
            PersonalizedSection(id="new_music", title="New Music", media_type="music", list_type="popular"),
        ]

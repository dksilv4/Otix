"""Plex Connect Info Resolution Pipeline.

Modular sub-pipeline functions for catalog item resolution, Plex library matching,
playable item extraction, and streaming metadata hydration.
"""

from __future__ import annotations

import logging
import urllib.parse
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from apps.integrations.models import UserPlexItem, UserPlexServer
    from apps.media.models import MediaItem

logger = logging.getLogger(__name__)


def resolve_target_media_item(
    ident: str,
    tmdb_id: str | int | None = None,
    imdb_id: str | None = None,
    tvdb_id: str | None = None,
) -> MediaItem | None:
    """Resolve a MediaItem instance from an ID, slug, or external IDs."""
    from apps.media.models import ExternalID, MediaItem

    target_media_item: MediaItem | None = None

    if ident.isdigit():
        target_media_item = MediaItem.objects.filter(id=int(ident)).first()

    if target_media_item is None:
        target_media_item = MediaItem.objects.filter(slug=ident).first()

    if target_media_item is None and (tmdb_id or imdb_id or tvdb_id):
        ext_obj = None
        if tmdb_id:
            ext_obj = ExternalID.objects.filter(provider="tmdb", external_id=str(tmdb_id)).first()
        if ext_obj is None and imdb_id:
            ext_obj = ExternalID.objects.filter(provider="imdb", external_id=str(imdb_id)).first()
        if ext_obj is None and tvdb_id:
            ext_obj = ExternalID.objects.filter(provider="tvdb", external_id=str(tvdb_id)).first()
        if ext_obj and ext_obj.object_id:
            target_media_item = MediaItem.objects.filter(id=ext_obj.object_id).first()

    return target_media_item


def resolve_user_plex_item(
    user,
    target_media_item: MediaItem | None,
    ident: str,
    tmdb_id: str | int | None = None,
    imdb_id: str | None = None,
    tvdb_id: str | None = None,
    title: str | None = None,
    year: str | int | None = None,
    media_type: str | None = None,
) -> UserPlexItem | None:
    """Resolve the matching UserPlexItem through priority-based cascading fallback."""
    from django.contrib.contenttypes.models import ContentType

    from apps.integrations.models import UserPlexItem
    from apps.integrations.services.plex import _is_compatible_plex_match
    from apps.media.models import ExternalID

    plex_item: UserPlexItem | None = None

    if target_media_item is not None:
        cand = (
            UserPlexItem.objects.filter(user=user, media_item_id=target_media_item.id)
            .select_related("server")
            .first()
        )
        if cand:
            if _is_compatible_plex_match(
                cand,
                target_media_item,
                has_guid_match=True,
                req_tmdb_id=tmdb_id,
                req_imdb_id=imdb_id,
                req_tvdb_id=tvdb_id,
            ):
                plex_item = cand
            else:
                cand.media_item = None
                cand.save(update_fields=["media_item"])

        if plex_item is None:
            ct = ContentType.objects.get_for_model(target_media_item.__class__)
            exts = {
                e.provider: e.external_id
                for e in ExternalID.objects.filter(content_type=ct, object_id=target_media_item.id)
            }
            tmdb_ext = exts.get("tmdb")
            imdb_ext = exts.get("imdb")
            tvdb_ext = exts.get("tvdb")

            p_filter_type = [target_media_item.media_type]
            if target_media_item.media_type == "show":
                p_filter_type = ["show", "episode"]

            if tmdb_ext:
                cand = (
                    UserPlexItem.objects.filter(
                        user=user, media_type__in=p_filter_type, guids__tmdb=str(tmdb_ext)
                    )
                    .select_related("server")
                    .first()
                )
                if _is_compatible_plex_match(
                    cand,
                    target_media_item,
                    has_guid_match=True,
                    req_tmdb_id=tmdb_id,
                    req_imdb_id=imdb_id,
                    req_tvdb_id=tvdb_id,
                ):
                    plex_item = cand
            if plex_item is None and imdb_ext:
                cand = (
                    UserPlexItem.objects.filter(
                        user=user, media_type__in=p_filter_type, guids__imdb=str(imdb_ext)
                    )
                    .select_related("server")
                    .first()
                )
                if _is_compatible_plex_match(
                    cand,
                    target_media_item,
                    has_guid_match=True,
                    req_tmdb_id=tmdb_id,
                    req_imdb_id=imdb_id,
                    req_tvdb_id=tvdb_id,
                ):
                    plex_item = cand
            if plex_item is None and tvdb_ext:
                cand = (
                    UserPlexItem.objects.filter(
                        user=user, media_type__in=p_filter_type, guids__tvdb=str(tvdb_ext)
                    )
                    .select_related("server")
                    .first()
                )
                if _is_compatible_plex_match(
                    cand,
                    target_media_item,
                    has_guid_match=True,
                    req_tmdb_id=tmdb_id,
                    req_imdb_id=imdb_id,
                    req_tvdb_id=tvdb_id,
                ):
                    plex_item = cand
            if plex_item is None:
                title_cands = UserPlexItem.objects.filter(
                    user=user,
                    media_type__in=p_filter_type,
                    title__iexact=target_media_item.title,
                ).select_related("server")
                for c in title_cands:
                    if _is_compatible_plex_match(
                        c,
                        target_media_item,
                        has_guid_match=False,
                        req_tmdb_id=tmdb_id,
                        req_imdb_id=imdb_id,
                        req_tvdb_id=tvdb_id,
                    ):
                        plex_item = c
                        break

            # Fallback: title matching with +/- 1 year tolerance
            if plex_item is None and target_media_item.release_date:
                t_year_val = target_media_item.release_date.year
                year_cands = UserPlexItem.objects.filter(
                    user=user,
                    media_type__in=p_filter_type,
                    year__gte=t_year_val - 1,
                    year__lte=t_year_val + 1,
                ).select_related("server")
                for c in year_cands:
                    if _is_compatible_plex_match(
                        c,
                        target_media_item,
                        has_guid_match=False,
                        req_tmdb_id=tmdb_id,
                        req_imdb_id=imdb_id,
                        req_tvdb_id=tvdb_id,
                    ):
                        plex_item = c
                        break

            if (
                plex_item is not None
                and plex_item.media_item_id != target_media_item.id
                and _is_compatible_plex_match(
                    plex_item,
                    target_media_item,
                    has_guid_match=True,
                    req_tmdb_id=tmdb_id,
                    req_imdb_id=imdb_id,
                    req_tvdb_id=tvdb_id,
                )
            ):
                plex_item.media_item = target_media_item
                plex_item.save(update_fields=["media_item"])

    # Query param fallbacks for unified single-roundtrip finding
    t_year = (
        target_media_item.release_date.year
        if (target_media_item and getattr(target_media_item, "release_date", None))
        else (int(year) if year and str(year).isdigit() else None)
    )
    p_type_filter = []
    if media_type:
        p_type_filter = (
            ["show", "episode"] if media_type in ("show", "series", "tv") else [media_type]
        )

    if plex_item is None and tmdb_id:
        qs = UserPlexItem.objects.filter(user=user, guids__tmdb=str(tmdb_id))
        if p_type_filter:
            qs = qs.filter(media_type__in=p_type_filter)
        cand = qs.select_related("server").first()
        if _is_compatible_plex_match(
            cand,
            target_media_item,
            target_media_type=media_type,
            target_year=t_year,
            has_guid_match=True,
            req_tmdb_id=tmdb_id,
            req_imdb_id=imdb_id,
            req_tvdb_id=tvdb_id,
        ):
            plex_item = cand
    if plex_item is None and tvdb_id:
        qs = UserPlexItem.objects.filter(user=user, guids__tvdb=str(tvdb_id))
        if p_type_filter:
            qs = qs.filter(media_type__in=p_type_filter)
        cand = qs.select_related("server").first()
        if _is_compatible_plex_match(
            cand,
            target_media_item,
            target_media_type=media_type,
            target_year=t_year,
            has_guid_match=True,
            req_tmdb_id=tmdb_id,
            req_imdb_id=imdb_id,
            req_tvdb_id=tvdb_id,
        ):
            plex_item = cand
    if plex_item is None and imdb_id:
        qs = UserPlexItem.objects.filter(user=user, guids__imdb=str(imdb_id))
        if p_type_filter:
            qs = qs.filter(media_type__in=p_type_filter)
        cand = qs.select_related("server").first()
        if _is_compatible_plex_match(
            cand,
            target_media_item,
            target_media_type=media_type,
            target_year=t_year,
            has_guid_match=True,
            req_tmdb_id=tmdb_id,
            req_imdb_id=imdb_id,
            req_tvdb_id=tvdb_id,
        ):
            plex_item = cand
    if plex_item is None and title:
        qs = UserPlexItem.objects.filter(user=user, title__iexact=str(title).strip())
        if target_media_item:
            p_filter_type = [target_media_item.media_type]
            if target_media_item.media_type == "show":
                p_filter_type = ["show", "episode"]
            qs = qs.filter(media_type__in=p_filter_type)
        elif p_type_filter:
            qs = qs.filter(media_type__in=p_type_filter)
        title_cands = qs.select_related("server")
        for c in title_cands:
            if _is_compatible_plex_match(
                c,
                target_media_item,
                target_media_type=media_type,
                target_year=t_year,
                has_guid_match=False,
                req_tmdb_id=tmdb_id,
                req_imdb_id=imdb_id,
                req_tvdb_id=tvdb_id,
            ):
                plex_item = c
                break

    # Direct rating_key lookup ONLY when target_media_item is None
    if plex_item is None and target_media_item is None:
        cand = (
            UserPlexItem.objects.filter(user=user, rating_key=ident)
            .select_related("server")
            .first()
        )
        if cand:
            plex_item = cand

    if (
        plex_item is not None
        and target_media_item is not None
        and plex_item.media_item_id != target_media_item.id
        and _is_compatible_plex_match(
            plex_item,
            target_media_item,
            has_guid_match=True,
            req_tmdb_id=tmdb_id,
            req_imdb_id=imdb_id,
            req_tvdb_id=tvdb_id,
        )
    ):
        plex_item.media_item = target_media_item
        plex_item.save(update_fields=["media_item"])

    return plex_item


def resolve_active_playback_item(
    server: UserPlexServer,
    user,
    plex_item: UserPlexItem,
    base_urls: list[str],
    season: str | int | None = None,
    episode: str | int | None = None,
) -> tuple[dict[str, Any], Any]:
    """Resolve active playback leaf item, season/episode context, and user progress."""
    from apps.integrations.models import UserPlexItem
    from apps.integrations.services.plex import _plex_server_get, _resolve_show_playable_item

    active_rating_key = plex_item.rating_key
    active_title = plex_item.title
    active_media_type = plex_item.media_type
    active_season_num: int | None = None
    active_episode_num: int | None = None
    active_ep_title: str | None = None
    active_offset = int(plex_item.view_offset or 0)
    active_duration = int(plex_item.duration or 0)
    active_viewed = bool(plex_item.viewed)

    target_leaf = None

    if plex_item.media_type == "show" or season is not None or episode is not None:
        try:
            selected_leaf, working_base = _resolve_show_playable_item(
                server, user, plex_item, season=season, episode=episode
            )
            if working_base and working_base in base_urls:
                base_urls.remove(working_base)
                base_urls.insert(0, working_base)

            if selected_leaf:
                target_leaf = selected_leaf
                active_rating_key = str(selected_leaf.get("ratingKey"))
                active_ep_title = selected_leaf.get("title")
                active_title = active_ep_title or active_title
                active_media_type = "episode"
                if selected_leaf.get("parentIndex") is not None:
                    active_season_num = int(selected_leaf.get("parentIndex"))
                if selected_leaf.get("index") is not None:
                    active_episode_num = int(selected_leaf.get("index"))
                active_duration = int(selected_leaf.get("duration") or 0)

                # Strictly isolate watch progress per user
                user_ep = UserPlexItem.objects.filter(
                    user=user, rating_key=active_rating_key
                ).first()
                if user_ep and user_ep.view_offset:
                    active_offset = int(user_ep.view_offset)
                    active_viewed = bool(user_ep.viewed)
                elif server.owned:
                    active_offset = int(selected_leaf.get("viewOffset") or 0)
                    active_viewed = int(selected_leaf.get("viewCount") or 0) > 0
                else:
                    active_offset = 0
                    active_viewed = False
        except Exception as e:
            logger.warning(
                "Failed to resolve targeted episode for show %s: %s", plex_item.rating_key, e
            )
    else:
        try:
            live_res = _plex_server_get(server, user, f"/library/metadata/{plex_item.rating_key}")
            if live_res:
                meta_data, working_base = live_res
                if working_base in base_urls:
                    base_urls.remove(working_base)
                    base_urls.insert(0, working_base)
                meta = meta_data.get("MediaContainer", {}).get("Metadata", [{}])[0]
                target_leaf = meta
                if active_offset == 0 and server.owned and meta.get("viewOffset") is not None:
                    active_offset = int(meta.get("viewOffset"))
                if meta.get("duration") is not None:
                    active_duration = int(meta.get("duration"))
                if not active_viewed and server.owned and meta.get("viewCount") is not None:
                    active_viewed = int(meta.get("viewCount")) > 0
        except Exception as e:
            logger.debug("Failed to query live movie metadata for %s: %s", plex_item.rating_key, e)

    playback_data = {
        "active_rating_key": active_rating_key,
        "active_title": active_title,
        "active_media_type": active_media_type,
        "active_season_num": active_season_num,
        "active_episode_num": active_episode_num,
        "active_ep_title": active_ep_title,
        "active_offset": active_offset,
        "active_duration": active_duration,
        "active_viewed": active_viewed,
    }
    return playback_data, target_leaf


def extract_stream_specs(
    target_leaf: Any,
    plex_item: UserPlexItem,
    base_urls: list[str],
    token: str | None,
    active_rating_key: str | None,
) -> dict[str, Any]:
    """Extract audio tracks, subtitles, container formats, and direct/HLS stream URLs."""
    from apps.integrations.services.plex import _as_list

    audio_tracks: list[dict] = []
    subtitles: list[dict] = []
    part_key: str | None = None
    container: str = "mp4"
    video_codec: str = "h264"
    audio_codec: str = "aac"

    if target_leaf is None and plex_item.raw:
        target_leaf = plex_item.raw

    if target_leaf:
        media_list = _as_list(target_leaf.get("Media"))
        if media_list:
            m_obj = media_list[0]
            container = m_obj.get("container") or "mp4"
            video_codec = m_obj.get("videoCodec") or "h264"
            audio_codec = m_obj.get("audioCodec") or "aac"
            part_list = _as_list(m_obj.get("Part"))
            if part_list:
                part_obj = part_list[0]
                part_key = part_obj.get("key")
                for s in _as_list(part_obj.get("Stream")):
                    stype = s.get("streamType")
                    sid = str(s.get("id", ""))
                    sidx = int(s.get("index", 0))
                    codec = str(s.get("codec") or "")
                    lang = s.get("languageCode") or s.get("language") or "und"
                    disp = s.get("displayTitle") or s.get("title")
                    if stype == 2:  # Audio
                        audio_tracks.append(
                            {
                                "id": sid,
                                "index": sidx,
                                "label": disp or f"{lang} ({codec})",
                                "language": lang,
                                "codec": codec,
                                "channels": int(s.get("channels") or 2),
                            }
                        )
                    elif stype == 3:  # Subtitle
                        sub_format = (
                            "pgs"
                            if codec == "pgs"
                            else ("ass" if codec == "ass" else ("srt" if codec == "srt" else "vtt"))
                        )
                        sub_key = s.get("key")
                        sub_url = (
                            f"{base_urls[0]}{sub_key}?X-Plex-Token={token}"
                            if (sub_key and base_urls and token)
                            else None
                        )
                        subtitles.append(
                            {
                                "id": sid,
                                "index": sidx,
                                "label": disp or lang or "Subtitles",
                                "language": lang,
                                "url": sub_url,
                                "format": sub_format,
                                "is_external": bool(sub_key),
                                "requires_burn_in": codec in ("pgs", "ass"),
                            }
                        )

    primary_url = base_urls[0] if base_urls else None
    direct_url = (
        f"{primary_url}{part_key}?X-Plex-Token={token}"
        if (primary_url and part_key and token)
        else None
    )
    hls_url = None
    if primary_url and token and active_rating_key:
        encoded_path = urllib.parse.quote(f"/library/metadata/{active_rating_key}", safe="")
        encoded_token = urllib.parse.quote(token, safe="")
        hls_url = (
            f"{primary_url}/video/:/transcode/universal/start.m3u8?"
            f"path={encoded_path}&mediaIndex=0&partIndex=0&protocol=hls&fastSeek=1&directPlay=0&directStream=1&hasMDE=1&"
            f"X-Plex-Client-Identifier=otix-web&X-Plex-Product=Otix&X-Plex-Platform=Chrome&"
            f"X-Plex-Token={encoded_token}"
        )

    return {
        "audio_tracks": audio_tracks,
        "subtitles": subtitles,
        "container": container,
        "video_codec": video_codec,
        "audio_codec": audio_codec,
        "direct_url": direct_url,
        "hls_url": hls_url,
    }

"""People domain services, re-exported for convenient imports.

Plain callables over the models (see ``person.py``); views stay thin and
serializers declarative, delegating aggregates/external-id lookups and
follow/rating mutations here.
"""

from apps.people.services.person import (
    build_person_context,
    follow_person,
    list_people,
    person_detail_queryset,
    person_external_ids,
    rate_person,
    search_people,
    unfollow_person,
    unrate_person,
)

__all__ = [
    "build_person_context",
    "follow_person",
    "list_people",
    "person_detail_queryset",
    "person_external_ids",
    "rate_person",
    "search_people",
    "unfollow_person",
    "unrate_person",
]

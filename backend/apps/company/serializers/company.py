"""Company serializers: detail response and rating request body.

Field-listed read serializers (never ``__all__``) grouped by concern. The detail
serializer mirrors the legacy ``CompanyOut`` payload exactly; the computed keys
(``follower_count``, ``avg_rating``, ``is_followed``, ``user_rating``) are read
off the model instance after the service layer attaches them.
"""

from rest_framework import serializers

from apps.company.models import Company


class CompanyDetailSerializer(serializers.ModelSerializer):
    """Public company detail (``GET /api/v1/company/{id}``).

    Anonymous callers see ``is_followed``/``user_rating`` as ``null``; when a
    valid token is present the service attaches the viewer's follow/rating state.
    """

    follower_count = serializers.IntegerField(read_only=True)
    avg_rating = serializers.FloatField(read_only=True, allow_null=True)
    is_followed = serializers.BooleanField(read_only=True, allow_null=True)
    user_rating = serializers.IntegerField(read_only=True, allow_null=True)

    class Meta:
        model = Company
        fields = (
            "id",
            "name",
            "slug",
            "logo_url",
            "origin_country",
            "description",
            "homepage",
            "follower_count",
            "is_followed",
            "avg_rating",
            "user_rating",
        )
        read_only_fields = (
            "id",
            "name",
            "slug",
            "logo_url",
            "origin_country",
            "description",
            "homepage",
        )


class CompanyRatingSerializer(serializers.Serializer):
    """Rating request body (``PUT /api/v1/company/{id}/rating``).

    Mirrors the legacy ``CompanyRatingBody`` constraint: score is a 1-5 integer.
    """

    score = serializers.IntegerField(min_value=1, max_value=5)

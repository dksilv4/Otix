"""Exercise catalog endpoints (public).

The legacy exercise router mounted these under ``/api/v1/exercises`` with no
auth dependency, so they opt out of the global ``IsAuthenticated`` default.
Both return plain arrays — legacy served ``list[ExerciseOut]`` /
``list[CategoryOut]``, not a page envelope.
"""

from rest_framework import permissions
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.workout import services
from apps.workout.serializers import CategoryOutSerializer, ExerciseOutSerializer


class ExerciseListView(APIView):
    """``GET /api/v1/exercises`` — the full exercise catalog."""

    permission_classes = (permissions.AllowAny,)

    def get(self, request: Request) -> Response:
        exercises = services.get_exercises()
        return Response(ExerciseOutSerializer(exercises, many=True).data)


class ExerciseCategoryListView(APIView):
    """``GET /api/v1/exercises/categories`` — category counts."""

    permission_classes = (permissions.AllowAny,)

    def get(self, request: Request) -> Response:
        categories = services.get_categories()
        return Response(CategoryOutSerializer(categories, many=True).data)

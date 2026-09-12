"""Workout endpoints: collection, today check-in, heatmap and detail CRUD.

Mirrors the legacy FastAPI routers under ``backend/otix/api/workout/**``. All
workout routes require the authenticated user (the global default); the
exercise catalog is public (``views/exercises.py``). Owner-scoping matches
legacy: a missing id is a 404, an existing workout owned by someone else is a
403 with the legacy ``detail`` strings.
"""

from rest_framework import generics, status
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.workout import services
from apps.workout.models import Workout
from apps.workout.serializers import (
    HeatmapQuerySerializer,
    WorkoutCreateSerializer,
    WorkoutDetailSerializer,
    WorkoutListSerializer,
    WorkoutUpdateSerializer,
)

WORKOUT_NOT_FOUND = "Workout not found"
NOT_YOUR_WORKOUT = "Not your workout"


def _owned_workout_or_404(workout_id: int | str, user) -> Workout:
    """Resolve a workout owned by ``user`` or raise the legacy 404/403 pair."""
    workout = services.get_workout(workout_id)
    if workout is None:
        raise NotFound(WORKOUT_NOT_FOUND)
    if workout.user_id != user.id:
        raise PermissionDenied(NOT_YOUR_WORKOUT)
    return workout


class WorkoutCollectionView(generics.GenericAPIView):
    """``GET``/``POST /api/v1/workout`` — list or create a workout."""

    serializer_class = WorkoutListSerializer

    def get_queryset(self):
        return services.get_workouts(self.request.user.id)

    def get(self, request: Request) -> Response:
        page = self.paginate_queryset(self.get_queryset())
        serializer = self.get_serializer(page, many=True)
        return self.get_paginated_response(serializer.data)

    def post(self, request: Request) -> Response:
        body = WorkoutCreateSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        workout = services.create_workout(user_id=request.user.id, **body.validated_data)
        return Response(WorkoutDetailSerializer(workout).data, status=status.HTTP_201_CREATED)


class TodayWorkoutView(APIView):
    """``GET``/``POST``/``DELETE /api/v1/workout/today`` — daily check-in."""

    def get(self, request: Request) -> Response:
        return Response(self._payload(services.get_today_status(request.user.id)))

    def post(self, request: Request) -> Response:
        services.check_in_today(request.user.id)
        return Response(
            self._payload(services.get_today_status(request.user.id)),
            status=status.HTTP_201_CREATED,
        )

    def delete(self, request: Request) -> Response:
        services.undo_check_in(request.user.id)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @staticmethod
    def _payload(result: dict) -> dict:
        workout = result["workout"]
        return {
            "checked_in": result["checked_in"],
            "workout": WorkoutListSerializer(workout).data if workout else None,
            "current_streak": result["current_streak"],
            "longest_streak": result["longest_streak"],
        }


class WorkoutHeatmapView(APIView):
    """``GET /api/v1/workout/heatmap`` — per-day workout counts."""

    def get(self, request: Request) -> Response:
        query = HeatmapQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)
        data = services.get_heatmap(request.user.id, query.validated_data["weeks"])
        return Response(data)


class WorkoutDetailView(APIView):
    """``GET``/``PATCH``/``DELETE /api/v1/workout/{workout_id}``."""

    def get(self, request: Request, workout_id: int) -> Response:
        workout = _owned_workout_or_404(workout_id, request.user)
        return Response(WorkoutDetailSerializer(workout).data)

    def patch(self, request: Request, workout_id: int) -> Response:
        workout = _owned_workout_or_404(workout_id, request.user)
        body = WorkoutUpdateSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        updated = services.update_workout(workout, **body.validated_data)
        return Response(WorkoutDetailSerializer(updated).data)

    def delete(self, request: Request, workout_id: int) -> Response:
        workout = _owned_workout_or_404(workout_id, request.user)
        services.delete_workout(workout)
        return Response(status=status.HTTP_204_NO_CONTENT)

"""Django admin registration for workout-domain models."""

from django.contrib import admin

from apps.workout.models import Exercise, UserRating, Workout, WorkoutExercise

admin.site.register(Exercise, admin.ModelAdmin)
admin.site.register(Workout, admin.ModelAdmin)
admin.site.register(WorkoutExercise, admin.ModelAdmin)
admin.site.register(UserRating, admin.ModelAdmin)

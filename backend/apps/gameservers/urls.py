"""URL routing for dedicated game servers."""

from django.urls import path

from apps.gameservers.views import (
    GameServerDetailView,
    GameServerInviteResolveView,
    GameServerInviteView,
    GameServerListCreateView,
    GameServerQueryView,
    GameServersByGameView,
    GameServerShareDeleteView,
    GameServerShareListCreateView,
)

app_name = "gameservers"

urlpatterns = [
    path("", GameServerListCreateView.as_view(), name="game-server-list-create"),
    path("<int:server_id>", GameServerDetailView.as_view(), name="game-server-detail"),
    path("<int:server_id>/query", GameServerQueryView.as_view(), name="game-server-query"),
    path("<int:server_id>/shares", GameServerShareListCreateView.as_view(), name="game-server-shares"),
    path("<int:server_id>/shares/<int:user_id>", GameServerShareDeleteView.as_view(), name="game-server-share-delete"),
    path("<int:server_id>/invites", GameServerInviteView.as_view(), name="game-server-invites"),
    path("invites/<str:code>", GameServerInviteResolveView.as_view(), name="game-server-invite-resolve"),
    path("invites/<str:code>/join", GameServerInviteResolveView.as_view(), name="game-server-invite-join"),
    path("by-game/<str:media_id>", GameServersByGameView.as_view(), name="game-servers-by-game"),
]

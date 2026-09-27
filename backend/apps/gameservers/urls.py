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
    GameServerVerifyView,
)

app_name = "gameservers"

urlpatterns = [
    path("", GameServerListCreateView.as_view(), name="game-server-list-create"),
    path("verify", GameServerVerifyView.as_view(), name="game-server-verify"),
    path("verify/", GameServerVerifyView.as_view(), name="game-server-verify-slash"),
    path("<int:server_id>", GameServerDetailView.as_view(), name="game-server-detail"),
    path("<int:server_id>/", GameServerDetailView.as_view(), name="game-server-detail-slash"),
    path("<int:server_id>/query", GameServerQueryView.as_view(), name="game-server-query"),
    path("<int:server_id>/query/", GameServerQueryView.as_view(), name="game-server-query-slash"),
    path("<int:server_id>/shares", GameServerShareListCreateView.as_view(), name="game-server-shares"),
    path("<int:server_id>/shares/", GameServerShareListCreateView.as_view(), name="game-server-shares-slash"),
    path("<int:server_id>/shares/<int:user_id>", GameServerShareDeleteView.as_view(), name="game-server-share-delete"),
    path("<int:server_id>/shares/<int:user_id>/", GameServerShareDeleteView.as_view(), name="game-server-share-delete-slash"),
    path("<int:server_id>/invites", GameServerInviteView.as_view(), name="game-server-invites"),
    path("<int:server_id>/invites/", GameServerInviteView.as_view(), name="game-server-invites-slash"),
    path("invites/<str:code>", GameServerInviteResolveView.as_view(), name="game-server-invite-resolve"),
    path("invites/<str:code>/", GameServerInviteResolveView.as_view(), name="game-server-invite-resolve-slash"),
    path("invites/<str:code>/join", GameServerInviteResolveView.as_view(), name="game-server-invite-join"),
    path("invites/<str:code>/join/", GameServerInviteResolveView.as_view(), name="game-server-invite-join-slash"),
    path("by-game/<str:media_id>", GameServersByGameView.as_view(), name="game-servers-by-game"),
    path("by-game/<str:media_id>/", GameServersByGameView.as_view(), name="game-servers-by-game-slash"),
]

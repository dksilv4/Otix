"""Public user-profile routes (``/api/v1/users/``).

Mounted at ``/api/v1/users/`` by ``config/urls.py``. No trailing slashes
(FastAPI parity; ``APPEND_SLASH`` off). ``username`` is the string converter
(matches ``accounts.User.username``); ``request_id`` is an integer converter.
Literal routes (``search``, ``achievements``) before ``<str:username>`` so they
are never shadowed.

The users surface spans two domain apps: identity/self/hub reads live in
``accounts``, social-graph/engagement reads+writes (follows, followers,
reviews, karma, badges, mood, activity) live in ``social``. This module imports
view classes from BOTH apps so there is exactly one URL namespace. Populated by
the users endpoint-port owner (wave #4).
"""

urlpatterns = []

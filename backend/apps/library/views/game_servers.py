"""Backward compatibility module for apps.library.views.game_servers -> nodes."""

import sys

import apps.library.views.nodes as _nodes

sys.modules[__name__] = _nodes


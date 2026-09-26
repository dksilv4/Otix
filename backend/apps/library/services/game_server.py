"""Backward compatibility module for apps.library.services.game_server -> node."""

import sys

import apps.library.services.node as _node

sys.modules[__name__] = _node

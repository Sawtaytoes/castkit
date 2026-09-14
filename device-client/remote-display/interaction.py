"""Bind a contact to the actionable element in the acknowledged display frame."""

from dataclasses import dataclass
from time import monotonic


@dataclass(frozen=True)
class Target:
    identity: str
    x: float
    y: float
    width: float
    height: float

    def contains(self, x, y):
        return self.x <= x < self.x + self.width and self.y <= y < self.y + self.height


def target_at(targets, x, y):
    return next((target.identity for target in reversed(targets) if target.contains(x, y)), None)


class FrameGuard:
    def __init__(self, max_age=10):
        self.frames = {}
        self.max_age = max_age

    def remember(self, frame_id, targets, timestamp=None):
        self.frames[frame_id] = (monotonic() if timestamp is None else timestamp, tuple(targets))
        while len(self.frames) > 32:
            self.frames.pop(next(iter(self.frames)))

    def match(self, frame_id, x, y, current_identity, timestamp=None):
        frame = self.frames.get(frame_id)
        now = monotonic() if timestamp is None else timestamp
        if frame is None or now - frame[0] > self.max_age or current_identity is None:
            return None
        identity = target_at(frame[1], x, y)
        return identity if identity == current_identity else None

import unittest
from interaction import FrameGuard, Target


class FrameGuardTests(unittest.TestCase):
    def test_unknown_frame_and_changed_target_are_rejected(self):
        guard = FrameGuard()
        guard.remember(4, [Target('open:drive-a:job-a', 10, 20, 80, 50)], timestamp=100)
        self.assertIsNone(guard.match(3, 25, 30, 'open:drive-a:job-a', timestamp=101))
        self.assertIsNone(guard.match(4, 25, 30, 'open:drive-b:job-b', timestamp=101))
        self.assertIsNone(guard.match(4, 25, 30, 'open:drive-a:job-b', timestamp=101))
        self.assertEqual(guard.match(4, 25, 30, 'open:drive-a:job-a', timestamp=101), 'open:drive-a:job-a')

    def test_expired_disabled_or_outside_target_does_not_act(self):
        guard = FrameGuard(max_age=10)
        guard.remember(4, [Target('slot:a', 0, 0, 480, 35)], timestamp=100)
        self.assertIsNone(guard.match(4, 20, 20, 'slot:a', timestamp=111))
        self.assertIsNone(guard.match(4, 20, 20, None, timestamp=101))
        self.assertIsNone(guard.match(4, 20, 35, 'slot:a', timestamp=101))

    def test_history_stays_bounded(self):
        guard = FrameGuard()
        for number in range(100):
            guard.remember(number, [])
        self.assertEqual(len(guard.frames), 32)
        self.assertNotIn(0, guard.frames)

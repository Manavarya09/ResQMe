"""Deterministic synthetic 50 Hz sensor windows."""
import math

DT = 20  # ms


def _mk(mags, gyro=0.0):
    return [{"t": i * DT, "ax": 0.0, "ay": 0.0, "az": m, "gx": gyro, "gy": 0.0, "gz": 0.0}
            for i, m in enumerate(mags)]


def walking(n):
    return [1.0 + 0.3 * math.sin(i * 0.9) for i in range(n)]


def still(n, level=1.0):
    return [level + 0.02 * math.sin(i * 0.7) for i in range(n)]


def handling(n):
    # phone picked up and moved around: large variance
    return [1.0 + 0.6 * math.sin(i * 1.3) for i in range(n)]


def none_window():
    return _mk(walking(150))


def drop_window():
    mags = still(25) + [0.1] * 15 + [4.0, 3.2, 1.5] + handling(75)
    return _mk(mags, gyro=2.0)


def fall_window():
    mags = walking(25) + [0.15] * 20 + [5.0, 3.5, 1.8, 1.2] + still(75)
    return _mk(mags, gyro=4.0)


def crash_window():
    driving = [1.0 + 0.08 * math.sin(i * 2.1) for i in range(50)]
    mags = driving + [3.0, 7.5, 9.2, 6.0, 2.5, 1.4] + still(75, level=1.0)
    return _mk(mags, gyro=6.0)

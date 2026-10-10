# FILE: scripts/make-exercise-clips.py   (new file)
#
# Clip converter for exercise demo clips.
#
# Turns phone videos (iPhone .mov, Android .mp4, anything) into small silent
# MP4 loops that play on every phone, tablet and the TV. A typical 4-second
# clip comes out around 200–600 KB.
#
# What it does to each video:
#   - removes the sound
#   - shrinks it to 540 pixels tall (plenty for a phone screen or the TV box)
#   - 30 frames per second
#   - keeps at most 8 seconds (trim to one rep first; see below)
#   - saves it as an MP4 (H.264) that starts playing right away
#
# NEEDS: Python 3 and ffmpeg.
#   Mac:      brew install ffmpeg
#   Windows:  winget install ffmpeg      (then close and reopen the terminal)
#
# HOW TO USE
#   1. Trim each video to one clean rep on your phone first
#      (iPhone: Photos → Edit → drag the ends of the timeline).
#   2. Put the trimmed videos in one folder and run:
#        python make-exercise-clips.py "path/to/folder"
#      The clips are saved in a "clips" folder inside it, with the same
#      names, e.g. back-squat.mov → clips/back-squat.mp4
#
#   One video, cut in the converter instead of on the phone:
#        python make-exercise-clips.py squat.mov --start 2.5 --length 4
#      (starts 2.5 seconds in and keeps 4 seconds)
#
#   3. Coach → Exercise Library → Edit → Demo Clip, and pick the .mp4.

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

VIDEO_TYPES = {'.mov', '.mp4', '.m4v', '.webm', '.avi', '.mkv', '.3gp'}
MAX_SECONDS = 8
HEIGHT = 540


def convert(src: Path, out_dir: Path, start: float | None, length: float | None) -> bool:
    out_dir.mkdir(parents=True, exist_ok=True)
    dest = out_dir / (src.stem.strip().lower().replace(' ', '-') + '.mp4')

    cmd = ['ffmpeg', '-y', '-hide_banner', '-loglevel', 'error']
    if start:
        cmd += ['-ss', str(start)]
    cmd += ['-i', str(src)]
    cmd += ['-t', str(min(length or MAX_SECONDS, MAX_SECONDS))]
    cmd += [
        '-an',                                            # no sound
        '-vf', f'scale=-2:{HEIGHT}:flags=lanczos,fps=30,format=yuv420p',
        '-c:v', 'libx264', '-profile:v', 'main', '-preset', 'slow', '-crf', '27',
        '-movflags', '+faststart',                        # starts playing right away
        str(dest),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0 or not dest.exists():
        print(f'  ✗ {src.name}: {result.stderr.strip()[:300] or "conversion failed"}')
        return False
    print(f'  ✓ {src.name} → {dest.relative_to(dest.parent.parent)}  ({dest.stat().st_size / 1024:.0f} KB)')
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description='Make small silent looping MP4s for exercise demo clips.')
    parser.add_argument('path', help='a video file, or a folder of videos')
    parser.add_argument('--start', type=float, help='seconds into the video to start (one video only)')
    parser.add_argument('--length', type=float, help=f'seconds to keep (one video only, {MAX_SECONDS} max)')
    args = parser.parse_args()

    if not shutil.which('ffmpeg'):
        print('ffmpeg is not installed. Mac: brew install ffmpeg   Windows: winget install ffmpeg')
        return 1

    target = Path(args.path).expanduser()
    if target.is_dir():
        if args.start or args.length:
            print('--start and --length only work with a single video, not a folder.')
            return 1
        videos = sorted(p for p in target.iterdir() if p.is_file() and p.suffix.lower() in VIDEO_TYPES)
        if not videos:
            print(f'No videos found in {target}')
            return 1
        out_dir = target / 'clips'
    elif target.is_file():
        videos = [target]
        out_dir = target.parent / 'clips'
    else:
        print(f'Not found: {target}')
        return 1

    print(f'Converting {len(videos)} video(s)…')
    ok = sum(convert(v, out_dir, args.start, args.length) for v in videos)
    print(f'Done: {ok} of {len(videos)} saved in {out_dir}')
    return 0 if ok == len(videos) else 1


if __name__ == '__main__':
    sys.exit(main())

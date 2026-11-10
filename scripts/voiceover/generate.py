"""Generate MP3 voice-overs (Kokoro, voice am_michael) from voiceover-out/txt/*.txt.
Usage: python scripts/voiceover/generate.py [shard n]   (shard/n only to split work across processes)
Skips topics whose MP3 already exists, so it is safe to stop and resume."""
import sys, os, subprocess, numpy as np, soundfile as sf
from kokoro_onnx import Kokoro

ROOT = "voiceover-out"
MODEL = os.environ.get("KOKORO_MODEL", f"{ROOT}/models/kokoro-v1.0.onnx")
VOICES = os.environ.get("KOKORO_VOICES", f"{ROOT}/models/voices-v1.0.bin")
shard, n = (int(sys.argv[1]), int(sys.argv[2])) if len(sys.argv) > 2 else (0, 1)
os.makedirs(f"{ROOT}/mp3", exist_ok=True)
k = Kokoro(MODEL, VOICES)
for i, f in enumerate(sorted(os.listdir(f"{ROOT}/txt"))):
    if i % n != shard or not f.endswith(".txt"): continue
    slug = f[:-4]; mp3 = f"{ROOT}/mp3/{slug}.mp3"
    if os.path.exists(mp3): continue
    parts = []
    for line in open(f"{ROOT}/txt/{f}", encoding="utf-8").read().split("\n"):
        line = line.strip()
        if not line: continue
        s, sr = k.create(line, voice="am_michael", speed=0.97, lang="en-us")
        parts += [s, np.zeros(int(sr * (0.55 if len(line) < 90 else 0.35)), dtype=np.float32)]
    wav = f"{ROOT}/{slug}.{shard}.wav"
    sf.write(wav, np.concatenate(parts), sr)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav, "-ac", "1", "-b:a", "64k", mp3 + ".tmp.mp3"], check=True)
    os.rename(mp3 + ".tmp.mp3", mp3); os.remove(wav)
    print("done", slug, flush=True)

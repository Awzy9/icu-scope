# Topic voice-overs (free, local, Kokoro voice "am_michael")

Run from the repo root. Needs Node (repo deps installed), Python 3.9+, and ffmpeg.

```bash
npm ci
# 1) Build the narration scripts for all topics -> voiceover-out/txt/<slug>.txt
node --conditions=react-server --import tsx scripts/voiceover/build-scripts.ts

# 2) Python deps + model files (about 350 MB)
python3 -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install kokoro-onnx soundfile                       # NVIDIA GPU: also pip install onnxruntime-gpu
mkdir -p voiceover-out/models
curl -L -o voiceover-out/models/kokoro-v1.0.onnx https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx
curl -L -o voiceover-out/models/voices-v1.0.bin  https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin

# 3) Generate MP3s -> voiceover-out/mp3/<slug>.mp3  (resumable; skips finished files)
python scripts/voiceover/generate.py
# Optional: 4 parallel workers
for s in 0 1 2 3; do python scripts/voiceover/generate.py $s 4 & done; wait
```

Expect several hours on CPU for all 106 topics (about 1.4M characters); much faster on a GPU.
Output is in `voiceover-out/` (add it to .gitignore; do not commit the models).
If topic text changes, delete that topic's MP3 and re-run to regenerate it.

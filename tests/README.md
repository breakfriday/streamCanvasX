# Workspace integration fixtures

`av-pcm.flv` contains the synthetic video from core's `av.flv` and its 440 Hz sine wave
converted to G.711 mu-law at 8 kHz. It exercises video MSE and upper-layer PCM output together.
Tests use the committed file and do not require FFmpeg. Regenerate from the workspace root:

```sh
ffmpeg -i packages/playercore/tests/fixtures/av.flv -c:v copy -ar 8000 -c:a pcm_mulaw -f flv tests/av-pcm.flv
```

The PCM integration test prepares AudioWorklet before loading the short local fixture and
sends core events through the upper player's `handleAudioSegment`. It avoids playing the
empty audio MediaSource in the legacy split-MSE path. `audio-worklet.spec.mjs` separately
checks that packets arriving before initialization are dropped without being replayed,
then verifies output channels and tone frequencies at 8/16 kHz, format changes and destruction
during initialization.

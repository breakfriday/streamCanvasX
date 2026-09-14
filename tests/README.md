# Workspace integration fixtures

`av-pcm.flv` contains the synthetic video from core's `av.flv` and its 440 Hz sine wave
converted to G.711 mu-law at 8 kHz. It exercises video MSE and upper-layer PCM output together.
Tests use the committed file and do not require FFmpeg. Regenerate from the workspace root:

```sh
ffmpeg -i packages/playercore/tests/fixtures/av.flv -c:v copy -ar 8000 -c:a pcm_mulaw -f flv tests/av-pcm.flv
```

The PCM test initializes AudioWorklet before loading this short local file to isolate packaging
and data transport from the player's existing asynchronous first-audio initialization behavior.

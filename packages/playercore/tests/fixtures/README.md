# Synthetic media fixtures

These short fixtures contain an FFmpeg-generated blue frame and a 440 Hz sine wave, with no third-party media content. Tests use the committed files and do not require FFmpeg.

To regenerate from the repository root (remove the existing fixture files first):

```sh
ffmpeg -f lavfi -i color=c=blue:s=160x90:r=15 -f lavfi -i sine=frequency=440:sample_rate=44100 -t 3 -c:v libx264 -preset ultrafast -tune zerolatency -pix_fmt yuv420p -g 15 -c:a aac -b:a 32k -f flv tests/fixtures/av.flv
ffmpeg -i tests/fixtures/av.flv -c copy -f mpegts tests/fixtures/av.mpegts
ffmpeg -f lavfi -i sine=frequency=440:sample_rate=8000 -t 1 -c:a pcm_mulaw -f flv tests/fixtures/pcm.flv
```

The MPEG-TS fixture uses `.mpegts` so Vite does not treat it as TypeScript.

`hevc.flv` is a two-frame, silent 160x96 blue image generated with FFmpeg/libx265
(`color=c=blue:s=160x96:r=5`, duration 0.4 s, ultrafast, yuv420p,
`pools=1:frame-threads=1`). Its MP4 hvcC and length-prefixed packets were wrapped
in legacy FLV codec-id 12 tags, preserving DTS and signed composition offsets.
It validates HEVC configuration and sample transport only, without requiring a
browser HEVC decoder. Tests do not invoke FFmpeg.

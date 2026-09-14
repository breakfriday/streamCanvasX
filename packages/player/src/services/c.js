/* eslint-disable */
import { TsDemuxer } from "./ts-demuxer";

if (!("VideoDecoder" in window)) {
  window.alert(
    "请开启 chrome://flags/#enable-experimental-web-platform-features"
  );
} else {
  main();
}

async function main() {
  const isAvcC = false; // avcC 格式还是 AnnexB，false 为 AnnexB 格式

  // 下载 10s 电影片段
  const response = await fetch(
    "https://test-streams.mux.dev/x36xhzz/url_4/url_718/193039199_mp4_h264_aac_7.ts"
  );
  const movie = new Uint8Array(await response.arrayBuffer());

  // demux
  const tsDemuxer = new TsDemuxer();
  const avcTrack = tsDemuxer.demux(movie).video;

  // 创建 canvas 用来渲染电影
  const canvas = document.createElement("canvas");
  canvas.width = avcTrack.width;
  canvas.height = avcTrack.height;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  ctx.font = "30px serif";

  // VideoDecoder 配置
  const decoderConfig = {
    codec: avcTrack.codec
  };

  if (isAvcC) {
    decoderConfig.description = AVCDecoderConfigurationRecord(avcTrack);
  }

  const { config, supported } = await VideoDecoder.isConfigSupported(
    decoderConfig
  );
  console.log(config);
  if (!supported) {
    window.alert(`当前设备不支持解码 codec: ${avcTrack.codec}`);
    return;
  }

  let frameCount = 0;
  let startTime;
  const decoder = new VideoDecoder({
    output: (frame) => {
      ctx.drawImage(frame, 0, 0, canvas.width, canvas.height);
      frame.close();

      const now = performance.now();
      let fps = "";
      if (frameCount++) {
        fps = (1000 * (frameCount / (now - startTime))).toFixed(0) + " FPS";
      } else {
        startTime = now;
      }

      ctx.fillText(fps, 20, 50);
    },
    error: console.error
  });

  // 配置 VideoDecoder
  decoder.configure(decoderConfig);

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let frame of avcTrack.frames) {
    // 封装成 AnnexB 格式
    const data = isAvcC ? avcC(frame.units) : AnnexB(frame.units);

    const timestamp = frame.pts / 90000;
    const duration = frame.duration / 90000;

    const chunk = new EncodedVideoChunk({
      type: frame.key ? "key" : "delta",
      timestamp: timestamp * 1000000, // 微秒
      duration: duration * 1000000, // 微秒
      data
    });

    decoder.decode(chunk);

    await sleep(duration * 1000);
  }
}

function AnnexB(units) {
  const size = units.reduce((t, u) => t + u.byteLength, 0) + units.length * 3;
  const data = new Uint8Array(size);

  let offset = 0;
  units.forEach((unit) => {
    data.set([0, 0, 1], offset);
    offset += 3;
    data.set(unit, offset);
    offset += unit.byteLength;
  });

  return data;
}

function avcC(units) {
  const size = units.reduce((t, u) => t + u.byteLength, 0) + units.length * 4;
  const data = new Uint8Array(size);
  const dataView = new DataView(data.buffer);

  let offset = 0;
  units.forEach((unit) => {
    dataView.setUint32(offset, unit.byteLength);
    offset += 4;
    data.set(unit, offset);
    offset += unit.byteLength;
  });

  return data;
}

function AVCDecoderConfigurationRecord(track) {
  const sps = [];
  const pps = [];

  let len;
  track.sps.forEach((s) => {
    len = s.byteLength;
    sps.push((len >>> 8) & 0xff);
    sps.push(len & 0xff);
    sps.push(...s);
  });

  track.pps.forEach((p) => {
    len = p.byteLength;
    pps.push((len >>> 8) & 0xff);
    pps.push(len & 0xff);
    pps.push(...p);
  });

  return new Uint8Array(
    [
      0x01,
      track.profileIdc,
      track.profileCompatibility,
      track.levelIdc,
      0xfc | 3,
      0xe0 | track.sps.length
    ]
      .concat(sps)
      .concat([track.pps.length])
      .concat(pps)
  );
}

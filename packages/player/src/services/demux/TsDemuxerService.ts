// MPEG-2 TS 数据流的解复用 , 转换 mpeg-ts流为h.264视频的类
interface IAvcTrack {
    codec: string;
    width: number;
    height: number;
    profileIdc: number | null;
    profileCompatibility: number | null;
    levelIdc: number | null;
    pps: IUnit[];
    sps: IUnit[];
    frames: AvcFrame[];
}

interface IUnit {
    // 这里填写你的 IUnit 结构
}

interface IPes {
    data: IUnit[];
    pts: number;
    dts: number;
}

class AvcFrame {
    public units: IUnit[];
    public frame: boolean;
    public key: boolean;
    public duration: number;

    constructor(public pts: number, public dts: number) {
        this.units = [];
        this.frame = false;
        this.key = false;
        this.duration = 0;
    }
}

class TsDemuxer {
    prevAvcFrame: AvcFrame | null;

    constructor() {
        this.prevAvcFrame = null;
    }

    demux(data: Uint8Array): { video: IAvcTrack } {
        let pmtId = -1;
      let avcId = -1;

      let avcPesData = [];

      const avcTrack = {
        codec: '',
        width: 0,
        height: 0,
        profileIdc: null,
        profileCompatibility: null,
        levelIdc: null,
        pps: [],
        sps: [],
        frames: [],
      };

      for (let start = 0, len = data.length; start < len; start += 188) {
        if (data[start] !== 0x47) throw new Error('TS packet did not start with 0x47');
        const payloadUnitStartIndicator = !!(data[start + 1] & 0x40);
        const pid = ((data[start + 1] & 0x1f) << 8) + data[start + 2];
        const adaptationFiledControl = (data[start + 3] & 0x30) >> 4;

        let offset;
        if (adaptationFiledControl > 1) {
          offset = start + 5 + data[start + 4];
          if (offset === start + 188) continue;
        } else {
          offset = start + 4;
        }

        switch (pid) {
          case 0:
            if (payloadUnitStartIndicator) offset += data[offset] + 1;
            pmtId = ((data[offset + 10] & 0x1f) << 8) | data[offset + 11];
            break;
          case pmtId:
            {
              if (payloadUnitStartIndicator) offset += data[offset] + 1;
              const tableEnd =
                offset +
                3 +
                (((data[offset + 1] & 0x0f) << 8) | data[offset + 2]) -
                4;
              const programInfoLength =
                ((data[offset + 10] & 0x0f) << 8) | data[offset + 11];
              offset += 12 + programInfoLength;
              while (offset < tableEnd) {
                const esPid = ((data[offset + 1] & 0x1f) << 8) | data[offset + 2];
                switch (data[offset]) {
                  case 0x1b:
                    avcId = esPid;
                    break;
                }
                offset +=
                  (((data[offset + 3] & 0x0f) << 8) | data[offset + 4]) + 5;
              }
            }
            break;
          case avcId:
            if (payloadUnitStartIndicator && avcPesData.length) {
              const pes = TsDemuxer.parsePES(concatUint8Array(...avcPesData));
              if (pes) {
                const { units } = parseAnnexBNALus(pes.data);
                if (units) this.createAvcFrames(avcTrack, units, pes.pts, pes.dts);
              }
              avcPesData = [];
            }
            avcPesData.push(data.subarray(offset, start + 188));
            break;
        }
      }

      for (
        let i = 0, l = avcTrack.frames.length, offset = 0, frame, nextFrame;
        i < l;
        i++
      ) {
        frame = avcTrack.frames[i];
        nextFrame = avcTrack.frames[i + 1];

        if (nextFrame) {
          frame.duration = nextFrame.dts - frame.dts;
        } else {
          frame.duration = avcTrack.frames[i - 1]?.duration || 0;
        }
      }

      return {
        video: avcTrack,
      };
    }

    static parsePES(data: Uint8Array): IPes | undefined {
        // 省略代码，因为它和你提供的代码基本一样
    }

    createAvcFrames(track: IAvcTrack, units: IUnit[], pts: number, dts: number): void {
        // 省略代码，因为它和你提供的代码基本一样
    }

    static getSyncOffset(data: Uint8Array): number {
        // 省略代码，因为它和你提供的代码基本一样
    }
}

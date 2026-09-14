
declare class AACHeader {
  public bitDepth: number;
  public bitrate: number;
  public channels: number;
  public sampleRate: number;
  public copyrightId: boolean;
  public copyrightIdStart: boolean;
  public channelMode: string;
  public bufferFullness: string;
  public isHome: boolean;
  public isOriginal: boolean;
  public isPrivate: boolean;
  public layer: string;
  public length: number;
  public mpegVersion: string;
  public numberAACFrames: number;
  public profile: string;
  public protection: string;
}

import type { IProcess } from '../types/services';
class AudioProcessingService {
  context: IProcess['context'];
  dataArray: Float32Array;
  bufferLength: number;
  bufferData: Float32Array; // 时域 缓存
  bufferDataLength: number;

  constructor(parmams: { media_el?: HTMLAudioElement; canvas_el?: HTMLCanvasElement}) {
    const { canvas_el, media_el } = parmams;
    this.context = {};
    if (canvas_el) {
      this.setCanvasDom(canvas_el);
    }
    this.createAudioContext();
    this.setMediaSource_el(media_el);
    this.audioContextConnect();
  }


  createAudioContext() {
    this.context.audioContext = new AudioContext();
    this.context.analyserNode = this.context.audioContext.createAnalyser();

    this.bufferLength = this.context.analyserNode!.fftSize;
    this.dataArray = new Float32Array(this.bufferLength);
    this.setBufferData();
  }

  setBufferData() {
       // 根据 AudioContext 的采样率、所需的缓存时间和 FFT 大小来设置缓存区大小
       this.bufferDataLength = Math.ceil(1 * this.context.audioContext!.sampleRate / this.dataArray.length) * this.dataArray.length;
       this.bufferData = new Float32Array(this.bufferDataLength);
  }

  updateBufferData() {
    let { dataArray, bufferData } = this;
    let { bufferDataLength } = this;
      // 将旧的数据向前移动
    bufferData.copyWithin(0, dataArray.length);
    this.context.analyserNode?.getFloatTimeDomainData(dataArray);
    // 将新的数据添加到缓存的末尾
    bufferData.set(dataArray, bufferDataLength - dataArray.length);
    // 每帧都更新缓存
    requestAnimationFrame(this.updateBufferData.bind(this));
  }

  drawWithBufferData() {
    let dataArray = this.bufferData;
    let bufferLength = this.bufferDataLength;
    const AnimationFrame = () => {
      // 清除画布
      this.context.canvasContext!.clearRect(0, 0, this.context.canvas!.width, this.context.canvas!.height);

      // 设置波形图样式
      this.context.canvasContext!.lineWidth = 2;
      this.context.canvasContext!.strokeStyle = '#7f0';


      // 绘制波形图
      this.context.canvasContext!.beginPath();
      const sliceWidth = this.context.canvas!.width / bufferLength;
      let x = 0;
      for (let i = 0; i < bufferLength; i++) {
        const value = dataArray[i] * this.context.canvas!.height / 2;
        const y = this.context.canvas!.height / 2 + value;

        if (i === 0) {
          this.context.canvasContext!.moveTo(x, y);
        } else {
          this.context.canvasContext!.lineTo(x, y);
        }

        x += sliceWidth;
      }
      this.context.canvasContext!.lineTo(this.context.canvas!.width, this.context.canvas!.height / 2);
      this.context.canvasContext!.stroke();

      // 循环绘制
      requestAnimationFrame(AnimationFrame.bind(this));
    };
    AnimationFrame();
  }

  setCanvasDom(el: HTMLCanvasElement) {
    this.context.canvas = el;
    this.context.canvasContext = this.context.canvas.getContext('2d')!;
  }

  setMediaSource_el(el) {
    this.context.mediaSource_el = el;
    this.context.audioSourceNode = this.context.audioContext!.createMediaElementSource(el);
  }

  resetAudioContextConnec() {
    this.context.audioSourceNode?.disconnect();
    this.audioContextConnect();
  }

  audioContextConnect() {
    this.context.audioSourceNode!.connect(this.context.analyserNode!);
    this.context.analyserNode!.connect(this.context.audioContext!.destination);
  }

  mute(parm) {
    if (parm === true) {
      this.context.analyserNode!.disconnect(this.context.audioContext!.destination);
    } else {
      this.context.analyserNode!.connect(this.context.audioContext!.destination);
    }
  }

  visulizerDraw() {
    const bufferLength = this.context.analyserNode!.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const AnimationFrame = () => {
      requestAnimationFrame(AnimationFrame.bind(this));
      // 获取音频数据
      this.context.analyserNode!.getByteFrequencyData(dataArray);

      // 清除canvas
      this.context.canvasContext!.fillStyle = 'rgb(255, 255, 255)';
      this.context.canvasContext!.fillRect(0, 0, this.context.canvas!.width, this.context.canvas!.height);

      // 设置绘制音频数据的样式
      const barWidth = (this.context.canvas!.width / bufferLength) * 2.5;
      let barHeight;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        barHeight = dataArray[i] / 2;

        const r = barHeight + (25 * (i / bufferLength));
        const g = 250 * (i / bufferLength);
        const b = 50;

        // this.canvasContext.fillStyle = 'rgb(0, 0, 0)';
        // this.canvas_context.fillStyle = `rgb(${r},${g},${b})`;
        this.context.canvasContext!.fillStyle = 'rgb(0, 0, 0)';
        this.context.canvasContext!.fillRect(x, this.context.canvas!.height - barHeight, barWidth, barHeight);

        x += barWidth + 1;
      }
    };
    AnimationFrame();
  }

  visulizerDraw1() {
    const bufferLength = this.context.analyserNode!.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const AnimationFrame = () => {
      requestAnimationFrame(AnimationFrame.bind(this));
      // 将音频数据填充到数组当中
      this.context.analyserNode!.getByteFrequencyData(dataArray);

      // 清除canvas
      this.context.canvasContext!.fillStyle = '#000';
      this.context.canvasContext!.fillRect(0, 0, this.context.canvas!.width, this.context.canvas!.height);

      const barWidth = (this.context.canvas!.width / bufferLength) * 2.5;
      let barHeight;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        barHeight = dataArray[i];

        const r = barHeight + (25 * (i / bufferLength));
        const g = 250 * (i / bufferLength);
        const b = 50;

        this.context.canvasContext!.fillStyle = `rgb(${r},${g},${b})`;
        this.context.canvasContext!.fillRect(x, this.context.canvas!.height - barHeight, barWidth, barHeight);

        x += barWidth + 1;
      }
    };

    AnimationFrame();
  }


  // 时域
  visulizerDraw2() {
    const bufferLength = this.context.analyserNode!.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const AnimationFrame = () => {
      requestAnimationFrame(AnimationFrame.bind(this));
      // 获取音频数据
      this.context.analyserNode!.getByteFrequencyData(dataArray);


      this.context.canvasContext!.fillStyle = 'rgba(0, 0, 0, 0.05)';
      this.context.canvasContext!.fillRect(0, 0, this.context.canvas!.width, this.context.canvas!.height);
      this.context.canvasContext!.lineWidth = 2;
      this.context.canvasContext!.strokeStyle = 'rgb(0, 255, 0)';

      this.context.canvasContext!.beginPath();

      const sliceWidth = this.context.canvas!.width * 1.0 / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = v * this.context.canvas!.height / 2;

        if (i === 0) {
          this.context.canvasContext!.moveTo(x, y);
        } else {
          this.context.canvasContext!.lineTo(x, y);
        }

        x += sliceWidth;
      }

      this.context.canvasContext!.lineTo(this.context.canvas!.width, this.context.canvas!.height / 2);
      this.context.canvasContext!.stroke();
    };

    AnimationFrame();
  }

  visulizerDraw3() {
    const { bufferLength } = this;
    const { dataArray } = this;

    const AnimationFrame = () => {
      this.context.analyserNode!.getFloatTimeDomainData(dataArray);

      // 清除画布
      this.context.canvasContext!.clearRect(0, 0, this.context.canvas!.width, this.context.canvas!.height);

      // 设置波形图样式
      this.context.canvasContext!.lineWidth = 2;
      this.context.canvasContext!.strokeStyle = '#7f0';


      // 绘制波形图
      this.context.canvasContext!.beginPath();
      const sliceWidth = this.context.canvas!.width / bufferLength;
      let x = 0;
      for (let i = 0; i < bufferLength; i++) {
        const value = dataArray[i] * this.context.canvas!.height / 2;
        const y = this.context.canvas!.height / 2 + value;

        if (i === 0) {
          this.context.canvasContext!.moveTo(x, y);
        } else {
          this.context.canvasContext!.lineTo(x, y);
        }

        x += sliceWidth;
      }
      this.context.canvasContext!.lineTo(this.context.canvas!.width, this.context.canvas!.height / 2);
      this.context.canvasContext!.stroke();

      // 循环绘制
      requestAnimationFrame(AnimationFrame.bind(this));
    };
    AnimationFrame();
  }

  visulizerDraw4() {
    const bufferLength = this.context.analyserNode!.fftSize;
    const dataArray = new Float32Array(bufferLength);
    const AnimationFrame = () => {
      requestAnimationFrame(AnimationFrame.bind(this));
      this.context.analyserNode!.getFloatTimeDomainData(dataArray);

      this.context.canvasContext!.fillStyle = 'rgba(0, 0, 0, 0.1)';
      this.context.canvasContext!.fillRect(0, 0, this.context.canvas!.width, this.context.canvas!.height);

      this.context.canvasContext!.lineWidth = 2;
      this.context.canvasContext!.strokeStyle = 'rgb(0, 255, 0)';
      this.context.canvasContext!.beginPath();

      const sliceWidth = this.context.canvas!.width * 1.0 / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = v * this.context.canvas!.height / 2;

        if (i === 0) {
          this.context.canvasContext!.moveTo(x, y);
        } else {
          this.context.canvasContext!.lineTo(x, y);
        }

        x += sliceWidth;
      }

      this.context.canvasContext!.lineTo(this.context.canvas!.width, this.context.canvas!.height / 2);
      this.context.canvasContext!.stroke();
    };

    AnimationFrame();
  }
}

export default AudioProcessingService;

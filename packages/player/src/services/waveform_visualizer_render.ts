import { injectable, inject, Container } from 'inversify';
import { IDrawer } from '..';


export class WaveformVisualizer implements IDrawer {
  mediaSource_el!: HTMLAudioElement|HTMLVideoElement;
  canvas!: HTMLCanvasElement;
  audioContext!: AudioContext;
  canvasContext!: CanvasRenderingContext2D;
  analyserNode: AnalyserNode;
  audioSourceNode: MediaElementAudioSourceNode;
  drawAudio1() {
    const bufferLength = this.analyserNode.fftSize;
    const dataArray = new Float32Array(bufferLength);

    const AnimationFrame = () => {
      this.analyserNode.getFloatTimeDomainData(dataArray);

      // 清除画布
      this.canvasContext.clearRect(0, 0, this.canvas.width, this.canvas.height);

      // 设置波形图样式
      this.canvasContext.lineWidth = 2;
      this.canvasContext.strokeStyle = '#7f0';


      // 绘制波形图
      this.canvasContext.beginPath();
      const sliceWidth = this.canvas.width / bufferLength;
      let x = 0;
      for (let i = 0; i < bufferLength; i++) {
        const value = dataArray[i] * this.canvas.height / 2;
        const y = this.canvas.height / 2 + value;

        if (i === 0) {
          this.canvasContext.moveTo(x, y);
        } else {
          this.canvasContext.lineTo(x, y);
        }

        x += sliceWidth;
      }
      this.canvasContext.lineTo(this.canvas.width, this.canvas.height / 2);
      this.canvasContext.stroke();

      // 循环绘制
      requestAnimationFrame(AnimationFrame.bind(this));
    };
    AnimationFrame();
  }
}

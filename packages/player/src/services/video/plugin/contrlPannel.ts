class VideoController {
    private video: HTMLVideoElement;
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private isPlaying: boolean;
    private dragging: boolean = false;
    private handle: { x: number; y: number; radius: number } = { x: 0, y: 0, radius: 5 };
    private progressBar: { x: number; y: number; height?: number} = { x: 0, y: 0,height: 4 };
    private container_bar: {height: number}={ height: 0 }
    private playPauseButton: {x: number;y: number;height: number;width: number}={
      x: 20, // 将按钮放在canvas的右侧
      y: 19,
      width: 12,
      height: 12
    };
    private content_el: HTMLElement

    constructor(videoElement: HTMLVideoElement, content_el: HTMLElement) {
      this.video = videoElement;
      this.content_el=content_el;


      this.isPlaying = true;
    }
    load() {
      this.initControls();
      this.update();
    }

    initControls() {
      this.create_canvas_el();
      this.event();
      this.container_bar.height=20; // this.canvas.height;

      this.handle.y =this.container_bar.height / 2;
    }

    create_canvas_el() {
      let control_pannel_el=document.createElement('canvas');
      let contentEl=this.content_el;


      control_pannel_el.width=200;
      control_pannel_el.height=35;
      control_pannel_el.style.position="absolute";
      control_pannel_el.style.zIndex="99";
      control_pannel_el.style.bottom="0px";
      control_pannel_el.style.left="0px";
      control_pannel_el.style.border='none';
      control_pannel_el.style.backgroundColor= 'rgba(0, 0, 0, 0.5)';

      this.canvas=control_pannel_el;
      this.ctx = this.canvas.getContext('2d');

      this.setSize();


      contentEl.append(control_pannel_el);
      contentEl.style.position="relative";
    }

    setSize() {
      let width=this.content_el.clientWidth;
      this.canvas.width=width;
    }

    event() {
      this.canvas.addEventListener('click', this.mouseClick.bind(this));
      // this.canvas.addEventListener('mousemove', this.onMouseMove.bind(this));
      // this.canvas.addEventListener('mousedown', this.onMouseDown.bind(this));
    }

    mouseClick(e: MouseEvent) {
      let offsetX= this.progressBar.x;
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;


      if (x >= this.playPauseButton.x && x <= this.playPauseButton.x + this.playPauseButton.width &&
        y >= this.playPauseButton.y && y <= this.playPauseButton.y + this.playPauseButton.height) { //  判断是否点击了播放/暂停按钮
          this.togglePlayPause();
         return false;
      } else {
        // 调整视频进度
       // const clickedTime = (x / (this.canvas.width- offsetX)) * this.video.duration;
        const clickedTime = ((x - offsetX) / (this.canvas.width - offsetX)) * this.video.duration;

        this.video.currentTime = clickedTime;
      }
    }

    togglePlayPause() {
      if (this.video.paused || this.video.ended) {
        this.video.play();
        this.isPlaying = true;
      } else {
        this.video.pause();
        this.isPlaying = false;
      }
    }

    update() {
      requestAnimationFrame(() => this.update());
      this.drawControls();
    }

    drawControls() {
      // let { offsetX } = this;
      // this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      // // Draw progress bar
      // const progress = (this.video.currentTime / this.video.duration) * (this.canvas.width-offsetX);
      // this.ctx.fillStyle = 'green';
      // this.ctx.fillRect(offsetX, 0, progress, 10);
      // // Draw play/pause toggle
      // this.ctx.fillStyle = this.isPlaying ? 'red' : 'blue';
      // this.ctx.fillRect(150, 20, 20, 20); // 假定播放/暂停按钮的简单表示

      this.drawProgress();
      this.drawPlayButton();
    }

    private drawProgress() {
      let offsetX = this.progressBar.x;
      const progress_wh=this.canvas.width-offsetX;

      let container_height=this.container_bar.height;

      const cur_progress_wh = (this.video.currentTime / this.video.duration) * progress_wh;
      const progressBarHeight = this.progressBar.height; // 进度条的高度
      const progressBarY=this.progressBar.y+ (container_height - progressBarHeight) / 2;


      this.handle= Object.assign(this.handle, { x: offsetX+cur_progress_wh, y: container_height / 2 });

      // 清除画布
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

      // 绘制进度条背景
      this.ctx.fillStyle = 'rgba(211, 211, 211, 0.5)';
      this.ctx.fillRect(offsetX, progressBarY, progress_wh, progressBarHeight);

      // 绘制进度
      this.ctx.fillStyle = 'lightblue';
      this.ctx.fillRect(offsetX, progressBarY, cur_progress_wh, progressBarHeight);

      // 绘制圆形句柄
      this.ctx.fillStyle = 'white';
      this.ctx.beginPath();
      this.ctx.arc(this.handle.x, this.handle.y, this.handle.radius, 0, Math.PI * 2);
      this.ctx.fill();
    }

    drawPlayButton() {
      let draw_play=() => {
        this.ctx.fillStyle = 'white';
        this.ctx.beginPath();
        this.ctx.moveTo(this.playPauseButton.x, this.playPauseButton.y);
        this.ctx.lineTo(this.playPauseButton.x + this.playPauseButton.width, this.playPauseButton.y + this.playPauseButton.height / 2);
        this.ctx.lineTo(this.playPauseButton.x, this.playPauseButton.y + this.playPauseButton.height);
        this.ctx.fill();
      };

      let draw_pause=() => {
        this.ctx.fillStyle = 'white';
        this.ctx.fillRect(this.playPauseButton.x, this.playPauseButton.y, this.playPauseButton.width / 3, this.playPauseButton.height);
        this.ctx.fillRect(this.playPauseButton.x + this.playPauseButton.width * 2 / 3, this.playPauseButton.y, this.playPauseButton.width / 3, this.playPauseButton.height);
      };

      if (this.isPlaying) {
        draw_pause();
      }else{
        debugger;
        draw_play();
      }
    }


    onMouseDown(event: MouseEvent) {
      const x = event.offsetX;
      const y = event.offsetY;


      // 檢查是否點擊在 圓形上
      const distance = Math.sqrt((x - this.handle.x) ** 2 + (y - this.handle.y) ** 2);
      if (distance < this.handle.radius) {
          this.dragging = true;
      }
  }

  onMouseMove(event: MouseEvent) {
      if (this.dragging) {
        let offsetX = this.progressBar.x;
          // Calculate the new time based on the mouse position
          const progress_wh=this.canvas.width-offsetX;
          const newTime = (event.offsetX / progress_wh) * this.video.duration;
          this.video.currentTime = Math.min(Math.max(newTime, 0), this.video.duration);
          this.drawProgress(); // Redraw the progress bar with the new handle position
      }
     }


     destroy() {

     }
  }


  export default VideoController;
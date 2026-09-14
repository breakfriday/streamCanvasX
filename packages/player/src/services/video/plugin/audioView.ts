// 音频 波形可视化 canvas 渲染
import PlayerService from '../../player';

class AudioView {
    playerService: PlayerService
    canvas_el: HTMLCanvasElement;
    resizeObserver: ResizeObserver;

    constructor() {

    }
    init(playerService: PlayerService) {
        let { contentEl } = this.playerService.config;
        this.playerService=playerService;
        this.canvas_el = document.createElement('canvas');
        this.canvas_el.style.position = 'absolute';
        contentEl.append(this.canvas_el);
        this.setCanvasSize();
    }

    event() {
        let { contentEl } = this.playerService.config;
                    // 监听 dom size 变化， 调整canvas 大小
      this.resizeObserver = new ResizeObserver(() => {
        setTimeout(() => {
           this.setCanvasSize();
          //  this.resizeControlPannel();
        }, 20);
      });

      this.resizeObserver.observe(contentEl);
    }

    setCanvasSize() {
        let height = 200;
        let width = 400;
        let { contentEl } = this.playerService.config;

        if (contentEl) {
          height = contentEl.clientHeight;
          width = contentEl.clientWidth;
        }

          this.canvas_el.width = width;
          this.canvas_el.height = height;
    }
    load() {


    }
    render() {

    }
    destroy() {
        this.canvas_el.remove();
    }
}

export default AudioView;
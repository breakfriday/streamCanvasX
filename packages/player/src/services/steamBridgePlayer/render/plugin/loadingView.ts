import PlayerService from '../../index';
class LoadingView {
    playerService: PlayerService;
    isLoading: boolean
    canvas_el: HTMLCanvasElement;
    canvas_context: CanvasRenderingContext2D;
    zIndex: string
    constructor() {

    }
    init(playerService: PlayerService) {
        this.playerService=playerService;
        this.zIndex='8';
    }
    set loading(value: any) {
        this.isLoading= value;
      }
    load() {
        this.isLoading=true;
        let { contentEl } = this.playerService.config;
        let canvas_el=document.createElement("canvas");
        this.canvas_el=canvas_el;
        this.canvas_el.setAttribute('name', 'loadingCanvas');
        this.canvas_context=canvas_el.getContext("2d");
        this.isLoading=true;
        this.setCanvasAttributes();
        contentEl.append(canvas_el);

        this.drawLoading();
    }
    setCanvasAttributes() {
        let { zIndex } = this;
        let { contentEl } = this.playerService.config;
        let width=contentEl.clientWidth;
        let height=contentEl.clientHeight;
        this.canvas_el.width=width;
        this.canvas_el.height=height;
        this.canvas_el.style.position="absolute";
        this.canvas_el.style.zIndex=zIndex;
        this.canvas_el.style.top="0px";
        this.canvas_el.style.left="0px";

        this.canvas_el.style.backgroundColor= 'rgba(0, 0, 0, 0.05)';
    }
    drawLoading() {
          let { isLoading } = this;
          let ctx = this.canvas_context;
          let { canvas_el } = this;
          let canvas = canvas_el;
          let timeId: any = null;

          // Define the circle radius and line width
          const radius = 50;
          const lineWidth = 10;

          // Initialize the start and end angles of the arc progress bar
          let startAngle = 0;
          let endAngle = 0;


          let drawAnimation = () => {
            // Define the center coordinates of the circle
            const centerX = canvas.width / 2;
            const centerY = canvas.height / 2;
            if (isLoading=== false) {
              clearTimeout(timeId);
              return false;
            }

            // Clear the canvas content to prepare for drawing a new frame
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Draw the background circle
            ctx.beginPath(); // Begin a new path
            ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI); // Draw a full circle
            ctx.lineWidth = lineWidth; // Set the line width
            ctx.strokeStyle = 'rgba(200, 200, 200, 0.5)'; // Set the line color
            ctx.stroke(); // Stroke the path

            // Draw the loading progress arc
            ctx.beginPath(); // Begin a new path
            ctx.arc(centerX, centerY, radius, startAngle * Math.PI, endAngle * Math.PI); // Draw an arc
            ctx.lineWidth = lineWidth; // Set the line width
            ctx.strokeStyle = 'rgba(50, 150, 255, 1)'; // Set the line color
            ctx.stroke(); // Stroke the path

            // Update the start and end angles of the arc progress bar for the next frame
            startAngle += 0.01;
            endAngle += 0.02;

            // When the angle reaches 2π, reset it to 0
            if (startAngle >= 2) {
              startAngle = 0;
            }

            if (endAngle >= 2) {
              endAngle = 0;
            }

            // Use the setTimeout function to recursively call drawLoading() to achieve animation effect
            timeId = setTimeout(drawAnimation, 1000 / 30); // Approximate 60 FPS
          };

          drawAnimation();
    }

    unload() {
      if(this.canvas_el) {
        this.isLoading=false;
        this.canvas_el.remove();
        this.canvas_context=null;
        this.canvas_el=null;
      }
    }
    destroy() {
        this.unload();
    }
}

export default LoadingView;
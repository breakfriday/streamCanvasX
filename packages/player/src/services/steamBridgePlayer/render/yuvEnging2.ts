import { injectable, inject } from 'inversify';
import PlayerService from '../index';
import * as twgl from 'twgl.js';

@injectable()
class YuvEngine {
  canvas: HTMLCanvasElement;
  gl: WebGL2RenderingContext;
  textures: {
    y: WebGLTexture;
    u: WebGLTexture;
    v: WebGLTexture;
  };
  programInfo: twgl.ProgramInfo;
  bufferInfo: twgl.BufferInfo;
  playerService: PlayerService;
  hasCreateTexture: boolean

  constructor() {
    this.textures = {
      y: null,
      u: null,
      v: null
    };
  }

  init(playerService: PlayerService) {
    this.playerService = playerService;
    this.initWebGL();
    this.setupShaders();

    this.setupBuffers();
  }

  initWebGL() {
    this.canvas = document.createElement('canvas');
    this.canvas.style.position = 'absolute';
    this.canvas.setAttribute('name', 'glcanvas');
    this.playerService.config.contentEl.append(this.canvas);
    this.gl = this.canvas.getContext('webgl2');

    if (!this.gl) {
      console.error('WebGL 2 is not supported by your browser.');
      return;
    }

    twgl.resizeCanvasToDisplaySize(this.canvas);
  }

  setupShaders() {
    const vs = `
      attribute vec4 position;
      varying vec2 texCoords;
      void main() {
        texCoords = position.xy * 0.5 + 0.5;
        gl_Position = position;
      }
    `;
    const fs = `
      precision mediump float;
      varying vec2 texCoords;
      uniform sampler2D yTexture;
      uniform sampler2D uTexture;
      uniform sampler2D vTexture;
      void main() {
        float y = texture2D(yTexture, texCoords).r;
        float u = texture2D(uTexture, texCoords).r - 0.5;
        float v = texture2D(vTexture, texCoords).r - 0.5;
        float r = y + 1.403 * v;
        float g = y - 0.344 * u - 0.714 * v;
        float b = y + 1.770 * u;
        gl_FragColor = vec4(r, g, b, 1.0);
      }
    `;
    this.programInfo = twgl.createProgramInfo(this.gl, [vs, fs]);
  }

  createTextures(width: number,height: number) {
    this.textures.y = twgl.createTexture(this.gl, { width: width, height: height, format: this.gl.LUMINANCE });
    this.textures.u = twgl.createTexture(this.gl, { width: width/2, height: height/2, format: this.gl.LUMINANCE });
    this.textures.v = twgl.createTexture(this.gl, { width: width/2, height: height/2, format: this.gl.LUMINANCE });
  }

  setupBuffers() {
    const arrays = {
      position: {
        numComponents: 2,
        data: [
          -1, -1, 1, -1, -1, 1,
          -1, 1, 1, -1, 1, 1
        ],
      },
    };
    this.bufferInfo = twgl.createBufferInfoFromArrays(this.gl, arrays);
  }

  update_yuv_texture(yuvFrame) {
    const { yData, uData, vData, width, height } = yuvFrame;
    if(this.hasCreateTexture) {
      twgl.setTextureFromElement(this.gl, this.textures.y, yData, { width, height });
      twgl.setTextureFromElement(this.gl, this.textures.u, uData, { width: width / 2, height: height / 2 });
      twgl.setTextureFromElement(this.gl, this.textures.v, vData, { width: width / 2, height: height / 2 });
      this.drawScene();
    }else{
      this.createTextures(width,height);
      this.hasCreateTexture=true;
    }
  }

  drawScene() {
    twgl.resizeCanvasToDisplaySize(this.canvas);
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);

    twgl.setBuffersAndAttributes(this.gl, this.programInfo, this.bufferInfo);
    twgl.setUniforms(this.programInfo, {
      yTexture: this.textures.y,
      uTexture: this.textures.u,
      vTexture: this.textures.v
    });
    twgl.drawBufferInfo(this.gl, this.bufferInfo);
  }

  destroy() {
    this.gl.deleteTexture(this.textures.y);
    this.gl.deleteTexture(this.textures.u);
    this.gl.deleteTexture(this.textures.v);
    this.gl.deleteProgram(this.programInfo.program);
    this.canvas.remove();
  }
}

export default YuvEngine;

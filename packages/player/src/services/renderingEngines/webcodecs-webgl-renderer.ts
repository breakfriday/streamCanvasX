import type {VideoFrameRenderer} from './webcodecs-renderer-types';

const vertexSource = `
attribute vec2 position;
varying vec2 uv;
void main() {
    gl_Position = vec4(position, 0.0, 1.0);
    uv = position * vec2(0.5, -0.5) + 0.5;
}`;
const fragmentSource = `
precision mediump float;
uniform sampler2D video;
varying vec2 uv;
void main() { gl_FragColor = texture2D(video, uv); }
`;

/** Upload VideoFrame directly; no Canvas2D staging or JS YUV conversion. */
export default class WebCodecsWebGLRenderer implements VideoFrameRenderer {
    readonly kind = 'webgl' as const;
    readonly canvas = document.createElement('canvas');
    private gl: WebGLRenderingContext;
    private program: WebGLProgram | null = null;
    private buffer: WebGLBuffer | null = null;
    private texture: WebGLTexture | null = null;
    private destroyed = false;
    private onLost = (event: Event): void => {
        event.preventDefault();
        if (!this.destroyed) this.onError(new Error('WebGL context lost; restart video playback'));
    };

    constructor(private onError: (error: Error) => void) {
        const gl = this.canvas.getContext('webgl', {alpha: false, antialias: false, depth: false, stencil: false});
        if (!gl) throw new Error('WebGL is unavailable');
        this.gl = gl;
        this.canvas.addEventListener('webglcontextlost', this.onLost);
        const shaders: WebGLShader[] = [];
        try {
            for (const [type, source] of [[gl.VERTEX_SHADER, vertexSource], [gl.FRAGMENT_SHADER, fragmentSource]] as const) {
                const shader = gl.createShader(type);
                if (!shader) throw new Error('Unable to create WebGL shader');
                shaders.push(shader);
                gl.shaderSource(shader, source);
                gl.compileShader(shader);
                if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) || 'WebGL shader compile failed');
            }
            this.program = gl.createProgram();
            this.buffer = gl.createBuffer();
            this.texture = gl.createTexture();
            if (!this.program || !this.buffer || !this.texture) throw new Error('Unable to allocate WebGL video resources');
            for (const shader of shaders) gl.attachShader(this.program, shader);
            gl.linkProgram(this.program);
            if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(this.program) || 'WebGL link failed');
            gl.useProgram(this.program);
            gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
            const position = gl.getAttribLocation(this.program, 'position');
            gl.enableVertexAttribArray(position);
            gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, this.texture);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.uniform1i(gl.getUniformLocation(this.program, 'video'), 0);
        } catch (error) {
            this.destroy();
            throw error;
        } finally {
            for (const shader of shaders) gl.deleteShader(shader);
        }
    }

    draw(frame: VideoFrame): void {
        if (this.destroyed) throw new Error('WebGL renderer is destroyed');
        const gl = this.gl;
        if (gl.isContextLost()) throw new Error('WebGL context lost');
        if (this.canvas.width !== frame.displayWidth) this.canvas.width = frame.displayWidth;
        if (this.canvas.height !== frame.displayHeight) this.canvas.height = frame.displayHeight;
        gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, frame);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    destroy(): void {
        if (this.destroyed) return;
        this.destroyed = true;
        this.canvas.removeEventListener('webglcontextlost', this.onLost);
        this.gl.deleteTexture(this.texture);
        this.gl.deleteBuffer(this.buffer);
        this.gl.deleteProgram(this.program);
        this.gl.getExtension('WEBGL_lose_context')?.loseContext();
        this.canvas.remove();
    }
}

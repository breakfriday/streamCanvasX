import WebMWriter from 'webm-writer';

class ImageDecoderService {
  private imageDecoderProcess: ImageDecoder;
   constructor() {
    console.log('--');
   }
   async createImageDecoder(imageByteStream: ImageBufferSource): Promise<ImageDecoder> {
  /*
  ImageDecoder 是一个Web API，它提供了更多对解码图像过程的控制。
  可以使用它将图像数据（如 ArrayBuffer 或 Blob）解码成可以绘制到 Canvas 上的格式。
  */
    const imageDecoder = new ImageDecoder({
        data: imageByteStream,
        type: 'image/gif',
    });


    await imageDecoder.tracks.ready;
    await imageDecoder.completed;

    this.imageDecoderProcess = imageDecoder;

    return imageDecoder;
    }

    /*

    除了使用 FileReader 的 readAsArrayBuffer 方法外，
    还可以使用 Blob.arrayBuffer() (File 对象就是一个 Blob 对象) 方法来获得一个 Promise，
    该 Promise 解析为表示 Blob 数据的 ArrayBuffer。

    */
    async blobToArrayBuffer(file: Blob) {
        const arraybuffer = await file.arrayBuffer();
        return arraybuffer;
    }

    async fetchImageByteStream(gifURL: string) {
        const response = await fetch(gifURL);
        return response.body!;
    }
    async decodeGifToWebM(imageDecoder: ImageDecoder) {
        const { frameCount } = imageDecoder.tracks.selectedTrack!;
        const { image: headFrame } = await imageDecoder.decode({ frameIndex: 0 });
        const frameDuration = headFrame.duration! / 1000;

        console.log('--输出帧日志--');
        console.log({ headFrame, frameCount, frameDuration });


        const canvas = document.createElement('canvas');
        // codedWidth ，codedHeight代表视频帧的编码高度和宽度，这是帧原始的像素维度。
        canvas.width = headFrame.codedWidth;
        canvas.height = headFrame.codedHeight;
        const canvasContext = canvas.getContext('2d')!;


        const videoWriter = new WebMWriter({
            quality: 1, // WebM image quality from 0.0 (worst) to 0.99999 (best), 1.00 (VP8L lossless) is not supported
            fileWriter: null, // FileWriter in order to stream to a file instead of buffering to memory (optional)
            fd: null, // Node.js file handle to write to instead of buffering to memory (optional)

            // You must supply one of:
            frameDuration, // Duration of frames in milliseconds
            frameRate: 1000 / frameDuration, // Number of frames per second

            transparent: true, // True if an alpha channel should be included in the video
            alphaQuality: 1, // Allows you to set the quality level of the alpha channel separately.
            // If not specified this defaults to the same value as `quality`.
        });

        const writeVideoFrame = async (frameIndex: number = 0) => {
            if (frameIndex >= frameCount) return;

            const result = await imageDecoder.decode({ frameIndex });
            canvasContext.clearRect(0, 0, canvas.width, canvas.height);
            canvasContext.drawImage(result.image, 0, 0);
            videoWriter.addFrame(canvas);

            await writeVideoFrame(frameIndex + 1);
        };

        await writeVideoFrame();

        const webMBlob: Blob = await videoWriter.complete();
        return URL.createObjectURL(webMBlob);
    }


    async getImageDataByByUrl(options: {
        imgUrl: string;
    }) {
        const { imgUrl } = options;
        const imageData = await this.fetchImageByteStream(imgUrl);
        return imageData;
    }

    async getImageDataByFile(file: Blob) {
        let data = this.blobToArrayBuffer(file);
        return data;
    }

    async decoderByData(data: ImageBufferSource) {
        const startTime = performance.now();
        const imageDecoder = await this.createImageDecoder(data);
    }


    async getFrameResultByFrameIndex(options: ImageDecodeOptions, imageDecoderPorocss: ImageDecoder): Promise<ImageDecodeResult> {
        let { frameIndex } = options;
        const result = await imageDecoderPorocss.decode({ frameIndex });
        return result;
    }

    async compose1(options: {
        imgUrl: string;
    }) {
        let imgData = await this.getImageDataByByUrl(options);
        const startTime = new Date();
        let imageDecoder = await this.createImageDecoder(imgData);
        const videoBlobURL = await this.decodeGifToWebM(imageDecoder);
        const endTime = new Date();
        const duration_time = (endTime.getTime() - startTime.getTime()) / 1000;

        console.log(`转码用时${duration_time} 秒`);
        return videoBlobURL;
    }

    async compose2(options: {
        imgUrl: string;
    }) {
        let imgData = await this.getImageDataByByUrl(options);
        const startTime = new Date();
        let imageDecoder = await this.createImageDecoder(imgData);

        let result = this.getFrameResultByFrameIndex({ frameIndex: 0 }, imageDecoder);
    }

    async renderCanvas(options: {
        imgUrl: string;
    }) {
        const { imgUrl } = options;
        const imageByteStream = await this.fetchImageByteStream(imgUrl);
        const imageDecoder = await this.createImageDecoder(imageByteStream);


        const { frameCount } = imageDecoder.tracks.selectedTrack!;
        const { image: headFrame } = await imageDecoder.decode({ frameIndex: 0 });
        const frameDuration = headFrame.duration! / 1000;
    }
}


export { ImageDecoderService };
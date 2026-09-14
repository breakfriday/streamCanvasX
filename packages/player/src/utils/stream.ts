
export class createRateLimitedReadableStream {
    stream: ReadableStream;
    controller: ReadableStreamDefaultController<any>;
    CHUNK_SIZE: number;
    residualBuffer: Uint8Array; // 用于存储溢出的数据
    delayTime: number;
    finish: boolean;
    constructor(parm?: { chunk_size: number }) {
        let $this = this;
        this.CHUNK_SIZE = 640;
        this.delayTime = 10;
        this.stream = new ReadableStream({
            start(controller) {
                $this.controller = controller;
            },
        });
        this.residualBuffer = new Uint8Array(0);
    }

    async equeneAll(data: Uint8Array) {
        let dataUint8 = data;
        this.controller.enqueue(dataUint8);
        this.controller.close();
    }

    async enqueue(chunk: Uint8Array) {
        let { controller, CHUNK_SIZE, residualBuffer, delayTime } = this;
        if (this.CHUNK_SIZE && this.CHUNK_SIZE > 0) {
            let dataToEnqueue = new Uint8Array([...residualBuffer, ...chunk]);

            while (dataToEnqueue.length > 0) {
                const currentChunk = dataToEnqueue.slice(0, CHUNK_SIZE);
                controller.enqueue(currentChunk);
                dataToEnqueue = dataToEnqueue.slice(CHUNK_SIZE);


                if (dataToEnqueue.length > 0) {
                    await new Promise(resolve => setTimeout(resolve, delayTime));
                }
            }
            residualBuffer = dataToEnqueue;
        } else {
            this.controller.enqueue(chunk);

            this.controller.close();
        }
    }

    close() {
        this.finish = true;
    }
}
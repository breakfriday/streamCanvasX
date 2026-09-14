
class Scheduler {
    private taskQueue: (() => Promise<any>)[] = []; // 任务队列
    private concurrentLimit: number;
    private runningTasks = 0; // 当前并发数

    constructor(concurrentLimit: number) {
        this.concurrentLimit = concurrentLimit;
    }

    addTask(task: () => Promise<any>) {
        console.log('ssssss  addtask');
        this.taskQueue.push(task); // 将任务添加到队列中
        this.runNextTask();
    }

    private runNextTask() {
        if (this.runningTasks < this.concurrentLimit && this.taskQueue.length > 0) {
            const task = this.taskQueue.shift();
            if (task) {
                this.runningTasks++;
                task().then((result) => {
                    this.runningTasks--;
                    if (result === 'clean') {
                        console.log(' Scheduler clearQueu ');
                        this.clearQueue();
                    } else {
                        this.runNextTask();
                    }
                });
            }
        }
    }
    getQueue() {
        return this.taskQueue;
    }

    clearQueue() {
        this.taskQueue = []; // 清空队列
    }

    addAudioTask(audio: HTMLAudioElement) {
        this.addTask(() => {
            return new Promise<void>((resolve) => {
                audio.onended = () => {
                    resolve();
                };
                audio.play();
            });
        });
    }
}

export default Scheduler;


// const scheduler = new Scheduler(3); // 设置并发限制为1

// scheduler.addTask(() => new Promise(resolve => setTimeout(resolve, 1000, 'Task 1 Completed')));

//scheduler.addAudioTask(audio)

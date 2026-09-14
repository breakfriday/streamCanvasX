import InstanceWorker from "./instance";

const instance =InstanceWorker.getInstance();

// // 监听来自主线程的消息
self.addEventListener('message', (event) => {
    // 更新数据或处理其他任务

    instance.onMessage(event);

    // postMessage(`Data updated to: ${instance.getData()}`);
});

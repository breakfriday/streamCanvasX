
// import { injectable, inject, Container, LazyServiceIdentifer } from 'inversify';
// // FLV文件的URL
// const url = 'http://example.com/path/to/video.flv';

// // 创建一个新的 AbortController 实例，以便稍后中断请求（如果需要）
// const controller = new AbortController();
// const { signal } = controller;

// // 发起带有中断信号的fetch请求
// fetch(url, { signal })
//   .then(response => response.blob()) // 将响应转换为Blob对象
//   .then(blob => {
//     // 创建指向该Blob对象的URL
//     const blobUrl = window.URL.createObjectURL(blob);
//     const a = document.createElement('a'); // 创建一个新的a元素
//     a.style.display = 'none'; // 确保新元素在页面上不可见
//     a.href = blobUrl; // 将新元素的href属性设置为Blob对象的URL
//     a.download = 'video.flv'; // 设置下载的文件名
//     document.body.appendChild(a); // 将新元素添加到DOM中
//     a.click(); // 模拟点击新元素以开始下载
//     // 确保在下载开始后清理我们创建的元素和URL
//     window.URL.revokeObjectURL(blobUrl);
//     document.body.removeChild(a);
//   })
//   .catch(error => {
//     if (error.name === 'AbortError') {
//       console.log('Fetch aborted');
//     } else {
//       console.error('An error occurred:', error);
//     }
//   });

// // 如果需要在某个时刻结束下载，可以调用以下代码
// // controller.abort();

// class downLoad
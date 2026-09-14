function captureShot(videoElement: HTMLVideoElement) {
    // 確保 video 元件已經載入並正在播放
    if (!videoElement || videoElement.readyState < 2) {
      console.error('Video element is not ready.');
      return;
    }

    // 創建一個 canvas 元件
    const canvas = document.createElement('canvas');
    // 設定 canvas 的寬高與 video 元件相同
    canvas.width = videoElement.videoWidth;
    canvas.height = videoElement.videoHeight;

    // 獲取 canvas 的 2D 繪圖上下文
    const context = canvas.getContext('2d');
    if (context) {
      // 將 video 畫面繪製到 canvas 上
      context.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
    } else {
      console.error('Failed to get 2D context from canvas.');
    }
    const imageUrl = canvas.toDataURL('image/png');

    return {
        imageUrl,width: canvas.width,height: canvas.height
    };
  }


export default captureShot;
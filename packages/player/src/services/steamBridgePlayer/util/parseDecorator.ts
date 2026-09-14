async function ParseYuvByFetch(url, frameWidth, frameHeight ,playerCount,fps) {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    const bytesPerFrame = frameWidth * frameHeight + 2 * (frameWidth / 2) * (frameHeight / 2);

   let players= createYuvPlayers(playerCount,frameWidth,frameHeight);

    let offset = 0;

    for (let player of players.values()) {
      if (player.yuvEngine) {
          player.yuvEngine.render();
      }
  }


    while (offset < arrayBuffer.byteLength) {
        const ySize = frameWidth * frameHeight;
        const uvSize = (frameWidth / 2) * (frameHeight / 2);

        // 创建 Uint8Array 视图用于分别访问 Y, U, V 数据
        const yData = new Uint8Array(arrayBuffer, offset, ySize);
        offset += ySize;

        const uData = new Uint8Array(arrayBuffer, offset, uvSize);
        offset += uvSize;

        const vData = new Uint8Array(arrayBuffer, offset, uvSize);
        offset += uvSize;

        // 使用获取的 Y, U, V 数据渲染一帧

        let yuvData={
          yData,uData,vData
        };
        console.info(yuvData);

        for (let player of players.values()) {
          if (player.yuvEngine) {
              player.yuvEngine.update_yuv_texture({ yData,uData,vData,width: frameWidth,height: frameHeight });
          }
      }


        // 等待下一帧（这里需要根据实际帧率进行调整）
        await new Promise(resolve => setTimeout(resolve, 1000 /fps)); // 假设视频是 30 FPS
    }
  }

  export default ParseYuvByFetch;
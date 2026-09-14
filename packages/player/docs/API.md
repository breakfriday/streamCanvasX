---
title: API
sidebar_label: API
sidebar_position: 4
---

<!-- ##  CanvasVideoService()
`CanvasVideoService()`中的旋转翻转方法
| 方法                         | 参数            | 描述                                     |
| ---------------------------- | ---------------| ---------------------------------------- |
| `drawTrasform() `            | degree :number | 画面沿着与水平轴夹角degree的直线进行翻转   |
| `drawVerticalMirror()`       | 无             | 画面进行垂直镜像变化                      |
| `drawHorizontalMirror()`     | 无             | 画面进行水平镜像变化                      |
| `transformReset() `          | 无             | 重置画面的镜像以及翻转变化                 |
| `drawRotate()`               | degree :number | 画面顺时针旋转degree                      |
| `rotateReset()`              | 无             | 重置画面的旋转变化                        | -->

## 初始化
```typescript
import { createPlayerServiceInstance } from '@break_happy/streamcanvasx';
let config = {
      url,
      contentEl: containerRef.current!,
      showAudio, // 是否展示音頻可視化
      hasAudio,// 是否解析放音頻
      hasVideo,// 是否解析視頻
      errorUrl: data_img, 
      useOffScreen, //非必填
      audioDraw: audioDrawType, //非必填
      fftsize,//非必填
      updataBufferPerSecond,//非必填
      renderPerSecond,//非必填
      bufferSize,//非必填
      degree,//非必填
      streamType,//"PCM", "MP4", "FLV" ,"MpegTs"，"WEBRTC" ，"AAC"
      isLive,
      fileData,
      crypto: enable_crypto === '1' ? {
        key: key_v,
        enable: true,
        wasmModulePath: '',
        useWasm: true,
      } : null,
      hasControl: boolen ; // 是否开启控制面板， 只在离线播放下生效
    };

    let player = createPlayerServiceInstance(config);

```

## 镜面反转
```typescript
   let play = streamPlayer.current;
   let  degree=90
  play.canvasVideoService.drawTrasform(degree);
```
##  角度旋转
```typescript
   let play = streamPlayer.current;
    let degree=30
        
   play.canvasVideoService.drawRotate(degree);
```
## 切换原始比例播放 
```typescript
   let play = streamPlayer.current;

        
   play.canvasVideoService.setCover(true)  //cover:true,   origin:false
```
## 设置音频增益  （1 是倍数 ， 2倍增益就是2  ，默认是1  ）
```typescript
player.audioProcessingService.setGain(1);
```
## AAC 加解密
```typescript
   let config = { url, // 数据源 url
        showAudio, // 开启音频可视化， false
        hasVideo, // 忽略 ，false
        hasAudio, // true  ， 有音频
        contentEl: containerRef.current!,  //div 容器
        streamType: 'AAC',  // 流类型 flv ,mp4 ,acc ..       
        fileData,  // 数据源 file 对象， 默认优先使用 file 对象
        crypto: {
          key: key_v,  // 解密key 默认  ideteck_chenxuejian_test
          enable: true, // 开启解密
          wasmModulePath: '', // 解密文件位置
          useWasm: true, // 是否使用wasm 解密， 是 目前只支持wasm 解密
        } : null,
        };


      const player = createPlayerServiceInstance(config);


      player.createBetaPlayer();
```
```typescript
      let auduo1 = { fftsize: 128, updataBufferPerSecond: 15, renderPerSecond: 15, audioDrawType: '1', bufferSize: 0.2 };
      let config = { url,
        showAudio,
        hasVideo,
        hasAudio,
        contentEl: containerRef.current!,
        streamType: 'AAC',
        audioPlayback: {
          method: playMethod, // 'MSE' 或 'AudioContext'
        },
        fileData,
        crypto: enable_crypto === '1' ? {
          key: key_v,
          enable: true,
          wasmModulePath: '',
          useWasm: true,
        } : null,
      };

       config = Object.assign(config, auduo1);

      const player = createPlayerServiceInstance(config);


      player.createBetaPlayer();
```
## 水印
###  显水印
```typescript
  play.canvasVideoService.drawWatermark({ value: '水印' });
```
![image.png](https://cdn.nlark.com/yuque/0/2023/png/22204442/1703570329567-158177a4-69b5-4615-9d05-ea81ba760bff.png#averageHue=%23638271&clientId=u892de5eb-e88b-4&from=paste&height=331&id=uf6c07931&originHeight=536&originWidth=861&originalType=binary&ratio=1&rotation=0&showTitle=false&size=574195&status=done&style=none&taskId=u6e2cb5d3-1fc5-46e0-b3b3-4f20064c1ae&title=&width=531)
## 事件
```typescript
    player.on('mediaInfo', (data:{hasAudio:boolean,hasVideo:boolean}) => {
      let { hasAudio ,hasVideo } = data;
    
    });
```
```typescript
   player.on('otherInfo', (data) => {
      let { speed } = data;
    });

    player.on('loadingComplete', (data) => {
       // 加載完成
        
    });
```
## 微模块能力
  **安全降級**： 在不能访问互联网环境阿里云oss訪問失敗，createPlayerServicePromise 会自动降级使用本地包中的播放器版本。
 ** 场景**： 灵活通过接口控制 各应用&环境的播放器版本， 与业务应用解耦独立更新发布，降低安全变更风险更安全的实现快速灵活迭代。 集中管理播放器在各应用平台环境的版本
###    微模块初始化
```rust
import { createPlayerServicePromise } from '@break_happy/streamcanvasx';

const createPlayer = async () => {
    let player = await createPlayerServicePromise({ url, contentEl: containerRef.current!, streamType: 'flv' });


    player.createFlvPlayer({});
  };
```
###  配置投放数据的结构设计（定义 资源， 规则，数据的关系）

```json
{


    "data":[
        {"id":0,"version":"0.1.79","desc":"default 環境 ，沒有規則命中"},
        {"id":1,"version":"0.1.79","desc":"pcweb 开发环境"},
        {"id":2,"version":"0.1.78","desc":"pcweb  测试环境"},
        {"id":3,"version":"0.1.78","desc":"pcweb  演示环境"},
        {"id":4,"version":"0.1.79","desc":"IOT 测试环境"},
        {"id":5,"version":"0.1.78","desc":"IOT 演示环境"}
    ],
    "resources": [
        {
            "version":"0.1.78",
             "data":[
                "//breakhappy.oss-cn-beijing.aliyuncs.com/streamcanvasx/0.1.78/index.esm.es5.production.js",
                "//breakhappy.oss-cn-beijing.aliyuncs.com/streamcanvasx/0.1.78/index.esm.es5.production.js"
            ]},
            {
                "version":"0.1.79",
                 "data":[
                    "//breakhappy.oss-cn-beijing.aliyuncs.com/streamcanvasx/0.1.79/vendor.esm.es5.production.js",
                    "//breakhappy.oss-cn-beijing.aliyuncs.com/streamcanvasx/0.1.79/index.esm.es5.production.js"
                ]}
    ],

    "rules":[
        {
            "rulesId":1 , "dataId":1,"desc":"pcweb 开发环境","conditions": [{
                "type": "and", 
                "condition": {
                    "name":"domain","options": ["http://192.168.100.26:8011","http://192.168.100.26:8011/*"]
                }}] 
        },
        {
            "rulesId":2 , "dataId":2,"desc":"pcweb  测试环境","conditions":[{
                "type": "and",
                 "condition": {"name":"domain","options": ["http://192.168.100.66:42091","http://192.168.100.66:42091/*"]}}] 
        },
        {
            "rulesId":3 , "dataId":3,"desc":"pcweb  演示环境","conditions":[{
                "type": "and",
                 "condition": {"name":"domain","options": ["http://120.26.38.129:42091/*","http://47.98.145.160:42091/*"]}}] 
        },
        {
            "rulesId":4 ,"dataId":4,"desc":"IOT 测试环境","conditions":[{
                "type": "and", 
                "condition": {"name":"domain","options": ["http://192.168.100.120:8080/*","http://192.168.100.120:8080","https://192.168.100.120:8080/*"]}}] 
        },
        {
            "rulesId":5 ,"dataId":5,"desc":"IOT 演示环境","conditions":[{
                "type": "and", 
                "condition": {"name":"domain","options": ["http://36.7.159.51:28082/*"]}}] 
        }
    ]


}
```
## 32路海量波形 可视化
```typescript
  waveVisualization = createWaveVisualizationInstance({ routes: routes, contentEl: containerRef.current,
                                                             renderType: 3, isMocking: false, arrayLength: length, 
                                                             updateArrayTimes: 1, converLiveData: true, fftSize: 1024 }, 
                                                            {});

 waveVisualization?.WavePlayerService.waveGl.render();

   waveVisualization?.WavePlayerService.update(updatearray);

```

## demo:
[https://breakfriday.github.io/StreamCanvasX/customerPlayers](https://breakfriday.github.io/StreamCanvasX/customerPlayers)
chrome:    
```typescript
 --args --disable-web-security --user-data-dir="C:/ChromeDevSession" --allow-running-insecure-content
```
edge:
```typescript
 --args --disable-web-security --user-data-dir="C:/edgeDevSession" --allow-running-insecure-content
```

url：[http://192.168.100.66:42221/rtp/525ED13A.live.flv](http://192.168.100.66:42221/rtp/525ED13A.live.flv)

```typescript
isHEVCSupported = MediaSource.isTypeSupported('video/mp4; codecs="hvc1.1.1.L150.B0 "'); 
```
## [性能報告](https://www.yuque.com/luoxuan-nir7u/rmkurm/ix33qs65xn4kcasp)

## 支持webrtc拉流
```typescript
import { createPlayerServicePromise } from '@break_happy/streamcanvasx';

const createPlayer = async () => {
    let player = await createPlayerServicePromise({ url, contentEl: containerRef.current!, streamType: 'WEBRTC' });


    player.createPlayer({});
  };
```

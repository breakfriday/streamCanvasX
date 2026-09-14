import PlayerService from '../player';
class RTCStreamAdaptor {
  public peer: RTCPeerConnection;
  private resource: string;
  private eTag: string | undefined = undefined;
  private extensions: string[];
  private resourceResolve: (resource: string) => void;

  private mediaMids: Array<string> = [];

  private iceGatheringTimeout: any;
  private waitingForCandidates: boolean = false;
  private role?: string;
  private timeId: NodeJS.Timeout;
  playerService: PlayerService;
    constructor(parm: { role: string }, player?: PlayerService) {
        let { role } = parm;
        this.role = role;
        if (player) {
          this.playerService = player;
        }
        this.init();
    }


    init() {
        this.peer = new RTCPeerConnection();
        if (this.role === 'sender') {


        } else if (this.role === 'receiver') {
            this.peer.addTransceiver('audio');
            this.peer.addTransceiver('video');
        }

        this.event();
    }


    event() {
        let pc = this.peer;
        pc.onicecandidate = (event) => {
          console.log(`ICE candidate:\n${event.candidate ? event.candidate.candidate : '(null)'}`);
        };
        pc.onconnectionstatechange = (event) => {
          console.log('pc.connectionState', pc.connectionState);
          switch (pc.connectionState) {
            case 'connected':
              // The connection has become fully connected
              break;
            case 'disconnected':
                        this.peer.close();
            case 'failed':
                        this.peer.close();
              // One or more transports has terminated unexpectedly or in an error
              break;
            case 'closed':
                        this.peer.close();
              // The connection has been closed
              break;
          }
        };

       this.getReceiverStatsJSON();
    }

    addTrack(stream: MediaStream) {
        for (const track of stream.getTracks()) {
            // You could add simulcast too here
            this.peer.addTrack(track);
        }
    }

    getReceiverStatsJSON() {
      let lastTime = 0;
      let lastBytes = 0;
      let pc = this.peer;
      let $this = this;


      function calculateAudioBitrate() {
          pc.getStats(null).then(stats => {
              stats.forEach(report => {
                  if (report.type === 'inbound-rtp' && !report.isRemote && report.mediaType === 'video') {
                     console.info(report);
                      const currentTime = report.timestamp;
                      const currentBytes = report.bytesReceived;

                      if (lastTime) {
                          // 计算时间差，单位转换为秒
                          const timeDiff = (currentTime - lastTime) / 1000; // 毫秒转换为秒
                          if (timeDiff > 0) {
                              const bytesDiff = currentBytes - lastBytes;
                              const bytesPerSecond = bytesDiff / timeDiff;
                              const kbps = (bytesPerSecond * 8) / 1000; // 字节转换为比特，再转换为千比特

                              const kBps = (bytesPerSecond) / 1024; // 1kB=1024 bytes

                              console.log(`当前网速：${kBps} kBps`);
                             $this.playerService.emitOtherInfo({ speed: kBps });
                          }
                      }

                      lastTime = currentTime;
                      lastBytes = currentBytes;
                  }
              });
          });
      }
              this.timeId = setInterval(calculateAudioBitrate, 1000);
          }

    replaceTrack(stream: MediaStream) {
         // getSenders方法返回一个RTCRtpSender[]，其中包含了RTCPeerConnection目前正在发送的所有轨道的发送器对象
        const senders = this.peer.getSenders();


        stream.getTracks().forEach(track => {
          const sender = senders.find(s => s.track?.kind === track.kind);
          if (sender) {
            // 重新设置轨道
            sender.replaceTrack(track);
          } else {
            // 如果找不到对应的sender，可能是新的轨道类型，需要添加
            this.peer.addTrack(track, stream);
          }
        });
    }
    pauseAllTracks(): void {
        const senders = this.peer.getSenders();
        senders.forEach(sender => {
          // 将当前轨道替换为null，暂时停止发送
          sender.replaceTrack(null);
        });
      }

    async connect(parm: {url: string}) {
        let pc = this.peer;

        let { url = '' } = parm;

        const offerOptions = {
          offerToReceiveAudio: true,
          offerToReceiveVideo: false,
        };

		const offer = await pc.createOffer(offerOptions);


    // const headers = {
		// 	'Content-Type': 'application/sdp',
		// };

    // const headers = {
		// 	'Content-Type': 'application/json',
		// };
    let headers = new Headers();
        const fetched = await fetch(url, {
          method: 'POST',
          body: offer.sdp,
          headers,
		  });

      const contentType = fetched.headers.get('Content-Type');
      let answer = '';
      if (contentType.includes('application/json')) {
          answer = await fetched.json();
          answer = answer.sdp;
      } else {
        answer = await fetched.text();
      }


        /// / Get the SDP answer
        //  const answer = await fetched.text();

        //  let answer = await fetched.json();
        //  answer = answer.sdp;

        await pc.setLocalDescription(offer);


        await pc.setRemoteDescription({ type: 'answer', sdp: answer });
        // debugger
    }

    async publish(parm: {url: string}) {
        this.connect(parm);
    }

    async runWhep(parm: {url: string}) {
      this.connect(parm);
    }

    close() {
        this.peer.close();
        this.peer = null;
       clearTimeout(this.timeId);
    }
}

export default RTCStreamAdaptor;
import { createPlayerServiceInstance } from '@break_happy/streamcanvasx';

const root = document.querySelector<HTMLElement>('#player-root');
const urlInput = document.querySelector<HTMLInputElement>('#stream-url');
const status = document.querySelector<HTMLElement>('#status');
const createButton = document.querySelector<HTMLButtonElement>('#create-player');
const destroyButton = document.querySelector<HTMLButtonElement>('#destroy-player');

if (!root || !urlInput || !status || !createButton || !destroyButton) {
  throw new Error('Playground DOM is incomplete.');
}

let player: ReturnType<typeof createPlayerServiceInstance> | undefined;

createButton.addEventListener('click', () => {
  if (!urlInput.value) {
    status.textContent = '请先输入一个 FLV URL。';
    return;
  }

  player?.destroy?.();
  root.replaceChildren();
  player = createPlayerServiceInstance({
    url: urlInput.value,
    contentEl: root,
    hasAudio: true,
    hasVideo: true,
  });
  player.createPlayer({});
  status.textContent = '播放器已开始加载；请在控制台查看网络或解码错误。';
});

destroyButton.addEventListener('click', () => {
  player?.destroy?.();
  player = undefined;
  root.replaceChildren();
  status.textContent = '播放器已销毁。';
});

function getRandomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function generatePCMData(target: any, key: string) {
    // 一次性生成 5000 点 PCM 数据
    target[key] = Array.from({ length: 5000 }, () => getRandomInt(-32768, 32767));
}

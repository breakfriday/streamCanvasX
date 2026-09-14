
// 假设当前模块的URL是 http://example.com/path/to/my/module.js

// export function addScript(scriptName: string) {
//     // 获取当前模块的base URL
//     // const baseURL = new URL('.', import.meta.url).href;
//     // const baseURL = new URL(import.meta.url).href;

//     // 创建一个新的script标签
//     const script = document.createElement('script');
//     script.type = 'module';


//     // debugger;
//     // 设置script的src属性
//     script.src = `${baseURL}${scriptName}`;

//     // 将script添加到页面中
//     document.head.appendChild(script);
// }

// 使用方法
// 这将会加载 http://example.com/path/to/my/anotherModule.js
// addScript('anotherModule.js');


// export function addScript2(scriptName: string) {
//     // 获取当前模块的base URL
//     const baseURL = '/';
//     // 创建一个新的script标签
//     const script = document.createElement('script');
//     // 设置script的src属性
//     script.src = `${baseURL}${scriptName}`;

//     // 将script添加到页面中
//     document.head.appendChild(script);
// }

export function addScript2(scriptName: string): Promise<void> {
    return new Promise((resolve, reject) => {
        // 获取当前模块的base URL
        const baseURL = '/';

        // 创建一个新的script标签
        const script = document.createElement('script');

        // 当script成功加载时
        script.onload = () => {
            resolve();
        };

        // 当script加载失败时
        script.onerror = (errorEvent) => {
            reject(new Error(`Failed to load the script: ${scriptName}`));
        };

        // 设置script的src属性
        script.src = `${baseURL}${scriptName}`;

        // 将script添加到页面中
        document.head.appendChild(script);
    });
}
export async function loadWASM(jsPath: string, exportName: string) {
    await addScript2(jsPath);
    const factory = (globalThis as Record<string, unknown>)[exportName];
    if (typeof factory !== 'function') {
        throw new Error(`WASM factory is not available on globalThis: ${exportName}`);
    }
    return await (factory as () => unknown | Promise<unknown>)();
  }

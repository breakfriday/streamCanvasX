import DBManager from './service/dbservice';


class LogMonitor {
    dbManager: DBManager;
    private _dbCreatedPromise: Promise<void>;
    private _dbCreatedNotify: () => void;

    constructor() {
        this.dbManager = new DBManager("canvasStreamPlayer", 1);
        // 直接在构造函数中初始化 Promise 和它的解析方法
        this._dbCreatedPromise = new Promise<void>((resolve) => {
            this._dbCreatedNotify = resolve;
        });
        this.init();
    }

    async init() {
        await this.dbManager.createDB();
        this._dbCreatedNotify();
    }

    async log(data: { flvUrl: string; status?: string; message?: string; statusDesc?: string }) {
        await this._dbCreatedPromise; // 直接使用 _dbCreatedPromise 而不是通过一个方法
        let time = new Date().getTime();
        let page = location.href;

        let logData = Object.assign({}, data, { time, page });
        this.dbManager.addData(logData);
    }
}


export default LogMonitor;
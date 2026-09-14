
import { injectable, inject, Container, LazyServiceIdentifer } from 'inversify';
import logConfig from '../constant/logConfig';

@injectable()
 class DebugLog {
    logConfig: any;
    constructor() {
        window.logConfig = logConfig;
        this.logConfig = window.logConfig;
    }
    log(data: {title: string; info: string; logkey: string}) {
        let { title, info, logkey } = data;
        if (this.logConfig[logkey]) {
            console.log(`${title}: `, info);
        } else {
            return false;
        }
    }
    info(data: {title: string; info: object; logkey: string}) {
        let { title, info, logkey } = data;
        if (this.logConfig[logkey]) {
            console.info(`${title}:`, info);
        } else {
            return false;
        }
    }
}


export default DebugLog;
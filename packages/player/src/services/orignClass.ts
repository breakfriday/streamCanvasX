import { injectable, inject, Container } from 'inversify';
import { ServiceA } from './ServiceA';
import { TYPES } from '../serviceFactories/symbol';

@injectable()
export class OriginSerivce {
  logger: ServiceA;

  constructor(
   @inject(TYPES.IServiceA) logger: ServiceA,
   params,

   ) {
    this.logger = logger;
  }

  doSomething(): void {
    this.logger.logMessage('asdfasdf');
  }
}

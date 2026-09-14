import { injectable } from 'inversify';

@injectable()
export class ServiceA {
  logMessage(message: string) {
    alert(message);
  }
}

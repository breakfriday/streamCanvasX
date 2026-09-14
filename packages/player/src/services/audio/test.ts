const showSecretSymbol = Symbol('showSecretSymbol');

const readRawData = Symbol('readRawData');

class MyClass {
    private secretValue: string = 'Secret Value';


    constructor() {
        this[showSecretSymbol]();
    }

    [showSecretSymbol]() {
        console.log(this.secretValue);
    }
    [readRawData]() {
        console.log(this.secretValue);
  }
}

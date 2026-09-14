import MediaView from '../mediaView';
function RotateDecorator(target: any, propertyName: string, descriptor: PropertyDescriptor): PropertyDescriptor {
    const originalMethod = descriptor.value;

    descriptor.value = function (this: MediaView, degree: number, ...args: any[]) { // 确保degree作为参数
        let ctx = this.canvas_context;
        // 你的自定义逻辑
        let canvas = this.canvas_el;
        degree = degree ? Number(degree) : 0;
        this.transformCount = this.transformCount ?? 0;
        this.rotateDegreeSum = this.rotateDegreeSum ?? 0;
        this.rotateDegreeSum = (this.rotateDegreeSum + degree) % 360;
        degree = this.transformCount == 0 ? degree : -degree; // 消除翻转影响
        let deg = Math.PI / 180; // 角度转化为弧度
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
         ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.transform(1, 0, 0, 1, centerX, centerY);
        ctx.transform(Math.cos(deg * degree), Math.sin(deg * degree), -Math.sin(deg * degree), Math.cos(deg * degree), 0, 0);
        ctx.transform(1, 0, 0, 1, -centerX, -centerY);

        // 原始方法可能不需要被调用，取决于你是否想扩展或完全替代原方法的行为
        // 如果你还想保留原始方法的行为，那么可以这样调用它：
        // originalMethod.apply(this, [degree, ...args]);
    };

    return descriptor;
}

function RotateResetDecrator(target: any, propertyName: string, descriptor: PropertyDescriptor): PropertyDescriptor {
    const originalMethod = descriptor.value;

    descriptor.value = function (this: MediaView, ...args: any[]) {
        let ctx = this.canvas_context;
        // let { canvas_el } = this;
        // let canvas = canvas_el;
        // let degree = (360 - this.rotateDegreeSum);
        // degree = this.transformCount == 0 ? degree : -degree;
        // let deg = Math.PI / 180;// 角度转化为弧度
        // const centerX = canvas.width / 2;
        // const centerY = canvas.height / 2;
        // this.canvas_context.clearRect(0, 0, canvas.width, canvas.height);
        // ctx.translate(centerX, centerY);
        // ctx.transform(Math.cos(deg * degree), Math.sin(deg * degree), -Math.sin(deg * degree), Math.cos(deg * degree), 0, 0);
        // ctx.translate(-centerX, -centerY);
        // this.rotateDegreeSum = 0;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
    };
    return descriptor;
}


function TrasformDecractor(target: any, propertyName: string, descriptor: PropertyDescriptor): PropertyDescriptor {
    descriptor.value = function (this: MediaView, degree: number, ...args: any[]) {
        this.transformCount = this.transformCount ? this.transformCount : 0;
        this.transformCount = (this.transformCount + 1) % 2;
        // console.log(this.transformCount);
        this.transformDegreeSum = this.transformDegreeSum ? this.transformDegreeSum : 0;
        degree = degree ? Number(degree) : 0;
        this.transformDegreeSum = (this.transformDegreeSum + degree) % 180;
        // 和初版实现相似   translate()scale()rotate()和transform()应该类似
        // 那么翻转后再调用旋转操作时旋转方向改变的问题 应无法通过改变翻转方式来解决
        let ctx = this.canvas_context;
        // ctx.restore(); // restore(),save()重置画布  添加之后可在render中直接调用drawTrasform()
        // ctx.save();
        let { canvas_el } = this;
        let canvas = canvas_el;
        let deg = Math.PI / 180; // 角度转化为弧度
        degree = this.transformCount == 0 ? -2 * degree : 2 * degree;
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        this.canvas_context.clearRect(0, 0, canvas.width, canvas.height);
        ctx.translate(centerX, centerY);
        ctx.transform(Math.cos(deg * degree), Math.sin(deg * degree), -Math.sin(deg * degree), Math.cos(deg * degree), 0, 0);
        ctx.translate(-centerX, -centerY);
        ctx.transform(1, 0, 0, -1, 0, canvas.height);
    };
    return descriptor;
}

function TrasforResetmDecractor(target: any, propertyName: string, descriptor: PropertyDescriptor): PropertyDescriptor {
    descriptor.value = function (this: MediaView, ...args: any[]) {
        let ctx = this.canvas_context;
        let { canvas_el } = this;
        let canvas = canvas_el;
        let degree = (180 - this.transformDegreeSum);
        let deg = Math.PI / 180;
        if (this.transformCount) {
          ctx.transform(1, 0, 0, -1, 0, canvas.height);
        }
        // degree = this.transformCount == 0 ? 2 * degree : -2 * degree;
        degree = 2 * degree;
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        this.canvas_context.clearRect(0, 0, canvas.width, canvas.height);
        ctx.translate(centerX, centerY);
        ctx.transform(Math.cos(deg * degree), Math.sin(deg * degree), -Math.sin(deg * degree), Math.cos(deg * degree), 0, 0);
        ctx.translate(-centerX, -centerY);
        this.transformDegreeSum = 0;
        this.transformCount = 0;
    };
    return descriptor;
}

function VerticalMirrorDecrator(target: any, propertyName: string, descriptor: PropertyDescriptor): PropertyDescriptor {
    descriptor.value = function (this: MediaView, ...args: any[]) {
        let degree = this.rotateDegreeSum ? this.rotateDegreeSum : 0;
        this.drawTrasform(0 - degree);
        this.transformDegreeSum = (this.transformDegreeSum + 2 * degree) % 180;
    };
    return descriptor;
}

function HorizontalMirrorDecrator(target: any, propertyName: string, descriptor: PropertyDescriptor): PropertyDescriptor {
    descriptor.value = function (this: MediaView, ...args: any[]) {
        let degree = this.rotateDegreeSum ? this.rotateDegreeSum : 0;
        this.drawTrasform(90 - degree);
        this.transformDegreeSum = (this.transformDegreeSum + 2 * degree) % 180;
    };
    return descriptor;
}

function setBrightness(target: any, propertyName: string, descriptor: PropertyDescriptor): PropertyDescriptor {
    descriptor.value = function (this: MediaView, brightness: number, ...args: any[]) {
        this.brightness = brightness ? Number(brightness) : 0;
        console.log('亮度设置值 calue', this.brightness);
    };
    return descriptor;
}

function setContrast(target: any, propertyName: string, descriptor: PropertyDescriptor): PropertyDescriptor {
    descriptor.value = function (this: MediaView, contrast: number, ...args: any[]) {
        this.contrast = contrast ? Number(contrast) : 0;
        console.log('对比度设置值 calue', this.contrast);
    };
    return descriptor;
}

export { RotateDecorator, RotateResetDecrator, TrasformDecractor, TrasforResetmDecractor, VerticalMirrorDecrator,
    HorizontalMirrorDecrator,
    setBrightness, setContrast };
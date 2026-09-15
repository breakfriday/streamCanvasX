import { injectable } from 'inversify';

type EventName = string | symbol;
// Event payloads and callback contexts vary across the existing player APIs.
type EventCallback = ((this: any, ...args: any[]) => void) & {
    /** Original callback for removing a once listener before it runs. */
    _?: EventCallback;
};

interface Listener {
    fn: EventCallback;
    ctx?: unknown;
}

@injectable()
class Emitter {
    private e?: Partial<Record<EventName, Listener[]>>;

    on(name: EventName, fn: EventCallback, ctx?: unknown): this {
        const e = this.e || (this.e = {});
        (e[name] || (e[name] = [])).push({ fn, ctx });
        return this;
    }

    once(name: EventName, fn: EventCallback, ctx?: unknown): this {
        const self = this;

        function listener(...args: any[]): void {
            self.off(name, listener);
            fn.apply(ctx, args);
        }

        listener._ = fn;
        return this.on(name, listener, ctx);
    }

    emit(name: EventName, ...data: any[]): this {
        const evtArr = ((this.e || (this.e = {}))[name] || []).slice();
        for (let i = 0; i < evtArr.length; i += 1) {
            evtArr[i].fn.apply(evtArr[i].ctx, data);
        }
        return this;
    }

    off(name?: EventName, callback?: EventCallback): this | undefined {
        const e = this.e || (this.e = {});

        if (!name) {
            Object.keys(e).forEach((key) => {
                delete e[key];
            });
            delete this.e;
            return undefined;
        }

        const evts = e[name];
        const liveEvents: Listener[] = [];
        if (evts && callback) {
            for (let i = 0, len = evts.length; i < len; i += 1) {
                if (evts[i].fn !== callback && evts[i].fn._ !== callback) liveEvents.push(evts[i]);
            }
        }
        if (liveEvents.length) {
            e[name] = liveEvents;
        } else {
            delete e[name];
        }
        return this;
    }
}

export default Emitter;

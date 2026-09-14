
type IndexDefinition = {
    keyPath: string;
    autoIncrement?: boolean;
    indexes?: {
        name: string;
        keyPath: string | string[];
        options?: IDBIndexParameters;
    }[];
};

class DbService {
    private dbName: string;
    private dbVersion: number;
    private db: IDBDatabase | null = null;

    constructor(dbName: string, dbVersion: number) {
        this.dbName = dbName;
        this.dbVersion = dbVersion;
    }

    public createDB(): Promise<void> {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBRequest).result as IDBDatabase;
                // db.createObjectStore("player", { keyPath: "id", autoIncrement: true });

                // this.createStore({ storeName: "player" });
                this.db=db;
                this.createStore({ storeName: "player" });
            };

            request.onsuccess = (event) => {
                this.db = (event.target as IDBRequest).result as IDBDatabase;
                // create/open database success

                resolve();
            };

            request.onerror = () => {
                reject(new Error("Failed to create/open database 数据库打开报错"));
            };
        });
    }

    createStore(opt: { storeName: string }) {
        let { storeName } = opt;
       let store=this.db.createObjectStore(storeName, { keyPath: "id", autoIncrement: true });
       store.createIndex('flvUrlIndex', 'flvUrl', { unique: false });
    }


    addData(data: any): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error("Database is not connected"));
                return;
            }

            const transaction = this.db.transaction("player", "readwrite");
            const store = transaction.objectStore("player");
            const request = store.add(data);

            request.onsuccess = () => {
                resolve();
            };

            request.onerror = () => {
                reject(new Error("Failed to add data"));
            };
        });
    }

    public connectDB(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (this.db) {
                resolve();
            } else {
                const request = indexedDB.open(this.dbName, this.dbVersion);
                request.onsuccess = (event) => {
                    this.db = (event.target as IDBRequest).result as IDBDatabase;
                    resolve();
                };

                request.onerror = () => {
                    reject(new Error("Failed to connect to database"));
                };
            }
        });
    }
  }


  export default DbService;
export interface Records { primary?: string; backup?: string; pending?: string }
export interface AtomicStore { transaction<T>(operation: (records: Records) => { records: Records; value: T }): Promise<T> }
export class MemoryStore implements AtomicStore {
  records: Records = {}; failNext = false; private queue: Promise<unknown> = Promise.resolve();
  transaction<T>(operation: (records: Records) => { records: Records; value: T }): Promise<T> {
    const task = this.queue.then(() => {
      const result = operation(structuredClone(this.records));
      if (this.failNext) { this.failNext = false; throw new Error("模拟提交中断"); }
      this.records = structuredClone(result.records); return result.value;
    });
    this.queue = task.catch(() => {}); return task;
  }
}
export class IndexedDbStore implements AtomicStore {
  private database: Promise<IDBDatabase>;
  constructor(name = "madmax-profile") {
    this.database = new Promise((resolve, reject) => {
      const request = indexedDB.open(name, 1);
      request.onupgradeneeded = () => request.result.createObjectStore("records");
      request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result); };
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("存档被其他页面占用，请关闭旧页面"));
    });
  }
  async transaction<T>(operation: (records: Records) => { records: Records; value: T }): Promise<T> {
    const database = await this.database;
    return new Promise((resolve, reject) => {
      const tx = database.transaction("records", "readwrite"), objectStore = tx.objectStore("records");
      let value: T, failure: unknown;
      const get = objectStore.get("profile");
      get.onsuccess = () => {
        try { const result = operation(get.result ?? {}); value = result.value; objectStore.put(result.records, "profile"); }
        catch (error) { failure = error; tx.abort(); }
      };
      tx.oncomplete = () => resolve(value);
      tx.onabort = tx.onerror = () => reject(failure ?? tx.error ?? new Error("存档事务失败"));
    });
  }
}

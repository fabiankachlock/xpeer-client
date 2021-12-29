import { Awaiter } from './awaiter.js';

type Task<T> = () => Promise<T>;

type QueueItem<T> = {
  task: Task<T>;
  awaiter: Awaiter<T>;
};

export class TaskQueue {
  private _queue: Array<QueueItem<unknown>>;

  private working = false;

  constructor() {
    this._queue = [];
  }

  async execute<T>(task: Task<T>): Promise<T> {
    const item: QueueItem<T> = {
      task,
      awaiter: new Awaiter<T>(),
    };

    this._queue.push(item as QueueItem<unknown>);
    this.tryExecute();

    return item.awaiter.promise;
  }

  private async tryExecute(): Promise<void> {
    if (!this.working && this._queue.length > 0) {
      this.working = true;
      const nextItem = this._queue[0];
      const result = await nextItem.task();
      nextItem.awaiter.callback(result);
      this._queue.shift();
      this.working = false;
    }
  }
}

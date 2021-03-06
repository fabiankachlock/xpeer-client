import { Awaiter } from './awaiter.js';
import { Logger } from './logger.js';

// @internal
type Task<T> = () => Promise<T>;

// @internal
type QueueItem<T> = {
  task: Task<T>;
  awaiter: Awaiter<T>;
};

// @internal
export class TaskQueue {
  private _queue: Array<QueueItem<unknown>>;

  private working = false;

  private stopped = false;

  get isStopped(): boolean {
    return this.stopped;
  }

  constructor() {
    this._queue = [];
  }

  public stop(): void {
    this.stopped = true;
  }

  public continue(): void {
    this.stopped = false;
    this.tryExecute();
  }

  async execute<T>(task: Task<T>): Promise<T> {
    const item: QueueItem<T> = {
      task,
      awaiter: new Awaiter<T>(),
    };

    this._queue.push(item as QueueItem<unknown>);
    if (!this.stopped) {
      this.tryExecute();
    }

    return item.awaiter.promise;
  }

  private async tryExecute(): Promise<void> {
    if (!this.stopped && !this.working && this._queue.length > 0) {
      this.working = true;
      const nextItem = this._queue[0];
      const result = await nextItem.task();
      nextItem.awaiter.callback(result);
      Logger.Queue.debug('executed task');
      this._queue.shift();
      this.working = false;
    }
  }
}

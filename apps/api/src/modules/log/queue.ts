/** Bounded async queue. Drop-oldest on overflow. */

export type QueueStats = {
  capacity: number;
  depth: number;
  droppedTotal: number;
};

export class BoundedQueue<T> {
  private readonly capacity: number;
  private readonly items: T[] = [];
  private droppedTotal = 0;

  constructor(capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new Error("BoundedQueue capacity must be a positive integer");
    }
    this.capacity = capacity;
  }

  /** Enqueue. If full, drop the oldest item and bump `droppedTotal`. */
  enqueue(item: T): void {
    if (this.items.length >= this.capacity) {
      this.items.shift();
      this.droppedTotal += 1;
    }
    this.items.push(item);
  }

  /**
   * Remove and return up to `max` items from the front (FIFO). This consumes
   * the items for the caller to process — it does not discard them. Returns
   * `[]` only when the queue is empty; `max` defaults to `capacity`, so a
   * no-arg call drains the whole queue.
   */
  drain(max = this.capacity): T[] {
    if (this.items.length === 0) return [];
    const take = Math.min(max, this.items.length);
    return this.items.splice(0, take);
  }

  /** Return (not remove) the next item, or undefined. */
  peek(): T | undefined {
    return this.items[0];
  }

  stats(): QueueStats {
    return {
      capacity: this.capacity,
      depth: this.items.length,
      droppedTotal: this.droppedTotal,
    };
  }
}

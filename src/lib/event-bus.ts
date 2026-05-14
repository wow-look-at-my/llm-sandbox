type Listener<T> = (event: T) => void

export class EventBus<T> {
  private listeners: Set<Listener<T>> = new Set()

  on(listener: Listener<T>): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  emit(event: T) {
    for (const listener of this.listeners) {
      try {
        listener(event)
      } catch (e) {
        console.error("[EventBus] Listener error:", e)
      }
    }
  }

  clear() {
    this.listeners.clear()
  }

  get size() {
    return this.listeners.size
  }
}

export const globalEventBus = new EventBus<unknown>()

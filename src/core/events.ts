/** Émetteur d'événements typé : `Events` associe chaque nom d'événement au type de sa charge. */
export class Emitter<Events extends object> {
  readonly #handlers = new Map<keyof Events, Set<(payload: never) => void>>();

  /** Abonne `handler` ; renvoie la fonction de désabonnement. */
  on<K extends keyof Events>(type: K, handler: (payload: Events[K]) => void): () => void {
    let set = this.#handlers.get(type);
    if (!set) {
      set = new Set();
      this.#handlers.set(type, set);
    }
    set.add(handler);
    return () => {
      set.delete(handler);
    };
  }

  emit<K extends keyof Events>(type: K, payload: Events[K]): void {
    const set = this.#handlers.get(type);
    if (!set) return;
    for (const handler of [...set]) (handler as (payload: Events[K]) => void)(payload);
  }
}

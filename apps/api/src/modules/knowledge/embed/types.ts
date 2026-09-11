/** A text-embedding client: texts in, one vector per text out. */
export type Embedder = {
  embed(texts: string[]): Promise<number[][]>;
};

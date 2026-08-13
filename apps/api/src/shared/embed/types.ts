export type Embedder = {
  embed(texts: string[]): Promise<number[][]>;
};

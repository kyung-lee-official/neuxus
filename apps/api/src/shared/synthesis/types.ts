export type Synthesizer = {
  synthesize(prompt: string): Promise<string>;
};

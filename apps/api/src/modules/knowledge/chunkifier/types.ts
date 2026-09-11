export type ChunkSpan = {
  index: number;
  text: string;
  start: number;
  end: number;
};

export type ChunkChild = ChunkSpan & {
  parentIndex: number;
};

export type ChunkifyResult = {
  parents: ChunkSpan[];
  children: ChunkChild[];
};

export type BlockKind =
  | "heading"
  | "fence"
  | "paragraph"
  | "list"
  | "table"
  | "blockquote"
  | "hr"
  | "html"
  | "indented_code"
  | "image"
  | "image_desc"
  | "blank";

export type LexBlock = {
  kind: BlockKind;
  start: number;
  end: number;
  /** ATX heading level 1–6 */
  level?: number;
  atomic: boolean;
  /** Same id ⇒ must stay in one parent and one child */
  glueGroupId?: number;
};

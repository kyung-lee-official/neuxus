# Appendix A — Knowledge data model (pages, parents, children)

Postgres + pgvector on **`kb_children.embedding`**. Chunking: [01-chunkify.md](./01-chunkify.md). Search: [appendix-b-vector-search.md](./appendix-b-vector-search.md).

## Entities

```text
Page ──* Parent ──* Child (embedding)
```

| Entity     | Role                                             | `vector`? |
| ---------- | ------------------------------------------------ | --------- |
| **Page**   | Markdown file: slug, title, body, `content_hash` | No        |
| **Parent** | Generation slice of `body`                       | No        |
| **Child**  | Retrieval unit                                   | Yes       |

FKs: `Parent.pageId → Page`, `Child.parentId → Parent`. Optional denormalized `Child.pageId`; optional `startOffset` / `endOffset`. On page change: delete that page’s parents/children, insert the new tree ([incremental updates](./01-chunkify.md#incremental-updates-page-hash)).

Keep `kb_*` separate from `app_*` (same `DATABASE_URL` is fine).

## Prisma shape

Prisma has no first-class pgvector: use `Unsupported("vector(N)")` and **raw SQL** for embed/search. Client CRUD omits `embedding`.

```prisma
model KnowledgePage {
  id          String   @id @default(cuid())
  slug        String   @unique
  title       String
  type        String?
  tags        String[] @default([])
  body        String
  sourcePath  String?  @map("source_path")
  contentHash String   @map("content_hash")
  updatedAt   DateTime @updatedAt @map("updated_at")
  parents     KnowledgeParent[]
  @@map("kb_pages")
}

model KnowledgeParent {
  id          String @id @default(cuid())
  pageId      String @map("page_id")
  parentIndex Int    @map("parent_index")
  text        String
  page        KnowledgePage    @relation(fields: [pageId], references: [id], onDelete: Cascade)
  children    KnowledgeChild[]
  @@unique([pageId, parentIndex])
  @@map("kb_parents")
}

model KnowledgeChild {
  id             String                      @id @default(cuid())
  parentId       String                      @map("parent_id")
  pageId         String                      @map("page_id")
  childIndex     Int                         @map("child_index")
  text           String
  embedding      Unsupported("vector(768)")?
  embeddingModel String?                     @map("embedding_model")
  embeddedAt     DateTime?                   @map("embedded_at")
  parent         KnowledgeParent @relation(fields: [parentId], references: [id], onDelete: Cascade)
  @@unique([parentId, childIndex])
  @@map("kb_children")
}
```

Match `vector(N)` to the embedding model. Migration SQL (manual — agents must not migrate / db push):

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE INDEX kb_children_embedding_hnsw
  ON kb_children
  USING hnsw (embedding vector_cosine_ops);
```

| Concern                    | Tooling           |
| -------------------------- | ----------------- |
| Page / parent / child text | Prisma and/or SQL |
| Embed + similarity         | Raw SQL only      |

## Chunk knobs table

Nullable columns; **defaults live in app code** ([01-chunkify.md](./01-chunkify.md#knobs)), not SQL `DEFAULT`. Shape open (single row vs key/value):

```prisma
model KnowledgeChunkSettings {
  id                      String  @id @default("default")
  childTargetTokens       Int?
  childHardMaxTokens      Int?
  childOverlapTokens      Int?
  childCrumbMinTokens     Int?
  parentMaxTokens         Int?
  fenceIntroGlueMaxTokens Int?
  tokenizerEncoding       String?
  @@map("kb_chunk_settings")
}
```

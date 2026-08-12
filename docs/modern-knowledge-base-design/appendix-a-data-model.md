# Appendix A — Knowledge data model (pages, parents, children)

Relational store in Postgres. Embeddings live as a **`vector` column on `children`** (pgvector extension) — still a normal table, not a separate vector product. Chunking rules: [01-chunkify.md](./01-chunkify.md). Search: [appendix-b-vector-search.md](./appendix-b-vector-search.md).

## Entity links

```text
Page 1 ──* Parent 1 ──* Child
         │              └── embedding vector(N)   // search only
         └── text used for LLM after child hit
```

| Entity     | Role                                                 | Has `vector`? |
| ---------- | ---------------------------------------------------- | ------------- |
| **Page**   | One markdown file: slug, title, body, `content_hash` | No            |
| **Parent** | Generation slice of `body`                           | No            |
| **Child**  | Retrieval unit inside one parent                     | Yes           |

Required FKs: `Parent.pageId → Page`, `Child.parentId → Parent`. Optional denormalized `Child.pageId` for cheaper filters. Optional `startOffset` / `endOffset` into page `body` for debug and re-slice.

On page change: delete that page’s parents and children (vectors go with child rows), then insert the new tree. See incremental updates in [01-chunkify.md](./01-chunkify.md).

## Prisma schema shape

Prisma does **not** first-class support pgvector. Declare the column with `Unsupported` so the schema stays honest; **read/write/search vectors with raw SQL** (`postgres.js` or `prisma.$queryRaw` / `$executeRaw`). Prisma Client CRUD will omit `embedding`.

Illustrative models (names/maps can follow `kb_*` or similar):

```prisma
datasource db {
  provider   = "postgresql"
  // extensions = [vector]  // when using postgresqlExtensions
}

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

  parents KnowledgeParent[]

  @@map("kb_pages")
}

model KnowledgeParent {
  id          String @id @default(cuid())
  pageId      String @map("page_id")
  parentIndex Int    @map("parent_index")
  text        String
  // optional: startOffset, endOffset

  page     KnowledgePage    @relation(fields: [pageId], references: [id], onDelete: Cascade)
  children KnowledgeChild[]

  @@unique([pageId, parentIndex])
  @@map("kb_parents")
}

model KnowledgeChild {
  id             String                       @id @default(cuid())
  parentId       String                       @map("parent_id")
  pageId         String                       @map("page_id") // optional denorm
  childIndex     Int                          @map("child_index")
  text           String
  embedding      Unsupported("vector(768)")?  // dims = embedding model
  embeddingModel String?                      @map("embedding_model")
  embeddedAt     DateTime?                    @map("embedded_at")

  parent KnowledgeParent @relation(fields: [parentId], references: [id], onDelete: Cascade)

  @@unique([parentId, childIndex])
  @@map("kb_children")
}
```

Adjust `vector(768)` to the real model dimensions (for example 768 for `nomic-embed-text`). Create the extension and HNSW index in migration SQL yourself, for example:

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE INDEX kb_children_embedding_hnsw
  ON kb_children
  USING hnsw (embedding vector_cosine_ops);
```

**Migrations:** apply manually (for example `prisma migrate dev`); agents must not run migrate / db push.

## Runtime access

| Concern                                        | Tooling                                             |
| ---------------------------------------------- | --------------------------------------------------- |
| Page / parent / child text metadata            | Prisma Client and/or SQL                            |
| Insert / update `embedding`, similarity search | Raw SQL only                                        |
| App chat users / sessions                      | Existing `app_*` models — keep separate from `kb_*` |

Same database URL is fine; keep knowledge tables namespaced so they do not collide with `app_users`, memories, and sessions.

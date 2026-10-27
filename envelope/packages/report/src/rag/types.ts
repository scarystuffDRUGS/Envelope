/** Retrieval index for the report narrative (D-036, MODELS.md A.7). Built by `pnpm rag:build`. */

export interface CorpusDoc {
  id: string;
  /** Title as it appears in the References section. */
  title: string;
  /** Names a report may use for the document ("EIA Notification"); case-insensitive. */
  aliases?: string[];
  issuer: string;
  year: string;
  /** Where the indexed copy was obtained. */
  url: string;
  /** Official reference when the copy is not from the issuer (e.g. a Gazette number). */
  officialRef?: string;
  licence: string;
  kind: 'regulation' | 'guideline' | 'method' | 'data';
  accessed: string; // ISO date
}

export interface Chunk {
  id: string;
  doc: string;
  /** Nearest heading above the chunk, '' when none was found. */
  section: string;
  /** 1-based page of the PDF where the chunk starts. */
  page: number;
  text: string;
}

export interface RagIndex {
  version: 1;
  model: string;
  dim: number;
  builtAt: string;
  docs: CorpusDoc[];
  chunks: Chunk[];
  /** Int8-quantised unit vectors, base64, same order as `chunks`. */
  vectors: string[];
  /** Query text → int8 vector (base64), for the fixed query set in queries.ts. */
  queries: Record<string, string>;
}

/** A passage handed to the LLM and, when cited, listed under References. */
export interface Passage {
  id: string; // S1, S2, …
  chunk: string;
  doc: CorpusDoc;
  section: string;
  page: number;
  text: string;
  /** The part of `text` sent to the LLM and quoted under References; whole text when unset. */
  quote?: string;
  /** Report sections it was retrieved for. */
  forSections: string[];
}

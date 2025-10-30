"use client";

import {
  ConversationDetail,
  ConversationMessage,
  ConversationSummary,
  DocumentDetail,
  DocumentItem,
  Citation
} from "./types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

async function http<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers as HeadersInit | undefined);
  if (!(init?.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(input, {
    ...init,
    headers
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || response.statusText);
  }

  return response.json() as Promise<T>;
}

export async function listConversations(): Promise<ConversationSummary[]> {
  const data = await http<Array<ConversationSummaryAPI>>(`${API_BASE_URL}/conversations`);
  return data.map(mapConversationSummary);
}

export async function createConversation(title?: string): Promise<ConversationDetail> {
  const data = await http<ConversationDetailAPI>(`${API_BASE_URL}/conversations`, {
    method: "POST",
    body: JSON.stringify({ title })
  });
  return mapConversationDetail(data);
}

export async function renameConversation(conversationId: string, title: string): Promise<ConversationDetail> {
  const data = await http<ConversationDetailAPI>(`${API_BASE_URL}/conversations/${conversationId}`, {
    method: "PATCH",
    body: JSON.stringify({ title })
  });
  return mapConversationDetail(data);
}

export async function deleteConversation(conversationId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/conversations/${conversationId}`, {
    method: "DELETE"
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || response.statusText);
  }
}

export async function getConversation(conversationId: string): Promise<ConversationDetail> {
  const data = await http<ConversationDetailAPI>(`${API_BASE_URL}/conversations/${conversationId}`);
  return mapConversationDetail(data);
}

export async function askQuestion(conversationId: string, question: string): Promise<ChatAnswer> {
  const data = await http<ChatResponseAPI>(`${API_BASE_URL}/chat/respond`, {
    method: "POST",
    body: JSON.stringify({ conversation_id: conversationId, question })
  });
  return {
    answer: data.answer,
    citations: data.citations.map(mapCitation)
  };
}

export type StreamHandlers = {
  onToken: (token: string) => void;
  onComplete?: () => void;
  onError?: (message: string) => void;
  onCitations?: (citations: Citation[]) => void;
};

export async function streamChat(
  conversationId: string,
  question: string,
  handlers: StreamHandlers
): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/chat/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream"
    },
    body: JSON.stringify({ conversation_id: conversationId, question })
  });

  if (!response.ok || !response.body) {
    const detail = await response.text();
    handlers.onError?.(detail || response.statusText);
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  let completed = false;

  const processPayload = (payload: string) => {
    const trimmed = payload.trim();
    if (!trimmed) {
      return;
    }
    if (trimmed === "[DONE]") {
      completed = true;
      handlers.onComplete?.();
      return;
    }
    try {
      const parsed = JSON.parse(trimmed) as StreamPayload;
      if (typeof parsed.error === "string" && parsed.error.length > 0) {
        handlers.onError?.(parsed.error);
        completed = true;
      } else if (typeof parsed.delta === "string") {
        handlers.onToken(parsed.delta);
      } else if (Array.isArray(parsed.citations)) {
        const mapped = parsed.citations.map(mapCitation);
        handlers.onCitations?.(mapped);
      }
    } catch {
      handlers.onError?.("Received malformed streaming payload.");
      completed = true;
    }
  };

  const processChunk = (chunk: string) => {
    const lines = chunk.split("\n");
    for (const line of lines) {
      if (line.startsWith("data:")) {
        processPayload(line.slice(5));
      }
    }
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      let splitIndex = buffer.indexOf("\n\n");
      while (splitIndex !== -1) {
        const rawEvent = buffer.slice(0, splitIndex);
        buffer = buffer.slice(splitIndex + 2);
        processChunk(rawEvent);
        splitIndex = buffer.indexOf("\n\n");
      }
    }

    buffer += decoder.decode();
    if (buffer.trim().length > 0) {
      processChunk(buffer);
    }
  } catch (error) {
    handlers.onError?.(error instanceof Error ? error.message : "Streaming interrupted.");
    completed = true;
  } finally {
    reader.releaseLock();
    if (!completed) {
      handlers.onComplete?.();
    }
  }
}

export async function listDocuments(): Promise<DocumentItem[]> {
  const data = await http<Array<DocumentAPI>>(`${API_BASE_URL}/documents`);
  return data.map(mapDocument);
}

export async function upsertDocument(payload: {
  filename: string;
  content?: string;
  file?: File;
  id?: string;
}): Promise<DocumentItem> {
  if (payload.id) {
    if (typeof payload.content !== "string" || !payload.content.trim()) {
      throw new Error("Document content is required when updating an existing record.");
    }
    const data = await http<DocumentAPI>(`${API_BASE_URL}/documents/${payload.id}`, {
      method: "PUT",
      body: JSON.stringify({
        filename: payload.filename,
        content: payload.content
      })
    });
    return mapDocument(data);
  }

  if (!payload.file) {
    throw new Error("A document file is required.");
  }

  const formData = new FormData();
  formData.append("file", payload.file, payload.file.name);
  formData.append("filename", payload.filename);

  const data = await http<DocumentAPI>(`${API_BASE_URL}/documents`, {
    method: "POST",
    body: formData
  });
  return mapDocument(data);
}

export async function getDocument(documentId: string): Promise<DocumentDetail> {
  const data = await http<DocumentDetailAPI>(`${API_BASE_URL}/documents/${documentId}`);
  return mapDocumentDetail(data);
}

export async function deleteDocument(documentId: string): Promise<void> {
  await fetch(`${API_BASE_URL}/documents/${documentId}`, { method: "DELETE" });
}

type ConversationSummaryAPI = {
  id: string;
  title: string;
  last_message_preview?: string | null;
  updated_at: string;
};

type CitationAPI = {
  source: string;
  filename: string;
  page?: number | null;
  content: string;
};

type ChatResponseAPI = {
  answer: string;
  citations: CitationAPI[];
};

type StreamPayload = {
  delta?: string;
  error?: string;
  citations?: CitationAPI[];
};

export type ChatAnswer = {
  answer: string;
  citations: Citation[];
};

type ConversationMessageAPI = {
  role: ConversationMessage["role"];
  content: string;
  created_at: string;
  citations?: CitationAPI[] | null;
};

type ConversationDetailAPI = {
  id: string;
  title: string;
  messages: ConversationMessageAPI[];
  created_at: string;
  updated_at: string;
};

type DocumentAPI = {
  id: string;
  filename: string;
  summary?: string | null;
  uploaded_at: string;
  updated_at: string;
};

type DocumentDetailAPI = DocumentAPI & {
  content: string;
};

function mapConversationSummary(api: ConversationSummaryAPI): ConversationSummary {
  return {
    id: api.id,
    title: api.title,
    lastMessagePreview: api.last_message_preview,
    updatedAt: api.updated_at
  };
}

function mapConversationDetail(api: ConversationDetailAPI): ConversationDetail {
  return {
    id: api.id,
    title: api.title,
    messages: api.messages.map(mapConversationMessage),
    createdAt: api.created_at,
    updatedAt: api.updated_at
  };
}

function mapConversationMessage(api: ConversationMessageAPI): ConversationMessage {
  return {
    role: api.role,
    content: api.content,
    createdAt: api.created_at,
    citations: api.citations ? api.citations.map(mapCitation) : undefined
  };
}

function mapDocument(api: DocumentAPI): DocumentItem {
  return {
    id: api.id,
    filename: api.filename,
    summary: api.summary,
    uploadedAt: api.uploaded_at,
    updatedAt: api.updated_at
  };
}

function mapDocumentDetail(api: DocumentDetailAPI): DocumentDetail {
  return {
    ...mapDocument(api),
    content: api.content
  };
}

function mapCitation(api: CitationAPI): Citation {
  return {
    source: api.source,
    filename: api.filename,
    page: api.page ?? null,
    content: api.content
  };
}

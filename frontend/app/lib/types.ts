export type MessageRole = "user" | "assistant" | "system";

export interface ConversationSummary {
  id: string;
  title: string;
  lastMessagePreview?: string | null;
  updatedAt: string;
}

export interface ConversationMessage {
  role: MessageRole;
  content: string;
  createdAt: string;
  citations?: Citation[];
}

export interface ConversationDetail {
  id: string;
  title: string;
  messages: ConversationMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface DocumentItem {
  id: string;
  filename: string;
  summary?: string | null;
  uploadedAt: string;
  updatedAt: string;
}

export interface DocumentDetail extends DocumentItem {
  content: string;
}

export interface Citation {
  source: string;
  filename: string;
  page?: number | null;
  content: string;
}

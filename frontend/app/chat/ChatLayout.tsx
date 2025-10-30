"use client";

import clsx from "clsx";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties
} from "react";
import { motion, useReducedMotion } from "framer-motion";

import AboutDialog from "../components/AboutDialog";
import SidebarContent, { SidebarListItem } from "../components/sidebar/SidebarContent";
import SidebarToggle from "../components/sidebar/SidebarToggle";
import { useMediaQuery } from "../hooks/useMediaQuery";
import {
  createConversation,
  deleteConversation,
  deleteDocument,
  getConversation,
  getDocument,
  listConversations,
  listDocuments,
  renameConversation,
  streamChat,
  upsertDocument
} from "../lib/api";
import {
  ConversationDetail,
  ConversationMessage,
  ConversationSummary,
  DocumentItem
} from "../lib/types";
import ChatWindow from "./components/ChatWindow";
import DocumentManager from "./components/DocumentManager";

type ChatLayoutProps = {
  initialOpen: boolean;
};

const EXPANDED_WIDTH = "16rem";
const COLLAPSED_DESKTOP_WIDTH = "4rem";
const COLLAPSED_MOBILE_WIDTH = "0rem";
const MAIN_SELECTOR = "main[data-chat-layout='true']";
const ASIDE_SELECTOR = "aside[data-sidebar-panel='true']";
const SIDEBAR_STORAGE_KEY = "sidebar_open";
const DESKTOP_MEDIA_QUERY = "(min-width: 768px)";
const SIDEBAR_WIDTH_EASE = [0.22, 1, 0.36, 1] as const;

const computeWidth = (open: boolean, isDesktop: boolean) => {
  if (open) {
    return EXPANDED_WIDTH;
  }
  return isDesktop ? COLLAPSED_DESKTOP_WIDTH : COLLAPSED_MOBILE_WIDTH;
};

export default function ChatLayout({ initialOpen }: ChatLayoutProps) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [conversation, setConversation] = useState<ConversationDetail | null>(null);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [streamingAnswer, setStreamingAnswer] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [activeTab, setActiveTab] = useState<"conversation" | "documents">("conversation");
  const [showAbout, setShowAbout] = useState(false);
  const prefersReducedMotion = useReducedMotion();
  const sidebarTransition = useMemo(
    () =>
      prefersReducedMotion
        ? { duration: 0 }
        : { type: "tween", duration: 0.24, ease: SIDEBAR_WIDTH_EASE },
    [prefersReducedMotion]
  );

  const readStoredSidebarPreference = () => {
    if (typeof window === "undefined") {
      return null;
    }
    try {
      const stored = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
      if (stored === null) {
        return null;
      }
      return stored === "1";
    } catch {
      return null;
    }
  };

  const detectDesktopMatch = () => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return true;
    }
    try {
      return window.matchMedia(DESKTOP_MEDIA_QUERY).matches;
    } catch {
      return true;
    }
  };

  const isDesktop = useMediaQuery(DESKTOP_MEDIA_QUERY);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(() => {
    const stored = readStoredSidebarPreference();
    return stored ?? initialOpen;
  });
  const [currentSidebarWidth, setCurrentSidebarWidth] = useState<string>(() => {
    const stored = readStoredSidebarPreference();
    const openValue = stored ?? initialOpen;
    return computeWidth(openValue, detectDesktopMatch());
  });

  const mainRef = useRef<HTMLElement | null>(null);
  const asideRef = useRef<HTMLElement | null>(null);

  const assignMainRef = useCallback((node: HTMLElement | null) => {
    if (node) {
      mainRef.current = node;
    }
  }, []);

  const assignAsideRef = useCallback((node: HTMLElement | null) => {
    if (node) {
      asideRef.current = node;
    }
  }, []);

  const synchronizeLayout = useCallback(
    (openValue: boolean, desktopValue: boolean) => {
      const nextWidth = computeWidth(openValue, desktopValue);
      setCurrentSidebarWidth(nextWidth);

      const mainElement = mainRef.current ?? document.querySelector<HTMLElement>(MAIN_SELECTOR);
      const asideElement = asideRef.current ?? document.querySelector<HTMLElement>(ASIDE_SELECTOR);

      if (mainElement) {
        mainElement.style.setProperty("--sb", nextWidth);
      }

      if (asideElement) {
        asideElement.style.width = nextWidth;
        asideElement.style.pointerEvents = nextWidth === "0rem" ? "none" : "auto";
      }
    },
    []
  );

  useEffect(() => {
    const mainElement = document.querySelector<HTMLElement>(MAIN_SELECTOR);
    const asideElement = document.querySelector<HTMLElement>(ASIDE_SELECTOR);
    if (mainElement) {
      mainRef.current = mainElement;
    }
    if (asideElement) {
      asideRef.current = asideElement;
    }
    synchronizeLayout(isSidebarOpen, isDesktop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setIsSidebarOpen(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== SIDEBAR_STORAGE_KEY) {
        return;
      }
      if (event.newValue === null) {
        setIsSidebarOpen(true);
        return;
      }
      setIsSidebarOpen(event.newValue === "1");
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  useEffect(() => {
    synchronizeLayout(isSidebarOpen, isDesktop);

    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(SIDEBAR_STORAGE_KEY, isSidebarOpen ? "1" : "0");
      } catch {
        // Ignore preference write failures (e.g., private mode)
      }
      document.cookie = `${SIDEBAR_STORAGE_KEY}=${isSidebarOpen ? "1" : "0"}; path=/; max-age=31536000`;
    }
  }, [isDesktop, isSidebarOpen, synchronizeLayout]);

  const loadDocuments = useCallback(async () => {
    try {
      const docs = await listDocuments();
      setDocuments(docs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load documents.");
    }
  }, []);

  const summarize = useCallback((detail: ConversationDetail): ConversationSummary => {
    const lastMessage: ConversationMessage | undefined =
      detail.messages.length > 0 ? detail.messages[detail.messages.length - 1] : undefined;
    return {
      id: detail.id,
      title: detail.title,
      lastMessagePreview: lastMessage?.content ?? null,
      updatedAt: detail.updatedAt
    };
  }, []);

  const loadConversation = useCallback(
    async (conversationId: string) => {
      try {
        const detail = await getConversation(conversationId);
        setConversation(detail);
        setSelectedConversationId(conversationId);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load conversation.");
      }
    },
    []
  );

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const [conversationList, docList] = await Promise.all([listConversations(), listDocuments()]);
        setConversations(conversationList);
        setDocuments(docList);

        if (conversationList.length > 0) {
          const initialId = conversationList[0].id;
          setSelectedConversationId(initialId);
          const detail = await getConversation(initialId);
          setConversation(detail);
        } else {
          const detail = await createConversation();
          setConversation(detail);
          setConversations([summarize(detail)]);
          setSelectedConversationId(detail.id);
        }

        setIsInitialized(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to initialize chat interface.");
      }
    };

    if (!isInitialized) {
      void bootstrap();
    }
  }, [isInitialized, summarize]);

  const handleCreateConversation = useCallback(async () => {
    setError(null);
    try {
      const detail = await createConversation();
      setConversation(detail);
      setSelectedConversationId(detail.id);
      setConversations((prev) => [summarize(detail), ...prev.filter((c) => c.id !== detail.id)].slice(0, 5));
      setIsSidebarOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create conversation.");
    }
  }, [summarize]);

  const handleSelectConversation = useCallback(
    async (conversationId: string) => {
      setError(null);
      setStreamingAnswer("");
      setIsStreaming(false);
      await loadConversation(conversationId);
      if (!isDesktop) {
        setIsSidebarOpen(false);
      }
    },
    [isDesktop, loadConversation]
  );

  const handleSendQuestion = useCallback(
    async (question: string) => {
      if (!selectedConversationId) {
        return;
      }

      const timestamp = new Date().toISOString();
      setError(null);
      setStreamingAnswer("");
      setIsStreaming(true);
      setConversation((prev) =>
        prev
          ? {
              ...prev,
              messages: [
                ...prev.messages,
                {
                  role: "user",
                  content: question,
                  createdAt: timestamp
                }
              ]
            }
          : prev
      );

      try {
        await streamChat(selectedConversationId, question, {
          onToken: (token) => {
            setStreamingAnswer((current) => current + token);
          },
          onError: (message) => {
            setError(message);
          }
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Streaming failed.");
      } finally {
        setIsStreaming(false);
      }

      try {
        const [updatedConversation, updatedSummaries] = await Promise.all([
          getConversation(selectedConversationId),
          listConversations()
        ]);
        setConversation(updatedConversation);
        setConversations(updatedSummaries);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to refresh conversation state.");
      } finally {
        setStreamingAnswer("");
      }
    },
    [selectedConversationId]
  );

  const handleUpsertDocument = useCallback(
    async (payload: { id?: string; filename: string; content?: string; file?: File }) => {
      setError(null);
      try {
        await upsertDocument(payload);
        await loadDocuments();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to save document.";
        setError(message);
        throw new Error(message);
      }
    },
    [loadDocuments]
  );

  const handleDeleteDocument = useCallback(
    async (documentId: string) => {
      setError(null);
      try {
        await deleteDocument(documentId);
        await loadDocuments();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to delete document.";
        setError(message);
        throw new Error(message);
      }
    },
    [loadDocuments]
  );

  const handleLoadDocument = useCallback(async (documentId: string) => {
    return getDocument(documentId);
  }, []);

  const handleRenameConversation = useCallback(
    async (conversationId: string) => {
      const current = conversations.find((item) => item.id === conversationId);
      const proposed = window.prompt("Đổi tên cuộc trò chuyện", current?.title ?? "");
      if (proposed === null) {
        return;
      }
      const trimmed = proposed.trim();
      if (!trimmed || trimmed === current?.title) {
        return;
      }

      setError(null);
      try {
        const detail = await renameConversation(conversationId, trimmed);
        setConversation((prev) => (prev && prev.id === conversationId ? detail : prev));
        const updatedSummaries = await listConversations();
        setConversations(updatedSummaries);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Không thể đổi tên cuộc trò chuyện.");
      }
    },
    [conversations]
  );

  const handleDeleteConversation = useCallback(
    async (conversationId: string) => {
      if (!window.confirm("Delete this conversation? This will remove the entire chat history.")) {
        return;
      }

      setError(null);

      if (isStreaming && conversationId === selectedConversationId) {
        setIsStreaming(false);
        setStreamingAnswer("");
      }

      try {
        await deleteConversation(conversationId);
        const updatedSummaries = await listConversations();
        setConversations(updatedSummaries);

        if (selectedConversationId === conversationId) {
          const nextId = updatedSummaries[0]?.id ?? null;
          setSelectedConversationId(nextId);

          if (nextId) {
            try {
              const detail = await getConversation(nextId);
              setConversation(detail);
            } catch (err) {
              setConversation(null);
              setError(err instanceof Error ? err.message : "Failed to load conversation.");
            }
          } else {
            setConversation(null);
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to delete conversation.";
        setError(message);
      }
    },
    [selectedConversationId, isStreaming]
  );

  const sidebarItems = useMemo<SidebarListItem[]>(
    () =>
      conversations.map((item) => ({
        id: item.id,
        label: item.title || "Untitled chat"
      })),
    [conversations]
  );

  const currentWidthValue = currentSidebarWidth;

  return (
    <>
      {!isDesktop && isSidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/60 backdrop-blur-sm md:hidden"
          aria-hidden="true"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      <main
        data-chat-layout="true"
        ref={assignMainRef}
        className={clsx(
          "h-dvh grid bg-background text-text transition-[grid-template-columns] duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
          "overflow-hidden",
          "motion-reduce:transition-none motion-reduce:duration-0",
          !isInitialized && "pointer-events-none opacity-70"
        )}
        style={
          {
            "--sb": currentWidthValue,
            gridTemplateColumns: "var(--sb) 1fr"
          } as CSSProperties
        }
      >
        <motion.aside
          data-sidebar-panel="true"
          ref={assignAsideRef}
          className={clsx(
            "relative z-30 shrink-0 overflow-hidden border-r border-border",
            "motion-reduce:transition-none motion-reduce:duration-0"
          )}
          animate={{ width: currentWidthValue }}
          initial={false}
          transition={sidebarTransition}
          style={{
            width: currentWidthValue,
            willChange: prefersReducedMotion ? undefined : "width"
          }}
        >
          <SidebarContent
            controlledId="sidebar-content"
            heading="Workspace"
            isOpen={isSidebarOpen}
            isDesktop={isDesktop}
            items={sidebarItems}
            activeId={selectedConversationId ?? undefined}
            onToggle={() => setIsSidebarOpen((prev) => !prev)}
            onNewChat={handleCreateConversation}
            onSelect={handleSelectConversation}
            onRename={handleRenameConversation}
            onDelete={handleDeleteConversation}
            onShowAbout={() => setShowAbout(true)}
          />
        </motion.aside>
        <section className="flex h-full w-full min-h-0 min-w-0 flex-col">
          <header className="flex items-center gap-3 border-b border-border px-4 py-4 md:px-6 lg:px-12">
            <div className="flex flex-1 items-center gap-3">
              <div className="inline-flex rounded-full border border-border bg-card p-1 shadow-sm shadow-black/10">
                <button
                  type="button"
                  className={clsx(
                    "rounded-full px-4 py-2 text-sm font-medium transition duration-200",
                    activeTab === "conversation"
                      ? "bg-primary text-primary-foreground shadow"
                      : "text-subtext hover:text-text"
                  )}
                  onClick={() => setActiveTab("conversation")}
                >
                  Conversation
                </button>
                <button
                  type="button"
                  className={clsx(
                    "rounded-full px-4 py-2 text-sm font-medium transition duration-200",
                    activeTab === "documents"
                      ? "bg-primary text-primary-foreground shadow"
                      : "text-subtext hover:text-text"
                  )}
                  onClick={() => setActiveTab("documents")}
                >
                  Documents
                </button>
              </div>
              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              )}
            </div>
          </header>
          <div className="flex min-h-0 flex-1 w-full">
            {activeTab === "conversation" ? (
              <ChatWindow
                conversation={conversation}
                streamingAnswer={streamingAnswer}
                isStreaming={isStreaming}
                onSend={handleSendQuestion}
              />
            ) : (
              <div className="flex-1 overflow-y-auto px-6 py-8 lg:px-12">
                <DocumentManager
                  documents={documents}
                  onUpsert={handleUpsertDocument}
                  onDelete={handleDeleteDocument}
                  onLoadDocument={handleLoadDocument}
                />
              </div>
            )}
          </div>
        </section>
      </main>
      <AboutDialog open={showAbout} onClose={() => setShowAbout(false)} />
    </>
  );
}

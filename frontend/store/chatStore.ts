import { create } from 'zustand';
import type { ChatConversation, ChatMessage, TypingUser } from '@/types/chat';

interface ChatState {
  conversations: ChatConversation[];
  activeConversationId: number | null;
  messages: Record<number, ChatMessage[]>;
  typingUsers: TypingUser[];
  onlineUsers: Set<number>;
  totalUnread: number;
  soundEnabled: boolean;
  // Last message delivered via the global socket listener (useSocket). ChatWindow
  // reacts to this so realtime delivery never depends on its own per-mount socket
  // listener being attached at the right moment.
  lastIncomingMessage: ChatMessage | null;

  setConversations: (conversations: ChatConversation[]) => void;
  setActiveConversation: (id: number | null) => void;
  setMessages: (conversationId: number, messages: ChatMessage[]) => void;
  prependMessages: (conversationId: number, messages: ChatMessage[]) => void;
  addMessage: (message: ChatMessage) => void;
  updateConversationLastMessage: (message: ChatMessage) => void;

  addTypingUser: (user: TypingUser) => void;
  removeTypingUser: (conversationId: number, userId: number) => void;

  setUserOnline: (userId: number) => void;
  setUserOffline: (userId: number) => void;

  setTotalUnread: (count: number) => void;
  incrementUnread: (conversationId: number) => void;
  clearUnread: (conversationId: number) => void;

  toggleSound: () => void;
}

export const useChatStore = create<ChatState>((set) => ({
  conversations: [],
  activeConversationId: null,
  messages: {},
  typingUsers: [],
  onlineUsers: new Set(),
  totalUnread: 0,
  soundEnabled: typeof window !== 'undefined' ? localStorage.getItem('chat_sound') !== 'false' : true,
  lastIncomingMessage: null,

  setConversations: (conversations) => set({ conversations }),

  setActiveConversation: (id) => set({ activeConversationId: id }),

  setMessages: (conversationId, messages) =>
    set((state) => ({
      messages: { ...state.messages, [conversationId]: messages },
    })),

  prependMessages: (conversationId, newMessages) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [conversationId]: [...newMessages, ...(state.messages[conversationId] || [])],
      },
    })),

  addMessage: (message) =>
    set((state) => {
      const convMessages = state.messages[message.conversation_id] || [];
      if (convMessages.some((m) => m.id === message.id)) {
        // Still surface it as the latest incoming message so any UI reacting to
        // the signal (e.g. ChatWindow) re-renders even on duplicate store writes.
        return { lastIncomingMessage: message };
      }
      return {
        messages: {
          ...state.messages,
          [message.conversation_id]: [...convMessages, message],
        },
        lastIncomingMessage: message,
      };
    }),

  updateConversationLastMessage: (message) =>
    set((state) => {
      const conversations = state.conversations.map((c) =>
        c.id === message.conversation_id ? { ...c, last_message: message } : c,
      );
      conversations.sort((a, b) => {
        const aTime = a.last_message?.created_at ?? a.created_at;
        const bTime = b.last_message?.created_at ?? b.created_at;
        return new Date(bTime).getTime() - new Date(aTime).getTime();
      });
      return { conversations };
    }),

  addTypingUser: (user) =>
    set((state) => {
      const exists = state.typingUsers.some(
        (t) => t.user_id === user.user_id && t.conversation_id === user.conversation_id,
      );
      if (exists) return state;
      return { typingUsers: [...state.typingUsers, user] };
    }),

  removeTypingUser: (conversationId, userId) =>
    set((state) => ({
      typingUsers: state.typingUsers.filter(
        (t) => !(t.conversation_id === conversationId && t.user_id === userId),
      ),
    })),

  setUserOnline: (userId) =>
    set((state) => {
      const next = new Set(state.onlineUsers);
      next.add(userId);
      return { onlineUsers: next };
    }),

  setUserOffline: (userId) =>
    set((state) => {
      const next = new Set(state.onlineUsers);
      next.delete(userId);
      return { onlineUsers: next };
    }),

  setTotalUnread: (count) => set({ totalUnread: count }),

  incrementUnread: (conversationId) =>
    set((state) => ({
      totalUnread: state.totalUnread + 1,
      conversations: state.conversations.map((c) =>
        c.id === conversationId ? { ...c, unread_count: c.unread_count + 1 } : c,
      ),
    })),

  clearUnread: (conversationId) =>
    set((state) => {
      const conv = state.conversations.find((c) => c.id === conversationId);
      const cleared = conv?.unread_count ?? 0;
      return {
        totalUnread: Math.max(0, state.totalUnread - cleared),
        conversations: state.conversations.map((c) =>
          c.id === conversationId ? { ...c, unread_count: 0 } : c,
        ),
      };
    }),

  toggleSound: () =>
    set((state) => {
      const next = !state.soundEnabled;
      localStorage.setItem('chat_sound', String(next));
      return { soundEnabled: next };
    }),
}));

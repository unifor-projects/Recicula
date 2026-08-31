'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useChatStore } from '@/store/chatStore';
import { getSocket } from '@/services/socket';
import api from '@/services/api';
import ConversationList from '@/components/chat/ConversationList';
import ChatWindow from '@/components/chat/ChatWindow';
import NewConversationModal from '@/components/chat/NewConversationModal';
import type { ChatConversation } from '@/types/chat';

export default function ChatPageClient() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const convParam = searchParams?.get('conv') ?? null;
  const {
    conversations,
    setConversations,
    activeConversationId,
    setActiveConversation,
    setTotalUnread,
  } = useChatStore();
  const [showNewConv, setShowNewConv] = useState(false);
  const [mobileShowChat, setMobileShowChat] = useState(false);

  useEffect(() => {
    api
      .get<ChatConversation[]>('/api/chat/conversations')
      .then((res) => {
        setConversations(res.data);
        const total = res.data.reduce((sum, c) => sum + c.unread_count, 0);
        setTotalUnread(total);
      })
      .catch(() => {});
  }, [setConversations, setTotalUnread]);

  useEffect(() => {
    if (!convParam || conversations.length === 0) return;
    const targetId = Number(convParam);
    if (!Number.isNaN(targetId) && targetId > 0) {
      handleSelectConversation(targetId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convParam, conversations.length]);

  const handleSelectConversation = useCallback(
    (id: number) => {
      const socket = getSocket();
      if (activeConversationId && socket) {
        socket.emit('leave_room', { conversation_id: activeConversationId });
      }
      setActiveConversation(id);
      setMobileShowChat(true);
      if (socket) {
        socket.emit('join_room', { conversation_id: id });
      }
    },
    [activeConversationId, setActiveConversation],
  );

  const handleBack = useCallback(() => {
    const socket = getSocket();
    if (activeConversationId && socket) {
      socket.emit('leave_room', { conversation_id: activeConversationId });
    }
    setActiveConversation(null);
    setMobileShowChat(false);
  }, [activeConversationId, setActiveConversation]);

  const handleConversationCreated = useCallback(
    (conv: ChatConversation) => {
      setConversations([conv, ...conversations.filter((c) => c.id !== conv.id)]);
      handleSelectConversation(conv.id);
      setShowNewConv(false);
    },
    [conversations, setConversations, handleSelectConversation],
  );

  const activeConversation = conversations.find((c) => c.id === activeConversationId) ?? null;

  return (
    <div className="mx-auto flex h-[calc(100vh-4rem)] max-w-6xl overflow-hidden bg-slate-50">
      {/* Sidebar — hidden on mobile when chat is open */}
      <div
        className={`w-full flex-shrink-0 border-r border-gray-200 md:w-80 ${
          mobileShowChat ? 'hidden md:block' : 'block'
        }`}
      >
        <ConversationList
          conversations={conversations}
          activeId={activeConversationId}
          currentUserId={user?.id ?? 0}
          onSelect={handleSelectConversation}
          onNewConversation={() => setShowNewConv(true)}
        />
      </div>

      {/* Chat area */}
      <div className={`min-w-0 flex-1 ${!mobileShowChat ? 'hidden md:flex' : 'flex'} flex-col`}>
        {activeConversation ? (
          <ChatWindow
            conversation={activeConversation}
            currentUserId={user?.id ?? 0}
            onBack={handleBack}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center text-gray-400">
            <p>Selecione uma conversa para começar</p>
          </div>
        )}
      </div>

      {showNewConv && (
        <NewConversationModal
          onClose={() => setShowNewConv(false)}
          onCreated={handleConversationCreated}
        />
      )}
    </div>
  );
}

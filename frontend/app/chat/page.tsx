import { Suspense } from 'react';
import ChatPageClient from './ChatPageClient';

export default function ChatPage() {
  return (
    <div className="mx-auto flex h-[calc(100vh-4rem)] max-w-4xl overflow-hidden bg-slate-50">
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

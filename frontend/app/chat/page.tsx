import { Suspense } from 'react';
import ChatPageClient from './ChatPageClient';

export default function ChatPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex h-[calc(100vh-4rem)] max-w-6xl items-center justify-center bg-slate-50 text-gray-400">
          <p>Carregando conversas…</p>
        </div>
      }
    >
      <ChatPageClient />
    </Suspense>
  );
}

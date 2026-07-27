'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import * as React from 'react';

interface Doc {
  pageContent?: string;
  metdata?: {
    loc?: {
      pageNumber?: number;
    };
    source?: string;
  };
}
interface IMessage {
  role: 'assistant' | 'user';
  content?: string;
  documents?: Doc[];
}

const ChatComponent: React.FC = () => {
  const [message, setMessage] = React.useState<string>('');
  const [messages, setMessages] = React.useState<IMessage[]>([]);

  console.log({ messages });

  const handleSendChatMessage = async () => {
    if (!message.trim()) return;
    
    const userMessage = message;
    setMessage(''); // Clear input
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
    
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const res = await fetch(`${apiUrl}/chat?message=${encodeURIComponent(userMessage)}`);
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: data?.message || 'No response received',
          documents: data?.docs || [],
        },
      ]);
    } catch (error) {
      console.error('Error fetching chat response:', error);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Sorry, I encountered an error. Please try again.',
          documents: [],
        },
      ]);
    }
  };

  return (
    <div className="p-4 flex flex-col h-screen">
      <div className="flex-1 overflow-y-auto mb-20">
        {messages.length === 0 ? (
          <div className="text-center text-gray-500 mt-10">
            Start a conversation by asking a question about your PDF
          </div>
        ) : (
          messages.map((msg, index) => (
            <div
              key={index}
              className={`mb-4 p-4 rounded-lg ${
                msg.role === 'user'
                  ? 'bg-blue-100 ml-auto max-w-[80%]'
                  : 'bg-gray-100 mr-auto max-w-[80%]'
              }`}
            >
              <div className="font-semibold mb-2">
                {msg.role === 'user' ? 'You' : 'Assistant'}
              </div>
              <div className="whitespace-pre-wrap">{msg.content}</div>
              {msg.documents && msg.documents.length > 0 && (
                <div className="mt-2 text-xs text-gray-600">
                  Found {msg.documents.length} relevant document(s)
                </div>
              )}
            </div>
          ))
        )}
      </div>
      <div className="fixed bottom-4 left-[30vw] right-4 flex gap-3 p-4 bg-white border-t">
        <Input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyPress={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSendChatMessage();
            }
          }}
          placeholder="Type your message here..."
          className="flex-1"
        />
        <Button onClick={handleSendChatMessage} disabled={!message.trim()}>
          Send
        </Button>
      </div>
    </div>
  );
};
export default ChatComponent;

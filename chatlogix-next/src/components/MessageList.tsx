import React from 'react';

interface Message {
  id: string | number;
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string | null;
  streaming?: boolean;
  isError?: boolean;
}

interface MessageListProps {
  messages: Message[];
}

const MessageList: React.FC<MessageListProps> = ({ messages }) => {
  return (
    <div>
      {messages.map((message) => (
        <div
          key={message.id}
          className={`message ${message.role} ${message.isError ? 'isError' : ''}`}
        >
          <div className="message-avatar">
            {message.role === 'assistant' ? '🤖' : '👤'}
          </div>
          <div className="message-content">
            {message.content || (message.streaming ? '▌' : '')}
          </div>
        </div>
      ))}
    </div>
  );
};

export default MessageList;

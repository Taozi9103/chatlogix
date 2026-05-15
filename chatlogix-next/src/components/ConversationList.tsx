import React from 'react';

interface Conversation {
  id: number;
  title: string;
  roleId?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface ConversationListProps {
  conversations: Conversation[];
  currentConversation: Conversation | null;
  onNewConversation: () => void;
  onSelectConversation: (conversation: Conversation) => void;
  onDeleteConversation: (conversationId: number) => void;
}

const ConversationList: React.FC<ConversationListProps> = ({
  conversations,
  currentConversation,
  onNewConversation,
  onSelectConversation,
  onDeleteConversation,
}) => {
  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <button className="new-chat-btn" onClick={onNewConversation}>
          + 新对话
        </button>
      </div>
      <div className="conversation-list">
        {conversations.map((conversation) => (
          <div
            key={conversation.id}
            className={`conversation-item ${
              currentConversation?.id === conversation.id ? 'active' : ''
            }`}
            onClick={() => onSelectConversation(conversation)}
          >
            <span>{conversation.title}</span>
            <button
              className="delete-btn"
              onClick={(e) => {
                e.stopPropagation();
                onDeleteConversation(conversation.id);
              }}
            >
              🗑️
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ConversationList;

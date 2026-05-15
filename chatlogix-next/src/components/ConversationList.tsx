import React from 'react';

interface Conversation {
  id: number;
  title: string;
  roleId?: string;
  isFavorite?: boolean;
  tagIds?: number[];
  createdAt?: string;
  updatedAt?: string;
}

interface ConversationListProps {
  conversations: Conversation[];
  currentConversation: Conversation | null;
  onNewConversation: () => void;
  onSelectConversation: (conversation: Conversation) => void;
  onDeleteConversation: (conversationId: number) => void;
  onToggleFavorite: (conversation: Conversation) => void;
}

const ConversationList: React.FC<ConversationListProps> = ({
  conversations,
  currentConversation,
  onNewConversation,
  onSelectConversation,
  onDeleteConversation,
  onToggleFavorite,
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
            <div className="conversation-actions">
              <button
                className={`fav-btn ${conversation.isFavorite ? 'active' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleFavorite(conversation);
                }}
                aria-label={conversation.isFavorite ? '取消收藏' : '收藏'}
                title={conversation.isFavorite ? '取消收藏' : '收藏'}
              >
                {conversation.isFavorite ? '⭐' : '☆'}
              </button>
              <button
                className="delete-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteConversation(conversation.id);
                }}
                aria-label="删除会话"
                title="删除会话"
              >
                🗑️
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ConversationList;

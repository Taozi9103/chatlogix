import React, { useState } from 'react';
import '../App.css';

const ConversationList = ({ 
  conversations, 
  currentConversation, 
  onNewConversation, 
  onSelectConversation, 
  onDeleteConversation 
}) => {
  const [deletingId, setDeletingId] = useState(null);

  const handleDelete = (e, conversationId) => {
    e.stopPropagation();
    if (window.confirm('确定要删除这个对话吗？')) {
      setDeletingId(conversationId);
      onDeleteConversation(conversationId);
    }
  };

  return (
    <aside className="conversation-sidebar">
      <div className="sidebar-header">
        <h2>聊天记录</h2>
        <button 
          className="new-conversation-btn"
          onClick={onNewConversation}
        >
          + 新建对话
        </button>
      </div>

      <div className="conversation-list">
        {conversations.length === 0 ? (
          <div className="empty-conversations">
            暂无对话，点击上方按钮创建
          </div>
        ) : (
          conversations.map((conversation) => (
            <div
              key={conversation.id}
              className={`conversation-item ${currentConversation?.id === conversation.id ? 'active' : ''}`}
              onClick={() => onSelectConversation(conversation)}
            >
              <div className="conversation-title">
                {conversation.title}
              </div>
              <button
                className="delete-btn"
                onClick={(e) => handleDelete(e, conversation.id)}
                style={{ opacity: deletingId === conversation.id ? 0 : 1 }}
              >
                ×
              </button>
            </div>
          ))
        )}
      </div>
    </aside>
  );
};

export default ConversationList;
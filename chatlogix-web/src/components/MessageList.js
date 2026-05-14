import React from 'react';

const MessageList = ({ messages }) => {
  if (messages.length === 0) {
    return (
      <div className="loading" style={{ textAlign: 'center', marginTop: '50px' }}>
        <p>👋 欢迎使用 ChatLogix！</p>
        <p>输入消息开始和 AI 对话吧~</p>
      </div>
    );
  }

  return (
    <>
      {messages.map((message, index) => (
        <div
          key={message.id ?? index}
          className={`message ${message.role}${message.streaming ? ' streaming' : ''}`}
        >
          <div className="message-bubble">
            {message.content}
            {message.timestamp && !message.streaming && (
              <div className="message-time">
                {new Date(message.timestamp).toLocaleTimeString()}
              </div>
            )}
          </div>
        </div>
      ))}
    </>
  );
};

export default MessageList;
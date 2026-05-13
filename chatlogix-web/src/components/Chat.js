import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import MessageList from './MessageList';

const Chat = () => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const navigate = useNavigate();
  const messagesEndRef = useRef(null);
  const user = (() => {
    try {
      const userData = localStorage.getItem('user');
      return userData && userData !== 'undefined' ? JSON.parse(userData) : {};
    } catch {
      return {};
    }
  })();

  // 获取 token
  const getToken = () => localStorage.getItem('token');

  // 配置 axios 拦截器，自动添加 token
  useEffect(() => {
    const token = getToken();
    if (!token) {
      navigate('/login');
      return;
    }

    // 设置 axios 默认 header
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;

    // 加载历史消息
    loadHistory();
  }, [navigate]);

  // 加载历史对话
  const loadHistory = async () => {
    try {
      const response = await axios.get('http://localhost:5001/api/chat/history');
      const historyMessages = response.data.messages.map((msg, index) => ({
        id: index,
        role: msg.role,
        content: msg.content,
        timestamp: msg.created_at
      }));
      setMessages(historyMessages);
    } catch (err) {
      console.error('加载历史失败:', err);
      if (err.response?.status === 401) {
        logout();
      }
    }
  };

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // 发送消息
  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMessage = {
      id: Date.now(),
      role: 'user',
      content: input,
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);
    setIsTyping(true);

    try {
      const response = await axios.post('http://localhost:5001/api/chat/send', {
        message: input
      });

      const assistantMessage = {
        id: Date.now() + 1,
        role: 'assistant',
        content: response.data.reply,
        timestamp: new Date().toISOString()
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (err) {
      console.error('发送失败:', err);
      const errorMessage = {
        id: Date.now() + 1,
        role: 'assistant',
        content: '抱歉，发生了错误：' + (err.response?.data?.error || '请稍后重试'),
        timestamp: new Date().toISOString(),
        isError: true
      };
      setMessages(prev => [...prev, errorMessage]);
      
      if (err.response?.status === 401) {
        logout();
      }
    } finally {
      setLoading(false);
      setIsTyping(false);
    }
  };

  // 处理回车键
  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // 退出登录
  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  // 清空对话（刷新页面重新加载历史，不清除数据库）
  const clearChat = () => {
    setMessages([]);
    loadHistory();
  };

  return (
    <div className="chat-container">
      <div className="chat-header">
        <h1>🤖 ChatLogix - AI 助手</h1>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={clearChat} className="logout-button" style={{ background: 'rgba(255,255,255,0.15)' }}>
            🔄 刷新
          </button>
          <button onClick={logout} className="logout-button">
            🚪 退出登录 ({user.username})
          </button>
        </div>
      </div>

      <div className="messages-container">
        <MessageList messages={messages} />
        {isTyping && (
          <div className="message assistant">
            <div className="typing-indicator">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-container">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="输入消息... (按 Enter 发送)"
          disabled={loading}
        />
        <button 
          onClick={sendMessage} 
          className="send-button"
          disabled={loading || !input.trim()}
        >
          {loading ? '发送中...' : '发送'}
        </button>
      </div>
    </div>
  );
};

export default Chat;
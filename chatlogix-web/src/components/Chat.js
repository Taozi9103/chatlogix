import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import MessageList from './MessageList';
import ConversationList from './ConversationList';
import RoleSelector from './RoleSelector';
import '../App.css';

/** 与后端默认角色一致，避免首屏请求未完成时无角色、无选择器 */
const DEFAULT_ROLE = {
  id: 'assistant',
  name: 'AI助手',
  icon: '🤖',
  description: '全能AI助手，帮您解答各种问题',
};

/** 解析 GET /api/chat/roles 响应体：{ roles: [...] }，兼容旧版 { success, roles } */
function rolesFromResponseBody(data) {
  if (!data || !Array.isArray(data.roles)) return [];
  return data.roles;
}

/** 会话详情单条消息：兼容 createdAt / created_at、无 id */
function normalizeHistoryMessage(msg, index) {
  const ts = msg.createdAt ?? msg.created_at ?? null;
  return {
    id: msg.id != null ? msg.id : `hist-${index}-${ts ?? ''}-${msg.role ?? 'x'}`,
    role: msg.role,
    content: msg.content,
    timestamp: ts,
  };
}

const API_BASE = 'http://localhost:5001';

const Chat = () => {
  const [conversations, setConversations] = useState([]);
  const [currentConversation, setCurrentConversation] = useState(null);
  const [currentRole, setCurrentRole] = useState(DEFAULT_ROLE);
  /** 与 /api/chat/roles 的 { roles } 一致，供角色弹窗使用 */
  const [roles, setRoles] = useState([]);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const navigate = useNavigate();
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);

  const user = (() => {
    try {
      const userData = localStorage.getItem('user');
      return userData && userData !== 'undefined' ? JSON.parse(userData) : {};
    } catch {
      return {};
    }
  })();

  const getToken = () => localStorage.getItem('token');

  // 初始化
  useEffect(() => {
    const token = getToken();
    if (!token) {
      navigate('/login');
      return;
    }

    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    
    fetchConversations();
    fetchRoles();
  }, [navigate]);

  // 获取会话列表
  const fetchConversations = async () => {
    try {
      const response = await axios.get(`${API_BASE}/api/conversations`);
      console.log('会话列表响应:', response.data);
      if (response.data.success) {
        const list = response.data.conversations || [];
        setConversations(list);
        setCurrentConversation((prev) => {
          if (list.length === 0) return null;
          if (prev && list.some((c) => c.id === prev.id)) return prev;
          return list[0];
        });
      }
    } catch (err) {
      console.error('获取会话列表失败:', err);
      if (err.response?.status === 401) {
        logout();
      }
    }
  };

  // 获取角色列表（弹窗选项来自 /api/chat/roles 的 roles 数组）
  const fetchRoles = async () => {
    setRolesLoading(true);
    try {
      const response = await axios.get(`${API_BASE}/api/chat/roles`);
      console.log('角色列表响应:', response.data);
      const list = rolesFromResponseBody(response.data);
      setRoles(list);
      if (list.length > 0) {
        setCurrentRole((prev) => {
          const match = list.find((r) => r.id === prev?.id);
          return match || list[0];
        });
      }
    } catch (err) {
      console.error('获取角色列表失败:', err);
      setRoles([]);
    } finally {
      setRolesLoading(false);
    }
  };

  // 加载会话历史消息
  const loadConversationMessages = useCallback(async (conversationId, page = 1) => {
    try {
      const response = await axios.get(`${API_BASE}/api/conversations/${conversationId}`, {
        params: { page, pageSize: 20 }
      });

      console.log('会话消息响应:', response.data);

      const data = response.data;
      if (!data || !Array.isArray(data.messages)) {
        return;
      }

      const historyMessages = data.messages.map((msg, i) => normalizeHistoryMessage(msg, i));

      if (page === 1) {
        setMessages(historyMessages);
      } else {
        setMessages((prev) => [...historyMessages, ...prev]);
      }

      const pag = data.pagination;
      if (pag && typeof pag.totalPages === 'number') {
        setPagination(pag);
        setHasMore(page < pag.totalPages);
      } else {
        setPagination(pag ?? null);
        setHasMore(false);
      }

      const conv = data.conversation;
      const roleId = conv?.roleId ?? conv?.role_id;
      if (conv && roleId) {
        try {
          const roleResponse = await axios.get(`${API_BASE}/api/chat/roles`);
          const list = rolesFromResponseBody(roleResponse.data);
          if (list.length > 0) {
            setRoles(list);
            const role = list.find((r) => r.id === roleId);
            if (role) {
              setCurrentRole(role);
            }
          }
        } catch (err) {
          console.error('更新角色失败:', err);
        }
      }
    } catch (err) {
      console.error('加载历史消息失败:', err);
    }
  }, []);

  // 切换会话时加载消息
  useEffect(() => {
    if (currentConversation) {
      console.log('切换到会话:', currentConversation);
      setMessages([]);
      loadConversationMessages(currentConversation.id);
    }
  }, [currentConversation, loadConversationMessages]);

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 滚动加载更多历史消息
  const handleScroll = () => {
    if (!messagesContainerRef.current) return;

    const { scrollTop } = messagesContainerRef.current;
    if (scrollTop === 0 && hasMore && !loading && pagination) {
      const nextPage = pagination.page + 1;
      if (currentConversation) {
        loadConversationMessages(currentConversation.id, nextPage);
      }
    }
  };

  // 新建会话
  const handleNewConversation = async () => {
    try {
      const response = await axios.post(`${API_BASE}/api/conversations`, {
        title: '新对话',
        roleId: currentRole?.id || 'assistant'
      });
      console.log('新建会话响应:', response.data);
      if (response.data.success) {
        const newConversation = response.data.conversation;
        setConversations(prev => [newConversation, ...prev]);
        setCurrentConversation(newConversation);
      }
    } catch (err) {
      console.error('创建会话失败:', err);
    }
  };

  // 选择会话
  const handleSelectConversation = (conversation) => {
    console.log('选择会话:', conversation);
    setCurrentConversation(conversation);
  };

  // 删除会话
  const handleDeleteConversation = async (conversationId) => {
    try {
      await axios.delete(`${API_BASE}/api/conversations/${conversationId}`);
      setConversations(prev => prev.filter(c => c.id !== conversationId));
      if (currentConversation?.id === conversationId) {
        const remaining = conversations.filter(c => c.id !== conversationId);
        setCurrentConversation(remaining[0] || null);
      }
    } catch (err) {
      console.error('删除会话失败:', err);
    }
  };

  // 切换角色
  const handleRoleChange = (role) => {
    console.log('切换角色:', role);
    setCurrentRole(role);
  };

  // 发送消息（SSE 流式，POST /api/chat/stream）
  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const text = input.trim();
    const convId = currentConversation?.id;
    const priorMessageCount = messages.length;
    const wasPlaceholderNewChat = currentConversation?.title === '新对话';

    const userMessage = {
      id: Date.now(),
      role: 'user',
      content: text,
      timestamp: new Date().toISOString()
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    const assistantStreamId = Date.now() + 1;
    let resolvedConvId = convId;
    let reader;

    try {
      const payload = {
        message: text,
        roleId: currentRole?.id || 'assistant'
      };
      if (convId) payload.conversationId = convId;

      const response = await fetch(`${API_BASE}/api/chat/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
          Accept: 'text/event-stream'
        },
        body: JSON.stringify(payload)
      });

      if (response.status === 401) {
        logout();
        return;
      }

      if (!response.ok) {
        const errText = await response.text();
        let errMsg = errText.slice(0, 300) || `请求失败 (${response.status})`;
        try {
          const j = JSON.parse(errText);
          if (j.error) errMsg = typeof j.error === 'string' ? j.error : j.error.message || errMsg;
        } catch (_) {}
        throw new Error(errMsg);
      }

      if (!response.body) {
        throw new Error('浏览器不支持流式读取响应');
      }

      setMessages((prev) => [
        ...prev,
        {
          id: assistantStreamId,
          role: 'assistant',
          content: '',
          timestamp: null,
          streaming: true
        }
      ]);

      reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let sseDone = false;

      while (!sseDone) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let sep;
        while ((sep = buf.indexOf('\n\n')) >= 0) {
          const rawEvent = buf.slice(0, sep);
          buf = buf.slice(sep + 2);
          const dataLine = rawEvent.split('\n').find((l) => l.startsWith('data:'));
          if (!dataLine) continue;
          const raw = dataLine.replace(/^data:\s*/i, '').trim();
          if (raw === '[DONE]') {
            sseDone = true;
            break;
          }
          let j;
          try {
            j = JSON.parse(raw);
          } catch {
            continue;
          }
          if (j.error) {
            throw new Error(typeof j.error === 'string' ? j.error : j.error?.message || '流式错误');
          }
          if (j.type === 'meta' && j.conversationId != null) {
            resolvedConvId = j.conversationId;
          }
          if (j.content) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantStreamId
                  ? { ...m, content: (m.content || '') + j.content }
                  : m
              )
            );
          }
        }
        if (sseDone) break;
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantStreamId
            ? {
                ...m,
                streaming: false,
                timestamp: m.timestamp || new Date().toISOString()
              }
            : m
        )
      );

      if (!convId && resolvedConvId) {
        const newConv = {
          id: resolvedConvId,
          title: text.substring(0, 20) || '新对话',
          roleId: currentRole?.id || 'assistant'
        };
        setConversations((prev) => {
          if (prev.some((c) => c.id === resolvedConvId)) return prev;
          return [newConv, ...prev];
        });
        setCurrentConversation(newConv);
      }

      const activeId = convId ?? resolvedConvId;
      if (priorMessageCount === 0 && activeId && wasPlaceholderNewChat) {
        const newTitle = text.substring(0, 20);
        await axios.put(`${API_BASE}/api/conversations/${activeId}`, {
          title: newTitle
        });
        setConversations((prev) =>
          prev.map((c) => (c.id === activeId ? { ...c, title: newTitle } : c))
        );
        setCurrentConversation((prev) =>
          prev && prev.id === activeId ? { ...prev, title: newTitle } : prev
        );
      }
    } catch (err) {
      console.error('发送失败:', err);
      setMessages((prev) => {
        const withoutStream = prev.filter((m) => m.id !== assistantStreamId);
        return [
          ...withoutStream,
          {
            id: Date.now() + 1,
            role: 'assistant',
            content: '抱歉，发生了错误：' + (err.message || '请稍后重试'),
            timestamp: new Date().toISOString(),
            isError: true
          }
        ];
      });
    } finally {
      try {
        reader?.releaseLock();
      } catch (_) {}
      setLoading(false);
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

  console.log('当前状态:', { currentConversation, currentRole, conversations });

  return (
    <div className="chat-layout">
      <ConversationList
        conversations={conversations}
        currentConversation={currentConversation}
        onNewConversation={handleNewConversation}
        onSelectConversation={handleSelectConversation}
        onDeleteConversation={handleDeleteConversation}
      />

      <div className="chat-main">
        <div className="chat-header">
          <div className="header-left">
            <h1>🤖 ChatLogix - AI 助手</h1>
          </div>
          <div className="header-right">
            <RoleSelector
              roles={roles}
              rolesLoading={rolesLoading}
              currentRole={currentRole}
              onRoleChange={handleRoleChange}
            />
            <button onClick={logout} className="logout-button">
              🚪 退出登录
            </button>
          </div>
        </div>

        <div 
          className="messages-container"
          ref={messagesContainerRef}
          onScroll={handleScroll}
        >
          {hasMore && (
            <div className="load-more-indicator">
              加载更多...
            </div>
          )}
          <MessageList messages={messages} />
          <div ref={messagesEndRef} />
        </div>

        <div className="chat-input-container">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="输入消息... (按 Enter 发送；无会话时发送将自动创建)"
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
    </div>
  );
};

export default Chat;
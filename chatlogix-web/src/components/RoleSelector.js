import React, { useState } from 'react';
import '../App.css';

/**
 * 弹窗列表由父组件传入的 roles 决定（GET /api/chat/roles 响应体中的 roles 数组）
 */
const RoleSelector = ({ roles, rolesLoading, currentRole, onRoleChange }) => {
  const [isOpen, setIsOpen] = useState(false);

  const handleSelectRole = (role) => {
    onRoleChange(role);
    setIsOpen(false);
  };

  return (
    <div className="role-selector">
      <button
        type="button"
        className="role-selector-btn"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="role-icon">{currentRole?.icon || '🤖'}</span>
        <span className="role-name">{currentRole?.name || 'AI助手'}</span>
        <span className="dropdown-arrow">▼</span>
      </button>

      {isOpen && (
        <>
          <div className="role-selector-overlay" onClick={() => setIsOpen(false)} />
          <div className="role-selector-dropdown">
            {rolesLoading ? (
              <div className="role-selector-dropdown-status">加载角色列表中…</div>
            ) : roles.length === 0 ? (
              <div className="role-selector-dropdown-status">
                暂无角色数据，请检查 /api/chat/roles 接口
              </div>
            ) : (
              roles.map((role) => (
                <button
                  type="button"
                  key={role.id}
                  className={`role-option ${currentRole?.id === role.id ? 'active' : ''}`}
                  onClick={() => handleSelectRole(role)}
                >
                  <span className="role-option-icon">{role.icon}</span>
                  <div className="role-option-info">
                    <div className="role-option-name">{role.name}</div>
                    <div className="role-option-desc">{role.description}</div>
                  </div>
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default RoleSelector;

import React, { useState, useRef, useEffect } from 'react';

interface Role {
  id: string;
  name: string;
  icon: string;
  description: string;
  systemPrompt?: string;
}

interface RoleSelectorProps {
  roles: Role[];
  rolesLoading: boolean;
  currentRole: Role;
  onRoleChange: (role: Role) => void;
}

const RoleSelector: React.FC<RoleSelectorProps> = ({
  roles,
  rolesLoading,
  currentRole,
  onRoleChange,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (role: Role) => {
    onRoleChange(role);
    setIsOpen(false);
  };

  return (
    <div className="role-selector-container" ref={dropdownRef}>
      <button
        className="role-btn"
        onClick={() => setIsOpen(!isOpen)}
        disabled={rolesLoading}
      >
        <span>{currentRole.icon}</span>
        <span>{currentRole.name}</span>
        <span>▼</span>
      </button>
      {isOpen && (
        <div className="role-dropdown">
          {rolesLoading ? (
            <div style={{ padding: '1rem', textAlign: 'center', color: '#718096' }}>
              加载中...
            </div>
          ) : (
            roles.map((role) => (
              <div
                key={role.id}
                className={`role-option ${currentRole.id === role.id ? 'selected' : ''}`}
                onClick={() => handleSelect(role)}
              >
                <span className="role-option-icon">{role.icon}</span>
                <div className="role-option-content">
                  <h4>{role.name}</h4>
                  <p>{role.description}</p>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default RoleSelector;

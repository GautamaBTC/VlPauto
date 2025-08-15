import React from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

// Placeholder for ThemeSwitch component
const ThemeSwitch = () => (
    <label title="Сменить тему">
        <input type="checkbox" />
        <span>Тема</span>
    </label>
);

const MainLayout = () => {
    const { user, logout } = useAuth();

    return (
        <>
            <header className="page-header">
                <h1 className="app-title"><i className="fas fa-car"></i> Vip<span className="title-auto">Авто</span></h1>
                <div className="header-controls">
                    <div id="user-name-display">{user?.name}</div>
                    <ThemeSwitch />
                    <button onClick={logout} className="btn-icon btn-logout" title="Выйти">
                        <i className="fas fa-sign-out-alt"></i>
                    </button>
                </div>
            </header>

            <main className="main-content">
                <Outlet /> {/* Page content will be rendered here */}
            </main>

            <nav className="nav-container">
                <div className="nav-tabs">
                    <NavLink to="/" end className="nav-tab" title="Главная">
                        <i className="fas fa-home"></i><span>Главная</span>
                    </NavLink>
                    <NavLink to="/orders" className="nav-tab" title="Наряды">
                        <i className="fas fa-history"></i><span>Наряды</span>
                    </NavLink>
                    <NavLink to="/clients" className="nav-tab" title="Клиенты">
                        <i className="fas fa-users"></i><span>Клиенты</span>
                    </NavLink>
                    <NavLink to="/archive" className="nav-tab" title="Архив">
                        <i className="fas fa-archive"></i><span>Архив</span>
                    </NavLink>
                    {/* Privileged routes can be added here based on user role */}
                </div>
            </nav>
        </>
    );
};

export default MainLayout;

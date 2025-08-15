import React from 'react';
import { Routes, Route } from 'react-router-dom';

import MainLayout from './layouts/MainLayout';
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import ProtectedRoute from './components/ProtectedRoute';

// Placeholders for other pages
const OrdersPage = () => <h2>Заказ-наряды</h2>;
const ClientsPage = () => <h2>Клиенты</h2>;
const ArchivePage = () => <h2>Архив</h2>;
const NotFoundPage = () => <h1>404 - Страница не найдена</h1>;

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      {/* Protected Routes */}
      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<MainLayout />}>
          <Route index element={<HomePage />} />
          <Route path="orders" element={<OrdersPage />} />
          <Route path="clients" element={<ClientsPage />} />
          <Route path="archive" element={<ArchivePage />} />
        </Route>
      </Route>

      {/* Catch-all route for 404 */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export default App;

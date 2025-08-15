-- Схема данных для проекта VIPавто (PostgreSQL)

-- Таблица пользователей
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    login VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL, -- В реальном проекте пароли должны быть хешированы
    role VARCHAR(20) NOT NULL CHECK (role IN ('DIRECTOR', 'SENIOR_MASTER', 'MASTER')),
    name VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Таблица клиентов
CREATE TABLE clients (
    id VARCHAR(50) PRIMARY KEY, -- Сохраняем строковый ID для совместимости
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(20) UNIQUE,
    car_model VARCHAR(100),
    license_plate VARCHAR(20),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Таблица заказ-нарядов (текущие)
CREATE TABLE orders (
    id VARCHAR(50) PRIMARY KEY, -- Сохраняем строковый ID для совместимости
    master_name VARCHAR(100) NOT NULL,
    car_model VARCHAR(100),
    license_plate VARCHAR(20),
    description TEXT,
    amount NUMERIC(10, 2) NOT NULL,
    payment_type VARCHAR(50),
    status VARCHAR(20) DEFAULT 'new' NOT NULL,
    client_id VARCHAR(50) REFERENCES clients(id) ON DELETE SET NULL,
    client_name VARCHAR(100),
    client_phone VARCHAR(20),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Таблица для хранения информации о закрытых неделях
CREATE TABLE history_weeks (
    id VARCHAR(50) PRIMARY KEY, -- week-timestamp
    closed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Таблица для хранения архивных заказ-нарядов
CREATE TABLE history_orders (
    id SERIAL PRIMARY KEY,
    original_order_id VARCHAR(50),
    week_id VARCHAR(50) NOT NULL REFERENCES history_weeks(id) ON DELETE CASCADE,
    master_name VARCHAR(100),
    car_model VARCHAR(100),
    license_plate VARCHAR(20),
    description TEXT,
    amount NUMERIC(10, 2),
    payment_type VARCHAR(50),
    client_name VARCHAR(100),
    client_phone VARCHAR(20),
    created_at TIMESTAMPTZ
);

-- Таблица для хранения отчетов по зарплатам
CREATE TABLE salary_reports (
    id SERIAL PRIMARY KEY,
    week_id VARCHAR(50) NOT NULL REFERENCES history_weeks(id) ON DELETE CASCADE,
    master_name VARCHAR(100) NOT NULL,
    revenue NUMERIC(10, 2),
    orders_count INTEGER,
    salary NUMERIC(10, 2)
);

-- Индексы для ускорения поиска
CREATE INDEX idx_orders_master_name ON orders(master_name);
CREATE INDEX idx_orders_created_at ON orders(created_at);
CREATE INDEX idx_clients_phone ON clients(phone);
CREATE INDEX idx_history_orders_week_id ON history_orders(week_id);
CREATE INDEX idx_salary_reports_week_id ON salary_reports(week_id);

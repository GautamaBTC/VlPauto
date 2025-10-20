-- Схема данных для проекта VIPавто (SQLite)

-- Таблица пользователей
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    login TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('DIRECTOR', 'SENIOR_MASTER', 'MASTER')),
    name TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Таблица клиентов
CREATE TABLE clients (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT UNIQUE,
    car_model TEXT,
    license_plate TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Таблица заказ-нарядов (текущие)
CREATE TABLE orders (
    id TEXT PRIMARY KEY,
    master_name TEXT NOT NULL,
    car_model TEXT,
    license_plate TEXT,
    description TEXT,
    amount REAL NOT NULL,
    payment_type TEXT,
    status TEXT DEFAULT 'new' NOT NULL,
    client_id TEXT,
    client_name TEXT,
    client_phone TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL
);

-- Таблица для хранения информации о закрытых неделях
CREATE TABLE history_weeks (
    id TEXT PRIMARY KEY,
    closed_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Таблица для хранения архивных заказ-нарядов
CREATE TABLE history_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    original_order_id TEXT,
    week_id TEXT NOT NULL,
    master_name TEXT,
    car_model TEXT,
    license_plate TEXT,
    description TEXT,
    amount REAL,
    payment_type TEXT,
    client_name TEXT,
    client_phone TEXT,
    created_at TEXT,
    FOREIGN KEY (week_id) REFERENCES history_weeks(id) ON DELETE CASCADE
);

-- Таблица для хранения отчетов по зарплатам
CREATE TABLE salary_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    week_id TEXT NOT NULL,
    master_name TEXT NOT NULL,
    revenue REAL,
    orders_count INTEGER,
    salary REAL,
    FOREIGN KEY (week_id) REFERENCES history_weeks(id) ON DELETE CASCADE
);

-- Индексы для ускорения поиска
CREATE INDEX idx_orders_master_name ON orders(master_name);
CREATE INDEX idx_orders_created_at ON orders(created_at);
CREATE INDEX idx_clients_phone ON clients(phone);
CREATE INDEX idx_history_orders_week_id ON history_orders(week_id);
CREATE INDEX idx_salary_reports_week_id ON salary_reports(week_id);

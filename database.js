/*────────────────────────────────────────────
  database.js
  Модуль для управления базой данных (SQLite)
─────────────────────────────────────────────*/

const sqlite3 = require('sqlite3').verbose();

// --- Конфигурация подключения к SQLite ---
const dbPath = process.env.DATABASE_URL || 'vipauto.sqlite';

if (!dbPath) {
  console.error('[FATAL] DATABASE_URL is not defined in environment variables.');
  console.error('Please create a .env file with DATABASE_URL=your_database_name.sqlite');
  process.exit(1);
}

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('[FATAL] Could not connect to database:', err.message);
    process.exit(1);
  }
  console.log('[DATABASE] Connected to SQLite database:', dbPath);
});

// Включаем поддержку внешних ключей для целостности данных
db.run('PRAGMA foreign_keys = ON;');

/**
 * Выполняет SQL-запрос (SELECT) к базе данных, возвращающий строки
 * @param {string} text - Текст запроса
 * @param {Array} params - Параметры запроса
 * @returns {Promise<Array>}
 */
const query = (text, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(text, params, (err, rows) => {
      if (err) {
        console.error('Database query error:', text, params, err.message);
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
};

/**
 * Выполняет SQL-запрос (INSERT, UPDATE, DELETE) к базе данных
 * @param {string} text - Текст запроса
 * @param {Array} params - Параметры запроса
 * @returns {Promise<{ changes: number, lastID: number }>}
 */
const run = (text, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(text, params, function(err) { // Обычная функция для доступа к `this`
      if (err) {
        console.error('Database run error:', text, params, err.message);
        reject(err);
      } else {
        resolve({ changes: this.changes, lastID: this.lastID });
      }
    });
  });
};

// --- Функции для работы с данными ---

// Геттеры для получения данных
const getUsers = async () => {
  const rows = await query('SELECT * FROM users');
  // Преобразуем массив в объект для совместимости со старой логикой
  return rows.reduce((acc, user) => {
    acc[user.login] = {
      password: user.password,
      role: user.role,
      name: user.name
    };
    return acc;
  }, {});
};

const getOrders = async () => {
  return await query('SELECT * FROM orders ORDER BY created_at DESC');
};

const getHistory = async () => {
  // Эта функция станет сложнее, пока вернем пустой массив
  // для совместимости. Логика будет реализована в closeWeek.
  return [];
};

const getClients = async () => {
  return await query('SELECT * FROM clients ORDER BY created_at DESC');
};

const findClientByPhone = async (phone) => {
  const rows = await query('SELECT * FROM clients WHERE phone = ?', [phone]);
  return rows[0]; // Возвращаем первого найденного или undefined
};

const searchClients = async (searchQuery) => {
  if (!searchQuery) return [];
  const lowerCaseQuery = searchQuery.toLowerCase();
  const queryText = "SELECT * FROM clients WHERE LOWER(name) LIKE ? OR phone LIKE ? LIMIT 10";
  const params = [`%${lowerCaseQuery}%`, `%${lowerCaseQuery}%`];
  return await query(queryText, params);
};

// Функции для изменения данных
const addOrder = async (order) => {
  const { id, masterName, carModel, licensePlate, description, amount, paymentType, status, clientId, clientName, clientPhone, createdAt } = order;
  const sql = `
    INSERT INTO orders (id, master_name, car_model, license_plate, description, amount, payment_type, status, client_id, client_name, client_phone, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  const params = [id, masterName, carModel, licensePlate, description, amount, paymentType, status || 'new', clientId, clientName, clientPhone, createdAt];
  await run(sql, params);
  const [newOrder] = await query('SELECT * FROM orders WHERE id = ?', [id]);
  return newOrder;
};

const updateOrder = async (updatedOrder) => {
  const { id, masterName, carModel, licensePlate, description, amount, paymentType } = updatedOrder;
  const sql = `
    UPDATE orders
    SET master_name = ?, car_model = ?, license_plate = ?, description = ?, amount = ?, payment_type = ?
    WHERE id = ?
  `;
  const params = [masterName, carModel, licensePlate, description, amount, paymentType, id];
  await run(sql, params);
  const [result] = await query('SELECT * FROM orders WHERE id = ?', [id]);
  return result;
};

const updateOrderStatus = async (id, status) => {
  await run('UPDATE orders SET status = ? WHERE id = ?', [status, id]);
  const [result] = await query('SELECT * FROM orders WHERE id = ?', [id]);
  return result;
};

const deleteOrder = async (id) => {
  await run('DELETE FROM orders WHERE id = ?', [id]);
  return true;
};

const addClient = async (client) => {
  const { id, name, phone, carModel, licensePlate, createdAt } = client;
  const sql = `
    INSERT INTO clients (id, name, phone, car_model, license_plate, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `;
  const params = [id, name, phone, carModel, licensePlate, createdAt];
  await run(sql, params);
  const [newClient] = await query('SELECT * FROM clients WHERE id = ?', [id]);
  return newClient;
};

const updateClient = async (updatedClient) => {
  const { id, name, phone, carModel, licensePlate } = updatedClient;
  const sql = `
    UPDATE clients SET name = ?, phone = ?, car_model = ?, license_plate = ?
    WHERE id = ?
  `;
  const params = [name, phone, carModel, licensePlate, id];
  await run(sql, params);
  const [result] = await query('SELECT * FROM clients WHERE id = ?', [id]);
  return result;
};

const closeWeek = async (payload) => {
  const { salaryReport } = payload;
  try {
    await run('BEGIN TRANSACTION');

    const weekId = `week-${Date.now()}`;
    await run('INSERT INTO history_weeks (id) VALUES (?)', [weekId]);

    // Копируем заказы в историю
    await run(`
      INSERT INTO history_orders (original_order_id, week_id, master_name, car_model, license_plate, description, amount, payment_type, client_name, client_phone, created_at)
      SELECT id, ?, master_name, car_model, license_plate, description, amount, payment_type, client_name, client_phone, created_at FROM orders
    `, [weekId]);

    // Сохраняем отчет по зарплатам
    if (salaryReport && salaryReport.length) {
      for (const report of salaryReport) {
        const { masterName, revenue, ordersCount, salary } = report;
        await run(
          'INSERT INTO salary_reports (week_id, master_name, revenue, orders_count, salary) VALUES (?, ?, ?, ?, ?)',
          [weekId, masterName, revenue, ordersCount, salary]
        );
      }
    }

    await run('DELETE FROM orders');
    await run('COMMIT');
    return true;

  } catch (e) {
    await run('ROLLBACK');
    throw e;
  }
};

const clearData = async () => {
  // Очищает текущие заказы и всю историю. Пользователей и клиентов не трогает.
  await run('DELETE FROM orders');
  await run('DELETE FROM history_weeks');
  await run('DELETE FROM salary_reports');
  await run('DELETE FROM history_orders');
  // Сброс счетчиков автоинкремента
  await run("DELETE FROM sqlite_sequence WHERE name IN ('users', 'history_orders', 'salary_reports')").catch(() => {}); // Игнорируем ошибку, если таблицы нет
  return true;
};

const clearHistory = async () => {
  await run('DELETE FROM history_weeks');
  await run('DELETE FROM salary_reports');
  await run('DELETE FROM history_orders');
  await run("DELETE FROM sqlite_sequence WHERE name IN ('history_orders', 'salary_reports')").catch(() => {}); // Игнорируем ошибку, если таблицы нет
  return true;
};

// Экспортируем функции для работы с БД
module.exports = {
  db, // Экспортируем для seed.js
  query,
  run, // Экспортируем для seed.js
  getUsers,
  getOrders,
  getHistory,
  getClients,
  findClientByPhone,
  searchClients,
  addOrder,
  updateOrder,
  updateOrderStatus,
  deleteOrder,
  addClient,
  updateClient,
  closeWeek,
  clearData,
  clearHistory
};

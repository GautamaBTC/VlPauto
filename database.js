/*────────────────────────────────────────────
  database.js
  Модуль для управления базой данных (PostgreSQL)
─────────────────────────────────────────────*/

const { Pool } = require('pg');

// --- Конфигурация подключения к Neon ---

// Собираем строку подключения вручную для поддержки SNI в средах типа Render.
// Это требует отдельных переменных окружения, которые пользователь должен установить.
const { PGHOST, PGDATABASE, PGUSER, PGPASSWORD, ENDPOINT_ID } = process.env;

// Проверяем, заданы ли все необходимые переменные, чтобы избежать падения при запуске
if (!PGHOST || !PGDATABASE || !PGUSER || !PGPASSWORD || !ENDPOINT_ID) {
  console.error('[FATAL] Missing required environment variables for Neon database connection.');
  // В реальном приложении можно было бы выйти с ошибкой: process.exit(1);
  // Но для простоты оставим так, ошибка проявится при первом запросе.
}

// Формируем строку подключения с параметром `options=endpoint=...` для SNI.
const connectionString = `postgresql://${PGUSER}:${PGPASSWORD}@${PGHOST}/${PGDATABASE}?sslmode=require&options=endpoint%3D${ENDPOINT_ID}`;

const pool = new Pool({
  connectionString,
});


/**
 * Выполняет SQL-запрос к базе данных
 * @param {string} text - Текст запроса
 * @param {Array} params - Параметры запроса
 * @returns {Promise<QueryResult<any>>}
 */
const query = (text, params) => pool.query(text, params);

// --- Функции для работы с данными ---

// Геттеры для получения данных
const getUsers = async () => {
  const { rows } = await query('SELECT * FROM users');
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
  const { rows } = await query('SELECT * FROM orders ORDER BY created_at DESC');
  return rows;
};

const getHistory = async () => {
  // Эта функция станет сложнее, пока вернем пустой массив
  // для совместимости. Логика будет реализована в closeWeek.
  return [];
};

const getClients = async () => {
  const { rows } = await query('SELECT * FROM clients ORDER BY created_at DESC');
  return rows;
};

const findClientByPhone = async (phone) => {
  const { rows } = await query('SELECT * FROM clients WHERE phone = $1', [phone]);
  return rows[0]; // Возвращаем первого найденного или undefined
};

const searchClients = async (searchQuery) => {
  if (!searchQuery) return [];
  const lowerCaseQuery = searchQuery.toLowerCase();
  const { rows } = await query(
    "SELECT * FROM clients WHERE LOWER(name) LIKE $1 OR phone LIKE $1 LIMIT 10",
    [`%${lowerCaseQuery}%`]
  );
  return rows;
};

// Функции для изменения данных
const addOrder = async (order) => {
  const { id, masterName, carModel, licensePlate, description, amount, paymentType, status, clientId, clientName, clientPhone, createdAt } = order;
  const sql = `
    INSERT INTO orders (id, master_name, car_model, license_plate, description, amount, payment_type, status, client_id, client_name, client_phone, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    RETURNING *;
  `;
  const params = [id, masterName, carModel, licensePlate, description, amount, paymentType, status || 'new', clientId, clientName, clientPhone, createdAt];
  const { rows } = await query(sql, params);
  return rows[0];
};

const updateOrder = async (updatedOrder) => {
  const { id, master_name, car_model, license_plate, description, amount, payment_type } = updatedOrder;
  const sql = `
    UPDATE orders
    SET master_name = $2, car_model = $3, license_plate = $4, description = $5, amount = $6, payment_type = $7
    WHERE id = $1
    RETURNING *;
  `;
  const params = [id, master_name, car_model, license_plate, description, amount, payment_type];
  const { rows } = await query(sql, params);
  return rows[0];
};

const updateOrderStatus = async (id, status) => {
  const { rows } = await query('UPDATE orders SET status = $1 WHERE id = $2 RETURNING *', [status, id]);
  return rows[0];
};

const deleteOrder = async (id) => {
  await query('DELETE FROM orders WHERE id = $1', [id]);
  return true;
};

const addClient = async (client) => {
  const { id, name, phone, carModel, licensePlate, createdAt } = client;
  const sql = `
    INSERT INTO clients (id, name, phone, car_model, license_plate, created_at)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *;
  `;
  const params = [id, name, phone, carModel, licensePlate, createdAt];
  const { rows } = await query(sql, params);
  return rows[0];
};

const updateClient = async (updatedClient) => {
  const { id, name, phone, car_model, license_plate } = updatedClient;
  const sql = `
    UPDATE clients SET name = $2, phone = $3, car_model = $4, license_plate = $5
    WHERE id = $1 RETURNING *;
  `;
  const params = [id, name, phone, car_model, license_plate];
  const { rows } = await query(sql, params);
  return rows[0];
};

const closeWeek = async (payload) => {
  const { salaryReport } = payload;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const weekId = `week-${Date.now()}`;
    await client.query('INSERT INTO history_weeks (id) VALUES ($1)', [weekId]);

    // Копируем заказы в историю
    await client.query(`
      INSERT INTO history_orders (original_order_id, week_id, master_name, car_model, license_plate, description, amount, payment_type, client_name, client_phone, created_at)
      SELECT id, $1, master_name, car_model, license_plate, description, amount, payment_type, client_name, client_phone, created_at FROM orders
    `, [weekId]);

    // Сохраняем отчет по зарплатам
    if (salaryReport && salaryReport.length) {
      for (const report of salaryReport) {
        const { masterName, revenue, ordersCount, salary } = report;
        await client.query(
          'INSERT INTO salary_reports (week_id, master_name, revenue, orders_count, salary) VALUES ($1, $2, $3, $4, $5)',
          [weekId, masterName, revenue, ordersCount, salary]
        );
      }
    }

    await client.query('TRUNCATE TABLE orders');
    await client.query('COMMIT');
    return true;

  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
};

const clearData = async () => {
  // Очищает текущие заказы и всю историю. Пользователей и клиентов не трогает.
  await query('TRUNCATE TABLE orders, history_weeks, salary_reports, history_orders RESTART IDENTITY');
  return true;
};

const clearHistory = async () => {
  await query('TRUNCATE TABLE history_weeks, salary_reports, history_orders RESTART IDENTITY');
  return true;
};

// Экспортируем функции для работы с БД
module.exports = {
  query, // Экспортируем для скрипта миграции
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

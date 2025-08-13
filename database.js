/*────────────────────────────────────────────
  database.js
  Модуль для управления базой данных (db.json)
─────────────────────────────────────────────*/

const fs = require('fs').promises;
const path = require('path');

const DB_PATH = path.join(__dirname, 'db.json');

// Внутреннее состояние базы данных
let db = { users: {}, orders: [], history: [], clients: [] };

/**
 * Сохраняет текущее состояние БД в файл db.json
 */
const saveDB = async () => {
  try {
    await fs.writeFile(DB_PATH, JSON.stringify(db, null, 2));
  } catch (err) {
    console.error('!!! ОШИБКА СОХРАНЕНИЯ БД:', err);
  }
};

/**
 * Загружает БД из файла db.json. Если файл не найден или пуст,
 * создает новую БД с тестовыми данными.
 */
const loadDB = async () => {
  try {
    const fileContent = await fs.readFile(DB_PATH, 'utf-8');
    if (fileContent.length < 20) throw new Error("Empty DB file");
    const parsedDb = JSON.parse(fileContent);

    // Убедимся, что все части БД существуют
    db = { users: {}, orders: [], history: [], clients: [], ...parsedDb };

    if (!db.orders || db.orders.length === 0) {
      console.log(`[DB] База пуста. Заполняем тестовыми данными.`);
      seedDatabaseWithTestData();
      await saveDB();
    } else {
      console.log(`[DB] База успешно загружена. Заказов: ${db.orders.length}, Клиентов: ${db.clients.length}`);
    }
  } catch (error) {
    console.log(`[DB] Файл db.json не найден или поврежден. Создаем новую базу.`);
    db = { users: {}, orders: [], history: [], clients: [] };
    seedDatabaseWithTestData();
    await saveDB();
  }
};

/**
 * Заполняет базу данных начальными тестовыми данными.
 */
const seedDatabaseWithTestData = () => {
    console.log('[SEED] Запуск генерации тестовых данных...');
    db.users = {
        'director': { password: 'Dir7wK9c', role: 'DIRECTOR', name: 'Владимир Орлов' },
        'vladimir.ch': { password: 'Vch4R5tG', role: 'SENIOR_MASTER', name: 'Владимир Ч.' },
        'vladimir.a': { password: 'Vla9L2mP', role: 'MASTER', name: 'Владимир А.' },
        'andrey': { password: 'And3Z8xY', role: 'MASTER', name: 'Андрей' },
        'danila': { password: 'Dan6J1vE', role: 'MASTER', name: 'Данила' },
        'maxim': { password: 'Max2B7nS', role: 'MASTER', name: 'Максим' },
        'artyom': { password: 'Art5H4qF', role: 'MASTER', name: 'Артём' }
    };

    const masterNames = Object.values(db.users).filter(u => u.role.includes('MASTER')).map(u => u.name);
    const carBrands = ['Lada Vesta', 'Toyota Camry', 'Ford Focus', 'BMW X5', 'Mercedes C-Class', 'Audi A6', 'Kia Rio', 'Hyundai Solaris'];
    const services = ['Замена масла ДВС', 'Комплексный шиномонтаж', 'Диагностика ходовой', 'Ремонт тормозной системы', 'Замена ГРМ'];

    const generateLicensePlate = () => {
        const letters = 'АВЕКМНОРСТУХ';
        const region = ['77', '99', '177', '199', '777', '161', '61', '93', '123'][Math.floor(Math.random() * 9)];
        const l1 = letters[Math.floor(Math.random() * letters.length)];
        const d1 = String(Math.floor(Math.random() * 10));
        const d2 = String(Math.floor(Math.random() * 10));
        const d3 = String(Math.floor(Math.random() * 10));
        const l2 = letters[Math.floor(Math.random() * letters.length)];
        const l3 = letters[Math.floor(Math.random() * letters.length)];
        return `${l1} ${d1}${d2}${d3} ${l2}${l3} ${region}`;
    };

    const clientsData = [
        { name: 'Иван Петров', phone: `+79${String(Math.floor(100000000 + Math.random() * 900000000)).padStart(9, '0')}` },
        { name: 'Сергей Смирнов', phone: `+79${String(Math.floor(100000000 + Math.random() * 900000000)).padStart(9, '0')}` },
        { name: 'Анна Кузнецова', phone: `+79${String(Math.floor(100000000 + Math.random() * 900000000)).padStart(9, '0')}` },
        { name: 'Ольга Васильева', phone: `+79${String(Math.floor(100000000 + Math.random() * 900000000)).padStart(9, '0')}` },
        { name: 'Дмитрий Попов', phone: `+79${String(Math.floor(100000000 + Math.random() * 900000000)).padStart(9, '0')}` },
    ];

    db.clients = clientsData.map((c, i) => ({
        ...c,
        id: `client-${Date.now()}-${i}`,
        createdAt: new Date().toISOString(),
        carModel: carBrands[Math.floor(Math.random() * carBrands.length)],
        licensePlate: generateLicensePlate()
    }));

    let testOrders = [];
    for (let i = 0; i < 50; i++) {
        const date = new Date();
        date.setDate(date.getDate() - Math.floor(Math.random() * 7));
        date.setHours(Math.floor(Math.random() * 10) + 9, Math.floor(Math.random() * 60));

        const randomClient = db.clients[Math.floor(Math.random() * db.clients.length)];

        const generateLicensePlate = () => {
            const letters = 'АВЕКМНОРСТУХ';
            const region = ['77', '99', '177', '199', '777', '161', '61', '93', '123'][Math.floor(Math.random() * 9)];
            const l1 = letters[Math.floor(Math.random() * letters.length)];
            const d1 = String(Math.floor(Math.random() * 10));
            const d2 = String(Math.floor(Math.random() * 10));
            const d3 = String(Math.floor(Math.random() * 10));
            const l2 = letters[Math.floor(Math.random() * letters.length)];
            const l3 = letters[Math.floor(Math.random() * letters.length)];
            return `${l1} ${d1}${d2}${d3} ${l2}${l3} ${region}`;
        };

        testOrders.push({
            id: `ord-${Date.now()}-${i}`,
            masterName: masterNames[Math.floor(Math.random() * masterNames.length)],
            carModel: carBrands[Math.floor(Math.random() * carBrands.length)],
            licensePlate: generateLicensePlate(),
            description: services[Math.floor(Math.random() * services.length)],
            amount: Math.floor(Math.random() * 2500 + 500),
            paymentType: ['Картой', 'Наличные', 'Перевод'][Math.floor(Math.random() * 3)],
            createdAt: date.toISOString(),
            clientName: randomClient.name,
            clientPhone: randomClient.phone,
            clientId: randomClient.id,
            status: 'new'
        });
    }
    db.orders = testOrders;
    console.log(`[SEED] Создано ${testOrders.length} тестовых заказ-нарядов и ${db.clients.length} клиентов.`);
};

// Экспортируем функции для работы с БД
module.exports = {
  // Инициализация
  loadDB,

  // Геттеры для получения данных
  getUsers: () => db.users,
  getOrders: () => db.orders,
  getHistory: () => db.history,
  getClients: () => db.clients,
  findClientByPhone: (phone) => db.clients.find(c => c.phone === phone),
  searchClients: (query) => {
    if (!query) return [];
    const lowerCaseQuery = query.toLowerCase();
    return db.clients.filter(c =>
        c.name.toLowerCase().includes(lowerCaseQuery) ||
        c.phone.includes(query)
    ).slice(0, 10);
  },

  // Функции для изменения данных
  addOrder: async (order) => {
    const orderWithStatus = { ...order, status: 'new' };
    db.orders.unshift(orderWithStatus);
    await saveDB();
  },
  updateOrder: async (updatedOrder) => {
    const orderIndex = db.orders.findIndex(o => o.id === updatedOrder.id);
    if (orderIndex !== -1) {
      db.orders[orderIndex] = { ...db.orders[orderIndex], ...updatedOrder };
      await saveDB();
      return true;
    }
    return false;
  },
  updateOrderStatus: async (id, status) => {
    const orderIndex = db.orders.findIndex(o => o.id === id);
    if (orderIndex !== -1) {
      db.orders[orderIndex].status = status;
      await saveDB();
      return true;
    }
    return false;
  },
  deleteOrder: async (id) => {
    const initialLength = db.orders.length;
    db.orders = db.orders.filter(o => o.id !== id);
    if (db.orders.length < initialLength) {
      await saveDB();
      return true;
    }
    return false;
  },
  addClient: async (client) => {
    db.clients.push(client);
    await saveDB();
  },
  updateClient: async (updatedClient) => {
    const clientIndex = db.clients.findIndex(c => c.id === updatedClient.id);
    if (clientIndex !== -1) {
      db.clients[clientIndex] = { ...db.clients[clientIndex], ...updatedClient };
      await saveDB();
      return true;
    }
    return false;
  },
  closeWeek: async (payload) => {
    const { salaryReport } = payload;
    db.history.unshift({
      weekId: `week-${Date.now()}`,
      orders: [...db.orders],
      salaryReport: salaryReport || []
    });
    db.orders = [];
    await saveDB();
  },
  clearData: async () => {
    db.orders = [];
    db.history = [];
    // Не очищаем клиентов и пользователей при этой операции
    await saveDB();
  },
  clearHistory: async () => {
    db.history = [];
    await saveDB();
  }
};

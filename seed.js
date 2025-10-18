/*────────────────────────────────────────────
  seed.js
  Скрипт для создания таблиц и наполнения БД
  Запуск: node seed.js
─────────────────────────────────────────────*/

require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

const query = (text, params) => pool.query(text, params);

const seedUsers = async () => {
    console.log('[SEED] Создание пользователей...');
    const users = [
        { login: 'director', password: 'password', role: 'DIRECTOR', name: 'Владимир Орлов' },
        { login: 'vladimir.ch', password: 'password', role: 'SENIOR_MASTER', name: 'Владимир Ч.' },
        { login: 'vladimir.a', password: 'password', role: 'MASTER', name: 'Владимир А.' },
        { login: 'andrey', password: 'password', role: 'MASTER', name: 'Андрей' },
        { login: 'danila', password: 'password', role: 'MASTER', name: 'Данила' },
        { login: 'maxim', password: 'password', role: 'MASTER', name: 'Максим' },
        { login: 'artyom', password: 'password', role: 'MASTER', name: 'Артём' }
    ];

    for (const user of users) {
        await query(
            'INSERT INTO users (login, password, role, name) VALUES ($1, $2, $3, $4)',
            [user.login, user.password, user.role, user.name]
        );
    }
    console.log(`[SEED] ✓ ${users.length} пользователей создано.`);
    return users;
};

const seedClientsAndOrders = async (users) => {
    console.log('[SEED] Создание клиентов и заказ-нарядов...');
    const masterNames = users.filter(u => u.role.includes('MASTER')).map(u => u.name);
    const carBrands = ['Lada Vesta', 'Toyota Camry', 'Ford Focus', 'BMW X5', 'Mercedes C-Class', 'Audi A6', 'Kia Rio', 'Hyundai Solaris'];
    const services = ['Замена масла ДВС', 'Комплексный шиномонтаж', 'Диагностика ходовой', 'Ремонт тормозной системы', 'Замена ГРМ'];

    const generateLicensePlate = () => {
        const letters = 'АВЕКМНОРСТУХ';
        const region = ['77', '99', '177', '199', '777', '161', '61', '93', '123'][Math.floor(Math.random() * 9)];
        return `${letters[Math.floor(Math.random() * letters.length)]} ${String(Math.floor(Math.random() * 900) + 100)} ${letters[Math.floor(Math.random() * letters.length)]}${letters[Math.floor(Math.random() * letters.length)]} ${region}`;
    };

    const clientsData = [
        { name: 'Иван Петров', phone: `+79${String(Math.floor(100000000 + Math.random() * 900000000)).padStart(9, '0')}` },
        { name: 'Сергей Смирнов', phone: `+79${String(Math.floor(100000000 + Math.random() * 900000000)).padStart(9, '0')}` },
        { name: 'Анна Кузнецова', phone: `+79${String(Math.floor(100000000 + Math.random() * 900000000)).padStart(9, '0')}` },
        { name: 'Ольга Васильева', phone: `+79${String(Math.floor(100000000 + Math.random() * 900000000)).padStart(9, '0')}` },
        { name: 'Дмитрий Попов', phone: `+79${String(Math.floor(100000000 + Math.random() * 900000000)).padStart(9, '0')}` },
    ];

    const insertedClients = [];
    for (const c of clientsData) {
        const client = {
            id: `client-${Date.now()}-${Math.random()}`,
            name: c.name,
            phone: c.phone,
            carModel: carBrands[Math.floor(Math.random() * carBrands.length)],
            licensePlate: generateLicensePlate(),
            createdAt: new Date().toISOString()
        };
        await query(
            'INSERT INTO clients (id, name, phone, car_model, license_plate, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
            [client.id, client.name, client.phone, client.carModel, client.licensePlate, client.createdAt]
        );
        insertedClients.push(client);
    }
    console.log(`[SEED] ✓ ${insertedClients.length} клиентов создано.`);

    let testOrders = [];
    for (let i = 0; i < 50; i++) {
        const date = new Date();
        date.setDate(date.getDate() - Math.floor(Math.random() * 7));
        date.setHours(Math.floor(Math.random() * 10) + 9, Math.floor(Math.random() * 60));

        const randomClient = insertedClients[Math.floor(Math.random() * insertedClients.length)];

        const order = {
            id: `ord-${Date.now()}-${i}`,
            masterName: masterNames[Math.floor(Math.random() * masterNames.length)],
            carModel: randomClient.carModel,
            licensePlate: randomClient.licensePlate,
            description: services[Math.floor(Math.random() * services.length)],
            amount: Math.floor(Math.random() * 2500 + 500),
            paymentType: ['Картой', 'Наличные', 'Перевод'][Math.floor(Math.random() * 3)],
            createdAt: date.toISOString(),
            clientId: randomClient.id,
            clientName: randomClient.name,
            clientPhone: randomClient.phone,
            status: 'new'
        };
        await query(
            `INSERT INTO orders (id, master_name, car_model, license_plate, description, amount, payment_type, status, client_id, client_name, client_phone, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
            [order.id, order.masterName, order.carModel, order.licensePlate, order.description, order.amount, order.paymentType, order.status, order.clientId, order.clientName, order.clientPhone, order.createdAt]
        );
        testOrders.push(order);
    }
    console.log(`[SEED] ✓ ${testOrders.length} заказ-нарядов создано.`);
};

const main = async () => {
    try {
        console.log('--- Запуск скрипта наполнения БД ---');

        console.log('[SEED] Чтение файла schema.sql...');
        const schemaSql = await fs.readFile(path.join(__dirname, 'schema.sql'), 'utf-8');

        console.log('[SEED] Удаление старых таблиц (если существуют)...');
        await query('DROP TABLE IF EXISTS salary_reports, history_orders, history_weeks, orders, clients, users CASCADE');

        console.log('[SEED] Создание таблиц по схеме...');
        await query(schemaSql);
        console.log('[SEED] ✓ Схема успешно создана.');

        const users = await seedUsers();
        await seedClientsAndOrders(users);

        console.log('--- Скрипт успешно завершен ---');
    } catch (error) {
        console.error('!!! КРИТИЧЕСКАЯ ОШИБКА СКРИПТА:', error);
    } finally {
        await pool.end();
        console.log('Пул соединений с БД закрыт.');
    }
};

main();

/*────────────────────────────────────────────
  seed.js
  Скрипт для создания таблиц и наполнения БД (SQLite)
  Запуск: node seed.js
─────────────────────────────────────────────*/

require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const dbPath = process.env.DATABASE_URL || 'vipauto.sqlite';

const seedUsers = async (db) => {
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

    const sql = 'INSERT INTO users (login, password, role, name) VALUES (?, ?, ?, ?)';
    for (const user of users) {
        await new Promise((resolve, reject) => {
            db.run(sql, [user.login, user.password, user.role, user.name], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }
    console.log(`[SEED] ✓ ${users.length} пользователей создано.`);
    return users;
};

const seedClientsAndOrders = async (db, users) => {
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
    const clientSql = 'INSERT INTO clients (id, name, phone, car_model, license_plate, created_at) VALUES (?, ?, ?, ?, ?, ?)';
    for (const c of clientsData) {
        const client = {
            id: `client-${Date.now()}-${Math.random()}`,
            name: c.name,
            phone: c.phone,
            carModel: carBrands[Math.floor(Math.random() * carBrands.length)],
            licensePlate: generateLicensePlate(),
            createdAt: new Date().toISOString()
        };
        await new Promise((resolve, reject) => {
            db.run(clientSql, [client.id, client.name, client.phone, client.carModel, client.licensePlate, client.createdAt], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        insertedClients.push(client);
    }
    console.log(`[SEED] ✓ ${insertedClients.length} клиентов создано.`);

    const orderSql = `
        INSERT INTO orders (id, master_name, car_model, license_plate, description, amount, payment_type, status, client_id, client_name, client_phone, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
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
        await new Promise((resolve, reject) => {
            db.run(orderSql, [order.id, order.masterName, order.carModel, order.licensePlate, order.description, order.amount, order.paymentType, order.status, order.clientId, order.clientName, order.clientPhone, order.createdAt], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        testOrders.push(order);
    }
    console.log(`[SEED] ✓ ${testOrders.length} заказ-нарядов создано.`);
};

const main = async () => {
    try {
        console.log('--- Запуск скрипта наполнения БД (SQLite) ---');

        // Удаление старого файла БД, если он существует
        try {
            await fs.unlink(dbPath);
            console.log(`[SEED] Старый файл БД '${dbPath}' удален.`);
        } catch (error) {
            if (error.code !== 'ENOENT') throw error; // Игнорируем, если файла нет
        }

        const db = new sqlite3.Database(dbPath);

        await new Promise((resolve, reject) => {
            db.serialize(async () => {
                try {
                    console.log('[SEED] Чтение файла schema.sql...');
                    const schemaSql = await fs.readFile(path.join(__dirname, 'schema.sql'), 'utf-8');

                    console.log('[SEED] Создание таблиц по схеме...');
                    await new Promise((resolve, reject) => {
                        db.exec(schemaSql, (err) => {
                            if (err) reject(err);
                            else resolve();
                        });
                    });
                    console.log('[SEED] ✓ Схема успешно создана.');

                    const users = await seedUsers(db);
                    await seedClientsAndOrders(db, users);

                    console.log('--- Скрипт успешно завершен ---');
                    resolve();
                } catch (error) {
                    reject(error);
                } finally {
                    db.close((err) => {
                        if (err) console.error('Ошибка при закрытии БД:', err.message);
                        else console.log('Соединение с БД закрыто.');
                    });
                }
            });
        });
    } catch (error) {
        console.error('!!! КРИТИЧЕСКАЯ ОШИБКА СКРИПТА:', error);
    }
};

main();

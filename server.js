/*────────────────────────────────────────────
  server.js
  Миграция на React/PostgreSQL - Версия 10.0
─────────────────────────────────────────────*/

require('dotenv').config();
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const path = require('path');
const db = require('./database');

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-key-for-vipauto-dont-share-it';

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.json());

// Serve static files from the React app
app.use(express.static(path.join(__dirname, 'client/dist')));

const isPrivileged = (user) => user && (user.role === 'DIRECTOR' || user.role === 'SENIOR_MASTER');

app.post('/login', async (req, res) => {
  try {
    const { login, password } = req.body;
    const users = await db.getUsers();
    const userRecord = users[login];
    if (!userRecord || userRecord.password !== password) {
      return res.status(401).json({ message: 'Неверный логин или пароль' });
    }
    const token = jwt.sign({ login, role: userRecord.role, name: userRecord.name }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, user: { login, name: userRecord.name, role: userRecord.role } });
  } catch (error) {
    console.error('[CRITICAL] Failed to process login request:', error);
    res.status(500).json({ message: 'Ошибка сервера при попытке входа. Проверьте подключение к БД.' });
  }
});

const getWeekOrders = async () => (await db.getOrders() || []).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

const getMonthOrders = async () => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const allDbOrders = [...(await db.getOrders()), ...(await db.getHistory()).flatMap(h => h.orders)];
    return allDbOrders
        .filter(o => new Date(o.createdAt) >= startOfMonth)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
};

const prepareDataForUser = async (user) => {
    const allWeekOrders = await getWeekOrders();
    const users = await db.getUsers();
    const history = await db.getHistory();
    const clients = await db.getClients();
    // Final, most robust filter to ensure Director is never included, by specific name.
    const masters = Object.values(users)
        .filter(u => u.name !== 'Владимир Орлов')
        .map(u => u.name);

    const userIsPrivileged = isPrivileged(user);
    const relevantOrders = userIsPrivileged ? allWeekOrders : allWeekOrders.filter(o => o.masterName === user.name);

    const weekStats = {
        revenue: relevantOrders.reduce((s, o) => s + o.amount, 0),
        ordersCount: relevantOrders.length,
        avgCheck: relevantOrders.length > 0 ? Math.round(relevantOrders.reduce((s, o) => s + o.amount, 0) / relevantOrders.length) : 0
    };

    const leaderboard = Object.values(allWeekOrders.reduce((acc, o) => {
        if (!acc[o.masterName]) acc[o.masterName] = { name: o.masterName, revenue: 0, ordersCount: 0 };
        acc[o.masterName].revenue += o.amount;
        acc[o.masterName].ordersCount++;
        return acc;
    }, {})).sort((a, b) => b.revenue - a.revenue);

    const todayOrders = relevantOrders.filter(o => o.createdAt.slice(0, 10) === new Date().toISOString().slice(0, 10));

    // NOTE: This is a temporary simplification to fix a bug.
    // The data structure is reverted to the old format.
    return {
        weekOrders: relevantOrders,
        weekStats: weekStats, // Reverted from dashboardStats
        todayOrders,
        leaderboard,
        masters,
        user,
        history: history || [],
        clients: clients || []
    };
};

const broadcastUpdates = async () => {
    const sockets = await io.fetchSockets();
    for (const socket of sockets) {
        if (socket.user) {
            socket.emit('dataUpdate', await prepareDataForUser(socket.user));
        }
    }
};

io.use((socket, next) => {
  try { socket.user = jwt.verify(socket.handshake.auth.token, JWT_SECRET); next(); }
  catch (err) { next(new Error('Invalid token')); }
});

io.on('connection', async (socket) => {
  console.log(`[Socket] Подключился: '${socket.user.name}'`);

  try {
    socket.emit('initialData', await prepareDataForUser(socket.user));
  } catch (error) {
    console.error('[CRITICAL] Failed to fetch initial data on user connection:', error);
    socket.emit('serverError', 'Не удалось загрузить начальные данные. Проблема с подключением к БД.');
  }

  // Temporarily disable this while the feature is reverted
  socket.on('getDashboardData', async (period) => {
    if (period === 'week' || period === 'month') {
      socket.user.activePeriod = period;
      socket.emit('dataUpdate', await prepareDataForUser(socket.user, socket.user.activePeriod));
    }
  });

  socket.on('searchClients', async (query) => {
    const results = await db.searchClients(query);
    socket.emit('clientSearchResults', results);
  });

  socket.on('addClient', async (clientData) => {
    if (isPrivileged(socket.user)) {
      const newClient = {
        ...clientData,
        id: `client-${Date.now()}`,
        createdAt: new Date().toISOString()
      };
      await db.addClient(newClient);
      broadcastUpdates();
    }
  });

  socket.on('updateClient', async (clientData) => {
    if (isPrivileged(socket.user)) {
      await db.updateClient(clientData);
      broadcastUpdates();
    }
  });

  socket.on('addOrder', async (orderData) => {
    if (!isPrivileged(socket.user)) orderData.masterName = socket.user.name;

    const { clientName, clientPhone, carModel, licensePlate } = orderData;
    let client = await db.findClientByPhone(clientPhone);

    if (!client && clientPhone) { // Create new client only if phone is provided
        client = {
            id: `client-${Date.now()}`,
            name: clientName || 'Новый клиент',
            phone: clientPhone,
            createdAt: new Date().toISOString(),
            carModel: carModel || '',
            licensePlate: licensePlate || ''
        };
        await db.addClient(client);
    }

    const newOrder = {
        ...orderData,
        id: `ord-${Date.now()}`,
        createdAt: new Date().toISOString(),
        clientId: client ? client.id : null
    };

    await db.addOrder(newOrder);
    broadcastUpdates();
  });

  socket.on('updateOrder', async (orderData) => {
    const allOrders = await db.getOrders();
    const orderIndex = allOrders.findIndex(o => o.id === orderData.id);
    if (orderIndex === -1) return socket.emit('serverError', 'Заказ-наряд не найден.');

    const order = allOrders[orderIndex];
    const user = socket.user;
    const orderAge = Date.now() - new Date(order.createdAt).getTime();
    const twoHours = 2 * 60 * 60 * 1000;
    const sevenDays = 7 * 24 * 60 * 60 * 1000;

    const canEdit = (() => {
      if (user.role === 'DIRECTOR' || user.role === 'SENIOR_MASTER') {
        return orderAge < sevenDays;
      }
      if (user.role === 'MASTER') {
        return order.masterName === user.name && orderAge < twoHours;
      }
      return false;
    })();

    if (!canEdit) {
      return socket.emit('serverError', 'У вас нет прав на редактирование или время истекло.');
    }

    await db.updateOrder(orderData);
    broadcastUpdates();
  });

  socket.on('deleteOrder', async (id) => {
    if (isPrivileged(socket.user)) {
      await db.deleteOrder(id);
      broadcastUpdates();
    }
  });

  socket.on('updateOrderStatus', async ({ id, status }) => {
    // For now, any authenticated user can change status.
    // Add role checks here if needed in the future.
    await db.updateOrderStatus(id, status);
    broadcastUpdates();
  });

  socket.on('closeWeek', async (payload) => {
    const orders = await db.getOrders();
    if (isPrivileged(socket.user) && orders.length) {
      await db.closeWeek(payload);
      broadcastUpdates();
    }
  });

  socket.on('clearData', async () => {
    if (isPrivileged(socket.user)) {
      await db.clearData();
      broadcastUpdates();
    }
  });

  socket.on('clearHistory', async () => {
    if (isPrivileged(socket.user)) {
      await db.clearHistory();
      broadcastUpdates();
    }
  });

  socket.on('disconnect', () => console.log(`[Socket] Отключился: '${socket.user.name}'`));
});

// The "catchall" handler: for any request that doesn't match one above,
// send back React's index.html file. This should be the last route.
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'client/dist', 'index.html'));
});

server.listen(PORT, () => {
  console.log(`>>> Сервер VIPавто v10.0 запущен на порту ${PORT} <<<`);
});

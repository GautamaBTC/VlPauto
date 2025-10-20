import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import io from 'socket.io-client';
import { useAuth } from './AuthContext';

const SocketContext = createContext(null);

export const SocketProvider = ({ children }) => {
    const { token, isAuthenticated } = useAuth();
    const [socket, setSocket] = useState(null);
    const [appData, setAppData] = useState({
        weekOrders: [],
        weekStats: {},
        todayOrders: [],
        leaderboard: [],
        masters: [],
        history: [],
        clients: []
    });

    useEffect(() => {
        if (isAuthenticated && token) {
            const newSocket = io(import.meta.env.VITE_API_BASE_URL, {
                auth: { token }
            });

            setSocket(newSocket);

            newSocket.on('connect', () => {
                console.log('Socket connected:', newSocket.id);
            });

            newSocket.on('initialData', (data) => {
                console.log('Received initial data');
                setAppData(data);
            });

            newSocket.on('dataUpdate', (data) => {
                console.log('Received data update');
                setAppData(data);
            });

            newSocket.on('serverError', (message) => {
                console.error('Server Error:', message);
                // Here you could show a notification to the user
            });

            return () => {
                console.log('Disconnecting socket...');
                newSocket.disconnect();
            };
        }
    }, [isAuthenticated, token]);

    const value = useMemo(() => ({
        socket,
        ...appData
    }), [socket, appData]);

    return (
        <SocketContext.Provider value={value}>
            {children}
        </SocketContext.Provider>
    );
};

export const useSocket = () => {
    const context = useContext(SocketContext);
    if (!context) {
        throw new Error('useSocket must be used within a SocketProvider');
    }
    return context;
};

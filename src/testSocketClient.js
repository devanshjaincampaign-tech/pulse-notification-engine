import { io } from 'socket.io-client';

const token = process.argv[2];

if (!token) {
  console.log('Usage: node src/testSocketClient.js <token>');
  process.exit(1);
}

const socket = io('http://localhost:3001', {
  auth: { token },
});

socket.on('connect', () => {
  console.log('Connected! Socket ID:', socket.id);
});

socket.on('connect_error', (err) => {
  console.log('Connection failed:', err.message);
});

socket.on('disconnect', () => {
  console.log('Disconnected');
});

socket.on('notification', (data) => {
  console.log('NEW NOTIFICATION RECEIVED:', data);
});
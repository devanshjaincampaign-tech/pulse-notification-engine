import {Server} from 'socket.io';
import { socketAuthMiddleware } from './socketAuth.js';
import { setIoInstance } from './socketEmitter.js';

export function initializeWebSocket(httpServer){
    const io=new Server(httpServer);

    setIoInstance(io);
    io.use(socketAuthMiddleware);

    io.on('connection',(socket)=>{
        const room=`user:${socket.userId}`;
        socket.join(room);

        console.log(`User ${socket.userId} connected, joined room ${room}`);

        socket.on('disconnect', () =>{
            console.log(`User ${socket.userId} disconnected`);
        })
    })

    return io;
}

/*const room = \user:${socket.userId}`;** and **socket.join(room);** — here's the exact mechanism behind our multi-device design from the very first architecture document. Every connection, regardless of which device it came from, gets placed into a room *named after the user's ID*. So if the same user opens the app on their laptop and their phone, **two separate socket connections both join the exact same room**, user:42. This means later, when we want to deliver a notification, we can emit to */
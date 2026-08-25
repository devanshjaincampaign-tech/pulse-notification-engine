import { verifyToken } from "../utils/jwt.js";

export function socketAuthMiddleware(socket,next){
    const token=socket.handshake.auth.token;

    if(!token){
        return next(new Error('No token provided'));
    }

    try{
        const payload = verifyToken(token);
        socket.userId=payload.userId;
        next();
    }
    catch(err){
        next(new Error('Invalid or expired token'));
    }
}

/*

this is where Socket.IO exposes whatever the client sent in that auth object during connection.
*/
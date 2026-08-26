let ioInstance = null;

export function setIoInstance(io) {
  ioInstance = io;
}

export function emitToUser(userId, eventName, data) {
  if (!ioInstance) {
    console.error('Socket.IO instance not initialized yet');
    return;
  }

  ioInstance.to(`user:${userId}`).emit(eventName, data);
}

/*emitToUser(userId, eventName, data) — the actual delivery function. ioInstance.to(\user:${userId}`)** — this is Socket.IO's way of targeting a specific room (the exact one we join sockets into on connection). **.emit(eventName, data)` — sends a named event with a data payload to every socket currently in that room — meaning every device that user has open, simultaneously, thanks to the room design we already built. */


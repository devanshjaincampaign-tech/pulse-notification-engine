import { createClient } from "redis";
import { env } from './env.js';

export const redisClient = createClient({
    socket:{
        host: env.redis.host,
        port: env.redis.port
    },
});

/*This creates a client object — but importantly, doesn't yet connect it. createClient just configures how it would connect (which host/port), similar to how new Pool(...) configured Postgres without immediately opening connections. Notice socket — Redis's config groups host/port info under a socket key specifically, unlike pg which takes them flat. Small library-specific quirk, not a deep concept — just note it so it doesn't confuse you later.*/

redisClient.on('error',(err)=>{
    console.error('Redis client error',err);
});

export async function connectRedis(){
    await redisClient.connect();
    console.log('Redis connection successful');
}

/*Postgres is the source of truth — if it's gone, nothing works, so we crash loudly.
Redis is an accelerator/real-time layer on top of that truth — if it's gone, some things get slower or less instant, but nothing is actually lost.*/

/*This is called graceful degradation — remember it appeared in our roadmap under Section 11 (Reliability). This Redis error handler is our very first real, concrete example of it — not just a definition, an actual line of code embodying the principle.*/

export const redisSubscriber = createClient({
    socket:{
        host: env.redis.host,
        port: env.redis.port,
    },
});

redisSubscriber.on('error',(err)=>{
    console.error('Redis subscriber error', err);
});

export async function connectRedisSubscriber(){
    await redisSubscriber.connect();
    console.log('Redis subscriber connection successful');
}
import { env } from "./config/env.js";
import { testConnection } from "./config/database.js";
import { connectRedis } from "./config/redis.js";
import app from './app.js';

async function startServer(){
    await testConnection();
    await connectRedis();

    app.listen(env.port,()=>{
        console.log(`server running on port ${env.port}`);
    });
}

startServer();
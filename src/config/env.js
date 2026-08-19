import dotenv from 'dotenv'; 
//dotenv is the small library whose is to read the .env file from project and copy its contents to process.env
/*Why we need it at all: without this package, Node.js has no idea your .env file even exists — .env isn't something Node reads automatically. process.env normally only contains variables your OS/shell already had set (like PATH). dotenv is the bridge that takes your .env file's contents and injects them into that same process.env object, so the rest of our code can read them. */

/* 
This has been Node's default since basically the beginning. It's synchronous — when Node hits a require() line, it stops, goes and loads that entire file/package right then, and only continues once it's fully loaded.

This is the same import/export syntax used in modern frontend JavaScript (React, etc.) — it's now the official JavaScript language standard, not just a Node-specific convention like require was. It supports asynchronous loading under the hood, and has a cleaner, more explicit syntax for picking exactly what you want out of a module.
*/

dotenv.config();

// Every variable the app genuinely cannot function without

const requiredVars=[
    'PORT',
    'DB_USER',
    'DB_PASSWORD',
    'DB_NAME',
    'DB_HOST',
    'DB_PORT',
    'REDIS_HOST',
    'REDIS_PORT',
    'JWT_SECRET',
];

const missing = requiredVars.filter((key) => !process.env[key]);

/* .filter() — a built-in array method. It goes through every item in an array, tests each one with a function you give it, and builds a new array containing only the items where that test returned true. It doesn't modify the original array.*/

/*for every name in requiredVars, check "is this one missing from process.env?" — keep only the ones where the answer is yes. So missing ends up as an array containing only the names of variables that were not found — e.g., ['DB_PASSWORD'] if you forgot to set that one in .env.*/
if(missing.length>0){
    console.error(`Missing required enviornment variable: ${missing.join(', ')}`);
    process.exit(1);
}

export const env={
    nodeEnv: process.env.NODE_ENV || 'development',
    port: Number(process.env.PORT),
    jwtSecret: process.env.JWT_SECRET,

    db: {
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        name: process.env.DB_NAME,
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT), 
    },

    redis: {
        host: process.env.REDIS_HOST,
        port: Number(process.env.REDIS_PORT),
    },
};
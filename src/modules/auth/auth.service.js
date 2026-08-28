import bcrypt from 'bcrypt';
import {findUserByEmail, createUser} from './auth.repository.js';
import { signToken } from '../../utils/jwt.js';
import { ConflictError, UnauthorizedError } from '../../common/errors/index.js';

export async function registerUser({username,email,password}){
    const existingUser= await findUserByEmail(email);

    if(existingUser){
        throw new ConflictError('Email already registered');    
    }

    const passwordHash= await bcrypt.hash(password,10);
    const user=await createUser({username,email,passwordHash});
    const token = signToken({ userId: user.id });

    return {user,token};
}

export async function login({email,password}){
    const user=await findUserByEmail(email);

    if(!user){
        throw new UnauthorizedError('Invalid email or password');
    }

    const isMatch= await bcrypt.compare(password,user.password_hash);

    if(!isMatch){
        throw new UnauthorizedError('Invalid email or password');    
    }

    const token = signToken({ userId: user.id });

    return {
        user:{
            id: user.id,
            username: user.username,
            email: user.email,
            created_at: user.created_at,
        },
        token,
    };
}

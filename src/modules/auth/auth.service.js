import bcrypt from 'bcrypt';
import {findUserByEmail, createUser} from './auth.repository.js';
import { signToken } from '../../utils/jwt.js';

export async function registerUser({username,email,password}){
    const existingUser= await findUserByEmail(email);

    if(existingUser){
        throw new Error('User with this email already exists');
    }

    const passwordHash= await bcrypt.hash(password,10);
    const user=await createUser({username,email,passwordHash});
    const token = signToken({ userId: user.id });

    return {user,token};
}

export async function login({email,password}){
    const user=await findUserByEmail(email);

    if(!user){
        throw new Error('Invalid email or password');
    }

    const isMatch= await bcrypt.compare(password,user.password_hash);

    if(!isMatch){
        throw new Error('Invalid email or password');
    }

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

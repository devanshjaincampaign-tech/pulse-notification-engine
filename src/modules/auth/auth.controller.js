import { registerUser, login} from './auth.service.js';

export async function registerController(req, res, next) {
  try {
    const { username, email, password } = req.body;
    const result = await registerUser({ username, email, password });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

export async function loginController(req,res){
    try{
        const {email,password} = req.body;
        const result = await login({email,password});
        res.status(200).json(result);
    }catch(err){
        res.status(401).json({error :err.message})
    }
}

export function meController(req,res){
    res.status(200).json({userId: req.user.userId});
}
import { AppError } from "./AppError.js";

export class ValidateError extends AppError{
    constructor(message){
        super(message,400);
    }
}

export class UnauthorizedError extends AppError{
    constructor(message){
        super(message,401);
    }
}

export class NotFoundError extends AppError{
    constructor(message){
        super(message,404);
    }
}

export class ConflictError  extends AppError{
    constructor(message){
        super(message,409);
    }
}


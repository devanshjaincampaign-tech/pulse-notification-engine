import { ValidateError } from '../errors/index.js';

export function validate(schema, source = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      const message = result.error.issues.map((issue) => issue.message).join(', ');
      return next(new ValidateError(message));
    }

    req.validated = req.validated || {};
    req.validated[source] = result.data;
    next();
  };
}